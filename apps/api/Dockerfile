# Build context: repository root (see docker-compose.yml).
FROM node:22-slim AS build-deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @voxa/api...
COPY apps/api apps/api

# Development: `nest start --watch`. compose.override.yml mounts the source over apps/api/src.
FROM build-deps AS dev
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM build-deps AS build
RUN pnpm --filter @voxa/api build

# Dev dependencies stay in: the same image runs the migrations (drizzle-kit).
FROM node:22-slim
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
