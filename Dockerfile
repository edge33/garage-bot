FROM node:26.13.1-bookworm-slim@sha256:b822af76043e2656ffc172072036fe0968a3c09a692e4ad05eb9348ad5dbdf4c AS dependencies
WORKDIR /app
RUN npm install --global pnpm@12.23.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:26.13.1-bookworm-slim@sha256:b822af76043e2656ffc172072036fe0968a3c09a692e4ad05eb9348ad5dbdf4c
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
CMD ["node", "src/index.ts"]
