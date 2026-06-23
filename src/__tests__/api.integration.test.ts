import { jest } from '@jest/globals';
import createHttpError from 'http-errors';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

const mockVerifyRepository = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule(
  '../infrastructure/scanner/rest-repository-verifier.js',
  () => ({
    RestRepositoryVerifier: class {
      verifyRepository = mockVerifyRepository;
    },
  }),
);

const mockAddEmail = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockAddBulkEmails = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule('../queue/email-queue.adapter.js', () => ({
  EmailQueueAdapter: class {
    addEmail = mockAddEmail;
    addBulkEmails = mockAddBulkEmails;
  },
}));

const { app } = await import('../index.js');
const { prisma } = await import('../infrastructure/db/client.js');
const { redis } = await import('../infrastructure/redis/redis.js');
const { emailQueue } = await import('../queue/email.queue.js');

async function seedSubscription(
  email: string,
  repoName: string,
  status: 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED',
  lastSeenTag?: string,
) {
  const repo = await prisma.repository.upsert({
    where: { name: repoName },
    update: { lastSeenTag },
    create: { name: repoName, lastSeenTag },
  });

  return prisma.subscription.create({
    data: {
      email,
      repositoryId: repo.id,
      status,
    },
  });
}

describe('Integration Tests: API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await emailQueue.close();
    await redis.quit();
  });

  describe('POST /api/subscribe', () => {
    it('returns 202, creates saga, repository and subscription if the data is valid', async () => {
      mockVerifyRepository.mockResolvedValue(undefined);

      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `golang/go-${randomUUID()}`;

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(202);
      expect(res.body.message).toMatch(/Subscription request accepted/i);
      expect(res.body.status).toBe('EMAIL_SEND_REQUESTED');
      expect(res.body.sagaId).toEqual(expect.any(String));
      expect(res.body.subscriptionId).toEqual(expect.any(String));

      const savedRepo = await prisma.repository.findUnique({
        where: { name: testRepo },
      });
      expect(savedRepo).not.toBeNull();

      const savedSubscription = await prisma.subscription.findFirst({
        where: { email: testEmail, repositoryId: savedRepo?.id },
      });
      expect(savedSubscription).not.toBeNull();
      expect(savedSubscription?.status).toBe('PENDING');
      expect(savedSubscription?.id).toBe(res.body.subscriptionId);

      const savedSaga = await prisma.subscriptionSaga.findUnique({
        where: { id: res.body.sagaId },
      });

      expect(savedSaga).not.toBeNull();
      expect(savedSaga?.status).toBe('EMAIL_SEND_REQUESTED');
      expect(savedSaga?.subscriptionId).toBe(savedSubscription?.id);
      expect(savedSaga?.repoName).toBe(testRepo);

      expect(mockAddEmail).toHaveBeenCalledWith({
        type: 'confirm-subscription',
        sagaId: res.body.sagaId,
        subscriptionId: savedSubscription?.id,
        email: testEmail,
        repoName: testRepo,
        confirmToken: savedSubscription?.confirmToken,
      });
    });

    it('returns 400 if email is invalid', async () => {
      const testRepo = `golang/go-${randomUUID()}`;

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'not-an-email', repo: testRepo });

      expect(res.status).toBe(400);

      const savedRepo = await prisma.repository.findUnique({
        where: { name: testRepo },
      });
      expect(savedRepo).toBeNull();
    });

    it('returns 404 if repository does not exist on GitHub', async () => {
      mockVerifyRepository.mockRejectedValue(
        createHttpError(404, 'Repository not found'),
      );

      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `bad/repo-${randomUUID()}`;

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(404);

      const savedRepo = await prisma.repository.findUnique({
        where: { name: testRepo },
      });
      const savedSub = await prisma.subscription.findFirst({
        where: { email: testEmail },
      });
      expect(savedRepo).toBeNull();
      expect(savedSub).toBeNull();
    });

    it('returns 409 if subscription is already PENDING', async () => {
      mockVerifyRepository.mockResolvedValue(undefined);

      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      await seedSubscription(testEmail, testRepo, 'PENDING');

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(409);
      expect(res.body.data.message).toMatch(/Subscription is pending/i);

      const savedSaga = await prisma.subscriptionSaga.findFirst({
        where: { email: testEmail, repoName: testRepo },
      });

      expect(savedSaga).toBeNull();
      expect(mockAddEmail).not.toHaveBeenCalled();
    });

    it('returns 409 if subscription is already ACTIVE', async () => {
      mockVerifyRepository.mockResolvedValue(undefined);

      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      await seedSubscription(testEmail, testRepo, 'ACTIVE');

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(409);
      expect(res.body.data.message).toMatch(/Already subscribed/i);

      const savedSaga = await prisma.subscriptionSaga.findFirst({
        where: { email: testEmail, repoName: testRepo },
      });

      expect(savedSaga).toBeNull();
      expect(mockAddEmail).not.toHaveBeenCalled();
    });

    it('returns 202, updates status to PENDING and starts saga if UNSUBSCRIBED', async () => {
      mockVerifyRepository.mockResolvedValue(undefined);

      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      const sub = await seedSubscription(testEmail, testRepo, 'UNSUBSCRIBED');

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(202);
      expect(res.body.message).toMatch(/Subscription request accepted/i);
      expect(res.body.status).toBe('EMAIL_SEND_REQUESTED');
      expect(res.body.sagaId).toEqual(expect.any(String));
      expect(res.body.subscriptionId).toBe(sub.id);

      const updatedSub = await prisma.subscription.findUnique({
        where: { id: sub.id },
      });
      expect(updatedSub?.status).toBe('PENDING');

      const savedSaga = await prisma.subscriptionSaga.findUnique({
        where: { id: res.body.sagaId },
      });

      expect(savedSaga).not.toBeNull();
      expect(savedSaga?.status).toBe('EMAIL_SEND_REQUESTED');
      expect(savedSaga?.subscriptionId).toBe(sub.id);
      expect(savedSaga?.createdSubscription).toBe(false);

      expect(mockAddEmail).toHaveBeenCalledTimes(1);
      expect(mockAddEmail).toHaveBeenCalledWith({
        type: 'confirm-subscription',
        sagaId: res.body.sagaId,
        subscriptionId: updatedSub?.id,
        email: testEmail,
        repoName: testRepo,
        confirmToken: updatedSub?.confirmToken,
      });
    });

    it('compensates subscription saga if email command publishing fails', async () => {
      mockVerifyRepository.mockResolvedValue(undefined);
      mockAddEmail.mockRejectedValue(new Error('Redis unavailable'));

      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(500);

      const savedRepo = await prisma.repository.findUnique({
        where: { name: testRepo },
      });

      const savedSubscription = await prisma.subscription.findFirst({
        where: { email: testEmail },
      });

      const savedSaga = await prisma.subscriptionSaga.findFirst({
        where: { email: testEmail, repoName: testRepo },
      });

      expect(savedSubscription).toBeNull();

      expect(savedSaga).not.toBeNull();
      expect(savedSaga?.status).toBe('COMPENSATED');
      expect(savedSaga?.errorMessage).toBe('Redis unavailable');

      if (savedRepo) {
        const repoSubscriptionsCount = await prisma.subscription.count({
          where: { repositoryId: savedRepo.id },
        });

        expect(repoSubscriptionsCount).toBe(0);
      }
    });
  });

  describe('GET /api/confirm/:token', () => {
    it('returns 200 and changes status to ACTIVE for a valid token', async () => {
      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      const sub = await seedSubscription(testEmail, testRepo, 'PENDING');

      const res = await request(app).get(`/api/confirm/${sub.confirmToken}`);

      expect(res.status).toBe(200);

      const updatedSub = await prisma.subscription.findUnique({
        where: { id: sub.id },
      });
      expect(updatedSub?.status).toBe('ACTIVE');
    });

    it('returns 404 for an invalid token', async () => {
      const res = await request(app).get(
        `/api/confirm/fake-token-${randomUUID()}`,
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 if subscription is already ACTIVE', async () => {
      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      const sub = await seedSubscription(testEmail, testRepo, 'ACTIVE');

      const res = await request(app).get(`/api/confirm/${sub.confirmToken}`);

      expect(res.status).toBe(400);
      expect(res.body.data.message).toMatch(/already confirmed/i);
    });
  });

  describe('GET /api/unsubscribe/:token', () => {
    it('returns 200 and changes status to UNSUBSCRIBED for a valid token', async () => {
      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      const sub = await seedSubscription(testEmail, testRepo, 'ACTIVE');

      const res = await request(app).get(
        `/api/unsubscribe/${sub.unsubscribeToken}`,
      );

      expect(res.status).toBe(200);

      const updatedSub = await prisma.subscription.findUnique({
        where: { id: sub.id },
      });
      expect(updatedSub?.status).toBe('UNSUBSCRIBED');
    });

    it('returns 404 if token is invalid', async () => {
      const res = await request(app).get(
        `/api/unsubscribe/fake-token-${randomUUID()}`,
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 if already UNSUBSCRIBED', async () => {
      const testEmail = `test-${randomUUID()}@example.com`;
      const testRepo = `test/repo-${randomUUID()}`;

      const sub = await seedSubscription(testEmail, testRepo, 'UNSUBSCRIBED');

      const res = await request(app).get(
        `/api/unsubscribe/${sub.unsubscribeToken}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.data.message).toMatch(/Already unsubscribed/i);
    });
  });

  describe('GET /api/subscriptions', () => {
    it('returns 401 if x-api-key header is missing', async () => {
      const res = await request(app).get(
        `/api/subscriptions?email=test-${randomUUID()}@test.com`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 if x-api-key is invalid', async () => {
      const res = await request(app)
        .get(`/api/subscriptions?email=test-${randomUUID()}@test.com`)
        .set('x-api-key', 'wrong-key');
      expect(res.status).toBe(403);
    });

    it('returns 400 if email query parameter is missing', async () => {
      const res = await request(app)
        .get('/api/subscriptions')
        .set('x-api-key', 'super-secret-key');
      expect(res.status).toBe(400);
    });

    it('returns 200 and a list of ACTIVE subscriptions for the email', async () => {
      const listEmail = `list-${randomUUID()}@test.com`;
      const activeRepo = `active-${randomUUID()}/repo`;
      const pendingRepo = `pending-${randomUUID()}/repo`;

      await seedSubscription(listEmail, activeRepo, 'ACTIVE', 'v1.0');
      await seedSubscription(listEmail, pendingRepo, 'PENDING');

      const res = await request(app)
        .get(`/api/subscriptions?email=${listEmail}`)
        .set('x-api-key', 'super-secret-key');

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual(
        expect.objectContaining({
          repo: activeRepo,
          confirmed: true,
          last_seen_tag: 'v1.0',
        }),
      );
    });
  });
});
