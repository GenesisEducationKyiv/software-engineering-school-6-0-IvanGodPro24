import { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { jest } from '@jest/globals';
import { GitHubRepositoryClient } from '../github/github.client.js';
import {
  IReleaseCache,
  ReleaseCacheEntry,
} from '../app/release-cache.port.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';

type GitHubApiMock = Pick<AxiosInstance, 'get'>;

const githubApi = {
  get: jest.fn(),
} as jest.Mocked<GitHubApiMock>;

const releaseCache = {
  get: jest.fn(),
  set: jest.fn(),
} as jest.Mocked<IReleaseCache>;

const createClient = (): GitHubRepositoryClient =>
  new GitHubRepositoryClient(githubApi as unknown as AxiosInstance, releaseCache);

const createResponse = <T>(
  overrides: Partial<AxiosResponse<T>> = {},
): AxiosResponse<T> =>
  ({
    data: {} as T,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    ...overrides,
  }) as AxiosResponse<T>;

const createAxiosError = (
  status?: number,
  headers: Record<string, string> = {},
): AxiosError => {
  const response =
    status === undefined
      ? undefined
      : createResponse({
          status,
          headers,
        });

  return new AxiosError(
    'GitHub API error',
    undefined,
    undefined,
    undefined,
    response,
  );
};

const expectRepositoryError = async (
  action: () => Promise<unknown>,
  code: RepositoryVerificationError['code'],
): Promise<void> => {
  await expect(action()).rejects.toMatchObject({
    name: 'RepositoryVerificationError',
    code,
  });
};

describe('GitHubRepositoryClient', () => {
  let client: GitHubRepositoryClient;

  beforeEach(() => {
    jest.resetAllMocks();

    releaseCache.get.mockResolvedValue(null);
    releaseCache.set.mockResolvedValue(undefined);

    client = createClient();
  });

  describe('verifyRepository', () => {
    it('returns verified repository full name from GitHub response', async () => {
      githubApi.get.mockResolvedValue(
        createResponse({
          data: {
            full_name: 'facebook/react',
          },
        }),
      );

      await expect(client.verifyRepository('facebook', 'react')).resolves.toEqual(
        {
          fullName: 'facebook/react',
        },
      );

      expect(githubApi.get).toHaveBeenCalledWith('/repos/facebook/react');
    });

    it('falls back to requested owner and repository when full_name is missing', async () => {
      githubApi.get.mockResolvedValue(
        createResponse({
          data: {},
        }),
      );

      await expect(client.verifyRepository('facebook', 'react')).resolves.toEqual(
        {
          fullName: 'facebook/react',
        },
      );
    });

    it('maps 404 response to NOT_FOUND', async () => {
      githubApi.get.mockRejectedValue(createAxiosError(404));

      await expectRepositoryError(
        () => client.verifyRepository('facebook', 'react'),
        'NOT_FOUND',
      );
    });

    it('maps 403 response to PERMISSION_DENIED', async () => {
      githubApi.get.mockRejectedValue(createAxiosError(403));

      await expectRepositoryError(
        () => client.verifyRepository('facebook', 'react'),
        'PERMISSION_DENIED',
      );
    });

    it('maps 429 response to RESOURCE_EXHAUSTED', async () => {
      githubApi.get.mockRejectedValue(createAxiosError(429));

      await expectRepositoryError(
        () => client.verifyRepository('facebook', 'react'),
        'RESOURCE_EXHAUSTED',
      );
    });

    it('maps exhausted 403 rate limit response to RESOURCE_EXHAUSTED', async () => {
      githubApi.get.mockRejectedValue(
        createAxiosError(403, {
          'x-ratelimit-remaining': '0',
        }),
      );

      await expectRepositoryError(
        () => client.verifyRepository('facebook', 'react'),
        'RESOURCE_EXHAUSTED',
      );
    });

    it('maps 5xx response to UNAVAILABLE', async () => {
      githubApi.get.mockRejectedValue(createAxiosError(503));

      await expectRepositoryError(
        () => client.verifyRepository('facebook', 'react'),
        'UNAVAILABLE',
      );
    });

    it('maps network errors without response to UNAVAILABLE', async () => {
      githubApi.get.mockRejectedValue(createAxiosError());

      await expectRepositoryError(
        () => client.verifyRepository('facebook', 'react'),
        'UNAVAILABLE',
      );
    });
  });

  describe('getLatestRelease', () => {
    it('sends If-None-Match when cached etag exists', async () => {
      releaseCache.get.mockResolvedValue({
        tag: 'v18.2.0',
        etag: '"release-etag"',
      });

      githubApi.get.mockResolvedValue(
        createResponse({
          data: {
            tag_name: 'v19.0.0',
          },
          headers: {
            etag: '"new-release-etag"',
          },
        }),
      );

      await expect(client.getLatestRelease('facebook', 'react')).resolves.toBe(
        'v19.0.0',
      );

      expect(githubApi.get).toHaveBeenCalledWith(
        '/repos/facebook/react/releases/latest',
        {
          headers: {
            'If-None-Match': '"release-etag"',
          },
        },
      );
    });

    it('returns cached tag on 304 response', async () => {
      const cachedRelease: ReleaseCacheEntry = {
        tag: 'v18.2.0',
        etag: '"release-etag"',
      };

      releaseCache.get.mockResolvedValue(cachedRelease);
      githubApi.get.mockResolvedValue(
        createResponse({
          status: 304,
          data: {},
        }),
      );

      await expect(client.getLatestRelease('facebook', 'react')).resolves.toBe(
        'v18.2.0',
      );

      expect(releaseCache.set).not.toHaveBeenCalled();
    });

    it('stores tag and etag from latest release response', async () => {
      githubApi.get.mockResolvedValue(
        createResponse({
          data: {
            tag_name: 'v19.0.0',
          },
          headers: {
            etag: '"release-etag"',
          },
        }),
      );

      await expect(client.getLatestRelease('facebook', 'react')).resolves.toBe(
        'v19.0.0',
      );

      expect(releaseCache.set).toHaveBeenCalledWith('facebook/react', {
        tag: 'v19.0.0',
        etag: '"release-etag"',
      });
    });

    it('returns null and caches null release when latest release is not found', async () => {
      githubApi.get.mockRejectedValue(createAxiosError(404));

      await expect(client.getLatestRelease('facebook', 'react')).resolves.toBe(
        null,
      );

      expect(releaseCache.set).toHaveBeenCalledWith('facebook/react', {
        tag: null,
        etag: null,
      });
    });

    it('maps rate limit errors while fetching latest release', async () => {
      githubApi.get.mockRejectedValue(createAxiosError(429));

      await expectRepositoryError(
        () => client.getLatestRelease('facebook', 'react'),
        'RESOURCE_EXHAUSTED',
      );
    });
  });
});
