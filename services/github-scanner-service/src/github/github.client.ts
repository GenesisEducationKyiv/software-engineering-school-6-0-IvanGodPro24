import axios, { AxiosInstance } from 'axios';
import {
  IGitHubRepositoryClient,
  VerifiedRepository,
} from '../app/github-repository-client.port.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';

type GitHubRepositoryResponse = {
  full_name?: string;
};

export class GitHubRepositoryClient implements IGitHubRepositoryClient {
  constructor(private readonly githubApi: AxiosInstance) {}

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
      'Unexpected repository verification error',
    );
  }
}
