import { PinoLogger } from '@github-notifier/shared';
import { prisma } from '../infrastructure/db/client.js';
import { redis } from '../infrastructure/redis/redis.js';
import { SubscriptionSagaRepository } from '../modules/subscriptions/saga/subscription-saga.repository.js';
import { SubscriptionSagaCompensationService } from '../modules/subscriptions/saga/subscription-saga-compensation.service.js';
import { NotificationResultHandler } from '../modules/subscriptions/saga/notification-result.handler.js';
import { NotificationResultWorker } from '../modules/subscriptions/saga/notification-result.worker.js';

const notificationResultLogger = new PinoLogger('NotificationResultWorker');

const subscriptionSagaRepository = new SubscriptionSagaRepository(prisma);

const subscriptionSagaCompensationService =
  new SubscriptionSagaCompensationService(
    prisma,
    subscriptionSagaRepository,
    notificationResultLogger,
  );

const notificationResultHandler = new NotificationResultHandler(
  subscriptionSagaRepository,
  subscriptionSagaCompensationService,
  notificationResultLogger,
);

export const notificationResultWorker = new NotificationResultWorker(
  redis,
  notificationResultHandler,
  notificationResultLogger,
);
