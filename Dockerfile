# RoutineSnap — own-server image
# Build:  docker build -t routinesnap .
# Run:    docker run -p 3000:3000 --env-file .env.local routinesnap
# Env needed in .env.local: NEXT_PUBLIC_SITE_URL (real domain),
# ANTHROPIC_API_KEY (real extraction; without it the mock extractor runs),
# UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (optional, shared rate limit),
# DAILY_SCAN_LIMIT (default 5). Serve behind nginx/Caddy with HTTPS —
# the PWA service worker and camera need a secure context.
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["pnpm", "start"]
