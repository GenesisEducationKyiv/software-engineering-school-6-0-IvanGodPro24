import { ITrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { ISubscriptionRepository } from '../repositories/subscription.repository.js';
import { IGitHubClient } from './github.service.js';
import { ILogger } from '../utils/logger.js';

export type BulkEmailJob = {
  name: string;
  data: {
    email: string;
    repoName: string;
    tag: string;
    unsubscribeToken: string;
  };
  opts?: {
    attempts: number;
    backoff: {
      type: string;
      delay: number;
    };
  };
};

export interface IEmailQueue {
  addBulkEmails(jobs: BulkEmailJob[]): Promise<void>;
}

export class ScannerService {
  constructor(
    private readonly repoRepository: ITrackedRepoRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly githubClient: IGitHubClient,
    private readonly emailQueue: IEmailQueue,
    private readonly logger: ILogger,
  ) {}

  scanRepositories = async () => {
    try {
      const repositories =
        await this.repoRepository.findWithActiveSubscriptions();

      this.logger.info(`Found ${repositories.length} repositories`);

      for (const repo of repositories) {
        const [owner, repoName] = repo.name.split('/');

        try {
          const latestTag = await this.githubClient.getLatestRelease(
            owner,
            repoName,
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
              await this.subscriptionRepository.findActiveByRepoId(repo.id);

            await this.emailQueue.addBulkEmails(
              subscriptions.map((sub) => ({
                name: 'send-email',
                data: {
                  email: sub.email,
                  repoName: repo.name,
                  tag: latestTag,
                  unsubscribeToken: sub.unsubscribeToken,
                },
                opts: {
                  attempts: 3,
                  backoff: { type: 'exponential', delay: 5000 },
                },
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
