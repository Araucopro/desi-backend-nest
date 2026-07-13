# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Copiar archivos necesarios para resolver dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Usar la versión de pnpm declarada en package.json
RUN corepack enable

# Instalar dependencias
RUN pnpm install --unsafe-perm --dangerously-allow-all-builds

# Copiar código fuente
COPY . .

# Compilar NestJS
RUN pnpm run build


# Stage 2: Runtime
FROM node:24-alpine

WORKDIR /usr/src/app

# Copiar archivos necesarios para dependencias de producción
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable

# Instalar solo dependencias de producción
RUN pnpm install --prod --unsafe-perm --dangerously-allow-all-builds

# Copiar artefactos compilados
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main"]