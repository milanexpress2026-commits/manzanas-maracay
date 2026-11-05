FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
ARG MM_RELEASE=local
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tsconfig.base.json tsconfig.check.json ./
ENV MM_STANDALONE=1 MM_RELEASE=${MM_RELEASE}
RUN npm run build

FROM build AS tools
ENV NODE_ENV=production MM_APP_ENV=staging
USER node
ENTRYPOINT ["node", "scripts/staging-runtime.mjs"]
CMD ["migrate"]

FROM dependencies AS api
ENV NODE_ENV=production MM_APP_ENV=staging MM_API_HOST=0.0.0.0 MM_API_PORT=3101
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/public/brand/logo-manzanas-maracay.png ./apps/api/assets/brand/logo-manzanas-maracay.png
COPY scripts/staging-runtime.mjs ./scripts/staging-runtime.mjs
USER node
ENTRYPOINT ["node", "scripts/staging-runtime.mjs"]
CMD ["api"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 MM_APP_ENV=staging PORT=3100 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY scripts/staging-runtime.mjs ./scripts/staging-runtime.mjs
USER node
ENTRYPOINT ["node", "scripts/staging-runtime.mjs"]
CMD ["web"]
