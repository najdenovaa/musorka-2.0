import { z } from "zod";
import { TRPCError } from "../../trpc-vendor";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import sql from "@/backend/db/index";
import { isSafeImageUri } from "@/lib/is-safe-image-uri";

/**
 * Live feed: \u00ab\u0414\u043e/\u041f\u043e\u0441\u043b\u0435\u00bb \u043f\u043e \u0433\u043e\u0440\u043e\u0434\u0443.
 * \u041d\u0438\u043a\u0430\u043a\u0438\u0445 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439 \u0432 service_requests / service_request_files.
 * \u041f\u0443\u0431\u043b\u0438\u0447\u043d\u044b\u0435 HTTPS-URL S3 \u0431\u0435\u0440\u0451\u043c \u043a\u0430\u043a \u0435\u0441\u0442\u044c (\u0431\u0435\u0437 presign).
 */

export interface LiveExecutor {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  completedCount: number;
}

export interface LiveItem {
  id: string;
  serviceType: string;
  city: string | null;
  createdAt: string;
  completedAt: string | null;
  beforePhotos: string[];
  afterPhotos: string[];
  executor: LiveExecutor | null;
  likesCount: number;
  likedByMe: boolean;
}

export interface LiveFeedPage {
  items: LiveItem[];
  nextCursor: string | null;
}

interface ParsedCursor {
  ts: Date;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse opaque cursor of the form `${iso}|${uuid}`. Returns null on malformed input. */
export function parseCursor(raw: string | undefined | null): ParsedCursor | null {
  if (!raw || typeof raw !== "string") return null;
  const sep = raw.indexOf("|");
  if (sep <= 0 || sep >= raw.length - 1) return null;
  const tsStr = raw.slice(0, sep);
  const idStr = raw.slice(sep + 1);
  if (!UUID_RE.test(idStr)) return null;
  const ts = new Date(tsStr);
  if (Number.isNaN(ts.getTime())) return null;
  return { ts, id: idStr };
}

/** Format cursor from row's effective timestamp + id. */
export function formatCursor(ts: Date | string, id: string): string {
  const iso = typeof ts === "string" ? new Date(ts).toISOString() : ts.toISOString();
  return `${iso}|${id}`;
}

interface RawRow {
  id: string;
  category_name: string;
  city: string | null;
  created_at: string | Date;
  completed_at: string | Date | null;
  before_urls: string[] | null;
  after_urls: string[] | null;
  executor_id: string | null;
  executor_first_name: string | null;
  executor_last_name: string | null;
  executor_avatar_url: string | null;
  executor_rating: number | string | null;
  executor_completed_count: number | string | null;
  likes_count: number | string | null;
  liked_by_me: boolean | null;
}

/** Pure mapper: raw DB row -> LiveItem DTO. Exported for unit tests. */
const isHttpUrl = (u: unknown): u is string =>
  typeof u === "string" && (u.startsWith("https://") || u.startsWith("http://"));

export function mapRow(row: RawRow): LiveItem {
  // postgres-js в Bun иногда возвращает не Array для array_agg — жёстко проверяем.
  const beforeRaw: string[] = Array.isArray(row.before_urls) ? row.before_urls : [];
  const afterRaw: string[] = Array.isArray(row.after_urls) ? row.after_urls : [];
  // Страховка: не отдаём клиенту data:-URI из старых «грязных» записей.
  const before = beforeRaw.filter(isHttpUrl).filter(isSafeImageUri).slice(0, 3);
  const after = afterRaw.filter(isHttpUrl).filter(isSafeImageUri).slice(0, 3);
  const createdAtIso =
    typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString();
  const completedAtIso = row.completed_at
    ? typeof row.completed_at === "string"
      ? row.completed_at
      : row.completed_at.toISOString()
    : null;
  let executor: LiveExecutor | null = null;
  if (row.executor_id) {
    const fn = (row.executor_first_name ?? "").trim();
    const ln = (row.executor_last_name ?? "").trim();
    const fullName = [fn, ln].filter(Boolean).join(" ").trim() || "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c";
    executor = {
      id: row.executor_id,
      name: fullName,
      avatarUrl:
        isHttpUrl(row.executor_avatar_url) && isSafeImageUri(row.executor_avatar_url)
          ? row.executor_avatar_url
          : null,
      rating: Number(row.executor_rating ?? 0) || 0,
      completedCount: Number(row.executor_completed_count ?? 0) || 0,
    };
  }
  return {
    id: row.id,
    serviceType: row.category_name,
    city: row.city,
    createdAt: createdAtIso,
    completedAt: completedAtIso,
    beforePhotos: before,
    afterPhotos: after,
    executor,
    likesCount: Number(row.likes_count ?? 0) || 0,
    likedByMe: !!row.liked_by_me,
  };
}

// --- toggleLike rate limiter (in-memory, per-user) ---
const LIKE_RL_WINDOW_MS = 60_000;
const LIKE_RL_MAX = 30;
const likeBuckets = new Map<string, number[]>();

function checkLikeRateLimit(userId: string): boolean {
  const now = Date.now();
  const arr = likeBuckets.get(userId) ?? [];
  const fresh = arr.filter((t) => now - t < LIKE_RL_WINDOW_MS);
  if (fresh.length >= LIKE_RL_MAX) {
    likeBuckets.set(userId, fresh);
    return false;
  }
  fresh.push(now);
  likeBuckets.set(userId, fresh);
  // \u0418\u0437\u0440\u0435\u0434\u043a\u0430 \u0447\u0438\u0441\u0442\u0438\u043c \u0431\u0430\u043a\u0435\u0442\u044b, \u0447\u0442\u043e\u0431\u044b \u043d\u0435 \u0440\u043e\u0441\u043b\u0438 \u0431\u0435\u0441\u043a\u043e\u043d\u0435\u0447\u043d\u043e
  if (likeBuckets.size > 5000) {
    for (const [k, v] of likeBuckets) {
      const f = v.filter((t) => now - t < LIKE_RL_WINDOW_MS);
      if (f.length === 0) likeBuckets.delete(k);
      else likeBuckets.set(k, f);
    }
  }
  return true;
}

export const liveRouter = createTRPCRouter({
  feed: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<LiveFeedPage> => {
      const limit = Math.max(1, Math.min(50, input.limit ?? 20));
      const userId = ctx.user.id;
      const cityNorm = (ctx.user.city ?? "").trim().toLowerCase();

      // \u0415\u0441\u043b\u0438 \u0433\u043e\u0440\u043e\u0434 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d \u2014 \u043e\u0442\u0434\u0430\u0451\u043c \u043f\u0443\u0441\u0442\u044b\u0439 \u0444\u0438\u0434 (\u0431\u0435\u0437 \u0441\u044e\u0440\u043f\u0440\u0438\u0437\u043e\u0432).
      if (cityNorm.length === 0) {
        return { items: [], nextCursor: null };
      }

      const parsed = parseCursor(input.cursor);

      const runFallbackNoLikes = async (): Promise<RawRow[]> => {
        // \u0420\u0435\u0437\u0435\u0440\u0432\u043d\u044b\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442 \u043d\u0430 \u0441\u043b\u0443\u0447\u0430\u0439, \u043a\u043e\u0433\u0434\u0430 live_likes \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430.
        return parsed
          ? await sql<RawRow[]>`
              SELECT
                sr.id,
                sc.name AS category_name,
                sr.city,
                sr.created_at,
                sr.completed_at,
                ph.before_urls,
                ph.after_urls,
                eu.id AS executor_id,
                eu.first_name AS executor_first_name,
                eu.last_name AS executor_last_name,
                eu.avatar_url AS executor_avatar_url,
                eu.rating AS executor_rating,
                eu.completed_count AS executor_completed_count,
                0 AS likes_count,
                false AS liked_by_me
              FROM service_requests sr
              INNER JOIN service_categories sc ON sc.id = sr.category_id
              INNER JOIN users cu ON cu.id = sr.client_id AND cu.is_blocked = false
              LEFT JOIN users eu ON eu.id = sr.executor_id
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'attachment'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS before_urls,
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'completion_photo'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS after_urls
              ) ph ON true
              WHERE sr.status <> 'cancelled'
                AND (eu.id IS NULL OR eu.is_blocked = false)
                AND (
                  LOWER(TRIM(COALESCE(sr.city, ''))) = ${cityNorm}
                  OR sr.city IS NULL OR TRIM(sr.city) = ''
                )
                AND COALESCE(sr.completed_at, sr.created_at) >= NOW() - INTERVAL '3 days'
                AND EXISTS (
                  SELECT 1 FROM service_request_files srf
                  WHERE srf.request_id = sr.id
                    AND srf.file_type IN ('attachment', 'completion_photo')
                    AND srf.file_url LIKE 'http%'
                )
                AND (
                  COALESCE(sr.completed_at, sr.created_at) < ${parsed.ts.toISOString()}::timestamptz
                  OR (
                    COALESCE(sr.completed_at, sr.created_at) = ${parsed.ts.toISOString()}::timestamptz
                    AND sr.id < ${parsed.id}::uuid
                  )
                )
              ORDER BY COALESCE(sr.completed_at, sr.created_at) DESC, sr.id DESC
              LIMIT ${limit + 1}
            `
          : await sql<RawRow[]>`
              SELECT
                sr.id,
                sc.name AS category_name,
                sr.city,
                sr.created_at,
                sr.completed_at,
                ph.before_urls,
                ph.after_urls,
                eu.id AS executor_id,
                eu.first_name AS executor_first_name,
                eu.last_name AS executor_last_name,
                eu.avatar_url AS executor_avatar_url,
                eu.rating AS executor_rating,
                eu.completed_count AS executor_completed_count,
                0 AS likes_count,
                false AS liked_by_me
              FROM service_requests sr
              INNER JOIN service_categories sc ON sc.id = sr.category_id
              INNER JOIN users cu ON cu.id = sr.client_id AND cu.is_blocked = false
              LEFT JOIN users eu ON eu.id = sr.executor_id
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'attachment'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS before_urls,
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'completion_photo'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS after_urls
              ) ph ON true
              WHERE sr.status <> 'cancelled'
                AND (eu.id IS NULL OR eu.is_blocked = false)
                AND (
                  LOWER(TRIM(COALESCE(sr.city, ''))) = ${cityNorm}
                  OR sr.city IS NULL OR TRIM(sr.city) = ''
                )
                AND COALESCE(sr.completed_at, sr.created_at) >= NOW() - INTERVAL '3 days'
                AND EXISTS (
                  SELECT 1 FROM service_request_files srf
                  WHERE srf.request_id = sr.id
                    AND srf.file_type IN ('attachment', 'completion_photo')
                    AND srf.file_url LIKE 'http%'
                )
              ORDER BY COALESCE(sr.completed_at, sr.created_at) DESC, sr.id DESC
              LIMIT ${limit + 1}
            `;
      };

      let rows: RawRow[] = [];
      try {
        rows = parsed
          ? await sql<RawRow[]>`
              SELECT
                sr.id,
                sc.name AS category_name,
                sr.city,
                sr.created_at,
                sr.completed_at,
                ph.before_urls,
                ph.after_urls,
                eu.id AS executor_id,
                eu.first_name AS executor_first_name,
                eu.last_name AS executor_last_name,
                eu.avatar_url AS executor_avatar_url,
                eu.rating AS executor_rating,
                eu.completed_count AS executor_completed_count,
                COALESCE(lc.cnt, 0) AS likes_count,
                (me.liked IS NOT NULL) AS liked_by_me
              FROM service_requests sr
              INNER JOIN service_categories sc ON sc.id = sr.category_id
              INNER JOIN users cu ON cu.id = sr.client_id AND cu.is_blocked = false
              LEFT JOIN users eu ON eu.id = sr.executor_id
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'attachment'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS before_urls,
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'completion_photo'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS after_urls
              ) ph ON true
              LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS cnt FROM live_likes WHERE request_id = sr.id
              ) lc ON true
              LEFT JOIN LATERAL (
                SELECT 1 AS liked FROM live_likes WHERE request_id = sr.id AND user_id = ${userId} LIMIT 1
              ) me ON true
              WHERE sr.status <> 'cancelled'
                AND (eu.id IS NULL OR eu.is_blocked = false)
                AND (
                  LOWER(TRIM(COALESCE(sr.city, ''))) = ${cityNorm}
                  OR sr.city IS NULL OR TRIM(sr.city) = ''
                )
                AND COALESCE(sr.completed_at, sr.created_at) >= NOW() - INTERVAL '3 days'
                AND EXISTS (
                  SELECT 1 FROM service_request_files srf
                  WHERE srf.request_id = sr.id
                    AND srf.file_type IN ('attachment', 'completion_photo')
                    AND srf.file_url LIKE 'http%'
                )
                AND (
                  COALESCE(sr.completed_at, sr.created_at) < ${parsed.ts.toISOString()}::timestamptz
                  OR (
                    COALESCE(sr.completed_at, sr.created_at) = ${parsed.ts.toISOString()}::timestamptz
                    AND sr.id < ${parsed.id}::uuid
                  )
                )
              ORDER BY COALESCE(sr.completed_at, sr.created_at) DESC, sr.id DESC
              LIMIT ${limit + 1}
            `
          : await sql<RawRow[]>`
              SELECT
                sr.id,
                sc.name AS category_name,
                sr.city,
                sr.created_at,
                sr.completed_at,
                ph.before_urls,
                ph.after_urls,
                eu.id AS executor_id,
                eu.first_name AS executor_first_name,
                eu.last_name AS executor_last_name,
                eu.avatar_url AS executor_avatar_url,
                eu.rating AS executor_rating,
                eu.completed_count AS executor_completed_count,
                COALESCE(lc.cnt, 0) AS likes_count,
                (me.liked IS NOT NULL) AS liked_by_me
              FROM service_requests sr
              INNER JOIN service_categories sc ON sc.id = sr.category_id
              INNER JOIN users cu ON cu.id = sr.client_id AND cu.is_blocked = false
              LEFT JOIN users eu ON eu.id = sr.executor_id
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'attachment'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS before_urls,
                  COALESCE((
                    SELECT jsonb_agg(file_url::text ORDER BY sort_order, id)
                    FROM service_request_files
                    WHERE request_id = sr.id
                      AND file_type = 'completion_photo'
                      AND file_url LIKE 'http%'
                  ), '[]'::jsonb) AS after_urls
              ) ph ON true
              LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS cnt FROM live_likes WHERE request_id = sr.id
              ) lc ON true
              LEFT JOIN LATERAL (
                SELECT 1 AS liked FROM live_likes WHERE request_id = sr.id AND user_id = ${userId} LIMIT 1
              ) me ON true
              WHERE sr.status <> 'cancelled'
                AND (eu.id IS NULL OR eu.is_blocked = false)
                AND (
                  LOWER(TRIM(COALESCE(sr.city, ''))) = ${cityNorm}
                  OR sr.city IS NULL OR TRIM(sr.city) = ''
                )
                AND COALESCE(sr.completed_at, sr.created_at) >= NOW() - INTERVAL '3 days'
                AND EXISTS (
                  SELECT 1 FROM service_request_files srf
                  WHERE srf.request_id = sr.id
                    AND srf.file_type IN ('attachment', 'completion_photo')
                    AND srf.file_url LIKE 'http%'
                )
              ORDER BY COALESCE(sr.completed_at, sr.created_at) DESC, sr.id DESC
              LIMIT ${limit + 1}
            `;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Live] feed primary query failed, retrying without live_likes:", msg);
        try {
          rows = await runFallbackNoLikes();
        } catch (e2) {
          const msg2 = e2 instanceof Error ? e2.message : String(e2);
          console.error("[Live] feed fallback also failed:", msg2);
          return { items: [], nextCursor: null };
        }
      }

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const items = sliced.map(mapRow);

      let nextCursor: string | null = null;
      if (hasMore && sliced.length > 0) {
        const last = sliced[sliced.length - 1];
        const ts = last.completed_at ?? last.created_at;
        nextCursor = formatCursor(ts as Date | string, last.id);
      }

      return { items, nextCursor };
    }),

  toggleLike: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ liked: boolean; likesCount: number }> => {
      const userId = ctx.user.id;
      if (!checkLikeRateLimit(userId)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439" });
      }

      try {
        const deleted = await sql`
          DELETE FROM live_likes
          WHERE request_id = ${input.requestId}::uuid AND user_id = ${userId}
          RETURNING 1
        `;
        let liked: boolean;
        if (deleted.length > 0) {
          liked = false;
        } else {
          await sql`
            INSERT INTO live_likes (request_id, user_id)
            VALUES (${input.requestId}::uuid, ${userId})
            ON CONFLICT DO NOTHING
          `;
          liked = true;
        }
        const cnt = await sql<{ cnt: number }[]>`
          SELECT COUNT(*)::int AS cnt FROM live_likes WHERE request_id = ${input.requestId}::uuid
        `;
        return { liked, likesCount: Number(cnt[0]?.cnt ?? 0) };
      } catch (e) {
        console.error("[Live] toggleLike error:", e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043b\u0430\u0439\u043a" });
      }
    }),
});
