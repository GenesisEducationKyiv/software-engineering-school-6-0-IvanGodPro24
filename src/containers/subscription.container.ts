import { SubscriptionService } from '../services/subscription.service.js';
import { SubscriptionController } from '../controllers/subscription.controller.js';
import {
  trackedRepoRepository,
  subscriptionRepository,
  subscriptionEmailService,
  githubClient,
} from './shared.container.js';

export const subscriptionService = new SubscriptionService(
  trackedRepoRepository,
  subscriptionRepository,
  subscriptionEmailService,
  githubClient,
);

export const subscriptionController = new SubscriptionController(
  subscriptionService,
);
