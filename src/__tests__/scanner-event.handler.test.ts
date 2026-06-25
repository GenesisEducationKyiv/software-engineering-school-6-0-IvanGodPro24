import { jest } from '@jest/globals';
import { ILogger } from '@github-notifier/shared';
import { ScannerEventHandler } from '../modules/scanner/scanner-event.handler.js';
import { ITrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { ISubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { IEmailQueue } from '../queue/email-queue.port.js';
import { TrackedRepoEntity } from '../modules/repositories/tracked-repo.entity.js';
import { SubscriptionEntity } from '../modules/subscriptions/subscription.entity.js';

const repository = {
  id: 'repository-1',
  name: 'facebook/react',
  lastSeenTag: 'v18.2.0',
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TrackedRepoEntity;

const repositoryRepository = {
  upsert: jest.fn(),
  findById: jest.fn(),
  findWithActiveSubscriptions: jest.fn(),
  updateLastSeenTag: jest.fn(),
  updateLastSeenTagIfCurrent: jest.fn(),
} as jest.Mocked<ITrackedRepoRepository>;

const subscriptionQueryRepository = {
  findByEmailAndStatusWithRepo: jest.fn(),
  findByRepoIdAndStatus: jest.fn(),
  findRepositoryById: jest.fn(),
  countByRepoIdAndStatus: jest.fn(),
} as jest.Mocked<ISubscriptionQueryRepository>;

const emailQueue = {
  addEmail: jest.fn(),
  addBulkEmails: jest.fn(),
} as jest.Mocked<IEmailQueue>;

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

describe('ScannerEventHandler', () => {
  let handler: ScannerEventHandler;

  beforeEach(() => {
    jest.resetAllMocks();

    repositoryRepository.findById.mockResolvedValue(repository);
    repositoryRepository.updateLastSeenTagIfCurrent.mockResolvedValue(true);
    emailQueue.addBulkEmails.mockResolvedValue(undefined);

    handler = new ScannerEventHandler(
      repositoryRepository,
      subscriptionQueryRepository,
      emailQueue,
      logger,
    );
  });

  it('updates tag and creates release email jobs', async () => {
    subscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      {
        id: 'subscription-1',
        email: 'user@test.com',
        repositoryId: 'repository-1',
        status: 'ACTIVE',
        confirmToken: 'confirm-token',
        unsubscribeToken: 'unsubscribe-token',
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies SubscriptionEntity,
    ]);

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(
      repositoryRepository.updateLastSeenTagIfCurrent,
    ).toHaveBeenCalledWith('repository-1', 'v18.2.0', 'v19.0.0');

    expect(emailQueue.addBulkEmails).toHaveBeenCalledWith([
      {
        type: 'new-release',
        email: 'user@test.com',
        repoName: 'facebook/react',
        tag: 'v19.0.0',
        unsubscribeToken: 'unsubscribe-token',
      },
    ]);
  });

  it('synchronizes initial tag without creating emails', async () => {
    repositoryRepository.findById.mockResolvedValue({
      ...repository,
      lastSeenTag: null,
    });

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: null,
      currentTag: 'v18.2.0',
      notifySubscribers: false,
    });

    expect(
      repositoryRepository.updateLastSeenTagIfCurrent,
    ).toHaveBeenCalledWith('repository-1', null, 'v18.2.0');

    expect(emailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('ignores an already processed event', async () => {
    repositoryRepository.findById.mockResolvedValue({
      ...repository,
      lastSeenTag: 'v19.0.0',
    });

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(
      repositoryRepository.updateLastSeenTagIfCurrent,
    ).not.toHaveBeenCalled();

    expect(emailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('ignores a stale release event', async () => {
    repositoryRepository.findById.mockResolvedValue({
      ...repository,
      lastSeenTag: 'v20.0.0',
    });

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(
      repositoryRepository.updateLastSeenTagIfCurrent,
    ).not.toHaveBeenCalled();

    expect(emailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('reverts tag when email job creation fails', async () => {
    subscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      {
        id: 'subscription-1',
        email: 'user@test.com',
        repositoryId: 'repository-1',
        status: 'ACTIVE',
        confirmToken: 'confirm-token',
        unsubscribeToken: 'unsubscribe-token',
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies SubscriptionEntity,
    ]);

    repositoryRepository.updateLastSeenTagIfCurrent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    emailQueue.addBulkEmails.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      handler.handle({
        type: 'repository-tag-updated',
        repositoryId: 'repository-1',
        repoName: 'facebook/react',
        previousTag: 'v18.2.0',
        currentTag: 'v19.0.0',
        notifySubscribers: true,
      }),
    ).rejects.toThrow('Redis unavailable');

    expect(
      repositoryRepository.updateLastSeenTagIfCurrent,
    ).toHaveBeenNthCalledWith(1, 'repository-1', 'v18.2.0', 'v19.0.0');

    expect(
      repositoryRepository.updateLastSeenTagIfCurrent,
    ).toHaveBeenNthCalledWith(2, 'repository-1', 'v19.0.0', 'v18.2.0');
  });
});
