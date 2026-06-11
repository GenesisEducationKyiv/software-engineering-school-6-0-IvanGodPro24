FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/notification-contracts/package.json ./packages/notification-contracts/package.json
COPY services/notification-service/package.json ./services/notification-service/package.json

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/build" npm ci

COPY . .

RUN npm run build:contracts
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
