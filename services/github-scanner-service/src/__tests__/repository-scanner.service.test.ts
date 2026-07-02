import { jest } from '@jest/globals';
import { RepositoryScannerService } from '../app/repository-scanner.service.js';
import { ITrackedRepositoryRepository } from '../app/tracked-repository.repository.port.js';
import { IGitHubReleaseClient } from '../app/github-release-client.port.js';
import { IScannerEventPublisher } from '../app/scanner-event-publisher.port.js';
import { ILogger } from '@github-notifier/shared';
import { TrackedRepositoryEntity } from '../domain/tracked-repository.entity.js';

const createTrackedRepository = (
  overrides: Partial<TrackedRepositoryEntity> = {},
): TrackedRepositoryEntity => ({
  id: 'scanner-repository-1',
  sourceRepositoryId: 'main-repository-1',
  name: 'facebook/react',
  lastSeenTag: 'v18.2.0',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const repository = createTrackedRepository();

const repositoryStore = {
  activate: jest.fn(),
  deactivate: jest.fn(),
  findActive: jest.fn(),
  updateLastSeenTag: jest.fn(),
} as jest.Mocked<ITrackedRepositoryRepository>;

const githubClient = {
  getLatestRelease: jest.fn(),
} as jest.Mocked<IGitHubReleaseClient>;

const eventPublisher = {
  publish: jest.fn(),
} as jest.Mocked<IScannerEventPublisher>;

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

describe('RepositoryScannerService', () => {
  let service: RepositoryScannerService;

  beforeEach(() => {
    jest.resetAllMocks();

    eventPublisher.publish.mockResolvedValue(undefined);
    repositoryStore.updateLastSeenTag.mockResolvedValue(undefined);

    service = new RepositoryScannerService(
      repositoryStore,
      githubClient,
      eventPublisher,
      logger,
    );
  });

  it('publishes event when a new release is detected', async () => {
    repositoryStore.findActive.mockResolvedValue([repository]);
    githubClient.getLatestRelease.mockResolvedValue('v19.0.0');

    await service.scanRepositories();

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      type: 'repository-tag-updated',
      repositoryId: 'main-repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(repositoryStore.updateLastSeenTag).toHaveBeenCalledWith(
      'scanner-repository-1',
      'v19.0.0',
    );
  });

  it('does not notify subscribers during initial scan', async () => {
    repositoryStore.findActive.mockResolvedValue([
      createTrackedRepository({
        lastSeenTag: null,
      }),
    ]);

    githubClient.getLatestRelease.mockResolvedValue('v18.2.0');

    await service.scanRepositories();

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        previousTag: null,
        currentTag: 'v18.2.0',
        notifySubscribers: false,
      }),
    );
  });

  it('does nothing when the tag has not changed', async () => {
    repositoryStore.findActive.mockResolvedValue([repository]);
    githubClient.getLatestRelease.mockResolvedValue('v18.2.0');

    await service.scanRepositories();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
    expect(repositoryStore.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('does not update lastSeenTag when event publishing fails', async () => {
    repositoryStore.findActive.mockResolvedValue([repository]);
    githubClient.getLatestRelease.mockResolvedValue('v19.0.0');
    eventPublisher.publish.mockRejectedValue(new Error('Redis unavailable'));

    await service.scanRepositories();

    expect(repositoryStore.updateLastSeenTag).not.toHaveBeenCalled();
  });
});
