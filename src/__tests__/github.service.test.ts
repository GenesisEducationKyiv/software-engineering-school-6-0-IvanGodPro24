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
    it('returns tag_name from response', async () => {
      mockGet.mockResolvedValue({ data: { tag_name: 'v1.22.0' } });

      const tag = await githubClient.getLatestRelease('golang', 'go');

      expect(tag).toBe('v1.22.0');

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'repo:golang/go:latest',
        'v1.22.0',
      );
    });

    it('returns null if repository has no releases (404)', async () => {
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
