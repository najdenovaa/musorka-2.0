import Constants from "expo-constants";

type Extra = { apiBaseUrl?: string; allowedApiHosts?: string[] };

const PRODUCTION_API_URL = 'https://app.musorka.su';

function isBadHost(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (lower.includes('rorktest.dev')) return true;
  if (lower.includes('localhost')) return true;
  if (lower.includes('127.0.0.1')) return true;
  if (lower.includes('10.0.2.2')) return true;
  if (lower.startsWith('http://192.168')) return true;
  return false;
}

export function getApiBaseUrl(): string {
  try {
    const extra = Constants.expoConfig?.extra as Extra | undefined;
    const fromExtra = extra?.apiBaseUrl?.trim() ?? '';
    if (fromExtra && !isBadHost(fromExtra)) {
      const normalized = fromExtra.replace(/\/$/, '');
      console.log('[getApiBaseUrl] Using Constants extra URL:', normalized);
      return normalized;
    }
    if (fromExtra) {
      console.log('[getApiBaseUrl] Ignoring bad host from extra:', fromExtra);
    }
  } catch (e) {
    console.log('[getApiBaseUrl] Constants read error:', e);
  }

  const envUrl =
    typeof process.env.EXPO_PUBLIC_API_BASE_URL === 'string'
      ? process.env.EXPO_PUBLIC_API_BASE_URL.trim()
      : '';
  if (envUrl && !isBadHost(envUrl)) {
    const normalized = envUrl.replace(/\/$/, '');
    console.log('[getApiBaseUrl] Using EXPO_PUBLIC_API_BASE_URL:', normalized);
    return normalized;
  }

  console.log('[getApiBaseUrl] Using hardcoded production URL:', PRODUCTION_API_URL);
  return PRODUCTION_API_URL;
}

export function hasApiBaseUrl(): boolean {
  return true;
}
