# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/github-client/package.json ./packages/github-client/package.json
COPY packages/diff-engine/package.json ./packages/diff-engine/package.json
COPY packages/static-analysis/package.json ./packages/static-analysis/package.json
COPY packages/ai-review/package.json ./packages/ai-review/package.json
COPY packages/finding-engine/package.json ./packages/finding-engine/package.json

RUN npm ci --workspace=apps/worker \
           --workspace=packages/shared \
           --workspace=packages/database \
           --workspace=packages/observability \
           --workspace=packages/github-client \
           --workspace=packages/diff-engine \
           --workspace=packages/static-analysis \
           --workspace=packages/ai-review \
           --workspace=packages/finding-engine

COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY packages/observability ./packages/observability
COPY packages/github-client ./packages/github-client
COPY packages/diff-engine ./packages/diff-engine
COPY packages/static-analysis ./packages/static-analysis
COPY packages/ai-review ./packages/ai-review
COPY packages/finding-engine ./packages/finding-engine

RUN npm run build -w packages/shared
RUN npm run build -w packages/observability
RUN npm run build -w packages/github-client
RUN npm run build -w packages/diff-engine
RUN npm run build -w packages/static-analysis
RUN npm run build -w packages/ai-review
RUN npm run build -w packages/finding-engine
RUN npm run build -w packages/database
RUN npm run build -w apps/worker

# ---- runtime stage ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Pinned Semgrep Community Edition (D-005 / A4)
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages semgrep==1.97.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/database/src/generated ./packages/database/src/generated
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/observability/dist ./packages/observability/dist
COPY --from=build /app/packages/observability/package.json ./packages/observability/package.json
COPY --from=build /app/packages/github-client/dist ./packages/github-client/dist
COPY --from=build /app/packages/github-client/package.json ./packages/github-client/package.json
COPY --from=build /app/packages/diff-engine/dist ./packages/diff-engine/dist
COPY --from=build /app/packages/diff-engine/package.json ./packages/diff-engine/package.json
COPY --from=build /app/packages/static-analysis/dist ./packages/static-analysis/dist
COPY --from=build /app/packages/static-analysis/package.json ./packages/static-analysis/package.json
COPY --from=build /app/packages/static-analysis/rules ./packages/static-analysis/rules
COPY --from=build /app/packages/ai-review/dist ./packages/ai-review/dist
COPY --from=build /app/packages/ai-review/package.json ./packages/ai-review/package.json
COPY --from=build /app/packages/finding-engine/dist ./packages/finding-engine/dist
COPY --from=build /app/packages/finding-engine/package.json ./packages/finding-engine/package.json

USER node

CMD ["node", "apps/worker/dist/start.js"]
