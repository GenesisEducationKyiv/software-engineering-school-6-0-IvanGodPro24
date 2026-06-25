import { ILogger } from '@github-notifier/shared';
import { ITrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { ISubscriptionQueryRepository } from '../subscriptions/subscription-query.repository.js';
import { IReleaseProvider } from '../github/release-provider.port.js';
import { GithubRepoId } from '../repositories/github-repo-id.js';
import { IEmailQueue } from '../../queue/email-queue.port.js';

export class ScannerService {
  constructor(
    private readonly repoRepository: ITrackedRepoRepository,
    private readonly subscriptionQueryRepository: ISubscriptionQueryRepository,
    private readonly releaseProvider: IReleaseProvider,
    private readonly emailQueue: IEmailQueue,
    private readonly logger: ILogger,
  ) {}

  scanRepositories = async () => {
    try {
      const repositories =
        await this.repoRepository.findWithActiveSubscriptions();

      this.logger.info(`Found ${repositories.length} repositories`);

      for (const repo of repositories) {
        const repoId = new GithubRepoId(repo.name);

        try {
          const latestTag = await this.releaseProvider.getLatestRelease(
            repoId.owner,
            repoId.name,
          );

          if (!latestTag) continue;

          if (!repo.lastSeenTag) {
            await this.repoRepository.updateLastSeenTag(repo.id, latestTag);
            continue;
          }

          if (repo.lastSeenTag !== latestTag) {
            this.logger.info(`New release for ${repo.name}: ${latestTag}`);

            await this.repoRepository.updateLastSeenTag(repo.id, latestTag);

            const subscriptions =
              await this.subscriptionQueryRepository.findByRepoIdAndStatus(
                repo.id,
                'ACTIVE',
              );

            await this.emailQueue.addBulkEmails(
              subscriptions.map((sub) => ({
                type: 'new-release',
                subscriptionId: sub.id,
                email: sub.email,
                repoName: repo.name,
                tag: latestTag,
                unsubscribeToken: sub.unsubscribeToken,
              })),
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Error checking ${repo.name}: ${message}`);
        }
      }
    } catch (globalError) {
      this.logger.error(
        `Critical database error during scan: ${String(globalError)}`,
      );
    }
  };
}
