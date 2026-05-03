# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps: install ALL dependencies (including devDeps for build tools)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — build: compile TypeScript + generate Prisma client
# ──────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

# Copy all deps from previous stage (includes devDeps for tsc / nest-cli)
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client against the actual schema before compiling
RUN npx prisma generate --schema=src/prisma/schema.prisma

# Compile TypeScript → dist/
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: lean production image (no devDeps, no source)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

# Install openssl — required by Prisma query engine on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Copy Prisma schema + generated client (query engine binaries)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

# Run migrations then start the app.
# In production, prefer running 'prisma migrate deploy' as a separate
# init container / pre-deploy step rather than on every container start.
CMD ["node", "dist/main"]
