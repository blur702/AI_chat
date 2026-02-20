# --- Build stage ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy locales (shared translations)
COPY locales/ ./locales/

# Copy this app
COPY apps/chat/ ./apps/chat/

# Install dependencies
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/chat

RUN pnpm build

# --- Runtime stage ---
FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/locales ./locales
COPY --from=builder /app/apps/chat ./apps/chat
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/tsconfig.base.json ./

RUN chown -R app:app /app

USER app

WORKDIR /app/apps/chat

EXPOSE 3001

# Production: use "pnpm start"; for development override with: CMD ["pnpm", "dev"]
CMD ["pnpm", "start"]
