# syntax=docker/dockerfile:1

# Stage 1: Build client
FROM node:24-alpine AS client-builder
WORKDIR /app
# Copy config.json for vite.config.ts
COPY config.json ./
WORKDIR /app/client
COPY client/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY client/ ./
# CI type-checks before an image is built, so only the bundle is made here
RUN npx vite build

# Stage 2: Build server
FROM node:24-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Server runtime dependencies, without the build and test tooling
FROM node:24-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Stage 4: Production image
FROM node:24-alpine
# node as PID 1 ignores SIGTERM unless it handles it; tini forwards it
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV FRONTPAGE_PORT=3043

WORKDIR /app/server
COPY server/package.json ./
COPY server/migrations ./migrations
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./dist

# Built client files, where the server expects them
COPY --from=client-builder /app/client/dist ../client/dist

USER node
EXPOSE 3043

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
