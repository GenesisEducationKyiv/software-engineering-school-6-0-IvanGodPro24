import { jest } from '@jest/globals';
import { ScannerService } from '../modules/scanner/scanner.service.js';
import { IEmailQueue } from '../queue/email-queue.port.js';
import { ITrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { ISubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { IReleaseProvider } from '../modules/github/release-provider.port.js';
import { ILogger } from '@github-notifier/shared';
import { SubscriptionEntity } from '../modules/subscriptions/subscription.entity.js';
import { TrackedRepoEntity } from '../modules/repositories/tracked-repo.entity.js';

describe('scanner.service', () => {
  let scannerService: ScannerService;

  const mockRepoRepository = {
    upsert: jest.fn(),
    findById: jest.fn(),
    findWithActiveSubscriptions: jest.fn(),
    updateLastSeenTag: jest.fn(),
    updateLastSeenTagIfCurrent: jest.fn(),
  } as jest.Mocked<ITrackedRepoRepository>;

  const mockSubscriptionQueryRepository = {
    findByEmailAndStatusWithRepo: jest.fn(),
    findByRepoIdAndStatus: jest.fn(),
    findRepositoryById: jest.fn(),
    countByRepoIdAndStatus: jest.fn(),
  } as jest.Mocked<ISubscriptionQueryRepository>;

  const mockReleaseProvider = {
    getLatestRelease: jest.fn(),
  } as jest.Mocked<IReleaseProvider>;

  const mockEmailQueue = {
    addEmail: jest.fn(),
    addBulkEmails: jest.fn(),
  } as jest.Mocked<IEmailQueue>;

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as jest.Mocked<ILogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    scannerService = new ScannerService(
      mockRepoRepository,
      mockSubscriptionQueryRepository,
      mockReleaseProvider,
      mockEmailQueue,
      mockLogger,
    );
  });

  it('does nothing if there are no repositories with active subscriptions', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([]);

    await scannerService.scanRepositories();

    expect(mockReleaseProvider.getLatestRelease).not.toHaveBeenCalled();
    expect(mockEmailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('updates lastSeenTag but does NOT queue emails if lastSeenTag was null (initial scan)', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      {
        id: 'repo-1',
        name: 'facebook/react',
        lastSeenTag: null,
      } as TrackedRepoEntity,
    ]);
    mockReleaseProvider.getLatestRelease.mockResolvedValue('v18.2.0');

    await scannerService.scanRepositories();

    expect(mockRepoRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-1',
      'v18.2.0',
    );
    expect(
      mockSubscriptionQueryRepository.findByRepoIdAndStatus,
    ).not.toHaveBeenCalled();
    expect(mockEmailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('does nothing if the tag has NOT changed', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      {
        id: 'repo-1',
        name: 'facebook/react',
        lastSeenTag: 'v18.2.0',
      } as TrackedRepoEntity,
    ]);
    mockReleaseProvider.getLatestRelease.mockResolvedValue('v18.2.0');

    await scannerService.scanRepositories();

    expect(mockRepoRepository.updateLastSeenTag).not.toHaveBeenCalled();
    expect(mockEmailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('updates DB and queues emails if the tag has changed (new release)', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      {
        id: 'repo-1',
        name: 'facebook/react',
        lastSeenTag: 'v18.2.0',
      } as TrackedRepoEntity,
    ]);
    mockReleaseProvider.getLatestRelease.mockResolvedValue('v19.0.0');

    mockSubscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      {
        email: 'user1@test.com',
        unsubscribeToken: 'tkn1',
      } as SubscriptionEntity,
      {
        email: 'user2@test.com',
        unsubscribeToken: 'tkn2',
      } as SubscriptionEntity,
    ]);

    await scannerService.scanRepositories();

    expect(mockRepoRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-1',
      'v19.0.0',
    );
    expect(mockEmailQueue.addBulkEmails).toHaveBeenCalledWith([
      {
        type: 'new-release',
        email: 'user1@test.com',
        repoName: 'facebook/react',
        tag: 'v19.0.0',
        unsubscribeToken: 'tkn1',
      },
      {
        type: 'new-release',
        email: 'user2@test.com',
        repoName: 'facebook/react',
        tag: 'v19.0.0',
        unsubscribeToken: 'tkn2',
      },
    ]);
  });

  it('continues scanning other repos if one repo throws an error', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      {
        id: 'repo-1',
        name: 'bad/repo',
        lastSeenTag: 'v1.0',
      } as TrackedRepoEntity,
      {
        id: 'repo-2',
        name: 'good/repo',
        lastSeenTag: 'v1.0',
      } as TrackedRepoEntity,
    ]);

    mockReleaseProvider.getLatestRelease
      .mockRejectedValueOnce(new Error('GitHub API Error'))
      .mockResolvedValueOnce('v2.0');

    mockSubscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      { email: 'user@test.com', unsubscribeToken: 'tkn' } as SubscriptionEntity,
    ]);

    await scannerService.scanRepositories();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error checking bad/repo: GitHub API Error'),
    );

    expect(mockRepoRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-2',
      'v2.0',
    );
    expect(mockEmailQueue.addBulkEmails).toHaveBeenCalledTimes(1);
  });
});
