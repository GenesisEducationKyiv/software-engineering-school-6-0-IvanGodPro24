import { GitHubRepositoryName, ILogger } from '@github-notifier/shared';
import { IGitHubReleaseClient } from './github-release-client.port.js';
import { IScannerEventPublisher } from './scanner-event-publisher.port.js';
import { ITrackedRepositoryRepository } from './tracked-repository.repository.port.js';
import { TrackedRepositoryEntity } from '../domain/tracked-repository.entity.js';

export class RepositoryScannerService {
  private scanInProgress = false;

  constructor(
    private readonly trackedRepositoryRepository: ITrackedRepositoryRepository,
    private readonly githubReleaseClient: IGitHubReleaseClient,
    private readonly eventPublisher: IScannerEventPublisher,
    private readonly logger: ILogger,
  ) {}

  async scanRepositories(): Promise<void> {
    if (this.scanInProgress) {
      this.logger.warn('Repository scan is already in progress');
      return;
    }

    this.scanInProgress = true;

    try {
      const repositories = await this.trackedRepositoryRepository.findActive();

      this.logger.info(
        {
          repositoriesCount: repositories.length,
        },
        'Starting repository scan',
      );

      for (const repository of repositories) {
        await this.scanRepository(repository);
      }
    } catch (error) {
      this.logger.error(
        { err: error },
        'Failed to load repositories for scanning',
      );
    } finally {
      this.scanInProgress = false;
    }
  }

  private async scanRepository(
    trackedRepository: TrackedRepositoryEntity,
  ): Promise<void> {
    try {
      const repositoryId = new GitHubRepositoryName(trackedRepository.name);

      const latestTag = await this.githubReleaseClient.getLatestRelease(
        repositoryId.owner,
        repositoryId.repository,
      );

      if (!latestTag || latestTag === trackedRepository.lastSeenTag) return;

      const previousTag = trackedRepository.lastSeenTag;

      await this.eventPublisher.publish({
        type: 'repository-tag-updated',
        repositoryId: trackedRepository.sourceRepositoryId,
        repoName: trackedRepository.name,
        previousTag,
        currentTag: latestTag,
        notifySubscribers: previousTag !== null,
      });

      await this.trackedRepositoryRepository.updateLastSeenTag(
        trackedRepository.id,
        latestTag,
      );

      this.logger.info(
        {
          repositoryId: trackedRepository.sourceRepositoryId,
          repoName: trackedRepository.name,
          previousTag,
          currentTag: latestTag,
        },
        previousTag === null
          ? 'Initial repository tag stored'
          : 'New repository release detected',
      );
    } catch (error) {
      this.logger.error(
        {
          err: error,
          repositoryId: trackedRepository.sourceRepositoryId,
          repoName: trackedRepository.name,
        },
        'Repository scan failed',
      );
    }
  }
}
