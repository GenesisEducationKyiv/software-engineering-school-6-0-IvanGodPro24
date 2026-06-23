FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

COPY packages/shared/package.json \
  ./packages/shared/package.json

COPY packages/notification-contracts/package.json \
  ./packages/notification-contracts/package.json

COPY packages/scanner-contracts/package.json ./packages/scanner-contracts/package.json

COPY services/notification-service/package.json \
  ./services/notification-service/package.json

COPY services/github-scanner-service/package.json \
  ./services/github-scanner-service/package.json

RUN npm ci

COPY packages/shared ./packages/shared
COPY packages/scanner-contracts ./packages/scanner-contracts
COPY services/github-scanner-service ./services/github-scanner-service

RUN npm run build -w @github-notifier/shared
RUN npm run build -w @github-notifier/scanner-contracts
RUN SCANNER_DATABASE_URL="postgresql://scanner:scanner@localhost:5432/build" \
    npm run build:github-scanner-service

WORKDIR /app

EXPOSE 3002

CMD ["sh", "-c", "npm run db:migrate:scanner && npm run start -w github-scanner-service"]
