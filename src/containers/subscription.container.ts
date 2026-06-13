import { PinoLogger } from '@github-notifier/shared';
import { SubscriptionService } from '../modules/subscriptions/subscription.service.js';
import { SubscriptionController } from '../modules/subscriptions/subscription.controller.js';
import {
  trackedRepoRepository,
  subscriptionRepository,
  githubClient,
  subscriptionQueryRepository,
} from './shared.container.js';
import { EmailQueueAdapter } from '../queue/email-queue.adapter.js';
import { emailQueue } from '../queue/email.queue.js';

const controllerLogger = new PinoLogger('SubscriptionController');

const emailQueueAdapter = new EmailQueueAdapter(emailQueue);

export const subscriptionService = new SubscriptionService(
  trackedRepoRepository,
  subscriptionRepository,
  subscriptionQueryRepository,
  emailQueueAdapter,
  githubClient,
);

export const subscriptionController = new SubscriptionController(
  subscriptionService,
  controllerLogger,
);
