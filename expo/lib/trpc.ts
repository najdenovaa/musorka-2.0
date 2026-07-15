import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { Platform } from "react-native";
import superjson from "superjson";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/backend/trpc/app-router";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** Successful mutations that establish a session ({ user, token }). */
export type AuthSessionPayload =
  | RouterOutputs["auth"]["login"]
  | RouterOutputs["auth"]["register"]
  | RouterOutputs["auth"]["loginByEmail"]
  | RouterOutputs["auth"]["oauthLogin"]
  | RouterOutputs["auth"]["loginVerifyComplete"]
  | RouterOutputs["auth"]["loginWithBiometricUnlock"];
import { getApiBaseUrl } from "@/lib/get-api-base-url";
import { loadAuthToken, persistAuthToken } from "@/lib/auth-token-storage";
import { resetSessionInvalidDebounce } from "@/lib/auth-session-events";
import { authErrorLink } from "@/lib/trpc-links/auth-error-link";

export const trpc = createTRPCReact<AppRouter>();
const apiBaseUrl = getApiBaseUrl();
const API_URL_ERROR_MESSAGE = 'Не настроен API_BASE_URL. Проверьте app.json (expo.extra.apiBaseUrl) или переменные окружения сборки.';

let cachedToken: string | null = null;
let tokenLoadPromise: Promise<string | null> | null = null;

function preloadToken(): Promise<string | null> {
  if (cachedToken) return Promise.resolve(cachedToken);
  if (tokenLoadPromise) return tokenLoadPromise;
  tokenLoadPromise = loadAuthToken().then((token) => {
    cachedToken = token;
    _headerTokenCache = token;
    console.log('[TRPC] Token preloaded:', token ? 'yes' : 'no');
    return token;
  }).catch((err) => {
    console.error('[TRPC] Token preload error:', err);
    tokenLoadPromise = null;
    return null;
  });
  return tokenLoadPromise;
}

export async function setAuthToken(token: string | null) {
  cachedToken = token;
  _headerTokenCache = token;
  if (token) resetSessionInvalidDebounce();
  await persistAuthToken(token);
  console.log(token ? '[TRPC] Token saved' : '[TRPC] Token cleared');
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  return preloadToken();
}

const REQUEST_TIMEOUT = 25000;
const MAX_FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = (err as any)?.message?.toLowerCase?.() ?? '';
  return msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('socket hang up') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504');
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 408;
}

function getRetryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after');
  if (header) {
    const sec = parseInt(header, 10);
    if (!isNaN(sec) && sec > 0) return Math.min(sec * 1000, 5000);
  }
  return RETRY_DELAY_MS * (attempt + 1);
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!apiBaseUrl) {
    throw new Error(API_URL_ERROR_MESSAGE);
  }
  let lastError: unknown;

  const isMutation = init?.method === 'POST';
  const urlStr = typeof input === 'string' ? input : (input as URL | Request)?.toString?.() ?? '';
  const isBackground = /auth\.heartbeat|auth\.onlineStatus/.test(urlStr);
  const maxRetries = isBackground ? 0 : (isMutation ? 2 : MAX_FETCH_RETRIES);
  const timeout = isMutation ? 30000 : REQUEST_TIMEOUT;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    const userSignal = init?.signal;
    if (userSignal?.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Запрос отменён.');
    }

    const signal = userSignal ?? controller.signal;

    try {
      const response = await fetch(input, { ...init, signal });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after') || '30';
        console.warn('[TRPC] 429 rate limit, do not retry');
        throw new Error(`Слишком много запросов. Подождите ${retryAfter} сек. и попробуйте снова.`);
      }

      // Мягкая диагностика размера ответа для Android: логируем, но не обрываем
      // соединение — иначе теряем валидные данные при chunked transfer / gzip.
      if (Platform.OS === 'android') {
        const lenHeader = response.headers.get('content-length');
        const len = lenHeader ? parseInt(lenHeader, 10) : 0;
        if (len > 4 * 1024 * 1024) {
          console.warn('[TRPC] Large Android response:', len, 'bytes for', urlStr.substring(0, 120));
        }
      }

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        const backoff = getRetryAfterMs(response, attempt);
        console.log('[TRPC] Server error', response.status, ', retry', attempt + 1, 'in', backoff, 'ms');
        await delay(backoff);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok && !contentType.includes('application/json')) {
        const text = await response.text().catch(() => 'Unknown error');
        console.error('[TRPC] Non-JSON response:', response.status, text.substring(0, 200));
        if (isRetryableStatus(response.status)) {
          throw new Error('Сервер временно недоступен. Попробуйте через несколько секунд.');
        }
        throw new Error(`Ошибка сервера (${response.status}). Попробуйте позже.`);
      }
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if ((err as any)?.name === 'AbortError') {
        if (userSignal?.aborted) {
          throw new Error('Запрос отменён.');
        }
        if (attempt < maxRetries) {
          const backoff = RETRY_DELAY_MS * (attempt + 1);
          console.log('[TRPC] Timeout, retry', attempt + 1, 'in', backoff, 'ms');
          await delay(backoff);
          continue;
        }
        throw new Error('Превышено время ожидания. Проверьте интернет-соединение.');
      }

      if ((err as any)?.message?.includes('Ошибка сервера') || (err as any)?.message?.includes('временно недоступен')) {
        if (attempt < maxRetries && (err as any)?.message?.includes('временно недоступен')) {
          const backoff = RETRY_DELAY_MS * (attempt + 1);
          console.log('[TRPC] Server unavailable, retry', attempt + 1, 'in', backoff, 'ms');
          await delay(backoff);
          continue;
        }
        throw err;
      }

      if (attempt < maxRetries && isRetryableError(err)) {
        const backoff = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt), 4000);
        console.log('[TRPC] Retryable error, retry', attempt + 1, 'in', backoff, 'ms:', (err as any)?.message);
        await delay(backoff);
        continue;
      }

      if (isBackground) {
        console.log('[TRPC] Background fetch failed (silent):', (err as any)?.message || err);
      } else {
        console.warn('[TRPC] Fetch error after', attempt + 1, 'attempt(s):', (err as any)?.message || err);
      }
      throw new Error('Ошибка сети. Проверьте интернет-соединение.');
    }
  }

  throw lastError ?? new Error('Ошибка сети.');
}

let _headerTokenCache: string | null = null;
let _headerTokenPromise: Promise<string | null> | null = null;

async function getCachedHeaderToken(): Promise<string | null> {
  if (_headerTokenCache !== null) return _headerTokenCache;
  if (cachedToken !== null) {
    _headerTokenCache = cachedToken;
    return cachedToken;
  }
  if (!_headerTokenPromise) {
    _headerTokenPromise = getAuthToken().then((t) => {
      _headerTokenCache = t;
      _headerTokenPromise = null;
      return t;
    }).catch(() => {
      _headerTokenPromise = null;
      return null;
    });
  }
  return _headerTokenPromise;
}

export const trpcClient = trpc.createClient({
  links: [
    authErrorLink(),
    httpBatchLink({
      url: `${apiBaseUrl ?? 'http://127.0.0.1:9'}/api/trpc`,
      transformer: superjson,
      maxURLLength: 2083,
      // Ограничиваем размер батча, чтобы один HTTP-ответ не стал слишком большим
      // и не вызывал OutOfMemoryError в Android BlobModule (okhttp ResponseBody.bytes()).
      // На Android BlobModule буферизует весь ответ как byte[], поэтому склейку
      // запросов держим минимальной (1 = фактически без батчинга).
      maxItems: Platform.OS === 'android' ? 1 : 5,
      async headers() {
        const token = await getCachedHeaderToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      fetch: fetchWithTimeout,
    }),
  ],
});
