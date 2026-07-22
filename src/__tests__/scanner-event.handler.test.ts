import { jest } from '@jest/globals';
import { ILogger } from '@github-notifier/shared';
import { ScannerEventHandler } from '../modules/scanner/scanner-event.handler.js';
import { ITrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { ISubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { IEmailQueue } from '../queue/email/email-queue.port.js';
import {
  createSubscriptionEntity,
  createTrackedRepoEntity,
} from './test-factories.js';

const repository = createTrackedRepoEntity({
  lastSeenTag: 'v18.2.0',
});

const repositoryRepository = {
  findById: jest.fn(),
  updateLastSeenTag: jest.fn(),
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
    repositoryRepository.updateLastSeenTag.mockResolvedValue(undefined);
    subscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([]);
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
      createSubscriptionEntity({
        id: 'subscription-1',
        email: 'user@test.com',
        status: 'ACTIVE',
        confirmToken: 'confirm-token',
        unsubscribeToken: 'unsubscribe-token',
      }),
    ]);

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repository-1',
      'v19.0.0',
    );

    expect(emailQueue.addBulkEmails).toHaveBeenCalledWith([
      {
        type: 'new-release',
        subscriptionId: 'subscription-1',
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

    expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repository-1',
      'v18.2.0',
    );

    expect(emailQueue.addBulkEmails).not.toHaveBeenCalled();
  });

  it('processes release event when Main DB projection differs from scanner previous tag', async () => {
    repositoryRepository.findById.mockResolvedValue({
      ...repository,
      lastSeenTag: null,
    });

    subscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      createSubscriptionEntity({
        id: 'subscription-1',
        email: 'user@test.com',
        status: 'ACTIVE',
        confirmToken: 'confirm-token',
        unsubscribeToken: 'unsubscribe-token',
      }),
    ]);

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(emailQueue.addBulkEmails).toHaveBeenCalledWith([
      expect.objectContaining({
        subscriptionId: 'subscription-1',
        tag: 'v19.0.0',
      }),
    ]);

    expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repository-1',
      'v19.0.0',
    );
  });

  it('does not update projection when email job creation fails', async () => {
    subscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      createSubscriptionEntity({
        id: 'subscription-1',
        email: 'user@test.com',
        status: 'ACTIVE',
        confirmToken: 'confirm-token',
        unsubscribeToken: 'unsubscribe-token',
      }),
    ]);

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

    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('enqueues idempotent email jobs when projection already has current tag', async () => {
    repositoryRepository.findById.mockResolvedValue({
      ...repository,
      lastSeenTag: 'v19.0.0',
    });

    subscriptionQueryRepository.findByRepoIdAndStatus.mockResolvedValue([
      createSubscriptionEntity({
        id: 'subscription-1',
        email: 'user@test.com',
        status: 'ACTIVE',
        confirmToken: 'confirm-token',
        unsubscribeToken: 'unsubscribe-token',
      }),
    ]);

    await handler.handle({
      type: 'repository-tag-updated',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      previousTag: 'v18.2.0',
      currentTag: 'v19.0.0',
      notifySubscribers: true,
    });

    expect(emailQueue.addBulkEmails).toHaveBeenCalledWith([
      expect.objectContaining({
        subscriptionId: 'subscription-1',
        tag: 'v19.0.0',
      }),
    ]);

    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });
});
