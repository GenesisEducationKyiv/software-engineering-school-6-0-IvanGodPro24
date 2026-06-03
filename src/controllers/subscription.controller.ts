import { Request, Response } from 'express';
import {
  SubscribeInput,
  GetSubscriptionsInput,
} from '../validation/subscription.schema.js';
import { SubscriptionService } from '../services/subscription.service.js';
import { ILogger } from '../utils/logger.js';

export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly logger: ILogger,
  ) {}

  subscribe = async (req: Request, res: Response) => {
    const { email, repo } = req.body as SubscribeInput;

    await this.subscriptionService.createSubscription(email, repo);

    this.logger.info(
      { email, repo },
      'Successfully subscribed user to repository',
    );

    res.status(200).json({
      message: 'Subscription created. Please confirm your email.',
    });
  };

  confirm = async (req: Request<{ token: string }>, res: Response) => {
    const { token } = req.params;

    await this.subscriptionService.confirmSubscription(token);

    res.status(200).json({
      message: 'Subscription confirmed successfully',
    });
  };

  unsubscribe = async (req: Request<{ token: string }>, res: Response) => {
    const { token } = req.params;

    await this.subscriptionService.cancelSubscription(token);

    res.status(200).json({
      message: 'Unsubscribed successfully',
    });
  };

  getSubscriptions = async (req: Request, res: Response) => {
    const { email } = req.query as GetSubscriptionsInput;

    const data = await this.subscriptionService.getSubscriptionsByEmail(email);

    res.status(200).json(data);
  };
}
