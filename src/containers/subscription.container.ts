import { SubscriptionService } from '../services/subscription.service.js';
import { SubscriptionController } from '../controllers/subscription.controller.js';
import { PinoLogger } from '../utils/logger.js';
import {
  trackedRepoRepository,
  subscriptionRepository,
  subscriptionEmailService,
  githubClient,
  subscriptionQueryRepository,
} from './shared.container.js';

const controllerLogger = new PinoLogger('SubscriptionController');

export const subscriptionService = new SubscriptionService(
  trackedRepoRepository,
  subscriptionRepository,
  subscriptionQueryRepository,
  subscriptionEmailService,
  githubClient,
);

export const subscriptionController = new SubscriptionController(
  subscriptionService,
  controllerLogger,
);
