# Build context is the @cally/guard package root (see docker-compose.yml).
# The in-image layout mirrors the repo so worker.mjs's ../../src imports resolve.
FROM node:22-slim

WORKDIR /app

COPY package.json ./package.json
COPY src ./src
COPY deploy/worker ./deploy/worker

RUN cd deploy/worker && npm install --omit=dev

WORKDIR /app/deploy/worker
CMD ["node", "worker.mjs", "start"]
