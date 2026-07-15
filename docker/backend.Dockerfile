FROM oven/bun:1.2-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN bun install --production

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./backend/
COPY types/ ./types/
COPY lib/ ./lib/
COPY mocks/ ./mocks/
COPY constants/ ./constants/
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "backend/serve.ts"]
