# ==========================================
# Stage 1: Build & Compilation (Builder)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build essentials if required by native addons
RUN apk add --no-cache python3 make g++

# Copy monorepo workspace package manifests
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/server/tsconfig.json ./packages/server/

# Install all dependencies (including devDependencies needed for compiling TypeScript)
RUN npm ci

# Copy TypeScript source code
COPY packages/core/src ./packages/core/src
COPY packages/server/src ./packages/server/src

# Compile Core and Server in dependency order
RUN npm run build -w @legacyx/core
RUN npm run build -w @legacyx/server

# ==========================================
# Stage 2: Minimal Production Runtime (Runner)
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy workspace package manifests for production install
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript distributions from builder
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Secure unprivileged user
USER node

EXPOSE 8080

CMD ["node", "packages/server/dist/index.js"]
