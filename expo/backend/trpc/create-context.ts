import { initTRPC, TRPCError } from "@trpc/server";

interface FetchCreateContextFnOptions {
  req: Request;
  resHeaders: Headers;
}
import superjson from "superjson";
import sql from "@/backend/db/index";

export interface DbUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string | null;
  role: "client" | "executor" | "admin" | "support";
  city: string;
  rating: number;
  rating_count: number;
  requests_count: number;
  completed_count: number;
  avatar_url: string | null;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

const userCache = new Map<string, { user: DbUser; cachedAt: number }>();
const USER_CACHE_TTL = 300_000;
const lastSeenUpdated = new Map<string, number>();
const LAST_SEEN_INTERVAL = 900_000;

function getCachedUser(token: string): DbUser | null {
  const entry = userCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > USER_CACHE_TTL) {
    userCache.delete(token);
    return null;
  }
  return entry.user;
}

function setCachedUser(token: string, user: DbUser) {
  userCache.set(token, { user, cachedAt: Date.now() });
  if (userCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of userCache) {
      if (now - val.cachedAt > USER_CACHE_TTL) userCache.delete(key);
    }
  }
}

export function invalidateUserCache(token?: string) {
  if (token) {
    userCache.delete(token);
  } else {
    userCache.clear();
  }
}

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const authHeader = opts.req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || null;

  let user: DbUser | null = null;

  if (token) {
    user = getCachedUser(token);
    if (!user) {
      try {
        const result = await sql`
          SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role, u.city,
            u.rating, u.rating_count, u.requests_count, u.completed_count,
            u.avatar_url, u.is_blocked, u.created_at, u.updated_at
          FROM users u
          INNER JOIN user_devices ud ON ud.user_id = u.id
          WHERE ud.device_key = ${token}
            AND ud.is_revoked = false
            AND COALESCE(ud.is_biometric_unlock, false) = false
            AND u.is_blocked = false
        `;
        user = result[0] as DbUser | undefined ?? null;

        if (user) {
          setCachedUser(token, user);
        }
      } catch (e) {
        console.error("[Context] Error looking up user:", e);
      }
    }

    if (user) {
      const now = Date.now();
      const lastUpdate = lastSeenUpdated.get(token) || 0;
      if (now - lastUpdate > LAST_SEEN_INTERVAL) {
        lastSeenUpdated.set(token, now);
        sql`
          UPDATE user_devices SET last_seen_at = NOW()
          WHERE device_key = ${token} AND user_id = ${user.id}
        `.catch((e: unknown) => console.error("[Context] Failed to update last_seen_at:", e));
      }
    }
  }

  return { req: opts.req, user, token };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Необходима авторизация" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Доступ только для администраторов" });
  }
  return next({ ctx });
});

export const supportProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "support") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Доступ только для поддержки" });
  }
  return next({ ctx });
});
