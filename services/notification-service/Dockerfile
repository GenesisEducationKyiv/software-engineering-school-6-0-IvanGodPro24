FROM node:22-alpine

WORKDIR /app

COPY packages/notification-contracts ./packages/notification-contracts
COPY services/notification-service ./services/notification-service

WORKDIR /app/packages/notification-contracts
RUN npm install
RUN npm run build

WORKDIR /app/services/notification-service
RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]
