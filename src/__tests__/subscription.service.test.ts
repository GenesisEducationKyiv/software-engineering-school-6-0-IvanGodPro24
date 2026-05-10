import { jest } from '@jest/globals';
import { Repository, Subscription } from '@prisma/client';
import {
  ISubscriptionEmailService,
  SubscriptionService,
} from '../services/subscription.service.js';
import { TrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../repositories/subscription.repository.js';
import { IGitHubClient } from '../services/github.service.js';

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
  findActiveByEmailWithRepo: jest.fn(),
} as unknown as jest.Mocked<SubscriptionRepository>;

const mockEmailService = {
  sendConfirmEmail: jest.fn(),
} as jest.Mocked<ISubscriptionEmailService>;

describe('subscription.service', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();

    subscriptionService = new SubscriptionService(
      mockRepoRepository,
      mockSubscriptionRepository,
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

      mockRepoRepository.upsert.mockResolvedValue(
        repo as unknown as Repository,
      );
      mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue(null);
      mockSubscriptionRepository.create.mockResolvedValue(
        subscription as unknown as Subscription,
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
      } as unknown as Repository);

      mockSubscriptionRepository.findByEmailAndRepoId.mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      } as unknown as Subscription);

      await expect(
        subscriptionService.createSubscription('test@test.com', 'golang/go'),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('confirmSubscription', () => {
    it('confirms the subscription', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      } as unknown as Subscription);

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        {} as unknown as Subscription,
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
      } as unknown as Subscription);

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
      } as unknown as Subscription);

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        {} as unknown as Subscription,
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
      } as unknown as Subscription);

      await expect(
        subscriptionService.cancelSubscription('unsub-token'),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('returns subscriptions in the correct format', async () => {
      mockSubscriptionRepository.findActiveByEmailWithRepo.mockResolvedValue([
        {
          email: 'test@test.com',
          status: 'ACTIVE',
          repository: { name: 'golang/go', lastSeenTag: 'v1.22.0' },
        } as unknown as Subscription & { repository: Repository },
      ]);

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
    });

    it('returns an empty array if no subscriptions found', async () => {
      mockSubscriptionRepository.findActiveByEmailWithRepo.mockResolvedValue(
        [],
      );

      const result =
        await subscriptionService.getSubscriptionsByEmail('noone@test.com');

      expect(result).toEqual([]);
    });
  });
});
