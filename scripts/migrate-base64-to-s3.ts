/**
 * One-shot migration: data:image base64 in service_request_files.file_url
 * and users.avatar_url -> upload to S3 -> replace with public https URL.
 *
 * Run inside bp-backend container (has DATABASE_URL + S3_* env):
 *   docker cp /var/M2.0/scripts/migrate-base64-to-s3.ts bp-backend:/tmp/m.ts
 *   docker exec bp-backend bun /tmp/m.ts
 *
 * Idempotent: skips rows that no longer match LIKE 'data:%'.
 * Continues on per-row failures, summarises ok/fail counts at the end.
 */

import sql from "../backend/db/index";
import {
  uploadBufferToS3,
  generateKey,
  extFromContentType,
  isS3Configured,
} from "../backend/lib/s3";

interface ParsedDataUri {
  contentType: string;
  buffer: Buffer;
}

function parseDataUri(uri: string): ParsedDataUri | null {
  if (typeof uri !== "string") return null;
  const m = uri.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/i);
  if (!m) return null;
  const contentType = (m[1] || "application/octet-stream").trim().toLowerCase();
  const payload = m[2];
  let buffer: Buffer;
  try {
    if (uri.includes(";base64,")) {
      buffer = Buffer.from(payload, "base64");
    } else {
      buffer = Buffer.from(decodeURIComponent(payload), "utf8");
    }
  } catch {
    return null;
  }
  if (buffer.length === 0) return null;
  return { contentType, buffer };
}

interface FileRow {
  id: string;
  request_id: string;
  file_type: string;
  file_url: string;
}

async function migrateRequestFiles(): Promise<{ ok: number; fail: number; skipped: number }> {
  const rows = await sql<FileRow[]>`
    SELECT id, request_id, file_type, file_url
    FROM service_request_files
    WHERE file_url LIKE 'data:%'
    ORDER BY created_at ASC
  `;
  console.log(`[migrate] service_request_files: ${rows.length} rows to process`);

  let ok = 0, fail = 0, skipped = 0;
  for (const row of rows) {
    const tag = `${row.id.slice(0, 8)} ${row.file_type}`;
    try {
      const parsed = parseDataUri(row.file_url);
      if (!parsed) {
        console.warn(`[skip] ${tag}: malformed data uri (len=${row.file_url.length})`);
        skipped++;
        continue;
      }
      const ext = extFromContentType(parsed.contentType);
      const prefix =
        row.file_type === "attachment"
          ? "requests"
          : row.file_type === "completion_photo"
            ? "completions"
            : "files";
      const key = generateKey(prefix, ext);
      const result = await uploadBufferToS3(parsed.buffer, key, parsed.contentType);

      await sql`
        UPDATE service_request_files
        SET file_url = ${result.url}
        WHERE id = ${row.id}::uuid AND file_url LIKE 'data:%'
      `;
      console.log(
        `[ok] ${tag} ${parsed.contentType} ${parsed.buffer.length}B -> ${result.url}`,
      );
      ok++;
    } catch (e: any) {
      console.error(`[fail] ${tag}: ${e?.message ?? e}`);
      fail++;
    }
  }
  console.log(`[migrate] service_request_files done: ok=${ok} fail=${fail} skipped=${skipped}`);
  return { ok, fail, skipped };
}

interface UserRow {
  id: string;
  avatar_url: string;
}

async function migrateUserAvatars(): Promise<{ ok: number; fail: number; skipped: number }> {
  const rows = await sql<UserRow[]>`
    SELECT id, avatar_url
    FROM users
    WHERE avatar_url LIKE 'data:%'
    ORDER BY id
  `;
  console.log(`[migrate] users.avatar_url: ${rows.length} rows to process`);

  let ok = 0, fail = 0, skipped = 0;
  for (const row of rows) {
    const tag = `user ${row.id.slice(0, 8)}`;
    try {
      const parsed = parseDataUri(row.avatar_url);
      if (!parsed) {
        console.warn(`[skip] ${tag}: malformed data uri (len=${row.avatar_url.length})`);
        skipped++;
        continue;
      }
      const ext = extFromContentType(parsed.contentType);
      const key = generateKey("avatars", ext);
      const result = await uploadBufferToS3(parsed.buffer, key, parsed.contentType);

      await sql`
        UPDATE users
        SET avatar_url = ${result.url}
        WHERE id = ${row.id}::uuid AND avatar_url LIKE 'data:%'
      `;
      console.log(
        `[ok] ${tag} ${parsed.contentType} ${parsed.buffer.length}B -> ${result.url}`,
      );
      ok++;
    } catch (e: any) {
      console.error(`[fail] ${tag}: ${e?.message ?? e}`);
      fail++;
    }
  }
  console.log(`[migrate] users.avatar_url done: ok=${ok} fail=${fail} skipped=${skipped}`);
  return { ok, fail, skipped };
}

async function main() {
  if (!isS3Configured()) {
    console.error("[migrate] S3 not configured (S3_ENDPOINT/BUCKET/KEYS missing). Aborting.");
    process.exit(2);
  }
  console.log("[migrate] start");
  const t0 = Date.now();
  const f = await migrateRequestFiles();
  const a = await migrateUserAvatars();
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[migrate] all done in ${dur}s. files: ok=${f.ok} fail=${f.fail} skipped=${f.skipped}, avatars: ok=${a.ok} fail=${a.fail} skipped=${a.skipped}`,
  );
  process.exit(f.fail + a.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[migrate] fatal:", e);
  process.exit(1);
});
