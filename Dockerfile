# ==========================================
# STAGE 1: Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Asegurar que devDependencies (como TypeScript) se instalen
ENV NODE_ENV=development

# Copiar manifiestos de workspaces y dependencias
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Instalar todas las dependencias en la raíz del workspace
RUN npm ci

# Copiar código fuente completo
COPY packages/core ./packages/core
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Compilar core primero y luego server (y cliente si aplica)
RUN npm run build -w @legacyx/core
RUN npm run build -w @legacyx/server
RUN npm run build -w @legacyx/client

# Verificar físicamente que el archivo de salida exista antes de pasar a producción
RUN test -f /app/packages/server/dist/index.js || (echo "ERROR: packages/server/dist/index.js no fue generado" && exit 1)

# ==========================================
# STAGE 2: Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copiar manifiestos y dependencias de producción
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

RUN npm ci --omit=dev

# Copiar los dist compilados preservando exactamente la estructura de carpetas
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Si server utiliza archivos de configuración json o estáticos adicionales, copiarlos:
COPY packages/server/room.config.json* ./packages/server/

# Configuración de usuario no-root para seguridad
USER node

EXPOSE 8080

CMD ["node", "packages/server/dist/index.js"]
