import createHttpError from 'http-errors';
import { randomUUID } from 'node:crypto';
import { UniqueConstraintError } from '../../shared/errors.js';
import { SubscriptionEntity } from './subscription.entity.js';
import { ITrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { ISubscriptionRepository } from './subscription.repository.js';
import { ISubscriptionQueryRepository } from './subscription-query.repository.js';
import { IGitHubClient } from '../github/github.service.js';
import { GithubRepoId } from '../repositories/github-repo-id.js';

export interface ISubscriptionEmailService {
  sendConfirmEmail(
    email: string,
    repoName: string,
    token: string,
  ): Promise<void>;
  sendNewReleaseEmail(
    email: string,
    repoName: string,
    tag: string,
    unsubscribeToken: string,
  ): Promise<void>;
}

export class SubscriptionService {
  constructor(
    private readonly repoRepository: ITrackedRepoRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly subscriptionQueryRepository: ISubscriptionQueryRepository,
    private readonly emailService: ISubscriptionEmailService,
    private readonly githubClient: IGitHubClient,
  ) {}

  async createSubscription(email: string, repo: string) {
    const repoId = new GithubRepoId(repo);

    await this.githubClient.checkRepoExists(repoId.owner, repoId.name);

    const repository = await this.repoRepository.upsert(repoId.fullName);

    const existing = await this.subscriptionRepository.findByEmailAndRepoId(
      email,
      repository.id,
    );

    if (existing) {
      return this.handleExistingSubscription(existing, repository.name);
    }

    return this.createNewSubscription(email, repository);
  }

  private async handleExistingSubscription(
    existing: SubscriptionEntity,
    repoName: string,
  ) {
    switch (existing.status) {
      case 'ACTIVE':
        throw createHttpError(409, 'Already subscribed to this repository');

      case 'PENDING':
        throw createHttpError(
          409,
          'Subscription is pending. Please check your email.',
        );

      case 'UNSUBSCRIBED': {
        const updated = await this.subscriptionRepository.updateStatus(
          existing.id,
          'PENDING',
          { confirmToken: randomUUID() },
        );

        await this.emailService.sendConfirmEmail(
          updated.email,
          repoName,
          updated.confirmToken,
        );

        return updated;
      }

      default:
        throw createHttpError(409, 'Subscription already exists.');
    }
  }

  private async createNewSubscription(
    email: string,
    repository: { id: string; name: string },
  ) {
    try {
      const subscription = await this.subscriptionRepository.create(
        email,
        repository.id,
      );

      await this.emailService.sendConfirmEmail(
        subscription.email,
        repository.name,
        subscription.confirmToken,
      );

      return subscription;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw createHttpError(
          409,
          'Subscription is processing or already exists.',
        );
      }
      throw error;
    }
  }

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
