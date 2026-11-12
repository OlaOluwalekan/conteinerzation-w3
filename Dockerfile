# ---- build stage: install deps, generate the Prisma client, compile TS ----
FROM node:22-slim AS build
WORKDIR /app
# prisma generate (run by postinstall and build) never connects to the DB,
# but prisma.config.ts needs some URL to load. This dummy one is build-only.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
RUN npm ci
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
# Apply pending migrations (creates the tasks table on first run), then start.
# The real DATABASE_URL comes from docker-compose.yml.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
