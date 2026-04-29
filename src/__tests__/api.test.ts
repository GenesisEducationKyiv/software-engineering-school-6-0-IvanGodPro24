import { jest } from '@jest/globals';
import request from 'supertest';
import createHttpError from 'http-errors';

const mockCheckRepoExists = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const mockPrisma = {
  repository: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
  subscription: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../db/client.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../services/github.service.js', () => ({
  checkRepoExists: mockCheckRepoExists,
}));
jest.unstable_mockModule('../services/subscription-email.service.js', () => ({
  sendConfirmEmail: jest.fn(),
}));
jest.unstable_mockModule('../services/scanner.service.js', () => ({
  startScanner: jest.fn(),
}));
jest.unstable_mockModule('../queue/dashboard.js', () => ({
  bullBoardRouter: (req: unknown, res: unknown, next: () => void) => next(),
}));
jest.unstable_mockModule('../utils/getEnvVar.js', () => ({
  getEnvVar: (key: string, fallback: string = '') => {
    if (key === 'API_KEY') return 'super-secret-key';
    return fallback;
  },
}));

const { app } = await import('../index.js');
const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

describe('Integration Tests: API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/subscribe', () => {
    it('returns 400 if validation fails (invalid email)', async () => {
      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'not-an-email', repo: 'golang/go' });

      expect(res.status).toBe(400);
    });

    it('returns 404 if repository does not exist on GitHub', async () => {
      mockCheckRepoExists.mockRejectedValue(
        createHttpError(404, 'Repository not found'),
      );

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@test.com', repo: 'bad/repo' });

      expect(res.status).toBe(404);
    });

    it('returns 200 and creates subscription if data is valid', async () => {
      mockCheckRepoExists.mockResolvedValue(undefined);
      asMock(mockPrisma.repository.upsert).mockResolvedValue({
        id: 'repo-1',
        name: 'golang/go',
      });
      asMock(mockPrisma.subscription.findUnique).mockResolvedValue(null);
      asMock(mockPrisma.subscription.create).mockResolvedValue({
        email: 'test@test.com',
        confirmToken: 'tkn',
      });

      const res = await request(app)
        .post('/api/subscribe')
        .send({ email: 'test@test.com', repo: 'golang/go' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/created/i);
    });
  });

  describe('GET /api/confirm/:token', () => {
    it('returns 200 on successful confirmation', async () => {
      asMock(mockPrisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'PENDING',
      });
      asMock(mockPrisma.subscription.update).mockResolvedValue({});

      const res = await request(app).get('/api/confirm/valid-token');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/confirmed successfully/i);
    });
  });

  describe('GET /api/unsubscribe/:token', () => {
    it('returns 200 on successful unsubscription', async () => {
      asMock(mockPrisma.subscription.findUnique).mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      });
      asMock(mockPrisma.subscription.update).mockResolvedValue({});

      const res = await request(app).get('/api/unsubscribe/valid-token');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/unsubscribed successfully/i);
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

    it('returns 400 if validation fails (no email query)', async () => {
      const res = await request(app)
        .get('/api/subscriptions')
        .set('x-api-key', 'super-secret-key');

      expect(res.status).toBe(400);
    });

    it('returns 200 and data if auth and validation pass', async () => {
      asMock(mockPrisma.subscription.findMany).mockResolvedValue([
        {
          email: 'test@test.com',
          status: 'ACTIVE',
          repository: { name: 'golang/go', lastSeenTag: 'v1.0' },
        },
      ]);

      const res = await request(app)
        .get('/api/subscriptions?email=test@test.com')
        .set('x-api-key', 'super-secret-key');

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body[0].repo).toBe('golang/go');
    });
  });
});
