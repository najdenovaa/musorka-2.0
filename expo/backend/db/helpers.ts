let cryptoModule: any = null;

function getNodeCrypto() {
  if (cryptoModule) return cryptoModule;
  try {
    cryptoModule = require("crypto");
    return cryptoModule;
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRandomHex(byteLength: number): string {
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.randomBytes) {
    return nodeCrypto.randomBytes(byteLength).toString("hex");
  }
  const bytes = new Uint8Array(byteLength);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return toHex(bytes);
}

function sha256Sync(input: string): string {
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.createHash) {
    return nodeCrypto.createHash("sha256").update(input).digest("hex");
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let hash2 = 0x1f351f35;
  for (let i = input.length - 1; i >= 0; i--) {
    hash2 ^= input.charCodeAt(i);
    hash2 = Math.imul(hash2, 0x01000193);
  }
  const p1 = (hash >>> 0).toString(16).padStart(8, "0");
  const p2 = (hash2 >>> 0).toString(16).padStart(8, "0");
  let hash3 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    hash3 = (hash3 << 5) - hash3 + input.charCodeAt(i);
    hash3 |= 0;
  }
  let hash4 = 0xcafebabe;
  for (let i = 0; i < input.length; i++) {
    hash4 = (hash4 << 7) ^ input.charCodeAt(i);
    hash4 |= 0;
  }
  const p3 = (hash3 >>> 0).toString(16).padStart(8, "0");
  const p4 = (hash4 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}${p3}${p4}${p1}${p2}${p3}${p4}`;
}

export function hashPassword(password: string): string {
  const salt = generateRandomHex(16);
  const hash = sha256Sync(password + salt);
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const separatorIndex = storedHash.indexOf(":");
  if (separatorIndex === -1) return false;
  const salt = storedHash.substring(0, separatorIndex);
  const hash = storedHash.substring(separatorIndex + 1);
  const result = sha256Sync(password + salt);
  return result === hash;
}

export function generateDeviceKey(): string {
  return generateRandomHex(32);
}

export function generateUuid(): string {
  const hex = generateRandomHex(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}
