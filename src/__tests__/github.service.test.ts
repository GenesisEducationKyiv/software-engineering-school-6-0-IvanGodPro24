import { jest } from '@jest/globals';
import { ICacheService } from '../services/cache.service.js';

const mockGet = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('axios', () => ({
  default: {
    create: jest.fn(() => ({ get: mockGet })),
    isAxiosError: jest.fn(),
  },
  isAxiosError: jest.fn(),
}));

const { default: axios } = await import('axios');
const { GitHubClient } = await import('../services/github.service.js');

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

describe('github.service', () => {
  let githubClient: InstanceType<typeof GitHubClient>;

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
  } as unknown as jest.Mocked<ICacheService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    githubClient = new GitHubClient(mockCacheService);
  });

  describe('checkRepoExists', () => {
    it('does not throw if repository exists', async () => {
      mockGet.mockResolvedValue({ status: 200 });

      await expect(
        githubClient.checkRepoExists('golang', 'go'),
      ).resolves.toBeUndefined();
    });

    it('throws 404 if repository is not found', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } });
      asMock(axios.isAxiosError).mockReturnValue(true);

      await expect(
        githubClient.checkRepoExists('bad', 'repo'),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 429 on GitHub rate limit', async () => {
      mockGet.mockRejectedValue({ response: { status: 429 } });
      asMock(axios.isAxiosError).mockReturnValue(true);

      await expect(
        githubClient.checkRepoExists('golang', 'go'),
      ).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  describe('getLatestRelease', () => {
    beforeEach(() => {
      mockGet.mockReset();
    });

    it('returns tag_name from cache when GitHub API returns 304', async () => {
      mockCacheService.get.mockImplementation(
        async <T>(key: string): Promise<T | null> => {
          if (key.endsWith(':latest')) return 'v1.20.0' as unknown as T;
          if (key.endsWith(':etag')) return 'W/"test-etag"' as unknown as T;
          return null;
        },
      );

      mockGet.mockResolvedValue({ status: 304 });

      const tag = await githubClient.getLatestRelease('golang', 'go');

      expect(tag).toBe('v1.20.0');
      expect(mockGet).toHaveBeenCalledWith('/repos/golang/go/releases/latest', {
        headers: { 'If-None-Match': 'W/"test-etag"' },
      });
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('returns tag_name from API and caches both tag and etag if repo updated', async () => {
      mockCacheService.get.mockResolvedValue(null);

      mockGet.mockResolvedValue({
        status: 200,
        data: { tag_name: 'v1.22.0' },
        headers: { etag: 'W/"new-etag"' },
      });

      const tag = await githubClient.getLatestRelease('golang', 'go');

      expect(tag).toBe('v1.22.0');

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'repo:golang/go:latest',
        'v1.22.0',
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'repo:golang/go:etag',
        'W/"new-etag"',
      );
    });

    it('returns null if repository has no releases (404) and caches null', async () => {
      mockCacheService.get.mockResolvedValue(null);

      mockGet.mockRejectedValue({ response: { status: 404 } });
      asMock(axios.isAxiosError).mockReturnValue(true);

      const tag = await githubClient.getLatestRelease('golang', 'go');

      expect(tag).toBeNull();

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'repo:golang/go:latest',
        null,
      );
    });
  });
});
