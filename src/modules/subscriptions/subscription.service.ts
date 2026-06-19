import createHttpError from 'http-errors';
import { ISubscriptionRepository } from './subscription.repository.js';
import { ISubscriptionQueryRepository } from './subscription-query.repository.js';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly subscriptionQueryRepository: ISubscriptionQueryRepository,
  ) {}

  async confirmSubscription(token: string) {
    const subscription =
      await this.subscriptionRepository.findByConfirmToken(token);

    if (!subscription) throw createHttpError(404, 'Token not found');

    if (subscription.status === 'ACTIVE')
      throw createHttpError(400, 'Subscription already confirmed');

    await this.subscriptionRepository.updateStatus(subscription.id, 'ACTIVE');
  }

  async cancelSubscription(token: string) {
    const subscription =
      await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) throw createHttpError(404, 'Token not found');

    if (subscription.status === 'UNSUBSCRIBED')
      throw createHttpError(400, 'Already unsubscribed');

    await this.subscriptionRepository.updateStatus(
      subscription.id,
      'UNSUBSCRIBED',
    );
  }

  async getSubscriptionsByEmail(email: string) {
    const subscriptions =
      await this.subscriptionQueryRepository.findByEmailAndStatusWithRepo(
        email,
        'ACTIVE',
      );

    return subscriptions.map(({ email, repository, status }) => ({
      email,
      repo: repository.name,
      confirmed: status === 'ACTIVE',
      last_seen_tag: repository.lastSeenTag,
    }));
  }
}
