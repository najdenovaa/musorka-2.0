import type { Context } from "hono";
import { fetchRequestHandler } from "./trpc-vendor";

type AnyRouter = any;

interface TRPCAdapterOptions<TRouter extends AnyRouter> {
  endpoint?: string;
  router: TRouter;
  createContext?: (opts: { req: Request; resHeaders: Headers }, c: Context) => Promise<any> | any;
  onError?: (opts: any) => void;
  responseMeta?: (opts: any) => any;
}

const bodyProps = new Set(["arrayBuffer", "blob", "formData", "json", "text"]);

export function trpcServer<TRouter extends AnyRouter>({
  endpoint,
  createContext,
  ...rest
}: TRPCAdapterOptions<TRouter>) {
  return async (c: Context) => {
    const canWithBody = c.req.method === "GET" || c.req.method === "HEAD";
    const resolvedEndpoint = endpoint || "/trpc";

    return await fetchRequestHandler({
      ...rest,
      createContext: async (opts: any) => ({
        ...(createContext ? await createContext(opts, c) : {}),
      }),
      endpoint: resolvedEndpoint,
      req: canWithBody
        ? c.req.raw
        : new Proxy(c.req.raw, {
            get(t: any, p: string | symbol, _r: any) {
              if (typeof p === "string" && bodyProps.has(p))
                return () => (c.req as any)[p]();
              return Reflect.get(t, p, t);
            },
          }),
    });
  };
}
