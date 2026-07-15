import app from "./hono";
import { Hono } from "hono";

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`[SERVER] Starting Hono server on port ${port}...`);

const root = new Hono();
root.route("/api", app);
root.route("/", app);

export default {
  port,
  fetch: root.fetch,
};
