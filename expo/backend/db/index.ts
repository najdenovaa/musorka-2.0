import postgres from "postgres";

function getConnectionUrl(): string {
  let url = process.env.DATABASE_URL || "";
  if (!url.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  url = url.replace("postgresql+asyncpg://", "postgres://");
  url = url.replace("postgresql://", "postgres://");
  if (!url.startsWith("postgres://")) {
    url = "postgres://" + url;
  }
  return url;
}

const connectionUrl = getConnectionUrl();
console.log("[DB] Connecting to external PostgreSQL...");

const sql = postgres(connectionUrl, {
  max: 25,
  idle_timeout: 120,
  connect_timeout: 10,
  ssl: false,
  prepare: true,
  fetch_types: false,
});

let initialized = false;
let initPromise: Promise<void> | null = null;

async function ensureInitialized() {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    try {
      console.log("[DB] Auto-initializing external PostgreSQL database...");
      const { initDatabase } = await import("./init");
      await initDatabase();
      initialized = true;
      console.log("[DB] External PostgreSQL database ready");
    } catch (err) {
      initPromise = null;
      console.error("[DB] Initialization failed:", err);
      throw err;
    }
  })();
  await initPromise;
}

export { sql, ensureInitialized };
export default sql;
