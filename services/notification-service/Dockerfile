FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/notification-contracts/package.json ./packages/notification-contracts/package.json
COPY packages/scanner-contracts/package.json ./packages/scanner-contracts/package.json
COPY services/notification-service/package.json ./services/notification-service/package.json
COPY services/github-scanner-service/package.json ./services/github-scanner-service/package.json

RUN npm ci

COPY packages/shared ./packages/shared
COPY packages/notification-contracts ./packages/notification-contracts
COPY packages/scanner-contracts ./packages/scanner-contracts
COPY services/notification-service ./services/notification-service

RUN npm run build:packages
RUN npm run build:notification-service

WORKDIR /app/services/notification-service

CMD ["node", "dist/index.js"]
