import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/client.js', () => ({
  prisma: {
    repository: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../services/subscription-email.service.js', () => ({
  sendConfirmEmail: jest.fn(),
}));

const { prisma } = await import('../db/client.js');
const { sendConfirmEmail } =
  await import('../services/subscription-email.service.js');
const {
  createSubscription,
  confirmSubscription,
  cancelSubscription,
  getSubscriptionsByEmail,
} = await import('../services/subscription.service.js');

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

describe('subscription.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      asMock(prisma.repository.upsert).mockResolvedValue(repo);
      asMock(prisma.subscription.findUnique).mockResolvedValue(null);
      asMock(prisma.subscription.create).mockResolvedValue(subscription);

      await createSubscription('test@test.com', 'golang/go');

      expect(prisma.repository.upsert).toHaveBeenCalledWith({
        where: { name: 'golang/go' },
        update: {},
        create: { name: 'golang/go' },
      });
      expect(prisma.subscription.create).toHaveBeenCalled();
      expect(sendConfirmEmail).toHaveBeenCalledWith(
        'test@test.com',
        'golang/go',
        'token-123',
      );
    });

    it('does not create repo if it already exists', async () => {
      const repo = { id: 'repo-1', name: 'golang/go' };
      const subscription = {
        id: 'sub-1',
        email: 'test@test.com',
        confirmToken: 'token-123',
      };

      asMock(prisma.repository.findUnique).mockResolvedValue(repo);
      asMock(prisma.subscription.findUnique).mockResolvedValue(null);
      asMock(prisma.subscription.create).mockResolvedValue(subscription);

      await createSubscription('test@test.com', 'golang/go');

      expect(prisma.repository.create).not.toHaveBeenCalled();
    });

    it('throws 409 if subscription already exists', async () => {
      asMock(prisma.repository.upsert).mockResolvedValue({
        id: 'repo-1',
        name: 'golang/go',
      });
      asMock(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      });

      await expect(
        createSubscription('test@test.com', 'golang/go'),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('confirmSubscription', () => {
    it('confirms the subscription', async () => {
      asMock(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      });
      asMock(prisma.subscription.update).mockResolvedValue({});

      await confirmSubscription('token-123');

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'ACTIVE' },
      });
    });

    it('throws 404 if token is not found', async () => {
      asMock(prisma.subscription.findUnique).mockResolvedValue(null);

      await expect(confirmSubscription('bad-token')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 400 if subscription is already confirmed', async () => {
      asMock(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      });

      await expect(confirmSubscription('token-123')).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('cancelSubscription', () => {
    it('unsubscribes the user', async () => {
      asMock(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      });
      asMock(prisma.subscription.update).mockResolvedValue({});

      await cancelSubscription('unsub-token');

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'UNSUBSCRIBED' },
      });
    });

    it('throws 404 if token is not found', async () => {
      asMock(prisma.subscription.findUnique).mockResolvedValue(null);

      await expect(cancelSubscription('bad-token')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 400 if already unsubscribed', async () => {
      asMock(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'UNSUBSCRIBED',
      });

      await expect(cancelSubscription('unsub-token')).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('returns subscriptions in the correct format', async () => {
      asMock(prisma.subscription.findMany).mockResolvedValue([
        {
          email: 'test@test.com',
          status: 'ACTIVE',
          repository: { name: 'golang/go', lastSeenTag: 'v1.22.0' },
        },
      ]);

      const result = await getSubscriptionsByEmail('test@test.com');

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
      asMock(prisma.subscription.findMany).mockResolvedValue([]);

      const result = await getSubscriptionsByEmail('noone@test.com');

      expect(result).toEqual([]);
    });
  });
});
