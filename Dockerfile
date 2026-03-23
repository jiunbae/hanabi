FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm turbo build

# Production
FROM node:22-slim
WORKDIR /app
COPY --from=base /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=base /app/node_modules/ node_modules/
COPY --from=base /app/packages/engine/dist/ packages/engine/dist/
COPY --from=base /app/packages/engine/package.json packages/engine/
COPY --from=base /app/packages/shared/dist/ packages/shared/dist/
COPY --from=base /app/packages/shared/package.json packages/shared/
COPY --from=base /app/apps/server/dist/ apps/server/dist/
COPY --from=base /app/apps/server/package.json apps/server/
COPY --from=base /app/apps/server/node_modules/ apps/server/node_modules/
COPY --from=base /app/apps/web/dist/ apps/web/dist/

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "apps/server/dist/main.js"]
