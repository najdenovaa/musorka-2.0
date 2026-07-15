import { Platform } from 'react-native';

export const UPLOAD_IMAGE_MAX_EDGE = 1600;
export const UPLOAD_IMAGE_MAX_APPROX_BYTES = 1.5 * 1024 * 1024;

function approxBytesFromBase64(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

async function compressViaCanvas(
  sourceUri: string,
  maxEdge: number,
  quality: number,
): Promise<string | null> {
  if (Platform.OS !== 'web') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = sourceUri;
    });

    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxEdge || h > maxEdge) {
      if (w >= h) {
        h = Math.round((h * maxEdge) / w);
        w = maxEdge;
      } else {
        w = Math.round((w * maxEdge) / h);
        h = maxEdge;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl || null;
  } catch (e) {
    console.log('[strip-image] Canvas compress error:', e);
    return null;
  }
}

async function compressViaImageManipulatorToFileUri(
  sourceUri: string,
  maxEdge: number,
  quality: number,
): Promise<{ uri: string; sizeBytes: number } | null> {
  try {
    const ImageManipulator = await import('expo-image-manipulator').catch(() => null);
    if (!ImageManipulator) {
      console.log('[strip-image] ImageManipulator not available');
      return null;
    }
    console.log('[strip-image] ImageManipulator(file): resize width=', maxEdge, 'quality=', quality);
    const manipResult = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: maxEdge } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: false }
    );
    if (!manipResult.uri) {
      console.log('[strip-image] ImageManipulator returned no uri');
      return null;
    }
    let sizeBytes = 0;
    try {
      const FS = await import('expo-file-system/legacy');
      const infoOptions: Record<string, boolean> = { size: true };
      const info = await FS.getInfoAsync(manipResult.uri, infoOptions);
      if (info.exists && typeof (info as any).size === 'number') {
        sizeBytes = (info as any).size as number;
      }
    } catch (e) {
      console.log('[strip-image] getInfoAsync error:', e);
    }
    console.log('[strip-image] ImageManipulator(file) success, size:', sizeBytes, 'uri:', manipResult.uri.substring(0, 80));
    return { uri: manipResult.uri, sizeBytes };
  } catch (e) {
    console.log('[strip-image] ImageManipulator compress error:', e);
    return null;
  }
}

export async function stripExifToJpegDataUri(
  sourceUri: string,
  opts?: { maxEdge?: number; maxBytes?: number },
): Promise<string | null> {
  const maxBytes = opts?.maxBytes ?? UPLOAD_IMAGE_MAX_APPROX_BYTES;
  let maxEdge = opts?.maxEdge ?? UPLOAD_IMAGE_MAX_EDGE;
  let quality = 0.7;

  if (Platform.OS !== 'web') {
    console.warn('[strip-image] stripExifToJpegDataUri called on native; prefer stripExifToUploadUri');
  }

  if (sourceUri.startsWith('data:')) {
    const b64Part = sourceUri.split(',')[1] ?? '';
    if (approxBytesFromBase64(b64Part) <= maxBytes) {
      return sourceUri;
    }
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const result = await compressViaCanvas(sourceUri, maxEdge, quality);

      if (!result) {
        console.log('[strip-image] Attempt', attempt, 'returned null, reducing params');
        maxEdge = Math.max(400, Math.round(maxEdge * 0.75));
        quality = Math.max(0.3, quality - 0.1);
        continue;
      }

      const b64Part = result.split(',')[1] ?? '';
      const resultBytes = approxBytesFromBase64(b64Part);
      console.log('[strip-image] Attempt', attempt, 'result bytes:', resultBytes, 'maxBytes:', maxBytes);
      if (resultBytes <= maxBytes) {
        return result;
      }

      maxEdge = Math.max(400, Math.round(maxEdge * 0.75));
      quality = Math.max(0.3, quality - 0.1);
    } catch (e) {
      console.log('[strip-image] Attempt', attempt, 'error:', e);
      maxEdge = Math.max(400, Math.round(maxEdge * 0.75));
      quality = Math.max(0.3, quality - 0.1);
    }
  }
  return null;
}

export async function stripExifToUploadUri(
  sourceUri: string,
  opts?: { maxEdge?: number; maxBytes?: number },
): Promise<string | null> {
  const maxBytes = opts?.maxBytes ?? UPLOAD_IMAGE_MAX_APPROX_BYTES;
  let maxEdge = opts?.maxEdge ?? UPLOAD_IMAGE_MAX_EDGE;
  let quality = 0.7;

  if (Platform.OS === 'web') {
    return stripExifToJpegDataUri(sourceUri, opts);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await compressViaImageManipulatorToFileUri(sourceUri, maxEdge, quality);
    if (!result) {
      maxEdge = Math.max(400, Math.round(maxEdge * 0.75));
      quality = Math.max(0.3, quality - 0.1);
      continue;
    }
    if (result.sizeBytes === 0 || result.sizeBytes <= maxBytes) {
      return result.uri;
    }
    console.log('[strip-image] file too large:', result.sizeBytes, '> maxBytes:', maxBytes, 'reducing');
    maxEdge = Math.max(400, Math.round(maxEdge * 0.75));
    quality = Math.max(0.3, quality - 0.1);
  }
  return null;
}

export async function imagePickerAssetToDataUri(
  base64: string | null | undefined,
  uri: string,
  opts?: { maxEdge?: number; maxBytes?: number },
): Promise<string | null> {
  const maxBytes = opts?.maxBytes ?? UPLOAD_IMAGE_MAX_APPROX_BYTES;

  console.log('[strip-image] imagePickerAssetToDataUri: hasBase64=', !!base64, 'uri=', uri?.substring(0, 60), 'maxBytes=', maxBytes);

  if (Platform.OS !== 'web') {
    const fileUri = await stripExifToUploadUri(uri, opts);
    if (fileUri) return fileUri;
    return uri || null;
  }

  const sourceForCompress = base64 ? `data:image/jpeg;base64,${base64}` : uri;
  const compressed = await stripExifToJpegDataUri(sourceForCompress, opts);
  if (compressed) return compressed;

  if (base64) {
    const originalBytes = approxBytesFromBase64(base64);
    if (originalBytes <= maxBytes) {
      console.log('[strip-image] Compression failed, returning original base64 (within budget)');
      return `data:image/jpeg;base64,${base64}`;
    }
    console.log('[strip-image] Compression failed and original exceeds budget, returning null');
    return null;
  }

  console.log('[strip-image] Compression failed, no base64 fallback, returning null');
  return null;
}
