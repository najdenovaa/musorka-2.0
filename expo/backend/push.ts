import sql from "@/backend/db/index";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: Record<string, any>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

type NotificationType = 'new_message' | 'request_update' | 'new_request' | 'system' | 'broadcast';

function mapNotifTypeToSettingColumn(type?: string): string | null {
  switch (type) {
    case 'new_message': return 'new_messages';
    case 'request_update': return 'request_updates';
    case 'new_request': return 'request_updates';
    case 'system': return 'system_alerts';
    case 'broadcast': return 'promotions';
    default: return null;
  }
}

async function isUserPushEnabled(userId: string, notifType?: string): Promise<boolean> {
  try {
    const col = mapNotifTypeToSettingColumn(notifType);
    if (!col) return true;
    const [settings] = await sql`
      SELECT new_messages, request_updates, promotions, system_alerts
      FROM user_notification_settings WHERE user_id = ${userId}::uuid
    `;
    if (!settings) return true;
    const val = settings[col];
    console.log("[Push] User", userId, "notifType:", notifType, "col:", col, "val:", val);
    return val !== false;
  } catch (err) {
    console.error("[Push] Error checking notification settings:", err);
    return true;
  }
}

/** Unread notifications count for one user — used as the app icon badge number (iOS). */
async function getUnreadBadgeCount(userId: string): Promise<number | undefined> {
  try {
    const [row] = await sql`
      SELECT COUNT(*)::int as cnt FROM notifications
      WHERE recipient_id = ${userId}::uuid AND is_read = false
    `;
    return Number(row?.cnt ?? 0);
  } catch (err) {
    console.error("[Push] Error computing badge count:", err);
    return undefined;
  }
}

/** Unread notifications counts for many users in one query. */
async function getUnreadBadgeCounts(userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  try {
    const rows = await sql`
      SELECT recipient_id::text as user_id, COUNT(*)::int as cnt
      FROM notifications
      WHERE recipient_id IN ${sql(userIds)} AND is_read = false
      GROUP BY recipient_id
    `;
    for (const r of rows as any[]) {
      map.set(String(r.user_id), Number(r.cnt));
    }
  } catch (err) {
    console.error("[Push] Error computing badge counts:", err);
  }
  return map;
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  notifType?: string
): Promise<void> {
  try {
    const enabled = await isUserPushEnabled(userId, notifType);
    if (!enabled) {
      console.log("[Push] User has disabled this notification type:", userId, notifType);
      return;
    }

    const tokens = await sql`
      SELECT token FROM push_tokens WHERE user_id = ${userId}::uuid
    `;
    if (tokens.length === 0) {
      console.log("[Push] No tokens for user:", userId);
      return;
    }

    const badge = await getUnreadBadgeCount(userId);

    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.token,
      title,
      body,
      data: data || {},
      sound: "default" as const,
      ...(badge !== undefined ? { badge } : {}),
      priority: "high" as const,
      channelId: "default",
    }));

    await sendExpoPushBatch(messages);
    console.log("[Push] Sent to user:", userId, "tokens:", tokens.length, "badge:", badge);
  } catch (err) {
    console.error("[Push] Error sending to user:", userId, err);
  }
}

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, any>,
  notifType?: string
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    console.log("[Push] sendPushToUsers called for", userIds.length, "users, type:", notifType);
    console.log("[Push] Target user IDs:", userIds.slice(0, 10).map(id => id.substring(0, 8)));

    let filteredUserIds = [...userIds];
    const col = mapNotifTypeToSettingColumn(notifType);
    if (col) {
      try {
        const uuidIds = userIds.map(id => id.trim());
        let disabledRows: Record<string, any>[] = [];
        if (col === 'new_messages') {
          disabledRows = await sql`
            SELECT user_id::text as user_id FROM user_notification_settings
            WHERE user_id IN ${sql(uuidIds)} AND new_messages = false
          `;
        } else if (col === 'request_updates') {
          disabledRows = await sql`
            SELECT user_id::text as user_id FROM user_notification_settings
            WHERE user_id IN ${sql(uuidIds)} AND request_updates = false
          `;
        } else if (col === 'promotions') {
          disabledRows = await sql`
            SELECT user_id::text as user_id FROM user_notification_settings
            WHERE user_id IN ${sql(uuidIds)} AND promotions = false
          `;
        } else if (col === 'system_alerts') {
          disabledRows = await sql`
            SELECT user_id::text as user_id FROM user_notification_settings
            WHERE user_id IN ${sql(uuidIds)} AND system_alerts = false
          `;
        }
        const disabledSet = new Set(disabledRows.map((r: any) => String(r.user_id)));
        if (disabledSet.size > 0) {
          filteredUserIds = userIds.filter(id => !disabledSet.has(id));
          console.log("[Push] Filtered out", disabledSet.size, "users with disabled", notifType, "notifications");
        }
      } catch (filterErr) {
        console.error("[Push] Error filtering by notification settings (proceeding without filter):", filterErr);
        filteredUserIds = [...userIds];
      }
    }

    if (filteredUserIds.length === 0) {
      console.log("[Push] All target users have disabled this notification type");
      return;
    }

    const trimmedIds = filteredUserIds.map(id => id.trim());
    const tokens = await sql`
      SELECT DISTINCT token, user_id::text as user_id FROM push_tokens WHERE user_id IN ${sql(trimmedIds)}
    `;
    console.log("[Push] Found", tokens.length, "push tokens for", filteredUserIds.length, "users, notifType:", notifType);
    if (tokens.length === 0) {
      console.log("[Push] No tokens found. Checking push_tokens table...");
      const [totalTokens] = await sql`SELECT COUNT(*)::int as cnt FROM push_tokens`;
      console.log("[Push] Total push_tokens in DB:", totalTokens?.cnt);
      const sampleTokens = await sql`SELECT user_id::text as user_id, substring(token, 1, 30) as token_prefix FROM push_tokens LIMIT 5`;
      console.log("[Push] Sample tokens:", sampleTokens.map((t: any) => ({ uid: t.user_id?.substring(0, 8), tok: t.token_prefix })));
      return;
    }

    const badgeByUser = await getUnreadBadgeCounts(trimmedIds);

    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.token,
      title,
      body,
      data: data || {},
      sound: "default" as const,
      badge: badgeByUser.get(String(t.user_id)) ?? 0,
      priority: "high" as const,
      channelId: "default",
    }));

    console.log("[Push] Sending", messages.length, "push messages for type:", notifType);
    await sendExpoPushBatch(messages);
    console.log("[Push] Successfully sent to", filteredUserIds.length, "users,", tokens.length, "tokens");
  } catch (err) {
    console.error("[Push] Error sending to users:", err);
  }
}

async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error("[Push] HTTP error:", response.status, await response.text());
        continue;
      }

      const result = await response.json() as { data: ExpoPushTicket[] };
      const errors = result.data?.filter((t: ExpoPushTicket) => t.status === "error") || [];
      if (errors.length > 0) {
        console.warn("[Push] Ticket errors:", JSON.stringify(errors));
        for (const err of errors) {
          if (err.details && (err.details as any).error === "DeviceNotRegistered") {
            const failedToken = batch.find((_, idx) => result.data[idx] === err)?.to;
            if (failedToken) {
              console.log("[Push] Removing invalid token:", failedToken);
              sql`DELETE FROM push_tokens WHERE token = ${failedToken}`.catch(() => {});
            }
          }
        }
      }
      console.log("[Push] Batch sent:", batch.length, "ok:", result.data?.filter((t: ExpoPushTicket) => t.status === "ok").length);
    } catch (err) {
      console.error("[Push] Batch send error:", err);
    }
  }
}
