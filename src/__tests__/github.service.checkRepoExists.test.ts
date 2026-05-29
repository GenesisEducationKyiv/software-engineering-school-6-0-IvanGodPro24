import { jest } from '@jest/globals';
import { ICacheService } from '../services/cache.service.js';
import { GitHubClient } from '../services/github.service.js';
import { AxiosInstance } from 'axios';

describe('github.service - checkRepoExists', () => {
  let githubClient: GitHubClient;

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
  } as unknown as jest.Mocked<ICacheService>;

  const mockAxiosGet = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const mockAxiosInstance = {
    get: mockAxiosGet,
  } as unknown as AxiosInstance;

  const createAxiosError = (
    status: number,
    headers: Record<string, string> = {},
  ) => ({
    isAxiosError: true,
    response: { status, headers },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    githubClient = new GitHubClient(mockCacheService, mockAxiosInstance);
  });

  it('does not throw if repository exists', async () => {
    mockAxiosGet.mockResolvedValue({ status: 200 });

    await expect(
      githubClient.checkRepoExists('golang', 'go'),
    ).resolves.toBeUndefined();
  });

  it('throws 404 if repository is not found', async () => {
    mockAxiosGet.mockRejectedValue(createAxiosError(404));

    await expect(
      githubClient.checkRepoExists('bad', 'repo'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws 429 on GitHub rate limit', async () => {
    mockAxiosGet.mockRejectedValue(
      createAxiosError(403, { 'x-ratelimit-remaining': '0' }),
    );

    await expect(
      githubClient.checkRepoExists('golang', 'go'),
    ).rejects.toMatchObject({
      status: 429,
    });
  });
});
