import { z } from "zod";
import { TRPCError } from "../../trpc-vendor";
import { createTRPCRouter, protectedProcedure, publicProcedure, invalidateUserCache } from "../create-context";
import sql from "@/backend/db/index";
import { generateUuid } from "@/backend/db/helpers";
import { sendPushToUser, sendPushToUsers } from "@/backend/push";

const LIST_LIMIT = 100;
let categoriesCache: { data: Record<string, any>[]; cachedAt: number } | null = null;
const CATEGORIES_CACHE_TTL = 300_000;
const TYUMEN_OFFSET_HOURS = 5;

function toTyumenDate(d: Date): { dateStr: string; timeStr: string } {
  const utcMs = d.getTime();
  const tyumenMs = utcMs + TYUMEN_OFFSET_HOURS * 60 * 60 * 1000;
  const tyumen = new Date(tyumenMs);
  const dateStr = tyumen.toISOString().split('T')[0];
  const timeStr = tyumen.toISOString().split('T')[1]?.substring(0, 5) || '00:00';
  return { dateStr, timeStr };
}

async function getCachedCategories() {
  if (categoriesCache && Date.now() - categoriesCache.cachedAt < CATEGORIES_CACHE_TTL) {
    return categoriesCache.data;
  }
  const cats = await sql`SELECT id, name, slug FROM service_categories`;
  categoriesCache = { data: cats, cachedAt: Date.now() };
  return cats;
}

export const requestsRouter = createTRPCRouter({
  publicList: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 30;
      const cursor = input?.cursor || null;
      const cursorFilter = cursor
        ? sql`AND sr.created_at < (SELECT created_at FROM service_requests WHERE id = ${cursor}::uuid)`
        : sql``;

      const requests = await sql`
        SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
          sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
          sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
          sr.city as request_city,
          sc.slug as category_slug, sc.name as category_name,
          cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
          cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
          NULL as client_phone,
          eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
          eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
          NULL as executor_phone
        FROM service_requests sr
        INNER JOIN service_categories sc ON sc.id = sr.category_id
        INNER JOIN users cu ON cu.id = sr.client_id
        LEFT JOIN users eu ON eu.id = sr.executor_id
        WHERE sr.status = 'new'
        ${cursorFilter}
        ORDER BY sr.created_at DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = requests.length > limit;
      const sliced = hasMore ? requests.slice(0, limit) : requests;
      const nextCursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : undefined;
      const enriched = await enrichRequestsBatchLight(sliced);

      const sanitized = enriched.map((r: any) => ({
        ...r,
        clientPhone: null,
        executorPhone: null,
        clientName: r.clientName ? r.clientName.split(' ')[0] || 'Клиент' : 'Клиент',
        proposals: [],
      }));

      return { items: sanitized, nextCursor };
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["new", "in_progress", "completed", "cancelled"]).optional(),
        categoryId: z.string().optional(),
        clientOnly: z.boolean().optional(),
        executorOnly: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const role = ctx.user.role;
      const statusFilter = input?.status || null;
      const limit = input?.limit || LIST_LIMIT;
      const cursor = input?.cursor || null;

      let requests: Record<string, any>[];
      let isCombinedFetch = false;

      const cursorFilter = cursor
        ? sql`AND sr.created_at < (SELECT created_at FROM service_requests WHERE id = ${cursor}::uuid)`
        : sql``;

      if (input?.clientOnly && role === "client") {
        requests = await sql`
          SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
            sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
            sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
            sr.city as request_city,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
            cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
            cu.phone as client_phone,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
            eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
            eu.phone as executor_phone
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          WHERE sr.client_id = ${userId}::uuid
            AND (${statusFilter}::text IS NULL OR sr.status = ${statusFilter})
            ${cursorFilter}
          ORDER BY sr.created_at DESC
          LIMIT ${limit + 1}
        `;
      } else if (input?.executorOnly && role === "executor") {
        requests = await sql`
          SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
            sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
            sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
            sr.city as request_city,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
            cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
            cu.phone as client_phone,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
            eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
            eu.phone as executor_phone
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          WHERE sr.executor_id = ${userId}::uuid
            AND (${statusFilter}::text IS NULL OR sr.status = ${statusFilter})
            ${cursorFilter}
          ORDER BY sr.created_at DESC
          LIMIT ${limit + 1}
        `;
      } else if (role === "executor") {
        isCombinedFetch = true;
        const activeLimit = Math.floor(limit * 0.5);
        const completedLimit = limit;
        const executorCity = (ctx.user.city || '').trim().toLowerCase();

        const [activeRequests, completedRequests2] = await Promise.all([
        sql`
          SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
            sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
            sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
            sr.city as request_city,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
            cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
            cu.phone as client_phone,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
            eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
            eu.phone as executor_phone
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          WHERE (
            (
              EXISTS (SELECT 1 FROM user_category_subscriptions WHERE user_id = ${userId}::uuid AND category_id = sr.category_id)
              AND sr.status = 'new'
              AND NOT EXISTS (SELECT 1 FROM request_ignores WHERE executor_id = ${userId}::uuid AND request_id = sr.id)
              AND (${executorCity} = '' OR LOWER(TRIM(COALESCE(sr.city, ''))) = ${executorCity} OR sr.city IS NULL OR TRIM(sr.city) = '')
            )
            OR (sr.executor_id = ${userId}::uuid AND sr.status IN ('new', 'in_progress'))
            OR (EXISTS (SELECT 1 FROM request_responses WHERE request_id = sr.id AND executor_id = ${userId}::uuid) AND sr.status IN ('new', 'in_progress'))
          )
          AND (${statusFilter}::text IS NULL OR sr.status = ${statusFilter})
          ${cursorFilter}
          ORDER BY sr.updated_at DESC, sr.created_at DESC
          LIMIT ${activeLimit + 1}
        `,
        statusFilter === null || statusFilter === 'completed' ? sql`
          SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
            sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
            sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
            sr.city as request_city,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
            cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
            cu.phone as client_phone,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
            eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
            eu.phone as executor_phone
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          WHERE sr.executor_id = ${userId}::uuid
            AND sr.status IN ('completed', 'cancelled')
            ${cursorFilter}
          ORDER BY COALESCE(sr.completed_at, sr.updated_at) DESC
          LIMIT ${completedLimit + 1}
        ` : Promise.resolve([]),
      ]);

        const seenIds = new Set<string>();
        requests = [];
        for (const r of activeRequests) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            requests.push(r);
          }
        }
        for (const r of completedRequests2) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            requests.push(r);
          }
        }

  
      } else if (role === "client") {
        isCombinedFetch = true;
        // Параллельно тянем активные и историю, чтобы при большом числе активных
        // история (completed/cancelled) не выпадала из лимита.
        const activeLimit = Math.floor(limit * 0.6);
        const completedLimit = limit;

        const [activeRequests, completedRequests2] = await Promise.all([
          statusFilter === null || statusFilter === 'new' || statusFilter === 'in_progress' ? sql`
            SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
              sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
              sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
              sr.city as request_city,
              sc.slug as category_slug, sc.name as category_name,
              cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
              cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
              cu.phone as client_phone,
              eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
              eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
              eu.phone as executor_phone
            FROM service_requests sr
            INNER JOIN service_categories sc ON sc.id = sr.category_id
            INNER JOIN users cu ON cu.id = sr.client_id
            LEFT JOIN users eu ON eu.id = sr.executor_id
            WHERE sr.client_id = ${userId}::uuid
              AND sr.status IN ('new', 'in_progress')
              AND (${statusFilter}::text IS NULL OR sr.status = ${statusFilter})
              ${cursorFilter}
            ORDER BY sr.created_at DESC
            LIMIT ${activeLimit + 1}
          ` : Promise.resolve([]),
          statusFilter === null || statusFilter === 'completed' || statusFilter === 'cancelled' ? sql`
            SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
              sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
              sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
              sr.city as request_city,
              sc.slug as category_slug, sc.name as category_name,
              cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
              cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
              cu.phone as client_phone,
              eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
              eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
              eu.phone as executor_phone
            FROM service_requests sr
            INNER JOIN service_categories sc ON sc.id = sr.category_id
            INNER JOIN users cu ON cu.id = sr.client_id
            LEFT JOIN users eu ON eu.id = sr.executor_id
            WHERE sr.client_id = ${userId}::uuid
              AND sr.status IN ('completed', 'cancelled')
              AND (${statusFilter}::text IS NULL OR sr.status = ${statusFilter})
              ${cursorFilter}
            ORDER BY COALESCE(sr.completed_at, sr.updated_at) DESC
            LIMIT ${completedLimit + 1}
          ` : Promise.resolve([]),
        ]);

        const seenIds = new Set<string>();
        requests = [];
        for (const r of activeRequests) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            requests.push(r);
          }
        }
        for (const r of completedRequests2) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            requests.push(r);
          }
        }
        console.log('[Requests] Client list:', activeRequests.length, 'active +', completedRequests2.length, 'completed for user', userId);
      } else {
        requests = await sql`
          SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
            sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
            sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
            sr.city as request_city,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
            cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
            cu.phone as client_phone,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
            eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
            eu.phone as executor_phone
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          WHERE (${statusFilter}::text IS NULL OR sr.status = ${statusFilter})
          ${cursorFilter}
          ORDER BY sr.created_at DESC
          LIMIT ${limit + 1}
        `;
      }

      // Для комбинированного запроса (active + completed) разрешаем больший потолок,
      // чтобы история не отрезалась.
      const effectiveCap = isCombinedFetch ? limit * 2 : limit;
      const hasMore = requests.length > effectiveCap;
      if (hasMore) requests = requests.slice(0, effectiveCap);

      const nextCursor = hasMore && requests.length > 0 ? requests[requests.length - 1].id : undefined;

      const enriched = await enrichRequestsBatchLight(requests);

      return {
        items: enriched,
        nextCursor,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [request] = await sql`
        SELECT sr.id, sr.category_id, sr.client_id, sr.executor_id, sr.description, sr.address,
          sr.acceptable_price, sr.payment_method, sr.latitude, sr.longitude, sr.scheduled_at,
          sr.status, sr.is_urgent, sr.is_paid, sr.accepted_at, sr.completed_at, sr.created_at, sr.updated_at,
          sr.city as request_city,
          sc.slug as category_slug, sc.name as category_name,
          cu.first_name as client_first_name, cu.last_name as client_last_name, cu.avatar_url as client_avatar_url,
          cu.rating as client_rating, cu.rating_count as client_rating_count, cu.requests_count as client_requests_count,
          cu.phone as client_phone,
          eu.first_name as executor_first_name, eu.last_name as executor_last_name, eu.avatar_url as executor_avatar_url,
          eu.rating as executor_rating, eu.rating_count as executor_rating_count, eu.completed_count as executor_completed_count,
          eu.phone as executor_phone
        FROM service_requests sr
        INNER JOIN service_categories sc ON sc.id = sr.category_id
        INNER JOIN users cu ON cu.id = sr.client_id
        LEFT JOIN users eu ON eu.id = sr.executor_id
        WHERE sr.id = ${input.id}::uuid
      `;
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      const [enriched] = await enrichRequestsBatch([request]);
      return enriched;
    }),

  create: protectedProcedure
    .input(
      z.object({
        categoryId: z.string(),
        categoryName: z.string(),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        acceptablePrice: z.string().optional(),
        paymentMethod: z.enum(["cash", "transfer", "online"]).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        isUrgent: z.boolean().optional(),
        attachments: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        console.log("[Requests] Creating request, category:", input.categoryId, "isUrgent:", input.isUrgent);

        const categories = await getCachedCategories();
        const category = categories.find((c) => c.slug === input.categoryId);
        if (!category) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Категория не найдена" });
        }

        let scheduledAt: string | null = null;
        if (input.date && !input.isUrgent) {
          const timeStr = (input.time && /^\d{2}:\d{2}$/.test(input.time)) ? input.time : "00:00";
          scheduledAt = `${input.date}T${timeStr}:00+05:00`;
        } else if (input.isUrgent) {
          const now = new Date();
          const tyumenNow = new Date(now.getTime() + TYUMEN_OFFSET_HOURS * 60 * 60 * 1000);
          const y = tyumenNow.getUTCFullYear();
          const mo = String(tyumenNow.getUTCMonth() + 1).padStart(2, '0');
          const da = String(tyumenNow.getUTCDate()).padStart(2, '0');
          const h = String(tyumenNow.getUTCHours()).padStart(2, '0');
          const mi = String(tyumenNow.getUTCMinutes()).padStart(2, '0');
          scheduledAt = `${y}-${mo}-${da}T${h}:${mi}:00+05:00`;
        }

        const price = input.acceptablePrice ? parseFloat(input.acceptablePrice) || null : null;

        const requestCity = (input.city || ctx.user.city || '').trim();

        const reqId = generateUuid();
        const [request] = await sql`
          INSERT INTO service_requests (
            id, category_id, client_id, description, address, acceptable_price,
            payment_method, latitude, longitude, scheduled_at, status, is_urgent, city
          ) VALUES (
            ${reqId}::uuid, ${category.id}, ${ctx.user.id}, ${input.description || null},
            ${input.address || "Не указан"}, ${price},
            ${input.paymentMethod || null}, ${input.latitude || null}, ${input.longitude || null},
            ${scheduledAt}, ${'new'}, ${input.isUrgent || false}, ${requestCity}
          )
          RETURNING *
        `;

        const parallelOps: Promise<any>[] = [
          sql`UPDATE users SET requests_count = requests_count + 1 WHERE id = ${ctx.user.id}`,
        ];

        if (input.attachments && input.attachments.length > 0) {
          for (let i = 0; i < input.attachments.length; i++) {
            const fileId = generateUuid();
            parallelOps.push(
              sql`
                INSERT INTO service_request_files (id, request_id, file_url, file_type, sort_order)
                VALUES (${fileId}::uuid, ${request.id}, ${input.attachments[i]}, ${'attachment'}, ${i})
              `
            );
          }
        }

        await Promise.all(parallelOps);

        void (async () => {
          try {
            const requestCityLower = requestCity.toLowerCase();
            console.log("[Requests] Looking for subscribed executors for category:", category.id, "city:", requestCity);
            const subscribedExecutors = await sql`
              SELECT DISTINCT ucs.user_id FROM user_category_subscriptions ucs
              INNER JOIN users u ON u.id = ucs.user_id
              WHERE ucs.category_id = ${category.id}
                AND u.role = 'executor'
                AND u.is_blocked = false
                AND u.id != ${ctx.user.id}
                AND (${requestCityLower} = '' OR LOWER(TRIM(COALESCE(u.city, ''))) = ${requestCityLower} OR u.city IS NULL OR TRIM(u.city) = '')
            `;
            console.log("[Requests] Found", subscribedExecutors.length, "subscribed executors");
            if (subscribedExecutors.length > 0) {
              const urgentPrefix = input.isUrgent ? '🔥 СРОЧНО! ' : '';
              const notifTitle = `${input.categoryName}. Новая заявка`;
              const notifBody = `${urgentPrefix}${input.description || "Без описания"}`;
              const payload = sql.json({ requestId: request.id, categorySlug: input.categoryId, subType: 'new_request' });
              const executorIds: string[] = [];
              const notifInserts: Promise<any>[] = [];
              for (const exec of subscribedExecutors) {
                executorIds.push(exec.user_id);
                const nId = generateUuid();
                notifInserts.push(
                  sql`
                    INSERT INTO notifications (id, title, body, type, payload, recipient_id, is_read)
                    VALUES (${nId}::uuid, ${notifTitle}, ${notifBody}, ${'new_request'}, ${payload}, ${exec.user_id}, ${false})
                  `.catch((e) => console.error("[Requests] Failed to notify executor:", exec.user_id, e))
                );
              }
              await Promise.all(notifInserts);
              console.log("[Requests] Created", notifInserts.length, "in-app notifications for new request");
              console.log("[Requests] Sending push to", executorIds.length, "executors:", executorIds.map(id => id.substring(0, 8)));
              try {
                await sendPushToUsers(executorIds, notifTitle, notifBody, { requestId: request.id, categorySlug: input.categoryId, subType: 'new_request' }, 'new_request');
                console.log("[Requests] Push notifications SENT for new request to", executorIds.length, "executors");
              } catch (pushErr) {
                console.error("[Requests] Push send FAILED:", pushErr);
              }
            } else {
              console.log("[Requests] No subscribed executors found for this category/city");
            }
          } catch (e) {
            console.error("[Requests] Notification batch error:", e);
          }
        })();

        console.log("[Requests] Created:", request.id);

        return {
          id: request.id,
          categoryId: input.categoryId,
          categoryName: input.categoryName,
          title: input.categoryName,
          description: input.description || null,
          address: input.address || "Не указан",
          acceptablePrice: input.acceptablePrice || null,
          paymentMethod: input.paymentMethod || null,
          latitude: input.latitude || null,
          longitude: input.longitude || null,
          date: input.date || null,
          time: input.time || null,
          isUrgent: input.isUrgent || false,
          isPaid: true,
          status: "new",
          clientId: ctx.user.id,
          clientName: [ctx.user.last_name, ctx.user.first_name].filter(Boolean).join(" ") || "Клиент",
          clientAvatar: null,
          clientRating: null,
          clientRatingCount: 0,
          clientRequestsCount: 0,
          executorId: null,
          masterName: null,
          acceptedAt: null,
          completedAt: null,
          attachments: input.attachments || [],
          completionPhotos: [],
          createdAt: request.created_at,
          proposalCount: 0,
          proposals: [],
          ignoredByExecutorIds: [],
          executorRatingByClient: undefined,
          clientRatingByExecutor: undefined,
          offerStatus: "none",
          selectedProposalId: undefined,
          clientPhone: null,
          executorPhone: null,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[Requests] Create error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось создать заявку" });
      }
    }),

  propose: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        price: z.string().optional(),
        scheduledDate: z.string().optional(),
        scheduledTime: z.string().optional(),
        conditions: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await sql`
          DELETE FROM request_responses
          WHERE request_id = ${input.requestId}::uuid AND executor_id = ${ctx.user.id}
        `;

        let scheduledAt: string | null = null;
        if (input.scheduledDate) {
          const timeStr = input.scheduledTime || "00:00";
          const candidate = `${input.scheduledDate}T${timeStr}:00+05:00`;
          const parsed = new Date(candidate);
          if (!isNaN(parsed.getTime())) {
            scheduledAt = parsed.toISOString();
          } else {
            console.warn("[Requests] Invalid scheduledAt, skipping:", candidate);
          }
        }

        const priceNum = input.price ? parseFloat(input.price) || null : null;

        const respId = generateUuid();
        const [response] = await sql`
          INSERT INTO request_responses (id, request_id, executor_id, price, scheduled_at, comment, status)
          VALUES (
            ${respId}::uuid, ${input.requestId}::uuid, ${ctx.user.id},
            ${priceNum}, ${scheduledAt}, ${input.conditions || null}, ${'pending'}
          )
          RETURNING *
        `;

        const [freshExecutorArr, reqRowArr] = await Promise.all([
          sql`
            SELECT id, first_name, last_name, avatar_url, rating, rating_count, completed_count
            FROM users WHERE id = ${ctx.user.id}
          `,
          sql`SELECT client_id FROM service_requests WHERE id = ${input.requestId}::uuid`,
        ]);
        const freshExecutor = freshExecutorArr[0];
        const reqRow = reqRowArr[0];

        if (reqRow?.client_id) {
          void (async () => {
            try {
              const [catRow] = await sql`SELECT sc.name FROM service_requests sr INNER JOIN service_categories sc ON sc.id = sr.category_id WHERE sr.id = ${input.requestId}::uuid`;
              const catName = catRow?.name || 'Заявка';
              const executorName = [ctx.user.last_name, ctx.user.first_name].filter(Boolean).join(" ") || "Исполнитель";
              const propNotifId = generateUuid();
              const priceText = input.price ? `${input.price}₽` : 'По договорённости';
              const dateText = [input.scheduledDate, input.scheduledTime].filter(Boolean).join(' ') || 'Дата не указана';
              const notifTitle = `${catName}. Новое предложение`;
              const notifBodyText = `${executorName}: ${priceText}, ${dateText}`;
              await sql`
                INSERT INTO notifications (id, title, body, type, payload, recipient_id, is_read)
                VALUES (
                  ${propNotifId}::uuid,
                  ${notifTitle},
                  ${notifBodyText},
                  ${'request_update'},
                  ${sql.json({ requestId: input.requestId, responseId: response.id, subType: 'new_proposal' })},
                  ${reqRow.client_id},
                  ${false}
                )
              `;
              await sendPushToUser(reqRow.client_id, notifTitle, notifBodyText, { requestId: input.requestId, responseId: response.id, subType: 'new_proposal' }, 'request_update');
            } catch (notifErr) {
              console.error("[Requests] Failed to notify client:", notifErr);
            }
          })();
        }

        return formatResponse(response, freshExecutor || ctx.user);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[Requests] Propose error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось отправить предложение" });
      }
    }),

  acceptProposal: protectedProcedure
    .input(z.object({ requestId: z.string(), proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        console.log("[Requests] Accepting proposal:", input.proposalId, "for request:", input.requestId, "by user:", ctx.user.id);

        const [[response], [requestRow]] = await Promise.all([
          sql`SELECT * FROM request_responses WHERE id = ${input.proposalId}::uuid`,
          sql`SELECT id, client_id, status FROM service_requests WHERE id = ${input.requestId}::uuid`,
        ]);

        if (!requestRow) throw new TRPCError({ code: "NOT_FOUND", message: "Заявка не найдена" });
        if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Предложение не найдено" });

        if (String(requestRow.client_id) !== String(ctx.user.id)) {
          console.error("[Requests] AcceptProposal: user", ctx.user.id, "is not client", requestRow.client_id);
          throw new TRPCError({ code: "FORBIDDEN", message: "Только клиент может принять предложение" });
        }

        if (requestRow.status !== 'new') {
          console.log("[Requests] AcceptProposal: request status is", requestRow.status, "- already processed");
        }

        console.log("[Requests] AcceptProposal: response executor_id:", response.executor_id, "response status:", response.status);

        await Promise.all([
          sql`UPDATE request_responses SET status = 'declined', updated_at = NOW() WHERE request_id = ${input.requestId}::uuid AND id != ${input.proposalId}::uuid AND status = 'pending'`,
          sql`UPDATE request_responses SET status = 'accepted', updated_at = NOW() WHERE id = ${input.proposalId}::uuid`,
          sql`
            UPDATE service_requests SET
              status = 'in_progress',
              executor_id = ${response.executor_id},
              accepted_at = NOW(),
              updated_at = NOW()
            WHERE id = ${input.requestId}::uuid
          `,
        ]);

        void (async () => {
          try {
            const [catRow] = await sql`SELECT sc.name FROM service_requests sr INNER JOIN service_categories sc ON sc.id = sr.category_id WHERE sr.id = ${input.requestId}::uuid`;
            const catName = catRow?.name || 'Заявка';
            const accNotifId = generateUuid();
            const accTitle = `${catName}. Предложение принято`;
            const accBody = 'Клиент принял ваше предложение по заявке';
            await sql`
              INSERT INTO notifications (id, title, body, type, payload, recipient_id, is_read)
              VALUES (
                ${accNotifId}::uuid,
                ${accTitle},
                ${accBody},
                ${'request_update'},
                ${sql.json({ requestId: input.requestId, subType: 'proposal_accepted', newStatus: 'in_progress' })},
                ${response.executor_id},
                ${false}
              )
            `;
            await sendPushToUser(response.executor_id, accTitle, accBody, { requestId: input.requestId, subType: 'proposal_accepted', newStatus: 'in_progress' }, 'request_update');
          } catch (notifErr) {
            console.error("[Requests] Failed to notify executor about acceptance:", notifErr);
          }
        })();

        if (ctx.token) invalidateUserCache(ctx.token);

        return { success: true, requestId: input.requestId, proposalId: input.proposalId, executorId: response.executor_id };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[Requests] AcceptProposal error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось принять предложение" });
      }
    }),

  complete: protectedProcedure
    .input(z.object({ requestId: z.string(), completionPhotos: z.array(z.string()).optional(), isPaid: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        console.log("[Requests] Completing request:", input.requestId);

        const [existing] = await sql`SELECT id, status, client_id, executor_id FROM service_requests WHERE id = ${input.requestId}::uuid`;
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Заявка не найдена" });
        }

        const executorId = existing.executor_id;
        console.log('[Requests] Complete: executorId =', executorId, 'status =', existing.status);

        const isPaid = input.isPaid !== undefined ? input.isPaid : true;
        const parallelOps: Promise<any>[] = [
          sql`
            UPDATE service_requests SET
              status = 'completed',
              completed_at = NOW(),
              updated_at = NOW(),
              is_paid = ${isPaid}
            WHERE id = ${input.requestId}::uuid AND status != 'completed'
          `,
        ];

        if (input.completionPhotos && input.completionPhotos.length > 0) {
          const safePhotos = input.completionPhotos.slice(0, 5);
          for (let i = 0; i < safePhotos.length; i++) {
            const cpFileId = generateUuid();
            parallelOps.push(
              sql`
                INSERT INTO service_request_files (id, request_id, file_url, file_type, sort_order)
                VALUES (${cpFileId}::uuid, ${input.requestId}::uuid, ${safePhotos[i]}, ${'completion_photo'}, ${i})
              `
            );
          }
        }

        await Promise.all(parallelOps);

        if (executorId) {
          const [actualCount] = await sql`
            SELECT COUNT(*)::int as cnt FROM service_requests
            WHERE executor_id = ${executorId}::uuid AND status = 'completed'
          `;
          const realCount = actualCount?.cnt ?? 0;
          await sql`UPDATE users SET completed_count = ${realCount}, updated_at = NOW() WHERE id = ${executorId}::uuid`;
          console.log('[Requests] Synced executor completed_count to', realCount, 'for', executorId);
        }

        if (ctx.token) {
          invalidateUserCache(ctx.token);
        }

        const recipientId = String(ctx.user.id) === String(existing.client_id) ? existing.executor_id : existing.client_id;
        const isClientRecipient = recipientId === existing.client_id;
        if (recipientId) {
          void (async () => {
            try {
              const [catRow] = await sql`SELECT sc.name FROM service_requests sr INNER JOIN service_categories sc ON sc.id = sr.category_id WHERE sr.id = ${input.requestId}::uuid`;
              const catName = catRow?.name || 'Заявка';
              const compNotifId = generateUuid();
              const compTitle = `${catName}. Заявка выполнена`;
              const compBody = isClientRecipient
                ? 'Заявка отмечена как выполненная. Оцените работу и не забудьте оплатить услуги исполнителя!'
                : 'Заявка отмечена как выполненная. Оцените работу!';
              await sql`
                INSERT INTO notifications (id, title, body, type, payload, recipient_id, is_read)
                VALUES (
                  ${compNotifId}::uuid,
                  ${compTitle},
                  ${compBody},
                  ${'request_update'},
                  ${sql.json({ requestId: input.requestId, subType: 'request_completed', newStatus: 'completed' })},
                  ${recipientId},
                  ${false}
                )
              `;
              await sendPushToUser(recipientId, compTitle, compBody, { requestId: input.requestId, subType: 'request_completed', newStatus: 'completed' }, 'request_update');
            } catch (notifErr) {
              console.error("[Requests] Failed to notify about completion:", notifErr);
            }
          })();
        }

          console.log('[Requests] Completed request:', input.requestId);

        return { success: true, id: input.requestId, status: 'completed', completedAt: new Date().toISOString() };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[Requests] Complete error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось завершить заявку" });
      }
    }),

  ignore: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sql`
        INSERT INTO request_ignores (request_id, executor_id)
        VALUES (${input.requestId}::uuid, ${ctx.user.id})
        ON CONFLICT DO NOTHING
      `;
      return { success: true };
    }),

  rate: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        reviewedId: z.string(),
        rating: z.number().min(1).max(5),
        reviewText: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        console.log("[Requests] Rating request:", input.requestId, "target:", input.reviewedId, "rating:", input.rating);

        const existing = await sql`
          SELECT id FROM reviews WHERE request_id = ${input.requestId}::uuid AND author_id = ${ctx.user.id}
        `;

        if (existing.length > 0) {
          await sql`
            UPDATE reviews SET rating = ${input.rating}, text = ${input.reviewText || null}
            WHERE request_id = ${input.requestId}::uuid AND author_id = ${ctx.user.id}
          `;
          console.log("[Requests] Updated existing review:", existing[0].id);
        } else {
          const revId = generateUuid();
          await sql`
            INSERT INTO reviews (id, request_id, author_id, target_id, rating, text)
            VALUES (${revId}::uuid, ${input.requestId}::uuid, ${ctx.user.id}, ${input.reviewedId}::uuid, ${input.rating}, ${input.reviewText || null})
          `;
          console.log("[Requests] Created new review:", revId);
        }

        const [avg] = await sql`
          SELECT AVG(rating)::numeric(3,2) as avg_rating, COUNT(*)::int as cnt FROM reviews WHERE target_id = ${input.reviewedId}::uuid
        `;

        await sql`
          UPDATE users SET rating = ${avg.avg_rating || 5}, rating_count = ${avg.cnt || 0}, updated_at = NOW()
          WHERE id = ${input.reviewedId}::uuid
        `;

        if (ctx.token) {
          invalidateUserCache(ctx.token);
        }

        console.log("[Requests] Rating saved. Avg:", avg.avg_rating, "Count:", avg.cnt);
        return { success: true };
      } catch (err) {
        console.error("[Requests] Rate error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось сохранить оценку" });
      }
    }),

  declineProposal: protectedProcedure
    .input(z.object({ requestId: z.string(), proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [request] = await sql`SELECT client_id FROM service_requests WHERE id = ${input.requestId}::uuid`;
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Заявка не найдена" });
        if (String(request.client_id) !== String(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Только клиент может отклонить предложение" });
        }

        await sql`UPDATE request_responses SET status = 'declined', updated_at = NOW() WHERE id = ${input.proposalId}::uuid AND request_id = ${input.requestId}::uuid`;

        void (async () => {
          try {
            const [[responseRow], [catRow]] = await Promise.all([
              sql`SELECT executor_id FROM request_responses WHERE id = ${input.proposalId}::uuid`,
              sql`SELECT sc.name FROM service_requests sr INNER JOIN service_categories sc ON sc.id = sr.category_id WHERE sr.id = ${input.requestId}::uuid`,
            ]);
            if (responseRow?.executor_id) {
              const catName = catRow?.name || 'Заявка';
              const notifId = generateUuid();
              const declineTitle = `${catName}. Предложение отклонено`;
              const declineBody = 'Клиент отклонил ваше предложение по заявке';
              await sql`
                INSERT INTO notifications (id, title, body, type, payload, recipient_id, is_read)
                VALUES (
                  ${notifId}::uuid,
                  ${declineTitle},
                  ${declineBody},
                  ${'request_update'},
                  ${sql.json({ requestId: input.requestId, subType: 'proposal_declined' })},
                  ${responseRow.executor_id},
                  ${false}
                )
              `;
              await sendPushToUser(responseRow.executor_id, declineTitle, declineBody, { requestId: input.requestId, subType: 'proposal_declined' }, 'request_update');
            }
          } catch (notifErr) {
            console.error("[Requests] Failed to notify executor about decline:", notifErr);
          }
        })();

        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[Requests] DeclineProposal error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось отклонить предложение" });
      }
    }),

  executorSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      console.log('[ExecutorSummary] Fetching for user:', userId);

      const [dailyRows, monthlyRows, yearlyRows, recentRequests] = await Promise.all([
        sql`
          SELECT
            TO_CHAR(COALESCE(sr.completed_at, sr.updated_at, sr.created_at), 'YYYY-MM-DD') as day,
            COUNT(*)::int as count,
            COALESCE(SUM(
              CASE
                WHEN rr.price IS NOT NULL THEN rr.price
                WHEN sr.acceptable_price IS NOT NULL THEN sr.acceptable_price
                ELSE 0
              END
            ), 0)::numeric as total
          FROM service_requests sr
          LEFT JOIN request_responses rr ON rr.request_id = sr.id AND rr.executor_id = ${userId} AND rr.status = 'accepted'
          WHERE sr.executor_id = ${userId}
            AND sr.status = 'completed'
          GROUP BY TO_CHAR(COALESCE(sr.completed_at, sr.updated_at, sr.created_at), 'YYYY-MM-DD')
          ORDER BY day DESC
          LIMIT 90
        `,
        sql`
          SELECT
            TO_CHAR(COALESCE(sr.completed_at, sr.updated_at, sr.created_at), 'YYYY-MM') as month,
            COUNT(*)::int as count,
            COALESCE(SUM(
              CASE
                WHEN rr.price IS NOT NULL THEN rr.price
                WHEN sr.acceptable_price IS NOT NULL THEN sr.acceptable_price
                ELSE 0
              END
            ), 0)::numeric as total
          FROM service_requests sr
          LEFT JOIN request_responses rr ON rr.request_id = sr.id AND rr.executor_id = ${userId} AND rr.status = 'accepted'
          WHERE sr.executor_id = ${userId}
            AND sr.status = 'completed'
          GROUP BY TO_CHAR(COALESCE(sr.completed_at, sr.updated_at, sr.created_at), 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 24
        `,
        sql`
          SELECT
            TO_CHAR(COALESCE(sr.completed_at, sr.updated_at, sr.created_at), 'YYYY') as year,
            COUNT(*)::int as count,
            COALESCE(SUM(
              CASE
                WHEN rr.price IS NOT NULL THEN rr.price
                WHEN sr.acceptable_price IS NOT NULL THEN sr.acceptable_price
                ELSE 0
              END
            ), 0)::numeric as total
          FROM service_requests sr
          LEFT JOIN request_responses rr ON rr.request_id = sr.id AND rr.executor_id = ${userId} AND rr.status = 'accepted'
          WHERE sr.executor_id = ${userId}
            AND sr.status = 'completed'
          GROUP BY TO_CHAR(COALESCE(sr.completed_at, sr.updated_at, sr.created_at), 'YYYY')
          ORDER BY year DESC
        `,
        sql`
          SELECT
            sr.id,
            sc.name as category_name,
            COALESCE(sr.completed_at, sr.updated_at, sr.created_at) as completed_at,
            sr.address,
            CASE
              WHEN rr.price IS NOT NULL THEN rr.price
              WHEN sr.acceptable_price IS NOT NULL THEN sr.acceptable_price
              ELSE 0
            END as price
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          LEFT JOIN request_responses rr ON rr.request_id = sr.id AND rr.executor_id = ${userId} AND rr.status = 'accepted'
          WHERE sr.executor_id = ${userId}
            AND sr.status = 'completed'
          ORDER BY COALESCE(sr.completed_at, sr.updated_at, sr.created_at) DESC
          LIMIT 30
        `,
      ]);

      return {
        daily: dailyRows.map((r: any) => ({ day: r.day, count: Number(r.count), total: Number(r.total) })),
        monthly: monthlyRows.map((r: any) => ({ month: r.month, count: Number(r.count), total: Number(r.total) })),
        yearly: yearlyRows.map((r: any) => ({ year: r.year, count: Number(r.count), total: Number(r.total) })),
        recent: recentRequests.map((r: any) => ({
          id: r.id,
          categoryName: r.category_name,
          completedAt: r.completed_at,
          address: r.address,
          price: Number(r.price),
        })),
      };
    }),

  cancel: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ input }) => {
      await sql`
        UPDATE service_requests SET status = 'cancelled', updated_at = NOW() WHERE id = ${input.requestId}::uuid
      `;
      return { success: true };
    }),

  getPhone: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const [request] = await sql`
        SELECT sr.client_id, sr.executor_id, sr.status,
          cu.phone as client_phone_direct,
          eu.phone as executor_phone_direct
        FROM service_requests sr
        INNER JOIN users cu ON cu.id = sr.client_id
        LEFT JOIN users eu ON eu.id = sr.executor_id
        WHERE sr.id = ${input.requestId}::uuid
      `;
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Заявка не найдена" });
      const isClient = String(request.client_id) === String(userId);
      const isExecutor = request.executor_id ? String(request.executor_id) === String(userId) : false;

      let hasProposal = false;
      if (!isClient && !isExecutor) {
        const [proposal] = await sql`
          SELECT id FROM request_responses
          WHERE request_id = ${input.requestId}::uuid AND executor_id = ${userId}
        `;
        hasProposal = !!proposal;
      }

      if (!isClient && !isExecutor && !hasProposal) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа" });
      }

      const clientPhone = request.client_phone_direct || null;
      const executorPhone = request.executor_phone_direct || null;

      console.log('[Requests] getPhone for request:', input.requestId, 'isClient:', isClient, 'isExecutor:', isExecutor, 'hasProposal:', hasProposal, 'clientPhone:', clientPhone, 'executorPhone:', executorPhone);
      return {
        clientPhone,
        executorPhone,
      };
    }),
});

async function enrichRequestsBatchLight(requests: Record<string, any>[]) {
  if (requests.length === 0) return [];

  const requestIds = requests.map((r) => r.id);

  const [allResponses, allIgnored] = await Promise.all([
    sql`
      SELECT rr.id, rr.request_id, rr.executor_id, rr.price, rr.scheduled_at, rr.comment, rr.status, rr.created_at,
        u.first_name as executor_first_name, u.last_name as executor_last_name,
        u.avatar_url as executor_avatar_url, u.rating as executor_rating, u.rating_count as executor_rating_count,
        u.completed_count as executor_completed_count, u.about as executor_about, u.email as executor_email, u.phone as executor_phone_personal,
        0 as executor_portfolio_count
      FROM request_responses rr
      INNER JOIN users u ON u.id = rr.executor_id
      WHERE rr.request_id IN ${sql(requestIds)}
        AND rr.status IN ('pending', 'accepted')
      ORDER BY u.rating DESC NULLS LAST, rr.created_at ASC
    `,
    sql`SELECT request_id, executor_id FROM request_ignores WHERE request_id IN ${sql(requestIds)}`,
  ]);

  return formatRequestsBatch(requests, allResponses, allIgnored, [], []);
}

async function enrichRequestsBatch(requests: Record<string, any>[]) {
  if (requests.length === 0) return [];

  const requestIds = requests.map((r) => r.id);

  const [allResponses, allIgnored, allFiles, allReviews] = await Promise.all([
    sql`
      SELECT rr.id, rr.request_id, rr.executor_id, rr.price, rr.scheduled_at, rr.comment, rr.status, rr.created_at,
        u.first_name as executor_first_name, u.last_name as executor_last_name,
        u.avatar_url as executor_avatar_url, u.rating as executor_rating, u.rating_count as executor_rating_count,
        u.completed_count as executor_completed_count, u.about as executor_about, u.email as executor_email, u.phone as executor_phone_personal,
        COALESCE(epp.cnt, 0)::int as executor_portfolio_count
      FROM request_responses rr
      INNER JOIN users u ON u.id = rr.executor_id
      LEFT JOIN LATERAL (SELECT COUNT(*)::int as cnt FROM executor_portfolio_photos WHERE user_id = u.id) epp ON true
      WHERE rr.request_id IN ${sql(requestIds)}
        AND rr.status IN ('pending', 'accepted')
      ORDER BY u.rating DESC NULLS LAST, rr.created_at ASC
    `,
    sql`SELECT request_id, executor_id FROM request_ignores WHERE request_id IN ${sql(requestIds)}`,
    sql`SELECT request_id, file_url, file_type FROM service_request_files WHERE request_id IN ${sql(requestIds)} ORDER BY sort_order`,
    sql`SELECT request_id, author_id, rating FROM reviews WHERE request_id IN ${sql(requestIds)}`,
  ]);

  return formatRequestsBatch(requests, allResponses, allIgnored, allFiles, allReviews);
}

function formatRequestsBatch(
  requests: Record<string, any>[],
  allResponses: Record<string, any>[],
  allIgnored: Record<string, any>[],
  allFiles: Record<string, any>[],
  allReviews: Record<string, any>[],
) {
  const responsesMap = new Map<string, Record<string, any>[]>();
  const ignoredMap = new Map<string, string[]>();
  const filesMap = new Map<string, Record<string, any>[]>();
  const reviewsMap = new Map<string, Record<string, any>[]>();

  for (const r of allResponses) {
    const key = String(r.request_id);
    if (!responsesMap.has(key)) responsesMap.set(key, []);
    responsesMap.get(key)!.push(r);
  }
  for (const ig of allIgnored) {
    const key = String(ig.request_id);
    if (!ignoredMap.has(key)) ignoredMap.set(key, []);
    ignoredMap.get(key)!.push(ig.executor_id);
  }
  for (const f of allFiles) {
    const key = String(f.request_id);
    if (!filesMap.has(key)) filesMap.set(key, []);
    filesMap.get(key)!.push(f);
  }
  for (const rev of allReviews) {
    const key = String(rev.request_id);
    if (!reviewsMap.has(key)) reviewsMap.set(key, []);
    reviewsMap.get(key)!.push(rev);
  }

  return requests.map((request) => {
    const rid = String(request.id);
    const responses = responsesMap.get(rid) || [];
    const ignored = ignoredMap.get(rid) || [];
    const files = filesMap.get(rid) || [];
    const reviews = reviewsMap.get(rid) || [];

    let executorRatingByClient: number | undefined;
    let clientRatingByExecutor: number | undefined;
    if (request.executor_id && request.client_id) {
      const er = reviews.find((rev: any) => String(rev.author_id) === String(request.client_id));
      const cr = reviews.find((rev: any) => String(rev.author_id) === String(request.executor_id));
      executorRatingByClient = er?.rating;
      clientRatingByExecutor = cr?.rating;
    }

    const attachments = files.filter((f: any) => f.file_type === "attachment").map((f: any) => f.file_url);
    const completionPhotos = files.filter((f: any) => f.file_type === "completion_photo").map((f: any) => f.file_url);

    const clientName = [request.client_last_name, request.client_first_name].filter(Boolean).join(" ") || "Клиент";
    const clientAvatar = request.client_avatar_url || null;
    const clientRating = request.client_rating != null ? Number(request.client_rating) : null;
    const clientRatingCount = request.client_rating_count ? Number(request.client_rating_count) : 0;
    const clientRequestsCount = request.client_requests_count ? Number(request.client_requests_count) : 0;
    const clientPhone = request.client_phone || null;
    const executorPhone = request.executor_phone || null;

    const executorName = request.executor_id
      ? [request.executor_last_name, request.executor_first_name].filter(Boolean).join(" ") || "Исполнитель"
      : null;
    const executorAvatar = request.executor_avatar_url || null;
    const executorRating = request.executor_rating != null ? Number(request.executor_rating) : null;
    const executorRatingCount = request.executor_rating_count ? Number(request.executor_rating_count) : 0;
    const executorCompletedCount = request.executor_completed_count ? Number(request.executor_completed_count) : 0;

    let dateStr: string | null = null;
    let timeStr: string | null = null;
    const isUrgent = request.is_urgent || false;
    if (request.scheduled_at && !isUrgent) {
      const tyumen = toTyumenDate(new Date(request.scheduled_at));
      dateStr = tyumen.dateStr;
      timeStr = tyumen.timeStr;
    } else if (request.scheduled_at && isUrgent) {
      const tyumen = toTyumenDate(new Date(request.scheduled_at));
      dateStr = tyumen.dateStr;
      timeStr = 'В ближайшее время';
    }

    const sortedResponses = [...responses].sort((a: any, b: any) => {
      const aRating = a.executor_rating != null ? Number(a.executor_rating) : 0;
      const bRating = b.executor_rating != null ? Number(b.executor_rating) : 0;
      if (bRating !== aRating) return bRating - aRating;

      const aAbout = a.executor_about || '';
      const aAvatar = a.executor_avatar_url || null;
      const aPortfolio = a.executor_portfolio_count != null ? Number(a.executor_portfolio_count) : 0;
      const aName = [a.executor_last_name, a.executor_first_name].filter(Boolean).join(' ');
      const aPhone = a.executor_phone_personal || '';
      const aEmail = a.executor_email || '';
      const aVerified = !!aAbout && !!aAvatar && aPortfolio > 0 && !!aName && aName !== 'Исполнитель' && !!aPhone && !!aEmail;

      const bAbout = b.executor_about || '';
      const bAvatar = b.executor_avatar_url || null;
      const bPortfolio = b.executor_portfolio_count != null ? Number(b.executor_portfolio_count) : 0;
      const bName = [b.executor_last_name, b.executor_first_name].filter(Boolean).join(' ');
      const bPhone = b.executor_phone_personal || '';
      const bEmail = b.executor_email || '';
      const bVerified = !!bAbout && !!bAvatar && bPortfolio > 0 && !!bName && bName !== 'Исполнитель' && !!bPhone && !!bEmail;

      if (aVerified !== bVerified) return aVerified ? -1 : 1;

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return {
      id: request.id,
      categoryId: request.category_slug,
      categoryName: request.category_name,
      title: request.category_name,
      description: request.description,
      address: request.address,
      city: request.request_city || null,
      acceptablePrice: request.acceptable_price ? String(request.acceptable_price) : null,
      paymentMethod: request.payment_method,
      latitude: request.latitude,
      longitude: request.longitude,
      date: dateStr,
      time: timeStr,
      isUrgent,
      isPaid: request.is_paid !== false,
      status: request.status,
      clientId: request.client_id,
      clientName,
      clientAvatar,
      clientRating,
      clientRatingCount,
      clientRequestsCount,
      executorId: request.executor_id,
      masterName: executorName,
      executorAvatar,
      executorRating,
      executorRatingCount,
      executorCompletedCount,
      acceptedAt: request.accepted_at,
      completedAt: request.completed_at,
      attachments,
      completionPhotos,
      createdAt: request.created_at,
      proposalCount: sortedResponses.length,
      proposals: sortedResponses.map((r: any) => formatResponse(r, null)),
      ignoredByExecutorIds: ignored,
      executorRatingByClient,
      clientRatingByExecutor,
      offerStatus: getOfferStatus(responses),
      selectedProposalId: responses.find((r: any) => r.status === "accepted")?.id,
      clientPhone: clientPhone,
      executorPhone: executorPhone,
    };
  });
}

function formatResponse(r: Record<string, any>, executor: Record<string, any> | null) {
  const executorName = executor
    ? [executor.last_name, executor.first_name].filter(Boolean).join(" ") || "Исполнитель"
    : [r.executor_last_name, r.executor_first_name].filter(Boolean).join(" ") || "Исполнитель";

  let scheduledDate: string | null = null;
  let scheduledTime: string | null = null;
  if (r.scheduled_at) {
    const tyumen = toTyumenDate(new Date(r.scheduled_at));
    scheduledDate = tyumen.dateStr;
    scheduledTime = tyumen.timeStr;
  }

  const executorRating = r.executor_rating != null ? Number(r.executor_rating) : (executor?.rating != null ? Number(executor.rating) : null);
  const executorRatingCount = r.executor_rating_count != null ? Number(r.executor_rating_count) : (executor?.rating_count != null ? Number(executor.rating_count) : 0);
  const executorCompletedCount = r.executor_completed_count != null ? Number(r.executor_completed_count) : (executor?.completed_count != null ? Number(executor.completed_count) : 0);

  const eAbout = r.executor_about || executor?.about || '';
  const eAvatar = r.executor_avatar_url || executor?.avatar_url || null;
  const eEmail = r.executor_email || executor?.email || '';
  const ePhone = r.executor_phone_personal || executor?.phone || '';
  const ePortfolio = r.executor_portfolio_count != null ? Number(r.executor_portfolio_count) : 0;
  const executorIsFullyVerified = !!eAbout && !!eAvatar && ePortfolio > 0 && !!executorName && executorName !== 'Исполнитель' && !!ePhone && !!eEmail;

  return {
    id: r.id,
    executorId: r.executor_id,
    executorName,
    executorAvatar: eAvatar,
    executorRating,
    executorRatingCount,
    executorCompletedCount,
    executorIsFullyVerified,
    price: r.price ? String(r.price) : null,
    scheduledDate,
    scheduledTime,
    conditions: r.comment,
    status: r.status,
    createdAt: r.created_at,
  };
}

function getOfferStatus(responses: Record<string, any>[]): string {
  if (responses.some((r: any) => r.status === "accepted")) return "accepted";
  if (responses.some((r: any) => r.status === "pending")) return "pending";
  return "none";
}
