import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import sql from "@/backend/db/index";

export const notificationsRouter = createTRPCRouter({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const [settings] = await sql`
      SELECT new_messages, request_updates, promotions, system_alerts
      FROM user_notification_settings WHERE user_id = ${ctx.user.id}
    `;
    return settings || { newMessages: true, requestUpdates: true, promotions: true, systemAlerts: true };
  }),

  saveSettings: protectedProcedure
    .input(z.object({
      newMessages: z.boolean(),
      requestUpdates: z.boolean(),
      promotions: z.boolean(),
      systemAlerts: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await sql`
        INSERT INTO user_notification_settings (user_id, new_messages, request_updates, promotions, system_alerts, updated_at)
        VALUES (${ctx.user.id}, ${input.newMessages}, ${input.requestUpdates}, ${input.promotions}, ${input.systemAlerts}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          new_messages = ${input.newMessages},
          request_updates = ${input.requestUpdates},
          promotions = ${input.promotions},
          system_alerts = ${input.systemAlerts},
          updated_at = NOW()
      `;
      console.log('[Notifications] Settings saved for user:', ctx.user.id);
      return { success: true };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await sql`
      SELECT id, title, body, type, payload, is_read, created_at
      FROM notifications
      WHERE recipient_id = ${ctx.user.id}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return notifications.map((n: any) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      data: n.payload || {},
      read: n.is_read,
      createdAt: n.created_at,
    }));
  }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await sql`UPDATE notifications SET is_read = true WHERE id = ${input.id}::uuid`;
      return { success: true };
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await sql`
      UPDATE notifications SET is_read = true
      WHERE recipient_id = ${ctx.user.id} AND is_read = false
    `;
    return { success: true };
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await sql`
      SELECT COUNT(*)::int as count FROM notifications
      WHERE recipient_id = ${ctx.user.id} AND is_read = false
    `;
    return result.count as number;
  }),
});

export type NotificationSettingsOutput = {
  newMessages: boolean;
  requestUpdates: boolean;
  promotions: boolean;
  systemAlerts: boolean;
};
