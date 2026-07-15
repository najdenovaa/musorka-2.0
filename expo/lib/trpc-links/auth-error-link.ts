import { observable } from "@trpc/server/observable";
import { isTRPCClientError, type TRPCClientError, type TRPCLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import { notifySessionInvalid } from "@/lib/auth-session-events";

/**
 * Forwards tRPC errors; on UNAUTHORIZED/FORBIDDEN notifies global session handler (logout + cache clear).
 */
const SKIP_SESSION_INVALID_PATHS = new Set([
  'auth.me',
  'auth.login',
  'auth.loginByEmail',
  'auth.loginSendCode',
  'auth.loginVerifyComplete',
  'auth.loginWithBiometricUnlock',
  'auth.register',
  'auth.oauthLogin',
  'auth.registerBiometricUnlock',
]);

export function authErrorLink(): TRPCLink<AppRouter> {
  return () => {
    return ({ next, op }) => {
      return observable((observer) => {
        const sub = next(op).subscribe({
          next: (value) => observer.next(value),
          error: (err: unknown) => {
            if (isTRPCClientError(err) && !SKIP_SESSION_INVALID_PATHS.has(op.path)) {
              const code = err.data?.code;
              if (code === "UNAUTHORIZED") {
                console.log('[authErrorLink] UNAUTHORIZED on path:', op.path);
                notifySessionInvalid("unauthorized");
              }
            }
            observer.error(err as TRPCClientError<AppRouter>);
          },
          complete: () => observer.complete(),
        });
        return () => sub.unsubscribe();
      });
    };
  };
}
