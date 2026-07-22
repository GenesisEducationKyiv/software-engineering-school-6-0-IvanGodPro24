import { Request, Response } from 'express';
import { ILogger } from '@github-notifier/shared';
import {
  SubscribeInput,
  GetSubscriptionsInput,
} from './subscription.schema.js';
import { SubscriptionService } from './subscription.service.js';
import { SubscriptionSagaOrchestrator } from './saga/subscription-saga.orchestrator.js';

export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionSagaOrchestrator: SubscriptionSagaOrchestrator,
    private readonly logger: ILogger,
  ) {}

  subscribe = async (req: Request, res: Response) => {
    const { email, repo } = req.body as SubscribeInput;

    const result = await this.subscriptionSagaOrchestrator.start({
      email,
      repoName: repo,
    });

    this.logger.info(
      { email, repo, sagaId: result.sagaId },
      'Subscription saga accepted',
    );

    res.status(202).json({
      message: 'Subscription request accepted. Please check your email.',
      sagaId: result.sagaId,
      subscriptionId: result.subscriptionId,
      status: result.status,
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
