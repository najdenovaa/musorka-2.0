import React from 'react';
import { Image as RNImage, Platform, type ImageStyle, type StyleProp } from 'react-native';

/**
 * Cross-platform image wrapper.
 *
 * - On native: uses `expo-image` for better caching, memory and performance
 *   (this also avoids the Android OOM we saw earlier with the stock RN Image).
 * - On web: falls back to React Native's built-in Image, because `expo-image`
 *   under SDK 54 has a circular-import / TDZ issue in the Metro web bundle
 *   that surfaces as `ReferenceError: Cannot access 'Gt' before initialization`.
 *
 * The exported API matches the most common subset of `expo-image`'s `<Image>`
 * props that the app actually uses (`source`, `style`, `contentFit`,
 * `cachePolicy`, `transition`, `placeholder`, `onLoad`, `onError`).
 */

export type ImageContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
export type ImageCachePolicy = 'none' | 'disk' | 'memory' | 'memory-disk';

export interface MImageProps {
  source?: { uri?: string | null } | number | string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  cachePolicy?: ImageCachePolicy;
  transition?: number | { duration?: number };
  placeholder?: { uri?: string } | string | number | null;
  placeholderContentFit?: ImageContentFit;
  blurRadius?: number;
  tintColor?: string | null;
  recyclingKey?: string | null;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  onLoad?: (e?: unknown) => void;
  onError?: (e?: unknown) => void;
  onLoadEnd?: () => void;
  onLoadStart?: () => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  allowDownscaling?: boolean;
  priority?: 'low' | 'normal' | 'high';
  // Catch-all for forward-compat
  [key: string]: unknown;
}

function contentFitToResizeMode(fit?: ImageContentFit): 'cover' | 'contain' | 'stretch' | 'center' {
  switch (fit) {
    case 'contain':
      return 'contain';
    case 'fill':
      return 'stretch';
    case 'none':
      return 'center';
    case 'scale-down':
      return 'contain';
    case 'cover':
    default:
      return 'cover';
  }
}

function normalizeSource(source: MImageProps['source']): { uri: string } | number | undefined {
  if (source == null) return undefined;
  if (typeof source === 'number') return source;
  if (typeof source === 'string') return { uri: source };
  if (typeof source === 'object' && source.uri) return { uri: source.uri };
  return undefined;
}

let NativeImageImpl: React.ComponentType<MImageProps> | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-image') as { Image: React.ComponentType<MImageProps> };
    NativeImageImpl = mod.Image;
  } catch (err) {
    if (__DEV__) console.log('[MImage] expo-image not available, falling back to RN Image:', err);
  }
}

function WebImage({
  source,
  style,
  contentFit,
  cachePolicy: _cachePolicy,
  transition: _transition,
  placeholder: _placeholder,
  placeholderContentFit: _phFit,
  recyclingKey: _recyclingKey,
  allowDownscaling: _allow,
  priority: _priority,
  blurRadius,
  tintColor,
  testID,
  accessible,
  accessibilityLabel,
  onLoad,
  onError,
  onLoadEnd,
  onLoadStart,
}: MImageProps) {
  const normalized = normalizeSource(source);
  if (!normalized) return null;
  return (
    <RNImage
      source={normalized as any}
      style={style}
      resizeMode={contentFitToResizeMode(contentFit)}
      blurRadius={blurRadius}
      tintColor={tintColor ?? undefined}
      testID={testID}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      onLoad={onLoad as any}
      onError={onError as any}
      onLoadEnd={onLoadEnd}
      onLoadStart={onLoadStart}
    />
  );
}

export const Image: React.ComponentType<MImageProps> =
  Platform.OS === 'web' || !NativeImageImpl ? WebImage : NativeImageImpl;

export default Image;
