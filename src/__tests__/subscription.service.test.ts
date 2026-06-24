import { jest } from '@jest/globals';
import { SubscriptionEntity } from '../modules/subscriptions/subscription.entity.js';
import { TrackedRepoEntity } from '../modules/repositories/tracked-repo.entity.js';
import { SubscriptionService } from '../modules/subscriptions/subscription.service.js';
import { ISubscriptionRepository } from '../modules/subscriptions/subscription.repository.js';
import { ISubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { IScannerCommandPublisher } from '../queue/scanner-command-queue.port.js';

const mockSubscriptionRepository = {
  findByEmailAndRepoId: jest.fn(),
  findByConfirmToken: jest.fn(),
  findByUnsubscribeToken: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
} as jest.Mocked<ISubscriptionRepository>;

const mockSubscriptionQueryRepository = {
  findByEmailAndStatusWithRepo: jest.fn(),
  findByRepoIdAndStatus: jest.fn(),
  findRepositoryById: jest.fn(),
  countByRepoIdAndStatus: jest.fn(),
} as jest.Mocked<ISubscriptionQueryRepository>;

const scannerCommandPublisher = {
  publish: jest.fn(),
} as jest.Mocked<IScannerCommandPublisher>;

const createSubscription = (
  overrides: Partial<SubscriptionEntity> = {},
): SubscriptionEntity => ({
  id: 'sub-1',
  email: 'test@test.com',
  status: 'PENDING',
  confirmToken: 'token-123',
  unsubscribeToken: 'unsub-token',
  repositoryId: 'repository-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createRepository = (): TrackedRepoEntity => ({
  id: 'repository-1',
  name: 'facebook/react',
  lastSeenTag: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('subscription.service', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    jest.resetAllMocks();

    scannerCommandPublisher.publish.mockResolvedValue(undefined);

    subscriptionService = new SubscriptionService(
      mockSubscriptionRepository,
      mockSubscriptionQueryRepository,
      scannerCommandPublisher,
    );
  });

  describe('confirmSubscription', () => {
    it('confirms the subscription and enables repository tracking', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue(
        createSubscription(),
      );

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        createSubscription({
          status: 'ACTIVE',
        }),
      );

      mockSubscriptionQueryRepository.findRepositoryById.mockResolvedValue(
        createRepository(),
      );

      mockSubscriptionQueryRepository.countByRepoIdAndStatus.mockResolvedValue(
        1,
      );

      await subscriptionService.confirmSubscription('token-123');

      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        'sub-1',
        'ACTIVE',
      );

      expect(
        mockSubscriptionQueryRepository.findRepositoryById,
      ).toHaveBeenCalledWith('repository-1');

      expect(
        mockSubscriptionQueryRepository.countByRepoIdAndStatus,
      ).toHaveBeenCalledWith('repository-1', 'ACTIVE');

      expect(scannerCommandPublisher.publish).toHaveBeenCalledWith({
        type: 'sync-repository-tracking',
        repositoryId: 'repository-1',
        repoName: 'facebook/react',
        active: true,
      });
    });

    it('throws 404 if token is not found', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue(null);

      await expect(
        subscriptionService.confirmSubscription('bad-token'),
      ).rejects.toMatchObject({
        status: 404,
      });

      expect(scannerCommandPublisher.publish).not.toHaveBeenCalled();
    });

    it('throws 400 if subscription is already confirmed', async () => {
      mockSubscriptionRepository.findByConfirmToken.mockResolvedValue(
        createSubscription({
          status: 'ACTIVE',
        }),
      );

      await expect(
        subscriptionService.confirmSubscription('token-123'),
      ).rejects.toMatchObject({
        status: 400,
      });

      expect(scannerCommandPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    it('unsubscribes the last active user and disables repository tracking', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue(
        createSubscription({
          status: 'ACTIVE',
        }),
      );

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        createSubscription({
          status: 'UNSUBSCRIBED',
        }),
      );

      mockSubscriptionQueryRepository.findRepositoryById.mockResolvedValue(
        createRepository(),
      );

      mockSubscriptionQueryRepository.countByRepoIdAndStatus.mockResolvedValue(
        0,
      );

      await subscriptionService.cancelSubscription('unsub-token');

      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        'sub-1',
        'UNSUBSCRIBED',
      );

      expect(scannerCommandPublisher.publish).toHaveBeenCalledWith({
        type: 'sync-repository-tracking',
        repositoryId: 'repository-1',
        repoName: 'facebook/react',
        active: false,
      });
    });

    it('keeps repository tracking enabled when other active subscriptions remain', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue(
        createSubscription({
          status: 'ACTIVE',
        }),
      );

      mockSubscriptionRepository.updateStatus.mockResolvedValue(
        createSubscription({
          status: 'UNSUBSCRIBED',
        }),
      );

      mockSubscriptionQueryRepository.findRepositoryById.mockResolvedValue(
        createRepository(),
      );

      mockSubscriptionQueryRepository.countByRepoIdAndStatus.mockResolvedValue(
        2,
      );

      await subscriptionService.cancelSubscription('unsub-token');

      expect(scannerCommandPublisher.publish).toHaveBeenCalledWith({
        type: 'sync-repository-tracking',
        repositoryId: 'repository-1',
        repoName: 'facebook/react',
        active: true,
      });
    });

    it('throws 404 if token is not found', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue(null);

      await expect(
        subscriptionService.cancelSubscription('bad-token'),
      ).rejects.toMatchObject({
        status: 404,
      });

      expect(scannerCommandPublisher.publish).not.toHaveBeenCalled();
    });

    it('throws 400 if already unsubscribed', async () => {
      mockSubscriptionRepository.findByUnsubscribeToken.mockResolvedValue(
        createSubscription({
          status: 'UNSUBSCRIBED',
        }),
      );

      await expect(
        subscriptionService.cancelSubscription('unsub-token'),
      ).rejects.toMatchObject({
        status: 400,
      });

      expect(scannerCommandPublisher.publish).not.toHaveBeenCalled();
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
