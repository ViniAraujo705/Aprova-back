# syntax=docker/dockerfile:1

# Base debian (nao alpine): ffmpeg-static/ffprobe-static e o engine do Prisma
# tem suporte mais confiavel a glibc do que a musl.
ARG NODE_VERSION=20-slim

# ---- deps: instala TODAS as deps (dev incluidas), usadas so no build ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# Prisma (generate/migrate) precisa de openssl para detectar o libssl e
# baixar/rodar o engine correto - sem isso ele "adivinha" a versao e falha.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: gera o Prisma Client e compila o TypeScript ----
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# ---- migrate: roda `prisma migrate deploy` (reusa o stage de build, que
# tem o Prisma CLI completo); usado como job/one-off, nao como servidor ----
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- prod-deps: instala so as deps de producao (mesmo base da imagem final) ----
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: imagem final, minima ----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 nodeapp \
  && useradd --uid 1001 --gid nodeapp --no-create-home nodeapp

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
# Prisma Client gerado no stage "build" (engine compativel com esta mesma
# imagem base) - a instalacao de producao acima nao roda `prisma generate`.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma

USER nodeapp
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main"]
