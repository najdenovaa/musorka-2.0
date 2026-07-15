import { createHash, createHmac } from "crypto";

const S3_ENDPOINT = (process.env.S3_ENDPOINT || "").replace(/\/$/, "");
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "";
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "";

export function isS3Configured(): boolean {
  return Boolean(S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function uriEncode(s: string, encodeSlash: boolean = true): string {
  return s.replace(/[^A-Za-z0-9\-._~]/g, (c) => {
    if (c === "/" && !encodeSlash) return c;
    return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
  });
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

export async function uploadBufferToS3(
  body: Buffer,
  key: string,
  contentType: string,
): Promise<UploadResult> {
  if (!isS3Configured()) {
    throw new Error("S3 не настроен на сервере");
  }

  const cleanKey = key.replace(/^\/+/, "");
  const url = new URL(`${S3_ENDPOINT}/${S3_BUCKET}/${cleanKey}`);
  const host = url.host;
  const canonicalUri = uriEncode(url.pathname, false);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(body);
  const service = "s3";

  const headers: Record<string, string> = {
    "host": host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": contentType,
    "content-length": String(body.length),
    "x-amz-acl": "public-read",
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headers[k].trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${S3_REGION}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(S3_SECRET_ACCESS_KEY, dateStamp, S3_REGION, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const reqHeaders: Record<string, string> = {
    "Host": host,
    "X-Amz-Content-Sha256": payloadHash,
    "X-Amz-Date": amzDate,
    "Content-Type": contentType,
    "Content-Length": String(body.length),
    "X-Amz-Acl": "public-read",
    "Authorization": authorization,
  };

  console.log(`[S3] PUT ${url.toString()} size=${body.length} type=${contentType}`);

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: reqHeaders,
    body: body as any,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[S3] Upload failed status=${res.status} body=${text.slice(0, 500)}`);
    throw new Error(`S3 upload failed: ${res.status}`);
  }

  const publicUrl = `${S3_ENDPOINT}/${S3_BUCKET}/${cleanKey}`;
  console.log(`[S3] Upload OK: ${publicUrl}`);

  return {
    url: publicUrl,
    key: cleanKey,
    size: body.length,
    contentType,
  };
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function generateKey(prefix: string, ext: string): string {
  const safeExt = ext.replace(/^\.+/, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${prefix}/${y}/${m}/${d}/${randomId()}.${safeExt}`;
}

export function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  return map[ct.toLowerCase()] || "bin";
}
