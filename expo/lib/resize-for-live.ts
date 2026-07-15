import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

/**
 * Resize a local/data URI to ~1080px JPEG q70 before uploading. The resulting
 * file serves both as the original and as the Live feed thumbnail. On any
 * failure we fall back to the original URI to avoid blocking UX.
 */
export async function resizeForLive(uri: string): Promise<string> {
  if (!uri || typeof uri !== "string") return uri;
  if (Platform.OS === "web") return uri;
  if (/^https?:\/\//i.test(uri)) return uri;
  try {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri || uri;
  } catch (e) {
    console.log("[resizeForLive] fallback to original:", e);
    return uri;
  }
}
