import {
  RepositoryTagUpdatedEvent,
  ScannerEvent,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';
import { ITrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { ISubscriptionQueryRepository } from '../subscriptions/subscription-query.repository.js';
import { IEmailQueue } from '../../queue/email-queue.port.js';

export class ScannerEventHandler {
  constructor(
    private readonly repositoryRepository: ITrackedRepoRepository,
    private readonly subscriptionQueryRepository: ISubscriptionQueryRepository,
    private readonly emailQueue: IEmailQueue,
    private readonly logger: ILogger,
  ) {}

  async handle(event: ScannerEvent): Promise<void> {
    switch (event.type) {
      case 'repository-tag-updated':
        await this.handleRepositoryTagUpdated(event);
        return;

      default:
        throw new Error('Unsupported scanner event type');
    }
  }

  private async handleRepositoryTagUpdated(
    event: RepositoryTagUpdatedEvent,
  ): Promise<void> {
    const repository = await this.repositoryRepository.findById(
      event.repositoryId,
    );

    if (!repository) {
      this.logger.warn(
        {
          repositoryId: event.repositoryId,
          repoName: event.repoName,
        },
        'Repository not found for scanner event',
      );

      return;
    }

    if (repository.name !== event.repoName) {
      this.logger.warn(
        {
          repositoryId: event.repositoryId,
          expectedRepoName: repository.name,
          eventRepoName: event.repoName,
        },
        'Scanner event repository name mismatch',
      );

      return;
    }

    if (repository.lastSeenTag === event.currentTag) {
      this.logger.info(
        {
          repositoryId: event.repositoryId,
          tag: event.currentTag,
        },
        'Scanner event already processed',
      );

      return;
    }

    if (
      event.notifySubscribers &&
      repository.lastSeenTag !== event.previousTag
    ) {
      this.logger.warn(
        {
          repositoryId: event.repositoryId,
          storedTag: repository.lastSeenTag,
          eventPreviousTag: event.previousTag,
          eventCurrentTag: event.currentTag,
        },
        'Stale or out-of-order scanner event ignored',
      );

      return;
    }

    const storedPreviousTag = repository.lastSeenTag;

    const updated = await this.repositoryRepository.updateLastSeenTagIfCurrent(
      repository.id,
      storedPreviousTag,
      event.currentTag,
    );

    if (!updated) {
      this.logger.warn(
        {
          repositoryId: event.repositoryId,
          tag: event.currentTag,
        },
        'Scanner event skipped because repository was concurrently updated',
      );

      return;
    }

    if (!event.notifySubscribers) {
      this.logger.info(
        {
          repositoryId: event.repositoryId,
          tag: event.currentTag,
        },
        'Initial repository tag synchronized',
      );

      return;
    }

    try {
      const subscriptions =
        await this.subscriptionQueryRepository.findByRepoIdAndStatus(
          repository.id,
          'ACTIVE',
        );

      if (subscriptions.length === 0) {
        this.logger.info(
          {
            repositoryId: event.repositoryId,
            tag: event.currentTag,
          },
          'No active subscribers for repository release',
        );

        return;
      }

      await this.emailQueue.addBulkEmails(
        subscriptions.map((subscription) => ({
          type: 'new-release',
          email: subscription.email,
          repoName: repository.name,
          tag: event.currentTag,
          unsubscribeToken: subscription.unsubscribeToken,
        })),
      );

      this.logger.info(
        {
          repositoryId: event.repositoryId,
          tag: event.currentTag,
          subscriptionsCount: subscriptions.length,
        },
        'Release notification jobs created',
      );
    } catch (error) {
      let tagReverted = false;

      try {
        tagReverted =
          await this.repositoryRepository.updateLastSeenTagIfCurrent(
            repository.id,
            event.currentTag,
            storedPreviousTag,
          );
      } catch (rollbackError) {
        this.logger.error(
          {
            err: rollbackError,
            repositoryId: event.repositoryId,
            currentTag: event.currentTag,
            previousTag: storedPreviousTag,
          },
          'Failed to revert repository tag after event processing failure',
        );
      }

      this.logger.error(
        {
          err: error,
          repositoryId: event.repositoryId,
          tag: event.currentTag,
          tagReverted,
        },
        'Failed to create release notification jobs',
      );

      throw error;
    }
  }
}
