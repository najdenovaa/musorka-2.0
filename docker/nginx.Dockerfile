FROM oven/bun:1.2-alpine AS base
WORKDIR /app
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG API_BASE_URL=https://app.musorka.su
ENV API_BASE_URL=${API_BASE_URL}
RUN CI=1 EXPO_NO_TELEMETRY=1 sh -c './node_modules/.bin/expo export --platform web > /tmp/expo-export.log 2>&1 & \
  pid=$!; \
  i=0; \
  while [ "$i" -lt 600 ]; do \
    if [ -f /app/dist/index.html ]; then \
      kill "$pid" >/dev/null 2>&1 || true; \
      wait "$pid" >/dev/null 2>&1 || true; \
      exit 0; \
    fi; \
    if ! kill -0 "$pid" >/dev/null 2>&1; then \
      wait "$pid"; \
      exit $?; \
    fi; \
    i=$((i + 1)); \
    sleep 1; \
  done; \
  kill "$pid" >/dev/null 2>&1 || true; \
  wait "$pid" >/dev/null 2>&1 || true; \
  echo "expo export timed out; last logs:"; \
  tail -n 80 /tmp/expo-export.log; \
  exit 1'
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/legal/ /usr/share/nginx/legal/
RUN chmod -R a+rX /usr/share/nginx/legal
