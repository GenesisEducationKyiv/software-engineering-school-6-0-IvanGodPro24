import { jest } from '@jest/globals';
import createHttpError from 'http-errors';
import request from 'supertest';

const mockCheckRepoExists = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule('../services/github.service.js', () => ({
  GitHubClient: class {
    checkRepoExists = mockCheckRepoExists;
    getLatestRelease = jest.fn();
  },
}));

const mockSendEmail = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule('../services/email.service.js', () => ({
  NodemailerProvider: class {
    sendEmail = mockSendEmail;
  },
}));

const { app } = await import('../index.js');
const { prisma } = await import('../db/client.js');
const { redis } = await import('../queue/redis.js');
const { emailQueue } = await import('../queue/email.queue.js');

const TEST_EMAILS = [
  'test@example.com',
  'confirm@test.com',
  'unsub@test.com',
  'list@test.com',
];

const TEST_REPOS = [
  'golang/go',
  'test/repo',
  'test/confirm-repo',
  'test/unsub-repo',
  'active/repo',
  'pending/repo',
];

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
  beforeEach(async () => {
    jest.clearAllMocks();

    await prisma.subscription.deleteMany({
      where: { email: { in: TEST_EMAILS } },
    });
    await prisma.repository.deleteMany({
      where: { name: { in: TEST_REPOS } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await emailQueue.close();
    await redis.quit();
  });

  describe('POST /api/subscribe', () => {
    it('returns 200, creates repository and subscription in the database if the data is valid', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);
      const testEmail = 'test@example.com';
      const testRepo = 'golang/go';

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: testEmail, repo: testRepo });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Subscription created/i);

      const savedRepo = await prisma.repository.findUnique({
        where: { name: testRepo },
      });
      expect(savedRepo).not.toBeNull();

      const savedSubscription = await prisma.subscription.findFirst({
        where: { email: testEmail, repositoryId: savedRepo?.id },
      });
      expect(savedSubscription).not.toBeNull();
      expect(savedSubscription?.status).toBe('PENDING');

      expect(mockSendEmail).toHaveBeenCalledWith(
        testEmail,
        expect.stringContaining(testRepo),
        expect.stringContaining(savedSubscription?.confirmToken || ''),
      );
    });

    it('returns 400 if email is invalid', async () => {
      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'not-an-email', repo: 'golang/go' });

      expect(res.status).toBe(400);

      const subsCount = await prisma.subscription.count();
      expect(subsCount).toBe(0);
    });

    it('returns 404 if repository does not exist on GitHub', async () => {
      mockCheckRepoExists.mockRejectedValue(
        createHttpError(404, 'Repository not found'),
      );

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@example.com', repo: 'bad/repo' });

      expect(res.status).toBe(404);

      const repoCount = await prisma.repository.count();
      const subCount = await prisma.subscription.count();
      expect(repoCount).toBe(0);
      expect(subCount).toBe(0);
    });

    it('returns 409 if subscription is already PENDING', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);

      await seedSubscription('test@example.com', 'test/repo', 'PENDING');

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@example.com', repo: 'test/repo' });

      expect(res.status).toBe(409);
      expect(res.body.data.message).toMatch(/Subscription is pending/i);
    });

    it('returns 409 if subscription is already ACTIVE', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);

      await seedSubscription('test@example.com', 'test/repo', 'ACTIVE');

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@example.com', repo: 'test/repo' });

      expect(res.status).toBe(409);
      expect(res.body.data.message).toMatch(/Already subscribed/i);
    });

    it('returns 200, updates status to PENDING and resends email if UNSUBSCRIBED', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);

      const sub = await seedSubscription(
        'test@example.com',
        'test/repo',
        'UNSUBSCRIBED',
      );

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@example.com', repo: 'test/repo' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Subscription created/i);

      const updatedSub = await prisma.subscription.findUnique({
        where: { id: sub.id },
      });
      expect(updatedSub?.status).toBe('PENDING');

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('test/repo'),
        expect.stringContaining(updatedSub?.confirmToken || ''),
      );
    });
  });

  describe('GET /api/confirm/:token', () => {
    it('returns 200 and changes status to ACTIVE for a valid token', async () => {
      const sub = await seedSubscription(
        'confirm@test.com',
        'test/confirm-repo',
        'PENDING',
      );

      const res = await request(app).get(`/api/confirm/${sub.confirmToken}`);

      expect(res.status).toBe(200);

      const updatedSub = await prisma.subscription.findUnique({
        where: { id: sub.id },
      });
      expect(updatedSub?.status).toBe('ACTIVE');
    });

    it('returns 404 for an invalid token', async () => {
      const res = await request(app).get('/api/confirm/fake-invalid-token');
      expect(res.status).toBe(404);
    });

    it('returns 400 if subscription is already ACTIVE', async () => {
      const sub = await seedSubscription(
        'confirm@test.com',
        'test/confirm-repo',
        'ACTIVE',
      );

      const res = await request(app).get(`/api/confirm/${sub.confirmToken}`);

      expect(res.status).toBe(400);
      expect(res.body.data.message).toMatch(/already confirmed/i);
    });
  });

  describe('GET /api/unsubscribe/:token', () => {
    it('returns 200 and changes status to UNSUBSCRIBED for a valid token', async () => {
      const sub = await seedSubscription(
        'unsub@test.com',
        'test/unsub-repo',
        'ACTIVE',
      );

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
      const res = await request(app).get('/api/unsubscribe/fake-token');
      expect(res.status).toBe(404);
    });

    it('returns 400 if already UNSUBSCRIBED', async () => {
      const sub = await seedSubscription(
        'unsub@test.com',
        'test/unsub-repo',
        'UNSUBSCRIBED',
      );

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
        '/api/subscriptions?email=test@test.com',
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 if x-api-key is invalid', async () => {
      const res = await request(app)
        .get('/api/subscriptions?email=test@test.com')
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
      await seedSubscription('list@test.com', 'active/repo', 'ACTIVE', 'v1.0');
      await seedSubscription('list@test.com', 'pending/repo', 'PENDING');

      const res = await request(app)
        .get('/api/subscriptions?email=list@test.com')
        .set('x-api-key', 'super-secret-key');

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual(
        expect.objectContaining({
          repo: 'active/repo',
          confirmed: true,
          last_seen_tag: 'v1.0',
        }),
      );
    });
  });
});
