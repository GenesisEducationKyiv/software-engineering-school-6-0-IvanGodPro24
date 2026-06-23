FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/notification-contracts/package.json ./packages/notification-contracts/package.json
COPY services/notification-service/package.json ./services/notification-service/package.json
COPY services/github-scanner-service/package.json ./services/github-scanner-service/package.json

RUN npm ci

COPY . .

RUN npm run build:packages
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/build" npm run build

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
