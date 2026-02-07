# --- Build stage ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy this app
COPY apps/sandbox/ ./apps/sandbox/

# Install dependencies
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/sandbox

RUN pnpm build

# --- Runtime stage ---
FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/sandbox ./apps/sandbox
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/tsconfig.base.json ./

RUN chown -R app:app /app

USER app

WORKDIR /app/apps/sandbox

EXPOSE 3002

# Production: use "pnpm start"; for development override with: CMD ["pnpm", "dev"]
CMD ["pnpm", "start"]
