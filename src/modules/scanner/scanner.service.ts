import { ITrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { ISubscriptionQueryRepository } from '../subscriptions/subscription-query.repository.js';
import { IGitHubClient } from '../github/github.service.js';
import { ILogger } from '../../infrastructure/logger/logger.js';
import { EmailJobData } from '../notifications/email-job.types.js';
import { GithubRepoId } from '../repositories/github-repo-id.js';

export interface IEmailQueue {
  addEmail(jobData: EmailJobData): Promise<void>;
  addBulkEmails(jobsData: EmailJobData[]): Promise<void>;
}

export class ScannerService {
  constructor(
    private readonly repoRepository: ITrackedRepoRepository,
    private readonly subscriptionQueryRepository: ISubscriptionQueryRepository,
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
        const repoId = new GithubRepoId(repo.name);

        try {
          const latestTag = await this.githubClient.getLatestRelease(
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
