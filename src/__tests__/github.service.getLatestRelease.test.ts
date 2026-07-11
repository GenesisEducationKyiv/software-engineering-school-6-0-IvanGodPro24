import { jest } from '@jest/globals';
import { ICacheService } from '../infrastructure/cache/cache.service.js';
import { GitHubClient } from '../modules/github/github.service.js';
import { AxiosInstance } from 'axios';

describe('github.service - getLatestRelease', () => {
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

  it('returns tag_name from cache when GitHub API returns 304', async () => {
    mockCacheService.get.mockImplementation(
      async <T>(key: string): Promise<T | null> => {
        if (key.endsWith(':latest')) return 'v1.20.0' as unknown as T;
        if (key.endsWith(':etag')) return 'W/"test-etag"' as unknown as T;
        return null;
      },
    );

    mockAxiosGet.mockResolvedValue({ status: 304 });

    const tag = await githubClient.getLatestRelease('golang', 'go');

    expect(tag).toBe('v1.20.0');
    expect(mockAxiosGet).toHaveBeenCalledWith(
      '/repos/golang/go/releases/latest',
      {
        headers: { 'If-None-Match': 'W/"test-etag"' },
      },
    );
    expect(mockCacheService.set).not.toHaveBeenCalled();
  });

  it('returns tag_name from API and caches both tag and etag if repo updated', async () => {
    mockCacheService.get.mockResolvedValue(null);

    mockAxiosGet.mockResolvedValue({
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

    mockAxiosGet.mockRejectedValue(createAxiosError(404));

    const tag = await githubClient.getLatestRelease('golang', 'go');

    expect(tag).toBeNull();

    expect(mockCacheService.set).toHaveBeenCalledWith(
      'repo:golang/go:latest',
      null,
    );
  });
});
