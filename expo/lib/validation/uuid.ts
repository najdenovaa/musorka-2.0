import { z } from "zod";

/** UUID v4-style string (Zod built-in). */
export const uuidStringSchema = z.string().uuid();

export function isValidUuidString(value: string): boolean {
  return uuidStringSchema.safeParse(value).success;
}
