# syntax=docker/dockerfile:1

# One Dockerfile builds either backend service; choose it with --build-arg SERVICE=connector|core.
# Each image holds only that service, packages/shared and their production dependencies.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# Manifests only, so the dependency layers stay cached until a manifest or the lockfile changes.
ARG SERVICE
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .husky/install.mjs .husky/install.mjs
COPY packages/shared/package.json packages/shared/
COPY services/${SERVICE}/package.json services/${SERVICE}/

FROM base AS build
ARG SERVICE
RUN pnpm install --frozen-lockfile --filter . --filter "@arlo-tern/${SERVICE}..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/${SERVICE} services/${SERVICE}
RUN pnpm exec tsc -b services/${SERVICE}/tsconfig.build.json

FROM base AS prod-deps
ARG SERVICE
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter "@arlo-tern/${SERVICE}..."

FROM node:${NODE_VERSION}-slim AS runtime
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages packages
COPY --from=prod-deps /app/services services
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/${SERVICE}/dist services/${SERVICE}/dist
USER node
WORKDIR /app/services/${SERVICE}
CMD ["node", "dist/main.js"]
