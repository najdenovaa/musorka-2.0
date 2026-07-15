export type SessionInvalidReason = "unauthorized" | "forbidden";

type SessionInvalidHandler = (reason: SessionInvalidReason) => void | Promise<void>;

let onSessionInvalid: SessionInvalidHandler | null = null;
let _lastNotifyTs = 0;
const DEBOUNCE_MS = 5000;

export function registerSessionInvalidHandler(handler: SessionInvalidHandler | null): void {
  onSessionInvalid = handler;
}

export function notifySessionInvalid(reason: SessionInvalidReason): void {
  const now = Date.now();
  if (now - _lastNotifyTs < DEBOUNCE_MS) {
    console.log("[auth-session-events] Debounced session invalid:", reason);
    return;
  }
  _lastNotifyTs = now;
  try {
    console.log("[auth-session-events] Firing session invalid:", reason);
    void onSessionInvalid?.(reason);
  } catch (e) {
    console.warn("[auth-session-events] notifySessionInvalid error:", e);
  }
}

export function resetSessionInvalidDebounce(): void {
  _lastNotifyTs = 0;
}
