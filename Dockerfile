# Multi-stage build for frontpage application

# Stage 1: Build client
FROM node:24-alpine AS client-builder
WORKDIR /app
# Copy config.json for vite.config.ts
COPY config.json ./
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:24-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# Stage 3: Production image
FROM node:24-alpine
RUN apk add --no-cache git
WORKDIR /app

# Copy server dependencies and built code
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# Copy built client files to server's expected location
COPY --from=client-builder /app/client/dist ./client/dist

# Set environment variables
ENV NODE_ENV=production
ENV FRONTPAGE_PORT=3043
ENV FRONTPAGE_HOME=/data/frontpage

# Expose the port
EXPOSE 3043

# Create data directory
RUN mkdir -p /data/frontpage

# Start the server
WORKDIR /app/server
CMD ["node", "dist/index.js"]
