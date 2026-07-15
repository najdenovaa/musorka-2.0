/** Avoid passing garbage URIs into expo-image / native loaders (can crash on some devices). */
export function isSafeImageUri(uri: string | null | undefined): boolean {
  if (uri == null || typeof uri !== "string") return false;
  const u = uri.trim();
  if (u.length === 0) return false;
  if (u.length > 12_000_000) return false;
  return (
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("file://") ||
    u.startsWith("content://") ||
    u.startsWith("data:image/")
  );
}
