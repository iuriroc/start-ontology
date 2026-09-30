# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Web (React + Vite servido por nginx). Autocontido: nada a instalar no host.
# ---------------------------------------------------------------------------

# ---- Stage 1: build --------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# URL da API embutida no bundle em tempo de build (Vite).
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

# Sem --omit=optional: o Vite/Rollup/esbuild precisam dos binários nativos.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=packages/shared --workspace=apps/web --include-workspace-root=false

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=apps/web

# ---- Stage 2: nginx --------------------------------------------------------
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
