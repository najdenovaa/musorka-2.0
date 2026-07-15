import sql from "../backend/db";

(async () => {
  try {
    const col = await sql`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='users' AND column_name='is_demo'`;
    console.log("is_demo column:", col);
    if (col.length === 0) {
      console.log("Adding is_demo column...");
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOL DEFAULT false`;
      console.log("Added.");
    }
    const demoUsers = await sql`SELECT id, phone, email, is_demo FROM users WHERE is_demo = true LIMIT 50`;
    console.log("Demo users count:", demoUsers.length);
    console.log("Demo users:", demoUsers);
  } catch (e) {
    console.error("ERR", e);
  }
  process.exit(0);
})();
