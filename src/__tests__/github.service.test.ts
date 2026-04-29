import { jest } from '@jest/globals';

const mockGet = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('axios', () => ({
  default: {
    create: jest.fn(() => ({ get: mockGet })),
    isAxiosError: jest.fn(),
  },
  isAxiosError: jest.fn(),
}));

jest.unstable_mockModule('../services/cache.service.js', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}));

const { default: axios } = await import('axios');
const { getCache, setCache } = await import('../services/cache.service.js');
const { checkRepoExists, getLatestRelease } =
  await import('../services/github.service.js');

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

describe('github.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    asMock(getCache).mockResolvedValue(null);
    asMock(setCache).mockResolvedValue(undefined);
  });

  describe('checkRepoExists', () => {
    it('does not throw if repository exists', async () => {
      mockGet.mockResolvedValue({ status: 200 });

      await expect(checkRepoExists('golang', 'go')).resolves.toBeUndefined();
    });

    it('throws 404 if repository is not found', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } });
      asMock(axios.isAxiosError).mockReturnValue(true);

      await expect(checkRepoExists('bad', 'repo')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 429 on GitHub rate limit', async () => {
      mockGet.mockRejectedValue({ response: { status: 429 } });
      asMock(axios.isAxiosError).mockReturnValue(true);

      await expect(checkRepoExists('golang', 'go')).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  describe('getLatestRelease', () => {
    it('returns tag_name from response', async () => {
      mockGet.mockResolvedValue({ data: { tag_name: 'v1.22.0' } });

      const tag = await getLatestRelease('golang', 'go');

      expect(tag).toBe('v1.22.0');
    });

    it('returns null if repository has no releases (404)', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } });
      asMock(axios.isAxiosError).mockReturnValue(true);

      const tag = await getLatestRelease('golang', 'go');

      expect(tag).toBeNull();
    });
  });
});
