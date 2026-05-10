import { TrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../repositories/subscription.repository.js';
import { IGitHubClient } from './github.service.js';

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
    private readonly repoRepository: TrackedRepoRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly githubClient: IGitHubClient,
    private readonly emailQueue: IEmailQueue,
  ) {}

  scanRepositories = async () => {
    try {
      const repositories =
        await this.repoRepository.findWithActiveSubscriptions();

      console.log(`[Scanner] Found ${repositories.length} repositories`);

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
            console.log(`[Scanner] New release for ${repo.name}: ${latestTag}`);

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
          console.error(`[Scanner] Error checking ${repo.name}:`, message);
        }
      }
    } catch (globalError) {
      console.error(
        '[Scanner] Critical database error during scan:',
        globalError,
      );
    }
  };
}
