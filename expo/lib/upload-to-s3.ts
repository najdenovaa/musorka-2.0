import { Platform } from "react-native";
import { getApiBaseUrl } from "@/lib/get-api-base-url";
import { getAuthToken } from "@/lib/trpc";

// Жёсткие лимиты, чтобы не уронить старые Android-устройства по памяти/диску.
// Изображения после pickPhotos обычно <500KB, так что 12MB — потолок безопасности.
const MAX_UPLOAD_BYTES_NATIVE = 12 * 1024 * 1024;
const MAX_UPLOAD_BYTES_WEB = 25 * 1024 * 1024;
// Параллельность загрузок: на native ограничиваем, чтобы не плодить большие
// одновременные запросы и не держать несколько base64-строк в памяти.
const UPLOAD_CONCURRENCY_NATIVE = 2;
const UPLOAD_CONCURRENCY_WEB = 4;

function approxBytesFromBase64(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  let pad = 0;
  if (b64.endsWith("==")) pad = 2;
  else if (b64.endsWith("=")) pad = 1;
  return Math.floor((len * 3) / 4) - pad;
}

async function getFileSizeBytes(uri: string): Promise<number> {
  if (Platform.OS === "web") return 0;
  if (!uri.startsWith("file:") && !uri.startsWith("content:") && !uri.startsWith("/")) return 0;
  try {
    const FS = await import("expo-file-system/legacy");
    const infoOptions: Record<string, boolean> = { size: true };
    const info = await FS.getInfoAsync(uri, infoOptions);
    if (info.exists && typeof (info as any).size === "number") return (info as any).size as number;
  } catch (e) {
    console.log("[uploadFileToS3] getInfoAsync failed:", e);
  }
  return 0;
}

export type UploadPrefix =
  | "avatars"
  | "chat"
  | "requests"
  | "portfolio"
  | "completions"
  | "misc";

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

function guessContentTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase().split("?")[0];
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function extractDataUriContentType(dataUri: string): string {
  const m = /^data:([^;]+);base64,/.exec(dataUri);
  return m?.[1] || "application/octet-stream";
}

async function dataUriToBlob(dataUri: string): Promise<Blob> {
  // На web используем fetch().blob() — браузер обрабатывает эффективно.
  // На native НЕ используем fetch().blob() — это вызывает RN BlobModule,
  // который грузит всё тело в память (OOM на старых Android).
  if (Platform.OS === "web" && typeof fetch !== "undefined") {
    const res = await fetch(dataUri);
    return await res.blob();
  }
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) throw new Error("Invalid data URI");
  const ct = m[1];
  const b64 = m[2];
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: ct });
}

/**
 * Native-only: записать data: URI во временный файл и вернуть file:// URI.
 * Позволяет загружать большие файлы стримом через FileSystem.uploadAsync,
 * избегая OOM в RN BlobModule на Android.
 */
async function dataUriToTempFileUri(dataUri: string, fileName: string): Promise<string | null> {
  try {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
    if (!m) return null;
    const b64 = m[2];
    const FS = await import("expo-file-system/legacy");
    const dir = (FS as any).cacheDirectory || (FS as any).documentDirectory;
    if (!dir) return null;
    const safeName = fileName.replace(/[^a-z0-9._-]/gi, "_");
    const target = `${dir}upload-${Date.now()}-${safeName}`;
    await FS.writeAsStringAsync(target, b64, { encoding: FS.EncodingType.Base64 });
    return target;
  } catch (e) {
    console.warn("[uploadFileToS3] dataUriToTempFileUri failed:", e);
    return null;
  }
}

export async function uploadFileToS3(
  uri: string,
  opts?: { prefix?: UploadPrefix; contentType?: string; fileName?: string },
): Promise<UploadResult> {
  const prefix: UploadPrefix = opts?.prefix ?? "misc";
  const apiBase = getApiBaseUrl();
  // Важно: nginx на проде проксирует на бэкенд только /api/*, поэтому используем /api/upload.
  // Иначе запрос уходит в статику (SPA) и возвращает HTML вместо JSON.
  const url = `${apiBase}/api/upload?prefix=${encodeURIComponent(prefix)}`;
  const token = await getAuthToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const platformLimit = Platform.OS === "web" ? MAX_UPLOAD_BYTES_WEB : MAX_UPLOAD_BYTES_NATIVE;
  console.log("[uploadFileToS3] start prefix=", prefix, "uri=", uri.slice(0, 80));

  try {
    if (uri.startsWith("data:")) {
      const ct = opts?.contentType || extractDataUriContentType(uri);
      const fileName =
        opts?.fileName || `upload-${Date.now()}.${(ct.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "")}`;

      const b64Part = uri.split(",")[1] ?? "";
      const approx = approxBytesFromBase64(b64Part);
      if (approx > platformLimit) {
        throw new Error(`Файл слишком большой (${Math.round(approx / 1024 / 1024)} МБ). Максимум ${Math.round(platformLimit / 1024 / 1024)} МБ.`);
      }

      // На native: пишем data URI во временный файл и стримим через uploadAsync,
      // чтобы не вызывать OOM в BlobModule на Android.
      if (Platform.OS !== "web") {
        const tmp = await dataUriToTempFileUri(uri, fileName);
        if (tmp) {
          const FS = await import("expo-file-system/legacy");
          try {
            const result = await FS.uploadAsync(url, tmp, {
              httpMethod: "POST",
              uploadType: FS.FileSystemUploadType.MULTIPART,
              fieldName: "file",
              mimeType: ct,
              headers,
              parameters: {},
            });
            if (result.status < 200 || result.status >= 300) {
              console.error("[uploadFileToS3] data-uri uploadAsync status=", result.status, (result.body || "").slice(0, 300));
              throw new Error(`Upload failed: ${result.status} ${(result.body || "").slice(0, 200)}`);
            }
            const json = JSON.parse(result.body) as UploadResult;
            console.log("[uploadFileToS3] done url=", json.url);
            return json;
          } catch (e) {
            console.warn("[uploadFileToS3] data-uri uploadAsync failed, falling back to blob path. size=", approx, "platform=", Platform.OS, Platform.Version, "err=", e);
          } finally {
            try { await FS.deleteAsync(tmp, { idempotent: true }); } catch {}
          }
        } else {
          console.warn("[uploadFileToS3] temp-file write failed, using blob fallback (may OOM on Android)");
        }
      }

      const blob = await dataUriToBlob(uri);
      const form = new FormData();
      form.append("file", blob as any, fileName);
      const res = await fetch(url, { method: "POST", headers, body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const json = (await res.json()) as UploadResult;
      console.log("[uploadFileToS3] done url=", json.url);
      return json;
    }

    if (Platform.OS === "web") {
      const fetched = await fetch(uri);
      const blob = await fetched.blob();
      const ct = opts?.contentType || blob.type || guessContentTypeFromUri(uri);
      const form = new FormData();
      const fileName =
        opts?.fileName || `upload-${Date.now()}.${(ct.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "")}`;
      form.append("file", new Blob([blob], { type: ct }) as any, fileName);
      const res = await fetch(url, { method: "POST", headers, body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const json = (await res.json()) as UploadResult;
      console.log("[uploadFileToS3] done url=", json.url);
      return json;
    }

    const ct = opts?.contentType || guessContentTypeFromUri(uri);
    const fileName =
      opts?.fileName || `upload-${Date.now()}.${(ct.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "")}`;

    const fileSize = await getFileSizeBytes(uri);
    if (fileSize > platformLimit) {
      throw new Error(`Файл слишком большой (${Math.round(fileSize / 1024 / 1024)} МБ). Максимум ${Math.round(platformLimit / 1024 / 1024)} МБ.`);
    }

    try {
      const FS = await import("expo-file-system/legacy");
      const uploadHeaders: Record<string, string> = { ...headers };
      const result = await FS.uploadAsync(url, uri, {
        httpMethod: "POST",
        uploadType: FS.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: ct,
        headers: uploadHeaders,
        parameters: {},
      });
      if (result.status < 200 || result.status >= 300) {
        console.error("[uploadFileToS3] uploadAsync failed status=", result.status, (result.body || "").slice(0, 300));
        throw new Error(`Upload failed: ${result.status} ${(result.body || "").slice(0, 200)}`);
      }
      const json = JSON.parse(result.body) as UploadResult;
      console.log("[uploadFileToS3] done url=", json.url);
      return json;
    } catch (e) {
      console.warn("[uploadFileToS3] uploadAsync path failed, falling back to FormData. size=", fileSize, "platform=", Platform.OS, Platform.Version, "err=", e);
    }

    const form = new FormData();
    form.append("file", {
      uri,
      name: fileName,
      type: ct,
    } as any);
    const res = await fetch(url, { method: "POST", headers, body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[uploadFileToS3] failed status=", res.status, text.slice(0, 300));
      throw new Error(`Upload failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as UploadResult;
    console.log("[uploadFileToS3] done url=", json.url);
    return json;
  } catch (e) {
    console.error("[uploadFileToS3] error:", e);
    throw e;
  }
}

export async function uploadManyToS3(
  uris: string[],
  opts?: { prefix?: UploadPrefix },
): Promise<string[]> {
  // Ограничиваем параллельность, чтобы не держать много больших payload
  // в памяти одновременно (особенно критично для старых Android).
  const limit = Platform.OS === "web" ? UPLOAD_CONCURRENCY_WEB : UPLOAD_CONCURRENCY_NATIVE;
  const out: string[] = new Array(uris.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= uris.length) return;
      const u = uris[idx];
      if (/^https?:\/\//i.test(u)) {
        out[idx] = u;
        continue;
      }
      const r = await uploadFileToS3(u, opts);
      out[idx] = r.url;
    }
  }

  const workers = Array.from({ length: Math.min(limit, uris.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
