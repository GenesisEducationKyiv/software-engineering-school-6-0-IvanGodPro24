import { jest } from '@jest/globals';
import { ScannerService, IEmailQueue } from '../services/scanner.service.js';
import { ITrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { ISubscriptionRepository } from '../repositories/subscription.repository.js';
import { IGitHubClient } from '../services/github.service.js';
import { ILogger } from '../utils/logger.js';
import { Repository, Subscription } from '@prisma/client';

describe('scanner.service', () => {
  let scannerService: ScannerService;

  const mockRepoRepository = {
    findWithActiveSubscriptions: jest.fn(),
    updateLastSeenTag: jest.fn(),
  } as unknown as jest.Mocked<ITrackedRepoRepository>;

  const mockSubscriptionRepository = {
    findActiveByRepoId: jest.fn(),
  } as unknown as jest.Mocked<ISubscriptionRepository>;

  const mockGithubClient = {
    getLatestRelease: jest.fn(),
  } as unknown as jest.Mocked<IGitHubClient>;

  const mockEmailQueue = {
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
      mockSubscriptionRepository,
      mockGithubClient,
      mockEmailQueue,
      mockLogger,
    );
  });

  it('does nothing if there are no repositories with active subscriptions', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([]);

    await scannerService.scanRepositories();

    expect(mockGithubClient.getLatestRelease).not.toHaveBeenCalled();
    expect(mockEmailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('updates lastSeenTag but does NOT queue emails if lastSeenTag was null (initial scan)', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      { id: 'repo-1', name: 'facebook/react', lastSeenTag: null } as Repository,
    ]);
    mockGithubClient.getLatestRelease.mockResolvedValue('v18.2.0');

    await scannerService.scanRepositories();

    expect(mockRepoRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-1',
      'v18.2.0',
    );
    expect(
      mockSubscriptionRepository.findActiveByRepoId,
    ).not.toHaveBeenCalled();
    expect(mockEmailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('does nothing if the tag has NOT changed', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      {
        id: 'repo-1',
        name: 'facebook/react',
        lastSeenTag: 'v18.2.0',
      } as Repository,
    ]);
    mockGithubClient.getLatestRelease.mockResolvedValue('v18.2.0');

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
      } as Repository,
    ]);
    mockGithubClient.getLatestRelease.mockResolvedValue('v19.0.0');

    mockSubscriptionRepository.findActiveByRepoId.mockResolvedValue([
      { email: 'user1@test.com', unsubscribeToken: 'tkn1' } as Subscription,
      { email: 'user2@test.com', unsubscribeToken: 'tkn2' } as Subscription,
    ]);

    await scannerService.scanRepositories();

    expect(mockRepoRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-1',
      'v19.0.0',
    );
    expect(mockEmailQueue.addBulkEmails).toHaveBeenCalledWith([
      {
        email: 'user1@test.com',
        repoName: 'facebook/react',
        tag: 'v19.0.0',
        unsubscribeToken: 'tkn1',
      },
      {
        email: 'user2@test.com',
        repoName: 'facebook/react',
        tag: 'v19.0.0',
        unsubscribeToken: 'tkn2',
      },
    ]);
  });

  it('continues scanning other repos if one repo throws an error', async () => {
    mockRepoRepository.findWithActiveSubscriptions.mockResolvedValue([
      { id: 'repo-1', name: 'bad/repo', lastSeenTag: 'v1.0' } as Repository,
      { id: 'repo-2', name: 'good/repo', lastSeenTag: 'v1.0' } as Repository,
    ]);

    mockGithubClient.getLatestRelease
      .mockRejectedValueOnce(new Error('GitHub API Error'))
      .mockResolvedValueOnce('v2.0');

    mockSubscriptionRepository.findActiveByRepoId.mockResolvedValue([
      { email: 'user@test.com', unsubscribeToken: 'tkn' } as Subscription,
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
