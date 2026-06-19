import { jest } from '@jest/globals';
import { SubscriptionEntity } from '../modules/subscriptions/subscription.entity.js';
import { TrackedRepoEntity } from '../modules/repositories/tracked-repo.entity.js';
import { SubscriptionService } from '../modules/subscriptions/subscription.service.js';
import { ISubscriptionRepository } from '../modules/subscriptions/subscription.repository.js';
import { ISubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';

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
} as jest.Mocked<ISubscriptionQueryRepository>;

describe('subscription.service', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();

    subscriptionService = new SubscriptionService(
      mockSubscriptionRepository,
      mockSubscriptionQueryRepository,
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
