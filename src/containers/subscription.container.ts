import { PinoLogger } from '@github-notifier/shared';
import { prisma } from '../infrastructure/db/client.js';
import { SubscriptionService } from '../modules/subscriptions/subscription.service.js';
import { SubscriptionController } from '../modules/subscriptions/subscription.controller.js';
import { SubscriptionSagaRepository } from '../modules/subscriptions/saga/subscription-saga.repository.js';
import { SubscriptionSagaCompensationService } from '../modules/subscriptions/saga/subscription-saga-compensation.service.js';
import { SubscriptionSagaOrchestrator } from '../modules/subscriptions/saga/subscription-saga.orchestrator.js';
import {
  subscriptionRepository,
  githubClient,
  subscriptionQueryRepository,
} from './shared.container.js';
import { EmailQueueAdapter } from '../queue/email-queue.adapter.js';
import { emailQueue } from '../queue/email.queue.js';

const controllerLogger = new PinoLogger('SubscriptionController');
const sagaLogger = new PinoLogger('SubscriptionSaga');

const emailQueueAdapter = new EmailQueueAdapter(emailQueue);
const subscriptionSagaRepository = new SubscriptionSagaRepository(prisma);
const subscriptionSagaCompensationService =
  new SubscriptionSagaCompensationService(
    prisma,
    subscriptionSagaRepository,
    sagaLogger,
  );

export const subscriptionSagaOrchestrator = new SubscriptionSagaOrchestrator(
  prisma,
  subscriptionSagaRepository,
  subscriptionSagaCompensationService,
  githubClient,
  emailQueueAdapter,
  sagaLogger,
);

export const subscriptionService = new SubscriptionService(
  subscriptionRepository,
  subscriptionQueryRepository,
);

export const subscriptionController = new SubscriptionController(
  subscriptionService,
  subscriptionSagaOrchestrator,
  controllerLogger,
);
