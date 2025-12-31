# Multi-stage Dockerfile for Discord Minecraft Bot

# Stage 1: Base image with Bun
FROM oven/bun:1 AS base
WORKDIR /app

# Stage 2: Install dependencies
FROM base AS deps
# Copy package files
COPY package.json bun.lock* ./
COPY webUi/package.json webUi/bun.lock* ./webUi/

# Install dependencies
RUN bun install --frozen-lockfile

# Install webUI dependencies
WORKDIR /app/webUi
RUN bun install --frozen-lockfile

# Stage 3: Build the web UI
FROM deps AS webui-builder
WORKDIR /app/webUi
COPY webUi/ .
RUN bun run build

# Stage 4: Generate Prisma client
FROM deps AS prisma-builder
WORKDIR /app
# Set a placeholder DATABASE_URL for build time
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder"
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
RUN bunx prisma generate

# Stage 5: Production image
FROM base AS runner
WORKDIR /app

# Install PostgreSQL client for potential database operations
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 botgroup
RUN useradd --system --uid 1001 --gid botgroup --home /app botuser

# Copy node_modules from deps stage
COPY --from=deps --chown=botuser:botgroup /app/node_modules ./node_modules
COPY --from=deps --chown=botuser:botgroup /app/webUi/node_modules ./webUi/node_modules

# Copy built web UI
COPY --from=webui-builder --chown=botuser:botgroup /app/webUi/dist ./webUi/dist
COPY --from=webui-builder --chown=botuser:botgroup /app/webUi/astro.config.mjs ./webUi/

# Copy generated Prisma client
COPY --from=prisma-builder --chown=botuser:botgroup /app/generated ./generated

# Copy application source
COPY --chown=botuser:botgroup . .

# Copy and make startup script executable
COPY --chown=botuser:botgroup docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create directories for server data and ensure proper permissions
RUN mkdir -p /app/data /app/servers && \
	chown -R botuser:botgroup /app/data /app/servers

# Switch to non-root user
USER botuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
	CMD bun --version || exit 1

# Expose ports (adjust based on your configuration)
EXPOSE 3000 6001

# Environment variables (set defaults, override with docker run -e or docker-compose)
ENV NODE_ENV=production
ENV PORT=3000

# Start command
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD []
