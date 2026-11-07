# Build context: repository root (see docker-compose.yml).
FROM node:22-slim AS build-deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @voxa/web...
COPY apps/web apps/web

# Development: Vite with hot reload. docker-compose.override.yml mounts the source over apps/web.
FROM build-deps AS dev
WORKDIR /repo/apps/web
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM build-deps AS build
# The browser runs on the host, so it reaches the API through the published port.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @voxa/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
