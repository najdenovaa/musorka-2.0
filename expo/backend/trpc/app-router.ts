import { createTRPCRouter } from "./create-context";
import { authRouter } from "./routes/auth";
import { requestsRouter } from "./routes/requests";
import { chatsRouter } from "./routes/chats";
import { notificationsRouter } from "./routes/notifications";
import { adminRouter } from "./routes/admin";
import { uploadsRouter } from "./routes/uploads";
import { liveRouter } from "./routes/live";
import { servicesRouter } from "./routes/services";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  requests: requestsRouter,
  chats: chatsRouter,
  notifications: notificationsRouter,
  admin: adminRouter,
  uploads: uploadsRouter,
  live: liveRouter,
  services: servicesRouter,
});

export type AppRouter = typeof appRouter;
