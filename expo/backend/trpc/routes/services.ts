import { createTRPCRouter, publicProcedure } from "../create-context";
import sql from "@/backend/db/index";

/**
 * Public service catalog. `id` is the category slug — the client uses slugs
 * everywhere (subscriptions, request categoryId), UUIDs stay server-side.
 */
export const servicesRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const rows = await sql`
      SELECT slug, name, icon, color, bg_color, description
      FROM service_categories
      WHERE slug IS NOT NULL AND COALESCE(is_active, true) = true
      ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC, name ASC
    `;
    return rows.map((r: any) => ({
      id: String(r.slug),
      name: String(r.name),
      icon: String(r.icon ?? "Wrench"),
      color: String(r.color ?? "#0F766E"),
      bgColor: String(r.bg_color ?? "#CCFBF1"),
      description: String(r.description ?? ""),
    }));
  }),
});
