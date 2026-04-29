import { Request, Response } from 'express';
import { SubscribeInput } from '../validation/subscription.schema.js';
import { checkRepoExists } from '../services/github.service.js';
import {
  cancelSubscription,
  confirmSubscription,
  createSubscription,
  getSubscriptionsByEmail,
} from '../services/subscription.service.js';
import { GetSubscriptionsInput } from '../validation/subscription.schema.js';

export const subscribe = async (req: Request, res: Response) => {
  const { email, repo } = req.body as SubscribeInput;

  const [owner, repoName] = repo.split('/');

  await checkRepoExists(owner, repoName);

  await createSubscription(email, repo);

  res.status(200).json({
    message: 'Subscription created. Please confirm your email.',
  });
};

export const confirm = async (
  req: Request<{ token: string }>,
  res: Response,
) => {
  const { token } = req.params;

  await confirmSubscription(token);

  res.status(200).json({
    message: 'Subscription confirmed successfully',
  });
};

export const unsubscribe = async (
  req: Request<{ token: string }>,
  res: Response,
) => {
  const { token } = req.params;

  await cancelSubscription(token);

  res.status(200).json({
    message: 'Unsubscribed successfully',
  });
};

export const getSubscriptions = async (req: Request, res: Response) => {
  const { email } = req.query as GetSubscriptionsInput;

  const data = await getSubscriptionsByEmail(email);

  res.status(200).json(data);
};
