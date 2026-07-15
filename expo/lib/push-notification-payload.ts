import { z } from "zod";
import { uuidStringSchema } from "@/lib/validation/uuid";

const pushDataSchema = z
  .object({
    requestId: uuidStringSchema.optional(),
    chatId: uuidStringSchema.optional(),
  })
  .passthrough();

export type PushNavTarget =
  | { type: "request"; requestId: string }
  | { type: "chat"; chatId: string };

/**
 * Validates Expo push notification `content.data` before deep navigation.
 * Returns null if payload is missing or invalid (no throw).
 */
export function parsePushNavData(raw: unknown): PushNavTarget | null {
  const parsed = pushDataSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[PushNav] Invalid notification data shape:", parsed.error.flatten());
    return null;
  }
  const { requestId, chatId } = parsed.data;
  if (requestId && chatId) {
    console.warn("[PushNav] Both requestId and chatId set; preferring requestId");
    return { type: "request", requestId };
  }
  if (requestId) return { type: "request", requestId };
  if (chatId) return { type: "chat", chatId };
  return null;
}
