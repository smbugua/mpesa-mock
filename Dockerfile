FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod=false --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsup.config.ts ./
COPY src ./src
RUN corepack enable pnpm && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++ libc6-compat \
 && addgroup -g 1001 mpesa && adduser -D -u 1001 -G mpesa mpesa
COPY package.json ./
COPY --from=builder /app/dist ./dist
RUN corepack enable pnpm \
 && pnpm install --prod --ignore-scripts \
 && (cd node_modules/.pnpm/better-sqlite3*/node_modules/better-sqlite3 && npm run install) \
 && apk del python3 make g++ \
 && chown -R mpesa:mpesa /app

USER mpesa
EXPOSE 4000
ENV MPESA_MOCK_HOST=0.0.0.0
ENV MPESA_MOCK_PORT=4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/__mock__/health || exit 1

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--host", "0.0.0.0", "--port", "4000"]
