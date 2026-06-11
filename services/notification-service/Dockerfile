FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/notification-contracts/package.json ./packages/notification-contracts/package.json
COPY services/notification-service/package.json ./services/notification-service/package.json
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/build" npm ci

COPY packages/notification-contracts ./packages/notification-contracts
COPY services/notification-service ./services/notification-service

RUN npm run build:contracts
RUN npm run build:notification-service

WORKDIR /app/services/notification-service

CMD ["node", "dist/index.js"]
