import createHttpError from 'http-errors';
import { ISubscriptionRepository } from './subscription.repository.js';
import { ISubscriptionQueryRepository } from './subscription-query.repository.js';
import { IScannerCommandPublisher } from '../../queue/scanner/scanner-command-queue.port.js';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly subscriptionQueryRepository: ISubscriptionQueryRepository,
    private readonly scannerCommandPublisher: IScannerCommandPublisher,
  ) {}

  async confirmSubscription(token: string): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByConfirmToken(token);

    if (!subscription) throw createHttpError(404, 'Token not found');

    if (subscription.status === 'ACTIVE')
      throw createHttpError(400, 'Subscription already confirmed');

    await this.subscriptionRepository.updateStatus(subscription.id, 'ACTIVE');

    await this.syncRepositoryTracking(subscription.repositoryId);
  }

  async cancelSubscription(token: string): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByUnsubscribeToken(token);

    if (!subscription) throw createHttpError(404, 'Token not found');

    if (subscription.status === 'UNSUBSCRIBED')
      throw createHttpError(400, 'Already unsubscribed');

    await this.subscriptionRepository.updateStatus(
      subscription.id,
      'UNSUBSCRIBED',
    );

    await this.syncRepositoryTracking(subscription.repositoryId);
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

  private async syncRepositoryTracking(repositoryId: string): Promise<void> {
    const [repository, activeSubscriptionsCount] = await Promise.all([
      this.subscriptionQueryRepository.findRepositoryById(repositoryId),
      this.subscriptionQueryRepository.countByRepoIdAndStatus(
        repositoryId,
        'ACTIVE',
      ),
    ]);

    if (!repository)
      throw createHttpError(
        500,
        'Repository associated with subscription was not found',
      );

    await this.scannerCommandPublisher.publish({
      type: 'sync-repository-tracking',
      repositoryId: repository.id,
      repoName: repository.name,
      active: activeSubscriptionsCount > 0,
    });
  }
}
