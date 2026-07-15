import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

const IS_ANDROID = Platform.OS === 'android';
// Android: более агрессивные дефолты — BlobModule падает OOM на больших фото.
const DEFAULT_MAX_EDGE = IS_ANDROID ? 800 : 1100;
const DEFAULT_QUALITY = IS_ANDROID ? 0.4 : 0.5;
const PICKER_QUALITY = IS_ANDROID ? 0.4 : 0.5;

export type PhotoSource = 'camera' | 'gallery';

export interface PickPhotoOptions {
  multiple?: boolean;
  selectionLimit?: number;
  maxEdge?: number;
  quality?: number;
  maxBytes?: number;
}

async function ensureGalleryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!req.granted) {
    Alert.alert('Нет доступа', 'Разрешите доступ к галерее, чтобы прикрепить фото.');
    return false;
  }
  return true;
}

async function ensureCameraPermission(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const req = await ImagePicker.requestCameraPermissionsAsync();
  if (!req.granted) {
    Alert.alert('Нет доступа к камере', 'Разрешите доступ к камере в настройках устройства.');
    return false;
  }
  return true;
}

async function compressWeb(
  uri: string,
  maxEdge: number,
  quality: number,
  existingBase64?: string | null,
): Promise<string | null> {
  try {
    const srcForImg = existingBase64 ? `data:image/jpeg;base64,${existingBase64}` : uri;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load'));
      img.src = srcForImg;
    });
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxEdge || h > maxEdge) {
      if (w >= h) { h = Math.round((h * maxEdge) / w); w = maxEdge; }
      else { w = Math.round((w * maxEdge) / h); h = maxEdge; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality) || null;
  } catch (e) {
    console.log('[pickPhotos] web canvas error:', e);
    if (existingBase64) return `data:image/jpeg;base64,${existingBase64}`;
    return null;
  }
}

async function compressNativeToFileUri(
  uri: string,
  maxEdge: number,
  quality: number,
): Promise<{ uri: string; sizeBytes: number } | null> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxEdge } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: false },
    );
    if (!result.uri) return null;
    let sizeBytes = 0;
    try {
      const FS = await import('expo-file-system/legacy');
      const infoOptions: Record<string, boolean> = { size: true };
      const info = await FS.getInfoAsync(result.uri, infoOptions);
      if (info.exists && typeof (info as any).size === 'number') sizeBytes = (info as any).size as number;
    } catch (e) {
      console.log('[pickPhotos] getInfoAsync error:', e);
    }
    console.log('[pickPhotos] compressed file uri, size:', sizeBytes);
    return { uri: result.uri, sizeBytes };
  } catch (e) {
    console.log('[pickPhotos] ImageManipulator error:', e);
    return null;
  }
}

async function ensureSizeWeb(dataUri: string, maxEdge: number, quality: number): Promise<string> {
  const MAX_BYTES = 700 * 1024;
  let current = dataUri;
  let curEdge = maxEdge;
  let curQ = quality;
  for (let i = 0; i < 4; i++) {
    const b64 = current.split(',')[1] ?? '';
    const approx = Math.floor((b64.length * 3) / 4);
    if (approx <= MAX_BYTES) return current;
    curEdge = Math.max(500, Math.round(curEdge * 0.75));
    curQ = Math.max(0.35, curQ - 0.1);
    const next = await compressWeb(current, curEdge, curQ);
    if (!next) return current;
    current = next;
  }
  return current;
}

export async function pickPhotos(
  source: PhotoSource,
  opts: PickPhotoOptions = {},
): Promise<string[] | null> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  try {
    let assets: ImagePicker.ImagePickerAsset[] = [];

    if (source === 'camera') {
      if (Platform.OS === 'web') {
        Alert.alert('Недоступно', 'Камера недоступна в веб-версии. Используйте галерею.');
        return null;
      }
      const ok = await ensureCameraPermission();
      if (!ok) return null;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: PICKER_QUALITY,
        base64: false,
        exif: false,
      });
      if (result.canceled || !result.assets?.length) return null;
      assets = result.assets;
    } else {
      const ok = await ensureGalleryPermission();
      if (!ok) return null;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: !!opts.multiple,
        selectionLimit: opts.selectionLimit ?? (opts.multiple ? (IS_ANDROID ? 2 : 3) : 1),
        quality: PICKER_QUALITY,
        base64: Platform.OS === 'web',
        exif: false,
      });
      if (result.canceled || !result.assets?.length) return null;
      assets = result.assets;
    }

    const out: string[] = [];
    const targetMaxBytes = opts.maxBytes ?? (IS_ANDROID ? 400 * 1024 : 700 * 1024);
    for (const a of assets) {
      if (Platform.OS === 'web') {
        const compressed = await compressWeb(a.uri, maxEdge, quality, a.base64);
        if (!compressed) {
          console.log('[pickPhotos] compression failed for asset, skipping');
          continue;
        }
        const sized = await ensureSizeWeb(compressed, maxEdge, quality);
        out.push(sized);
        continue;
      }

      let curEdge = maxEdge;
      let curQ = quality;
      let pushed = false;
      for (let i = 0; i < 4; i++) {
        const r = await compressNativeToFileUri(a.uri, curEdge, curQ);
        if (!r) break;
        if (r.sizeBytes === 0 || r.sizeBytes <= targetMaxBytes) {
          out.push(r.uri);
          pushed = true;
          break;
        }
        curEdge = Math.max(500, Math.round(curEdge * 0.75));
        curQ = Math.max(0.35, curQ - 0.1);
      }
      if (!pushed) {
        const fallback = await compressNativeToFileUri(a.uri, 600, 0.4);
        if (fallback) out.push(fallback.uri);
        else console.log('[pickPhotos] native compression failed, skipping');
      }
    }
    if (out.length === 0) {
      Alert.alert('Ошибка', 'Не удалось обработать фото. Попробуйте ещё раз.');
      return [];
    }
    return out;
  } catch (err) {
    console.error('[pickPhotos] error:', err);
    Alert.alert('Ошибка', 'Не удалось получить фото. Попробуйте ещё раз.');
    return null;
  }
}
