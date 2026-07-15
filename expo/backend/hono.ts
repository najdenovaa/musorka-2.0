import { trpcServer } from "./trpc-adapter";
import { Hono } from "hono";
import type { Context, Next } from "hono";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { ensureInitialized } from "./db/index";
import { initDatabase } from "./db/init";
import sql from "./db/index";
import { uploadBufferToS3, generateKey, extFromContentType, isS3Configured } from "./lib/s3";

const API_VERSION = "v18";
console.log(`[HONO] MUSORKA API ${API_VERSION} starting...`);
console.log("[HONO] Build timestamp:", new Date().toISOString());
const dbUrl = process.env.DATABASE_URL || "";
console.log("[HONO] DATABASE_URL set:", !!dbUrl, "host-preview:", dbUrl.replace(/\/\/.*@/, "//***@").substring(0, 60));

const app = new Hono();

const ALLOWED_HEADERS = "Content-Type,Authorization,X-Requested-With,Accept,trpc-accept,x-trpc-source,Origin";
const ALLOWED_METHODS = "GET,POST,OPTIONS";

app.use("*", async (c: Context, next: Next) => {
  const origin = c.req.header("origin") || "*";

  if (c.req.method === "OPTIONS") {
    const reqHeaders = c.req.header("access-control-request-headers") || ALLOWED_HEADERS;
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": reqHeaders,
        "Access-Control-Max-Age": "600",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type",
        "Vary": "Origin, Access-Control-Request-Headers",
      },
    });
  }

  await next();

  try {
    const headers = new Headers(c.res.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Type");
    const vary = headers.get("Vary") || "";
    if (!vary.toLowerCase().split(",").map((s) => s.trim()).includes("origin")) {
      headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
    }
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  } catch (e) {
    console.warn("[CORS] failed to rewrite response headers:", e);
  }
});

function getClientIp(c: Context): string {
  return c.req.header("cf-connecting-ip")
    || c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("x-real-ip")
    || "-";
}

app.use("*", async (c: Context, next: Next) => {
  const startedAt = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const userAgent = c.req.header("user-agent") || "-";
  const ip = getClientIp(c);

  try {
    await next();
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[REQ][ERROR] ${method} ${path} ip=${ip} ua="${userAgent}" ${durationMs}ms`, error?.message || error);
    throw error;
  } finally {
    const durationMs = Date.now() - startedAt;
    const status = c.res.status || 200;
    const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
    console.log(`[REQ][${level}] ${method} ${path} ${status} ${durationMs}ms ip=${ip} ua="${userAgent}"`);
  }
});

app.onError((error, c) => {
  console.error(`[HTTP 500] ${c.req.method} ${c.req.path}:`, error?.message || error);
  return c.json({ error: "Внутренняя ошибка сервера" }, 500);
});

app.notFound((c) => {
  console.warn(`[HTTP 404] ${c.req.method} ${c.req.path}`);
  return c.json({ error: "Маршрут не найден" }, 404);
});

let dbReady = false;
let dbInitError: Error | null = null;

const initPromise = ensureInitialized().then(() => {
  dbReady = true;
  console.log("[HONO] DB initialization complete");
}).catch((err) => {
  dbInitError = err;
  console.error("[DB] Failed to auto-initialize:", err);
});

app.use("/trpc/*", async (c, next) => {
  try {
    if (!dbReady && !dbInitError) {
      const timeout = Promise.race([
        initPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB init timeout')), 30000)),
      ]);
      await timeout;
    }
    if (dbInitError) {
      console.error("[HONO] DB not available, retrying init...");
      dbInitError = null;
      dbReady = false;
      try {
        await ensureInitialized();
        dbReady = true;
      } catch (retryErr: any) {
        dbInitError = retryErr;
        console.error("[HONO] DB retry failed:", retryErr?.message);
        return c.json({ error: "Сервер временно недоступен" }, 503);
      }
    }
  } catch (err: any) {
    console.error("[HONO] DB middleware error:", err?.message);
    return c.json({ error: "Сервер временно недоступен" }, 503);
  }
  return next();
});

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", async (c) => {
  try {
    const result = await sql`SELECT NOW() as server_time, current_database() as db_name`;
    const catCount = await sql`SELECT COUNT(*)::int as cnt FROM service_categories`;
    const userCount = await sql`SELECT COUNT(*)::int as cnt FROM users`;
    return c.json({
      status: "ok",
      version: API_VERSION,
      db: result[0]?.db_name,
      serverTime: result[0]?.server_time,
      categories: catCount[0]?.cnt,
      users: userCount[0]?.cnt,
    });
  } catch (e: any) {
    return c.json({ status: "ok", version: API_VERSION, dbError: e.message });
  }
});

app.post("/init-db", async (c) => {
  console.log(`[HONO] Manual init-db ${API_VERSION} triggered`);
  try {
    const result = await initDatabase();
    return c.json(result);
  } catch (error: any) {
    console.error(`[Init DB ${API_VERSION}] Error:`, error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post("/fix-seed", async (c) => {
  console.log("[HONO] Manual fix-seed triggered (runs full migration + seed)");
  try {
    const result = await initDatabase();
    const catCount = await sql`SELECT COUNT(*)::int as cnt FROM service_categories`;
    const userCount = await sql`SELECT COUNT(*)::int as cnt FROM users`;
    return c.json({ ...result, totalCategories: catCount[0]?.cnt, totalUsers: userCount[0]?.cnt });
  } catch (error: any) {
    console.error("[Fix Seed] Error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get("/health", (c) => {
  return c.json({ status: "ok", version: API_VERSION });
});

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_PREFIXES = new Set([
  "avatars",
  "chat",
  "requests",
  "portfolio",
  "completions",
  "misc",
]);

async function authenticateRequest(c: Context): Promise<{ userId: string } | null> {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.replace("Bearer ", "") || null;
  if (!token) return null;
  try {
    const result = await sql`
      SELECT u.id FROM users u
      INNER JOIN user_devices ud ON ud.user_id = u.id
      WHERE ud.device_key = ${token}
        AND ud.is_revoked = false
        AND COALESCE(ud.is_biometric_unlock, false) = false
        AND u.is_blocked = false
    `;
    const row = result[0] as { id: string } | undefined;
    if (!row) return null;
    return { userId: row.id };
  } catch (e) {
    console.error("[Upload] auth error:", e);
    return null;
  }
}

app.post("/upload", async (c) => {
  if (!isS3Configured()) {
    return c.json({ error: "S3 не настроен" }, 503);
  }

  const auth = await authenticateRequest(c);
  if (!auth) {
    return c.json({ error: "Необходима авторизация" }, 401);
  }

  const url = new URL(c.req.url);
  const prefixParam = (url.searchParams.get("prefix") || "misc").toLowerCase();
  const prefix = ALLOWED_UPLOAD_PREFIXES.has(prefixParam) ? prefixParam : "misc";

  try {
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return c.json({ error: "Файл не передан" }, 400);
      }
      const f = file as File;
      if (f.size > MAX_UPLOAD_BYTES) {
        return c.json({ error: "Файл слишком большой" }, 413);
      }
      const ct = f.type || "application/octet-stream";
      const ab = await f.arrayBuffer();
      const buf = Buffer.from(ab);
      const key = generateKey(prefix, extFromContentType(ct));
      const result = await uploadBufferToS3(buf, key, ct);
      return c.json(result);
    }

    const ct = contentType || "application/octet-stream";
    const ab = await c.req.arrayBuffer();
    if (ab.byteLength > MAX_UPLOAD_BYTES) {
      return c.json({ error: "Файл слишком большой" }, 413);
    }
    const buf = Buffer.from(ab);
    const key = generateKey(prefix, extFromContentType(ct));
    const result = await uploadBufferToS3(buf, key, ct);
    return c.json(result);
  } catch (e: any) {
    console.error("[Upload] Error:", e?.message || e);
    return c.json({ error: e?.message || "Ошибка загрузки" }, 500);
  }
});

app.get("/db-check", async (c) => {
  try {
    const t0 = Date.now();
    const result = await sql`SELECT NOW() as server_time, current_database() as db_name, version() as pg_version`;
    const pingMs = Date.now() - t0;

    const t1 = Date.now();
    const catCount = await sql`SELECT COUNT(*)::int as cnt FROM service_categories`;
    const userCount = await sql`SELECT COUNT(*)::int as cnt FROM users`;
    const reqCount = await sql`SELECT COUNT(*)::int as cnt FROM service_requests`;
    const queryMs = Date.now() - t1;

    return c.json({
      status: "ok",
      version: API_VERSION,
      db: {
        name: result[0]?.db_name,
        serverTime: result[0]?.server_time,
        pgVersion: (result[0]?.pg_version || "").substring(0, 80),
        pingMs,
        queryMs,
      },
      counts: {
        categories: catCount[0]?.cnt ?? 0,
        users: userCount[0]?.cnt ?? 0,
        requests: reqCount[0]?.cnt ?? 0,
      },
    });
  } catch (e: any) {
    console.error("[DB-CHECK] Error:", e?.message);
    return c.json({ status: "error", version: API_VERSION, error: e?.message }, 500);
  }
});

export default app;
