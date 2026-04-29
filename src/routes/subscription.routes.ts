import { Router, json } from 'express';
import {
  confirm,
  getSubscriptions,
  subscribe,
  unsubscribe,
} from '../controllers/subscription.controller.js';
import { validate } from '../middleware/validate.js';
import { subscribeSchema } from '../validation/subscription.schema.js';
import { getSubscriptionsSchema } from '../validation/subscription.schema.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const jsonParser = json();

router.post('/subscribe', jsonParser, validate(subscribeSchema), subscribe);

router.get('/confirm/:token', confirm);

router.get('/unsubscribe/:token', unsubscribe);

router.get(
  '/subscriptions',
  auth,
  validate(getSubscriptionsSchema),
  getSubscriptions,
);

export default router;
