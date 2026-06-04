import { jest } from '@jest/globals';
import {
  SubscriptionEntity,
  TrackedRepoEntity,
} from '../modules/subscriptions/subscription.entity.js';
import {
  ISubscriptionEmailService,
  SubscriptionService,
} from '../modules/subscriptions/subscription.service.js';
import { TrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../modules/subscriptions/subscription.repository.js';
import { IGitHubClient } from '../modules/github/github.service.js';
import { SubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { UniqueConstraintError } from '../shared/errors.js';

const mockRepoRepository = {
  upsert: jest.fn(),
  findWithActiveSubscriptions: jest.fn(),
  updateLastSeenTag: jest.fn(),
} as unknown as jest.Mocked<TrackedRepoRepository>;

const mockGithubClient = {
  checkRepoExists: jest.fn(),
  getLatestRelease: jest.fn(),
} as jest.Mocked<IGitHubClient>;

const mockSubscriptionRepository = {
  findByEmailAndRepoId: jest.fn(),
  findByConfirmToken: jest.fn(),
  findByUnsubscribeToken: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  findByEmailAndStatusWithRepo: jest.fn(),
  findByRepoIdAndStatus: jest.fn(),
} as unknown as jest.Mocked<SubscriptionRepository>;

const mockSubscriptionQueryRepository = {
  findByEmailAndStatusWithRepo: jest.fn(),
  findByRepoIdAndStatus: jest.fn(),
} as unknown as jest.Mocked<SubscriptionQueryRepository>;

const mockEmailService = {
  sendConfirmEmail: jest.fn(),
  sendNewReleaseEmail: jest.fn(),
} as jest.Mocked<ISubscriptionEmailService>;

describe('subscription.service', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();

    subscriptionService = new SubscriptionService(
      mockRepoRepository,
      mockSubscriptionRepository,
      mockSubscriptionQueryRepository,
      mockEmailService,
      mockGithubClient,
    );
  });

  describe('createSubscription', () => {
    it('creates a new subscription if repo and subscription do not exist', async () => {
      const repo = { id: 'repo-1', name: 'golang/go' };
      const subscription = {
        id: 'sub-1',
        email: 'test@test.com',
        confirmToken: 'token-123',
        repositoryId: 'repo-1',
      };

      mockGithubClient.checkRepoExists.mockResolvedValue();

      mockRepoRepository.upsert.mockResolvedValue(repo as TrackedRepoEntity);
      mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue(null);
      mockSubscriptionRepository.create.mockResolvedValue(
        subscription as SubscriptionEntity,
      );

      await subscriptionService.createSubscription(
        'test@test.com',
        'golang/go',
      );

      expect(mockGithubClient.checkRepoExists).toHaveBeenCalledWith(
        'golang',
        'go',
      );
      expect(mockRepoRepository.upsert).toHaveBeenCalledWith('golang/go');
      expect(mockSubscriptionRepository.create).toHaveBeenCalledWith(
        'test@test.com',
        'repo-1',
      );
      expect(mockEmailService.sendConfirmEmail).toHaveBeenCalledWith(
        'test@test.com',
        'golang/go',
        'token-123',
      );
    });

    it('throws 409 if subscription already exists', async () => {
      mockRepoRepository.upsert.mockResolvedValue({
        id: 'repo-1',
        name: 'golang/go',
      } as TrackedRepoEntity);

      mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      } as SubscriptionEntity);

      await expect(
        subscriptionService.createSubscription('test@test.com', 'golang/go'),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  it('throws 409 if repository throws UniqueConstraintError (race condition during create)', async () => {
    mockGithubClient.checkRepoExists.mockResolvedValue();
    mockRepoRepository.upsert.mockResolvedValue({
      id: 'repo-1',
      name: 'golang/go',
    } as TrackedRepoEntity);
    mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue(null);

    mockSubscriptionRepository.create.mockRejectedValue(
      new UniqueConstraintError('Subscription already exists'),
    );

    await expect(
      subscriptionService.createSubscription('test@test.com', 'golang/go'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('throws 409 if subscription is PENDING', async () => {
    mockRepoRepository.upsert.mockResolvedValue({
      id: 'repo-1',
      name: 'golang/go',
    } as TrackedRepoEntity);
    mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue({
      id: 'sub-1',
      status: 'PENDING',
    } as SubscriptionEntity);

    await expect(
      subscriptionService.createSubscription('test@test.com', 'golang/go'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('throws 409 if subscription is already ACTIVE', async () => {
    mockRepoRepository.upsert.mockResolvedValue({
      id: 'repo-1',
      name: 'golang/go',
    } as TrackedRepoEntity);
    mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
    } as SubscriptionEntity);

    await expect(
      subscriptionService.createSubscription('test@test.com', 'golang/go'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('updates status to PENDING and resends email if UNSUBSCRIBED', async () => {
    mockGithubClient.checkRepoExists.mockResolvedValue();
    mockRepoRepository.upsert.mockResolvedValue({
      id: 'repo-1',
      name: 'golang/go',
    } as TrackedRepoEntity);

    mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue({
      id: 'sub-1',
      email: 'test@test.com',
      status: 'UNSUBSCRIBED',
    } as SubscriptionEntity);

    mockSubscriptionRepository.updateStatus.mockResolvedValue({
      id: 'sub-1',
      email: 'test@test.com',
      status: 'PENDING',
      confirmToken: 'new-token',
    } as SubscriptionEntity);

    await subscriptionService.createSubscription('test@test.com', 'golang/go');

    expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
      'sub-1',
      'PENDING',
      expect.objectContaining({ confirmToken: expect.any(String) }),
    );
    expect(mockEmailService.sendConfirmEmail).toHaveBeenCalledWith(
      'test@test.com',
      'golang/go',
      'new-token',
    );
  });

  describe('confirmSubscription', () => {
    it('confirms the subscription', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      } as SubscriptionEntity);

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        {} as SubscriptionEntity,
      );

      await subscriptionService.confirmSubscription('token-123');

      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        'sub-1',
        'ACTIVE',
      );
    });

    it('throws 404 if token is not found', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue(null);

      await expect(
        subscriptionService.confirmSubscription('bad-token'),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 400 if subscription is already confirmed', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      } as SubscriptionEntity);

      await expect(
        subscriptionService.confirmSubscription('token-123'),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('cancelSubscription', () => {
    it('unsubscribes the user', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      } as SubscriptionEntity);

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        {} as SubscriptionEntity,
      );

      await subscriptionService.cancelSubscription('unsub-token');

      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        'sub-1',
        'UNSUBSCRIBED',
      );
    });

    it('throws 404 if token is not found', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue(null);

      await expect(
        subscriptionService.cancelSubscription('bad-token'),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 400 if already unsubscribed', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue({
        id: 'sub-1',
        status: 'UNSUBSCRIBED',
      } as SubscriptionEntity);

      await expect(
        subscriptionService.cancelSubscription('unsub-token'),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('returns subscriptions in the correct format', async () => {
      mockSubscriptionQueryRepository.findByEmailAndStatusWithRepo.mockResolvedValue(
        [
          {
            email: 'test@test.com',
            status: 'ACTIVE',
            repository: { name: 'golang/go', lastSeenTag: 'v1.22.0' },
          } as SubscriptionEntity & {
            repository: TrackedRepoEntity;
          },
        ],
      );

      const result =
        await subscriptionService.getSubscriptionsByEmail('test@test.com');

      expect(result).toEqual([
        {
          email: 'test@test.com',
          repo: 'golang/go',
          confirmed: true,
          last_seen_tag: 'v1.22.0',
        },
      ]);

      expect(
        mockSubscriptionQueryRepository.findByEmailAndStatusWithRepo,
      ).toHaveBeenCalledWith('test@test.com', 'ACTIVE');
    });

    it('returns an empty array if no subscriptions found', async () => {
      mockSubscriptionQueryRepository.findByEmailAndStatusWithRepo.mockResolvedValue(
        [],
      );

      const result =
        await subscriptionService.getSubscriptionsByEmail('noone@test.com');

      expect(result).toEqual([]);
    });
  });
});
