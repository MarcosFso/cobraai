# Stage 1: compile TypeScript
FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 may need to compile a native module; these tools exist only in this build stage
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Stage 2: run only
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
VOLUME /app/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
