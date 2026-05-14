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

describe('Integration Tests: API Endpoints', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.subscription.deleteMany();
    await prisma.repository.deleteMany();
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
      const repo = await prisma.repository.create({
        data: { name: 'test/repo' },
      });
      await prisma.subscription.create({
        data: {
          email: 'test@example.com',
          repositoryId: repo.id,
          status: 'PENDING',
        },
      });

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@example.com', repo: 'test/repo' });

      expect(res.status).toBe(409);
      expect(res.body.data.message).toMatch(/Subscription is pending/i);
    });

    it('returns 409 if subscription is already ACTIVE', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);
      const repo = await prisma.repository.create({
        data: { name: 'test/repo' },
      });
      await prisma.subscription.create({
        data: {
          email: 'test@example.com',
          repositoryId: repo.id,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@example.com', repo: 'test/repo' });

      expect(res.status).toBe(409);
      expect(res.body.data.message).toMatch(/Already subscribed/i);
    });

    it('returns 200, updates status to PENDING and resends email if UNSUBSCRIBED', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);
      const repo = await prisma.repository.create({
        data: { name: 'test/repo' },
      });
      const sub = await prisma.subscription.create({
        data: {
          email: 'test@example.com',
          repositoryId: repo.id,
          status: 'UNSUBSCRIBED',
        },
      });

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
      const repo = await prisma.repository.create({
        data: { name: 'test/confirm-repo' },
      });
      const sub = await prisma.subscription.create({
        data: {
          email: 'confirm@test.com',
          repositoryId: repo.id,
          status: 'PENDING',
        },
      });

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
      const repo = await prisma.repository.create({
        data: { name: 'test/confirm-repo' },
      });
      const sub = await prisma.subscription.create({
        data: {
          email: 'confirm@test.com',
          repositoryId: repo.id,
          status: 'ACTIVE',
        },
      });

      const res = await request(app).get(`/api/confirm/${sub.confirmToken}`);

      expect(res.status).toBe(400);
      expect(res.body.data.message).toMatch(/already confirmed/i);
    });
  });

  describe('GET /api/unsubscribe/:token', () => {
    it('returns 200 and changes status to UNSUBSCRIBED for a valid token', async () => {
      const repo = await prisma.repository.create({
        data: { name: 'test/unsub-repo' },
      });
      const sub = await prisma.subscription.create({
        data: {
          email: 'unsub@test.com',
          repositoryId: repo.id,
          status: 'ACTIVE',
        },
      });

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
      const repo = await prisma.repository.create({
        data: { name: 'test/unsub-repo' },
      });
      const sub = await prisma.subscription.create({
        data: {
          email: 'unsub@test.com',
          repositoryId: repo.id,
          status: 'UNSUBSCRIBED',
        },
      });

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
      const repo1 = await prisma.repository.create({
        data: { name: 'active/repo', lastSeenTag: 'v1.0' },
      });
      const repo2 = await prisma.repository.create({
        data: { name: 'pending/repo' },
      });

      await prisma.subscription.createMany({
        data: [
          { email: 'list@test.com', repositoryId: repo1.id, status: 'ACTIVE' },
          { email: 'list@test.com', repositoryId: repo2.id, status: 'PENDING' },
        ],
      });

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
