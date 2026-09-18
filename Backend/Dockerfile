FROM node:22-bookworm-slim AS dependencies

WORKDIR /workspace/Backend
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY Backend/package.json Backend/package-lock.json ./
RUN npm ci
COPY Backend/prisma ./prisma
RUN npx prisma generate

FROM dependencies AS build
COPY Backend/tsconfig.json ./
COPY Backend/src ./src
COPY scripts ../scripts
COPY contracts ../contracts
COPY product.config.json ../product.config.json
RUN npm run build:docker

# 迁移镜像保留 Prisma CLI，只用于 docker compose run migrate。
FROM dependencies AS migration
ENV NODE_ENV=production
COPY Backend/prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY Backend/package.json Backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=dependencies /workspace/Backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /workspace/Backend/dist ./dist
RUN mkdir -p /app/uploads /app/certs && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
