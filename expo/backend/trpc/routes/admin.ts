import { z } from "zod";
import { TRPCError } from "../../trpc-vendor";
import { createTRPCRouter, adminProcedure, supportProcedure, invalidateUserCache } from "../create-context";
import sql from "@/backend/db/index";
import { generateUuid, hashPassword } from "@/backend/db/helpers";
import { sendPushToUsers } from "@/backend/push";

async function logAudit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {}
) {
  try {
    const logId = generateUuid();
    await sql`
      INSERT INTO admin_action_logs (id, admin_id, action, target_type, target_id, details)
      VALUES (${logId}::uuid, ${adminId}, ${action}, ${targetType}, ${targetId ? sql`${targetId}::uuid` : sql`NULL`}, ${sql.json(details as any)})
    `;
    console.log("[Audit]", action, targetType, targetId);
  } catch (e) {
    console.error("[Audit] Failed to log:", e);
  }
}

export const adminRouter = createTRPCRouter({
  stats: adminProcedure.query(async () => {
    const [users] = await sql`SELECT COUNT(*)::int as count FROM users`;
    const [clients] = await sql`SELECT COUNT(*)::int as count FROM users WHERE role = 'client'`;
    const [executors] = await sql`SELECT COUNT(*)::int as count FROM users WHERE role = 'executor'`;
    const [blocked] = await sql`SELECT COUNT(*)::int as count FROM users WHERE is_blocked = true`;
    const [admins] = await sql`SELECT COUNT(*)::int as count FROM users WHERE role = 'admin'`;
    const [supportStaff] = await sql`SELECT COUNT(*)::int as count FROM users WHERE role = 'support'`;
    const [requests] = await sql`SELECT COUNT(*)::int as count FROM service_requests`;
    const [newReqs] = await sql`SELECT COUNT(*)::int as count FROM service_requests WHERE status = 'new'`;
    const [inProgress] = await sql`SELECT COUNT(*)::int as count FROM service_requests WHERE status = 'in_progress'`;
    const [completed] = await sql`SELECT COUNT(*)::int as count FROM service_requests WHERE status = 'completed'`;
    const [cancelled] = await sql`SELECT COUNT(*)::int as count FROM service_requests WHERE status = 'cancelled'`;
    const [totalReviews] = await sql`SELECT COUNT(*)::int as count FROM reviews`;
    const [avgRating] = await sql`SELECT COALESCE(AVG(rating), 0)::real as avg FROM reviews`;
    const [supportChatsCount] = await sql`SELECT COUNT(*)::int as count FROM chats WHERE type = 'support'`;

    const regionStats = await sql`
      SELECT COALESCE(region, 'Не указан') as region, COUNT(*)::int as count
      FROM users
      WHERE role IN ('client', 'executor')
      GROUP BY region
      ORDER BY count DESC
      LIMIT 30
    `;

    const cityStats = await sql`
      SELECT COALESCE(city, 'Не указан') as city, COUNT(*)::int as count
      FROM users
      WHERE role IN ('client', 'executor')
      GROUP BY city
      ORDER BY count DESC
      LIMIT 30
    `;

    const recentRegistrations = await sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM-DD') as day,
        COUNT(*)::int as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day DESC
    `;

    const regionRoleStats = await sql`
      SELECT
        COALESCE(region, 'Не указан') as region,
        role,
        COUNT(*)::int as count
      FROM users
      WHERE role IN ('client', 'executor')
      GROUP BY region, role
      ORDER BY count DESC
      LIMIT 60
    `;

    return {
      totalUsers: users.count,
      totalClients: clients.count,
      totalExecutors: executors.count,
      totalAdmins: admins.count,
      totalSupport: supportStaff.count,
      blockedUsers: blocked.count,
      totalRequests: requests.count,
      newRequests: newReqs.count,
      inProgressRequests: inProgress.count,
      completedRequests: completed.count,
      cancelledRequests: cancelled.count,
      totalReviews: totalReviews.count,
      averageRating: parseFloat(avgRating.avg) || 0,
      supportChats: supportChatsCount.count,
      regionStats: regionStats.map((r: any) => ({ region: r.region || 'Не указан', count: r.count })),
      cityStats: cityStats.map((c: any) => ({ city: c.city || 'Не указан', count: c.count })),
      recentRegistrations: recentRegistrations.map((r: any) => ({ day: r.day, count: r.count })),
      regionRoleStats: regionRoleStats.map((r: any) => ({ region: r.region || 'Не указан', role: r.role, count: r.count })),
    };
  }),

  users: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        region: z.string().optional(),
        city: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 500;
      const offset = input?.offset || 0;

      const conditions: string[] = [];
      const searchPattern = input?.search ? `%${input.search}%` : null;

      let users: Record<string, any>[];

      if (searchPattern && input?.region && input?.city) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE (first_name ILIKE ${searchPattern} OR last_name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR email ILIKE ${searchPattern})
            AND region = ${input.region} AND city = ${input.city}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (searchPattern && input?.region) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE (first_name ILIKE ${searchPattern} OR last_name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR email ILIKE ${searchPattern})
            AND region = ${input.region}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (searchPattern && input?.city) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE (first_name ILIKE ${searchPattern} OR last_name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR email ILIKE ${searchPattern})
            AND city = ${input.city}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (searchPattern) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE (first_name ILIKE ${searchPattern} OR last_name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR email ILIKE ${searchPattern})
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (input?.region && input?.city) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE region = ${input.region} AND city = ${input.city}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (input?.region) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE region = ${input.region}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (input?.city) {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          WHERE city = ${input.city}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        users = await sql`
          SELECT id, first_name, last_name, phone, email, role, city, region, rating, rating_count,
                 requests_count, completed_count, is_blocked, avatar_url, created_at, user_number
          FROM users
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      return users.map((u: any) => ({
        id: u.id,
        userNumber: u.user_number || null,
        firstName: u.first_name,
        lastName: u.last_name,
        name: [u.last_name, u.first_name].filter(Boolean).join(" ") || "Пользователь",
        phone: u.phone,
        email: u.email,
        role: u.role,
        city: u.city,
        region: u.region,
        avatar: u.avatar_url || null,
        rating: parseFloat(u.rating) || 5,
        ratingCount: u.rating_count || 0,
        requestsCount: u.requests_count,
        completedCount: u.completed_count,
        isBlocked: u.is_blocked,
        createdAt: u.created_at,
      }));
    }),

  blockUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя заблокировать себя" });
      }
      const [target] = await sql`SELECT role, first_name, last_name FROM users WHERE id = ${input.userId}::uuid`;
      if (target?.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Нельзя заблокировать другого администратора" });
      }
      await sql`UPDATE users SET is_blocked = true, updated_at = NOW() WHERE id = ${input.userId}::uuid`;
      await sql`UPDATE user_devices SET is_revoked = true WHERE user_id = ${input.userId}::uuid`;
      await logAudit(ctx.user.id, "block_user", "user", input.userId, {
        targetName: [target?.last_name, target?.first_name].filter(Boolean).join(" "),
      });
      return { success: true };
    }),

  unblockUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sql`UPDATE users SET is_blocked = false, updated_at = NOW() WHERE id = ${input.userId}::uuid`;
      await logAudit(ctx.user.id, "unblock_user", "user", input.userId);
      return { success: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя удалить себя" });
      }
      const [target] = await sql`SELECT role, first_name, last_name, phone FROM users WHERE id = ${input.userId}::uuid`;
      if (target?.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Нельзя удалить другого администратора" });
      }
      await logAudit(ctx.user.id, "delete_user", "user", input.userId, {
        targetName: [target?.last_name, target?.first_name].filter(Boolean).join(" "),
        targetPhone: target?.phone,
        targetRole: target?.role,
      });
      await sql`DELETE FROM users WHERE id = ${input.userId}::uuid`;
      return { success: true };
    }),

  setUserRole: adminProcedure
    .input(z.object({
      userId: z.string(),
      role: z.enum(["client", "executor", "admin", "support"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя изменить свою роль" });
      }
      const [target] = await sql`SELECT role, first_name, last_name FROM users WHERE id = ${input.userId}::uuid`;
      const oldRole = target?.role;
      await sql`UPDATE users SET role = ${input.role}, updated_at = NOW() WHERE id = ${input.userId}::uuid`;
      invalidateUserCache();
      await logAudit(ctx.user.id, "set_role", "user", input.userId, {
        oldRole,
        newRole: input.role,
        targetName: [target?.last_name, target?.first_name].filter(Boolean).join(" "),
      });
      return { success: true };
    }),

  allRequests: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 500;
      const offset = input?.offset || 0;

      let requests: Record<string, any>[];

      if (input?.search) {
        const searchPattern = `%${input.search}%`;
        requests = await sql`
          SELECT sr.id, sr.description, sr.address, sr.acceptable_price, sr.payment_method,
            sr.status, sr.client_id, sr.executor_id, sr.created_at, sr.accepted_at, sr.completed_at,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          WHERE (sc.name ILIKE ${searchPattern} OR sr.description ILIKE ${searchPattern}
            OR cu.first_name ILIKE ${searchPattern} OR cu.last_name ILIKE ${searchPattern}
            OR eu.first_name ILIKE ${searchPattern} OR eu.last_name ILIKE ${searchPattern})
          ORDER BY sr.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        requests = await sql`
          SELECT sr.id, sr.description, sr.address, sr.acceptable_price, sr.payment_method,
            sr.status, sr.client_id, sr.executor_id, sr.created_at, sr.accepted_at, sr.completed_at,
            sc.slug as category_slug, sc.name as category_name,
            cu.first_name as client_first_name, cu.last_name as client_last_name,
            eu.first_name as executor_first_name, eu.last_name as executor_last_name
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          INNER JOIN users cu ON cu.id = sr.client_id
          LEFT JOIN users eu ON eu.id = sr.executor_id
          ORDER BY sr.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      return requests.map((r: any) => ({
        id: r.id,
        categoryId: r.category_slug,
        categoryName: r.category_name,
        description: r.description,
        address: r.address,
        acceptablePrice: r.acceptable_price ? String(r.acceptable_price) : null,
        paymentMethod: r.payment_method,
        status: r.status,
        clientId: r.client_id,
        clientName: [r.client_last_name, r.client_first_name].filter(Boolean).join(" ") || "Клиент",
        executorId: r.executor_id,
        executorName: r.executor_id
          ? [r.executor_last_name, r.executor_first_name].filter(Boolean).join(" ") || "Исполнитель"
          : null,
        createdAt: r.created_at,
        acceptedAt: r.accepted_at,
        completedAt: r.completed_at,
      }));
    }),

  updateRequestStatus: adminProcedure
    .input(z.object({
      requestId: z.string(),
      status: z.enum(["new", "in_progress", "completed", "cancelled"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [req] = await sql`
        SELECT sr.status, sc.name as category_name
        FROM service_requests sr
        INNER JOIN service_categories sc ON sc.id = sr.category_id
        WHERE sr.id = ${input.requestId}::uuid
      `;
      await sql`UPDATE service_requests SET status = ${input.status}, updated_at = NOW() WHERE id = ${input.requestId}::uuid`;
      await logAudit(ctx.user.id, "update_request_status", "request", input.requestId, {
        oldStatus: req?.status,
        newStatus: input.status,
        categoryName: req?.category_name,
      });
      return { success: true };
    }),

  sendBroadcast: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      targetRole: z.enum(["all", "client", "executor"]).optional(),
      userIds: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let recipients: Record<string, any>[];

      if (input.userIds && input.userIds.length > 0) {
        recipients = await sql`SELECT id FROM users WHERE id IN ${sql(input.userIds)} AND is_blocked = false`;
      } else if (input.targetRole && input.targetRole !== "all") {
        recipients = await sql`SELECT id FROM users WHERE role = ${input.targetRole} AND is_blocked = false`;
      } else {
        recipients = await sql`SELECT id FROM users WHERE is_blocked = false AND role IN ('client', 'executor')`;
      }

      const recipientCount = recipients.length;

      if (recipientCount === 0) {
        return { sent: 0 };
      }

      const BATCH_SIZE = 50;
      const recipientIds = recipients.map((u: any) => u.id);

      for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
        const batch = recipientIds.slice(i, i + BATCH_SIZE);
        try {
          await Promise.all(batch.map((uid: string) => {
            const nId = generateUuid();
            return sql`
              INSERT INTO notifications (id, title, body, type, recipient_id, is_read)
              VALUES (${nId}::uuid, ${input.title}, ${input.body}, ${'broadcast'}, ${uid}::uuid, ${false})
            `;
          }));
          console.log(`[Admin] Notification batch ${Math.floor(i / BATCH_SIZE) + 1} inserted (${batch.length})`);
        } catch (batchErr) {
          console.error(`[Admin] Notification insert batch error:`, batchErr);
        }
      }

      void logAudit(ctx.user.id, "send_broadcast", "notification", null, {
        title: input.title,
        targetRole: input.targetRole || "all",
        recipientCount,
      });

      console.log("[Admin] Broadcast notifications created for", recipientCount, "users. Sending pushes...");

      try {
        const PUSH_BATCH_SIZE = 80;
        for (let i = 0; i < recipientIds.length; i += PUSH_BATCH_SIZE) {
          const batch = recipientIds.slice(i, i + PUSH_BATCH_SIZE);
          console.log(`[Admin] Sending push batch ${Math.floor(i / PUSH_BATCH_SIZE) + 1} to ${batch.length} users`);
          await sendPushToUsers(batch, input.title, input.body, { type: 'broadcast' }, 'broadcast');
          console.log(`[Admin] Push batch ${Math.floor(i / PUSH_BATCH_SIZE) + 1} completed`);
        }
        console.log("[Admin] All push notifications sent for broadcast to", recipientCount, "users");
      } catch (err) {
        console.error("[Admin] Push send error:", err);
      }

      return { sent: recipientCount };
    }),

  supportChats: supportProcedure.query(async () => {
    const chats = await sql`
      SELECT c.* FROM chats c WHERE c.type = 'support'
      ORDER BY c.last_message_at DESC NULLS LAST
    `;

    if (chats.length === 0) return [];

    const chatIds = chats.map((c) => c.id);

    const [allParticipants, allLastMessages] = await Promise.all([
      sql`
        SELECT cp.chat_id, cp.user_id, cp.unread_count, u.first_name, u.last_name, u.avatar_url
        FROM chat_participants cp
        INNER JOIN users u ON u.id = cp.user_id
        WHERE cp.chat_id IN ${sql(chatIds)}
      `,
      sql`
        SELECT DISTINCT ON (chat_id) chat_id, text
        FROM chat_messages
        WHERE chat_id IN ${sql(chatIds)}
        ORDER BY chat_id, created_at DESC
      `,
    ]);

    const participantsMap = new Map<string, Record<string, any>[]>();
    for (const p of allParticipants) {
      const key = String(p.chat_id);
      if (!participantsMap.has(key)) participantsMap.set(key, []);
      participantsMap.get(key)!.push(p);
    }

    const lastMsgMap = new Map<string, string>();
    for (const m of allLastMessages) {
      lastMsgMap.set(String(m.chat_id), m.text);
    }

    return chats.map((chat) => {
      const cid = String(chat.id);
      const participants = participantsMap.get(cid) || [];

      return {
        id: chat.id,
        type: chat.type,
        participants: participants.map((p: any) => p.user_id),
        participantNames: participants.map((p: any) =>
          [p.last_name, p.first_name].filter(Boolean).join(" ") || "Пользователь"
        ),
        participantAvatars: participants.map((p: any) => p.avatar_url || null),
        lastMessage: lastMsgMap.get(cid) || null,
        lastMessageTime: chat.last_message_at,
        unreadCount: participants.reduce((sum: number, p: any) => sum + (p.unread_count || 0), 0),
      };
    });
  }),

  adminResetPassword: adminProcedure
    .input(z.object({
      userId: z.string(),
      newPassword: z.string().min(4),
    }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await sql`SELECT id, first_name, last_name, phone, role FROM users WHERE id = ${input.userId}::uuid`;
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      const newHash = hashPassword(input.newPassword);
      await sql`UPDATE users SET password_hash = ${newHash}, updated_at = NOW() WHERE id = ${input.userId}::uuid`;
      await sql`UPDATE user_devices SET is_revoked = true WHERE user_id = ${input.userId}::uuid`;
      await logAudit(ctx.user.id, "reset_password", "user", input.userId, {
        targetName: [target.last_name, target.first_name].filter(Boolean).join(" "),
        targetPhone: target.phone,
      });
      console.log("[Admin] Password reset for user:", input.userId);
      return { success: true };
    }),

  adminUpdateUser: adminProcedure
    .input(z.object({
      userId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      city: z.string().optional(),
      about: z.string().optional(),
      role: z.enum(["client", "executor", "admin", "support"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await sql`SELECT * FROM users WHERE id = ${input.userId}::uuid`;
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      if (input.phone) {
        const phoneExists = await sql`SELECT id FROM users WHERE phone = ${input.phone.trim()} AND id != ${input.userId}::uuid`;
        if (phoneExists.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Этот номер телефона уже используется" });
        }
      }
      if (input.email) {
        const emailLower = input.email.trim().toLowerCase();
        const emailExists = await sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower} AND id != ${input.userId}::uuid`;
        if (emailExists.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Этот email уже используется" });
        }
      }
      const changes: Record<string, unknown> = {};
      if (input.firstName !== undefined) changes.oldFirstName = target.first_name;
      if (input.lastName !== undefined) changes.oldLastName = target.last_name;
      if (input.phone !== undefined) changes.oldPhone = target.phone;
      if (input.email !== undefined) changes.oldEmail = target.email;
      if (input.role !== undefined) changes.oldRole = target.role;

      await sql`
        UPDATE users SET
          first_name = COALESCE(${input.firstName ?? null}, first_name),
          last_name = COALESCE(${input.lastName ?? null}, last_name),
          phone = COALESCE(${input.phone?.trim() ?? null}, phone),
          email = COALESCE(${input.email?.trim().toLowerCase() ?? null}, email),
          city = COALESCE(${input.city ?? null}, city),
          about = COALESCE(${input.about ?? null}, about),
          role = COALESCE(${input.role ?? null}, role),
          updated_at = NOW()
        WHERE id = ${input.userId}::uuid
      `;
      if (input.role && input.role !== target.role) {
        invalidateUserCache();
      }
      await logAudit(ctx.user.id, "update_user", "user", input.userId, {
        targetName: [target.last_name, target.first_name].filter(Boolean).join(" "),
        changes,
      });
      console.log("[Admin] User updated:", input.userId);
      return { success: true };
    }),

  adminGetUserDetails: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      try {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOL DEFAULT true`;
      } catch {}
      try {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOL DEFAULT false`;
      } catch {}
      const [user] = await sql`SELECT * FROM users WHERE id = ${input.userId}::uuid`;
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      const [addresses, devices, requests, reviews, chats, portfolioPhotos, subscriptions] = await Promise.all([
        sql`SELECT * FROM user_addresses WHERE user_id = ${input.userId}::uuid`,
        sql`SELECT id, device_name, platform, is_revoked, created_at FROM user_devices WHERE user_id = ${input.userId}::uuid ORDER BY created_at DESC LIMIT 20`,
        sql`
          SELECT sr.id, sr.status, sr.created_at, sc.name as category_name
          FROM service_requests sr
          INNER JOIN service_categories sc ON sc.id = sr.category_id
          WHERE sr.client_id = ${input.userId}::uuid OR sr.executor_id = ${input.userId}::uuid
          ORDER BY sr.created_at DESC LIMIT 50
        `,
        sql`
          SELECT r.rating, r.text, r.created_at, u.first_name as author_first_name, u.last_name as author_last_name
          FROM reviews r INNER JOIN users u ON u.id = r.author_id
          WHERE r.target_id = ${input.userId}::uuid
          ORDER BY r.created_at DESC LIMIT 20
        `,
        sql`
          SELECT c.id, c.type, c.last_message_at FROM chats c
          INNER JOIN chat_participants cp ON cp.chat_id = c.id
          WHERE cp.user_id = ${input.userId}::uuid
          ORDER BY c.last_message_at DESC NULLS LAST LIMIT 20
        `,
        sql`SELECT id, photo_url FROM executor_portfolio_photos WHERE user_id = ${input.userId}::uuid ORDER BY sort_order ASC LIMIT 20`,
        sql`SELECT sc.slug, sc.name FROM user_category_subscriptions ucs INNER JOIN service_categories sc ON sc.id = ucs.category_id WHERE ucs.user_id = ${input.userId}::uuid`,
      ]);

      return {
        id: user.id,
        userNumber: user.user_number || null,
        firstName: user.first_name,
        lastName: user.last_name,
        name: [user.last_name, user.first_name].filter(Boolean).join(" ") || "Пользователь",
        phone: user.phone,
        email: user.email,
        emailVerified: user.email_verified,
        role: user.role,
        city: user.city,
        region: user.region,
        about: user.about,
        statusText: user.status_text,
        avatar: user.avatar_url,
        rating: parseFloat(user.rating) || 5,
        ratingCount: user.rating_count || 0,
        requestsCount: user.requests_count || 0,
        completedCount: user.completed_count || 0,
        isBlocked: user.is_blocked,
        oauthProvider: user.oauth_provider,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        hasPassword: !!user.password_hash,
        twoFaEnabled: !!user.two_fa_enabled,
        isDemo: !!user.is_demo,
        addresses: addresses.map((a: any) => ({
          id: a.id, label: a.label, fullAddress: a.full_address,
          city: a.city, street: a.street, house: a.house,
        })),
        devices: devices.map((d: any) => ({
          id: d.id, deviceName: d.device_name, platform: d.platform,
          isRevoked: d.is_revoked, createdAt: d.created_at,
        })),
        requests: requests.map((r: any) => ({
          id: r.id, status: r.status, categoryName: r.category_name, createdAt: r.created_at,
        })),
        reviews: reviews.map((r: any) => ({
          rating: Number(r.rating), text: r.text,
          authorName: [r.author_last_name, r.author_first_name].filter(Boolean).join(" "),
          createdAt: r.created_at,
        })),
        chats: chats.map((c: any) => ({ id: c.id, type: c.type, lastMessageAt: c.last_message_at })),
        portfolio: portfolioPhotos.map((p: any) => ({ id: p.id, photoUrl: p.photo_url })),
        subscriptions: subscriptions.map((s: any) => ({ slug: s.slug, name: s.name })),
      };
    }),

  adminRevokeAllSessions: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sql`UPDATE user_devices SET is_revoked = true WHERE user_id = ${input.userId}::uuid`;
      await logAudit(ctx.user.id, "revoke_sessions", "user", input.userId);
      console.log("[Admin] All sessions revoked for user:", input.userId);
      return { success: true };
    }),

  adminToggleDemo: adminProcedure
    .input(z.object({
      userId: z.string(),
      isDemo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await sql`SELECT id, first_name, last_name, role FROM users WHERE id = ${input.userId}::uuid`;
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      try {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOL DEFAULT false`;
      } catch (e) {
        console.warn("[Admin] ensure is_demo column:", e);
      }
      try {
        await sql`UPDATE users SET is_demo = ${input.isDemo}, updated_at = NOW() WHERE id = ${input.userId}::uuid`;
      } catch (e: any) {
        console.error("[Admin] Failed to update is_demo:", e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message || "Не удалось обновить демо-режим" });
      }
      invalidateUserCache();
      await logAudit(ctx.user.id, input.isDemo ? "enable_demo" : "disable_demo", "user", input.userId, {
        targetName: [target.last_name, target.first_name].filter(Boolean).join(" "),
        targetRole: target.role,
      });
      console.log("[Admin] Demo mode toggled for user:", input.userId, "isDemo:", input.isDemo);
      return { success: true };
    }),

  adminToggle2FA: adminProcedure
    .input(z.object({
      userId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await sql`SELECT id, first_name, last_name, role, email FROM users WHERE id = ${input.userId}::uuid`;
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      try {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOL DEFAULT true`;
      } catch (e) {
        console.warn("[Admin] ensure two_fa_enabled column:", e);
      }
      try {
        await sql`UPDATE users SET two_fa_enabled = ${input.enabled}, updated_at = NOW() WHERE id = ${input.userId}::uuid`;
      } catch (e: any) {
        console.error("[Admin] Failed to update two_fa_enabled:", e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message || "Не удалось обновить 2FA" });
      }
      invalidateUserCache();
      await logAudit(ctx.user.id, input.enabled ? "enable_2fa" : "disable_2fa", "user", input.userId, {
        targetName: [target.last_name, target.first_name].filter(Boolean).join(" "),
        targetRole: target.role,
      });
      console.log("[Admin] 2FA toggled for user:", input.userId, "enabled:", input.enabled);
      return { success: true };
    }),

  auditLog: adminProcedure
    .input(
      z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        action: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      const logs = await sql`
        SELECT aal.*, u.first_name as admin_first_name, u.last_name as admin_last_name
        FROM admin_action_logs aal
        INNER JOIN users u ON u.id = aal.admin_id
        ${input?.action ? sql`WHERE aal.action = ${input.action}` : sql``}
        ORDER BY aal.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return logs.map((l: any) => ({
        id: l.id,
        adminId: l.admin_id,
        adminName: [l.admin_last_name, l.admin_first_name].filter(Boolean).join(" ") || "Админ",
        action: l.action,
        targetType: l.target_type,
        targetId: l.target_id,
        details: l.details || {},
        createdAt: l.created_at,
      }));
    }),

  listServiceCategories: adminProcedure.query(async () => {
    const rows = await sql`
      SELECT sc.id::text as id, sc.slug, sc.name, sc.icon, sc.color, sc.bg_color, sc.description,
        COALESCE(sc.is_active, true) as is_active, COALESCE(sc.sort_order, 0) as sort_order,
        (SELECT COUNT(*)::int FROM user_category_subscriptions ucs WHERE ucs.category_id = sc.id) as subscribers_count,
        (SELECT COUNT(*)::int FROM service_requests sr WHERE sr.category_id = sc.id) as requests_count
      FROM service_categories sc
      WHERE sc.slug IS NOT NULL
      ORDER BY COALESCE(sc.sort_order, 0) ASC, sc.created_at ASC
    `;
    return rows.map((r: any) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      icon: String(r.icon ?? "Wrench"),
      color: String(r.color ?? "#0F766E"),
      bgColor: String(r.bg_color ?? "#CCFBF1"),
      description: String(r.description ?? ""),
      isActive: r.is_active !== false,
      sortOrder: Number(r.sort_order ?? 0),
      subscribersCount: Number(r.subscribers_count ?? 0),
      requestsCount: Number(r.requests_count ?? 0),
    }));
  }),

  createServiceCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(2).max(128),
        description: z.string().max(500).optional(),
        icon: z.string().min(1).max(64),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim();
      const dupe = await sql`SELECT id FROM service_categories WHERE LOWER(name) = ${name.toLowerCase()}`;
      if (dupe.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Категория с таким названием уже существует" });
      }

      let slug = slugifyCategoryName(name);
      const slugTaken = await sql`SELECT id FROM service_categories WHERE slug = ${slug}`;
      if (slugTaken.length > 0) {
        slug = `${slug}_${Date.now().toString(36)}`;
      }

      const [maxRow] = await sql`SELECT COALESCE(MAX(sort_order), 0)::int as max_order FROM service_categories`;
      const id = generateUuid();
      await sql`
        INSERT INTO service_categories (id, name, slug, icon, color, bg_color, description, is_active, sort_order)
        VALUES (${id}::uuid, ${name}, ${slug}, ${input.icon}, ${input.color}, ${input.bgColor}, ${input.description?.trim() ?? ""}, true, ${Number(maxRow?.max_order ?? 0) + 1})
      `;
      void logAudit(ctx.user.id, "create_service_category", "service_category", id, { name, slug });
      console.log("[Admin] Service category created:", slug);
      return { id, slug };
    }),

  updateServiceCategory: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(128).optional(),
        description: z.string().max(500).optional(),
        icon: z.string().min(1).max(64).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await sql`SELECT id, name FROM service_categories WHERE id = ${input.id}::uuid`;
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Категория не найдена" });
      }
      if (input.name) {
        const dupe = await sql`
          SELECT id FROM service_categories
          WHERE LOWER(name) = ${input.name.trim().toLowerCase()} AND id != ${input.id}::uuid
        `;
        if (dupe.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Категория с таким названием уже существует" });
        }
      }

      await sql`
        UPDATE service_categories SET
          name = COALESCE(${input.name?.trim() ?? null}, name),
          description = COALESCE(${input.description ?? null}, description),
          icon = COALESCE(${input.icon ?? null}, icon),
          color = COALESCE(${input.color ?? null}, color),
          bg_color = COALESCE(${input.bgColor ?? null}, bg_color),
          is_active = COALESCE(${input.isActive ?? null}, is_active)
        WHERE id = ${input.id}::uuid
      `;
      void logAudit(ctx.user.id, "update_service_category", "service_category", input.id, {
        name: input.name,
        isActive: input.isActive,
      });
      console.log("[Admin] Service category updated:", input.id, "isActive:", input.isActive);
      return { success: true };
    }),
});

const CYRILLIC_TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

/** Transliterates a category name into a URL-safe slug (e.g. "Мойка окон" → "moyka_okon"). */
function slugifyCategoryName(name: string): string {
  let out = "";
  for (const ch of name.toLowerCase()) {
    out += CYRILLIC_TRANSLIT[ch] ?? ch;
  }
  const slug = out.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
  return slug || `category_${Date.now().toString(36)}`;
}
