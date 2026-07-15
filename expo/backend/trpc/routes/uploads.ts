import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { TRPCError } from "@trpc/server";
import { uploadBufferToS3, generateKey, extFromContentType, isS3Configured } from "../../lib/s3";

const ALLOWED_PREFIXES = ["avatars", "chat", "requests", "portfolio", "completions", "misc"] as const;

const MAX_BASE64_BYTES = 8 * 1024 * 1024;

function decodeDataUri(dataUri: string): { contentType: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) return null;
  const contentType = m[1] || "application/octet-stream";
  const b64 = m[2];
  try {
    const buffer = Buffer.from(b64, "base64");
    return { contentType, buffer };
  } catch {
    return null;
  }
}

export const uploadsRouter = createTRPCRouter({
  uploadBase64: protectedProcedure
    .input(
      z.object({
        dataUri: z.string().min(20),
        prefix: z.enum(ALLOWED_PREFIXES).default("misc"),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isS3Configured()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "S3 не настроен на сервере" });
      }
      const decoded = decodeDataUri(input.dataUri);
      if (!decoded) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Некорректные данные изображения" });
      }
      if (decoded.buffer.length > MAX_BASE64_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Файл слишком большой" });
      }
      const ext = extFromContentType(decoded.contentType);
      const key = generateKey(input.prefix, ext);
      try {
        const result = await uploadBufferToS3(decoded.buffer, key, decoded.contentType);
        return result;
      } catch (e: any) {
        console.error("[uploads.uploadBase64] Error:", e?.message || e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить файл" });
      }
    }),
});
