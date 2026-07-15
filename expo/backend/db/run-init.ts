import { initDatabase } from "./init";

console.log("[SCRIPT] Starting database initialization...");

initDatabase()
  .then((r) => {
    console.log("[SCRIPT] Done:", JSON.stringify(r));
    process.exit(0);
  })
  .catch((e) => {
    console.error("[SCRIPT] Error:", e);
    process.exit(1);
  });
