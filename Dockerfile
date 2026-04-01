FROM node:22-slim AS base
RUN corepack enable pnpm

# Install ripgrep for grep tool
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Source
COPY . .

# Build
RUN pnpm build

# Run
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "start"]
