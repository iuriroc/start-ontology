# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# API (Fastify + PostgreSQL). Autocontido: basta `docker compose up -d --build`.
# Tudo o que a aplicação precisa (Node, dependências npm, migrations do Postgres)
# é instalado/copiado aqui — nada precisa ser instalado na máquina de destino.
# ---------------------------------------------------------------------------

# ---- Stage 1: build (compila shared + api) --------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Dependências (camada cacheada enquanto os package.json não mudarem).
# Sem --omit=optional: binários nativos (ex.: esbuild/rollup) são opcionais no npm.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=packages/shared --workspace=apps/api --include-workspace-root=false

# Código-fonte e build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=apps/api \
 && npm prune --omit=dev \
 && mkdir -p apps/api/node_modules

# ---- Stage 2: runtime ------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=3001

COPY --from=build /app/node_modules ./node_modules
# npm workspaces hoists most deps to the root node_modules, but nests any
# whose version conflicts with another package's requirement (e.g. ajv is
# pinned to ^8 here vs ^6 elsewhere) under the workspace's own node_modules —
# that nested copy must ship too, or the nested package 404s at runtime.
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# A API executa estas migrations na inicialização (tabelas e índices).
COPY postgres ./postgres

RUN mkdir -p /app/backups
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${API_PORT}/api/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
