import axios, { AxiosInstance } from 'axios';
import {
  IGitHubRepositoryClient,
  VerifiedRepository,
} from '../app/github-repository-client.port.js';
import { IGitHubReleaseClient } from '../app/github-release-client.port.js';
import { IReleaseCache } from '../app/release-cache.port.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';

type GitHubRepositoryResponse = {
  full_name?: string;
};

type GitHubReleaseResponse = {
  tag_name?: string;
};

export class GitHubRepositoryClient
  implements IGitHubRepositoryClient, IGitHubReleaseClient
{
  constructor(
    private readonly githubApi: AxiosInstance,
    private readonly releaseCache: IReleaseCache,
  ) {}

  async verifyRepository(
    owner: string,
    repository: string,
  ): Promise<VerifiedRepository> {
    try {
      const response = await this.githubApi.get<GitHubRepositoryResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
      );

      return {
        fullName: response.data.full_name ?? `${owner}/${repository}`,
      };
    } catch (error) {
      this.handleGitHubError(error);
    }
  }

  async getLatestRelease(
    owner: string,
    repository: string,
  ): Promise<string | null> {
    const repoName = `${owner}/${repository}`;
    const cachedRelease = await this.releaseCache.get(repoName);

    try {
      const response = await this.githubApi.get<GitHubReleaseResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases/latest`,
        {
          headers: {
            ...(cachedRelease?.etag && {
              'If-None-Match': cachedRelease.etag,
            }),
          },
        },
      );

      if (response.status === 304) {
        return cachedRelease?.tag ?? null;
      }

      const tag = response.data.tag_name ?? null;
      const etag =
        typeof response.headers.etag === 'string'
          ? response.headers.etag
          : null;

      await this.releaseCache.set(repoName, {
        tag,
        etag,
      });

      return tag;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await this.releaseCache.set(repoName, {
          tag: null,
          etag: null,
        });

        return null;
      }

      this.handleGitHubError(error);
    }
  }

  private handleGitHubError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const rateLimitRemaining =
        error.response?.headers['x-ratelimit-remaining'];

      if (status === 404) {
        throw new RepositoryVerificationError(
          'NOT_FOUND',
          'Repository not found',
        );
      }

      if (
        status === 429 ||
        (status === 403 && String(rateLimitRemaining) === '0')
      ) {
        throw new RepositoryVerificationError(
          'RESOURCE_EXHAUSTED',
          'GitHub rate limit exceeded',
        );
      }

      if (status === 403) {
        throw new RepositoryVerificationError(
          'PERMISSION_DENIED',
          'GitHub repository access forbidden',
        );
      }

      if (!error.response || (status !== undefined && status >= 500)) {
        throw new RepositoryVerificationError(
          'UNAVAILABLE',
          'GitHub API is temporarily unavailable',
        );
      }
    }

    throw new RepositoryVerificationError(
      'INTERNAL',
      'Unexpected GitHub API error',
    );
  }
}
