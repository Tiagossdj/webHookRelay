FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
CMD [ "node", "dist/server.js" ]
