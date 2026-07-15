import { TRPCClientError } from "@trpc/client";

export function getTrpcErrorCode(err: unknown): string | undefined {
  if (err instanceof TRPCClientError) {
    return err.data?.code as string | undefined;
  }
  return undefined;
}

export function getTrpcErrorMessage(err: unknown): string {
  if (err instanceof TRPCClientError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "";
}
