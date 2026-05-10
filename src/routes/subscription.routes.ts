import { Router, json } from 'express';
import { subscriptionController } from '../container.js';
import { validate } from '../middleware/validate.js';
import {
  subscribeSchema,
  getSubscriptionsSchema,
} from '../validation/subscription.schema.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const jsonParser = json();

router.post(
  '/subscribe',
  jsonParser,
  validate(subscribeSchema),
  subscriptionController.subscribe,
);

router.get('/confirm/:token', subscriptionController.confirm);

router.get('/unsubscribe/:token', subscriptionController.unsubscribe);

router.get(
  '/subscriptions',
  auth,
  validate(getSubscriptionsSchema),
  subscriptionController.getSubscriptions,
);

export default router;
