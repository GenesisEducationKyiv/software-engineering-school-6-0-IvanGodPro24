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

    if (repository.lastSeenTag !== event.previousTag) {
      this.logger.warn(
        {
          repositoryId: event.repositoryId,
          projectionTag: repository.lastSeenTag,
          scannerPreviousTag: event.previousTag,
          scannerCurrentTag: event.currentTag,
        },
        'Repository tag projection differs from scanner state',
      );
    }

    if (!event.notifySubscribers) {
      if (repository.lastSeenTag !== event.currentTag) {
        await this.repositoryRepository.updateLastSeenTag(
          repository.id,
          event.currentTag,
        );
      }

      this.logger.info(
        {
          repositoryId: event.repositoryId,
          tag: event.currentTag,
        },
        'Initial repository tag synchronized',
      );

      return;
    }

    const subscriptions =
      await this.subscriptionQueryRepository.findByRepoIdAndStatus(
        repository.id,
        'ACTIVE',
      );

    if (subscriptions.length > 0) {
      await this.emailQueue.addBulkEmails(
        subscriptions.map((subscription) => ({
          type: 'new-release',
          subscriptionId: subscription.id,
          email: subscription.email,
          repoName: repository.name,
          tag: event.currentTag,
          unsubscribeToken: subscription.unsubscribeToken,
        })),
      );
    }

    if (repository.lastSeenTag !== event.currentTag) {
      await this.repositoryRepository.updateLastSeenTag(
        repository.id,
        event.currentTag,
      );
    }

    this.logger.info(
      {
        repositoryId: event.repositoryId,
        tag: event.currentTag,
        subscriptionsCount: subscriptions.length,
        projectionPreviousTag: repository.lastSeenTag,
        scannerPreviousTag: event.previousTag,
      },
      subscriptions.length > 0
        ? 'Release notification jobs ensured'
        : 'Repository tag projection updated without active subscribers',
    );
  }
}
