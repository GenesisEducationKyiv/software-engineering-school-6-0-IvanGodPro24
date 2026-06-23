import axios, { AxiosInstance } from 'axios';
import createHttpError from 'http-errors';
import { ICacheService } from '../../infrastructure/cache/cache.service.js';
import { IRepositoryVerifier } from './repository-verifier.port.js';
import { IReleaseProvider } from './release-provider.port.js';

export class GitHubClient implements IRepositoryVerifier, IReleaseProvider {
  constructor(
    private readonly cacheService: ICacheService,
    private readonly githubApi: AxiosInstance,
  ) {}

  async verifyRepository(owner: string, repository: string): Promise<void> {
    try {
      await this.githubApi.get(`/repos/${owner}/${repository}`);
    } catch (error) {
      this.handleGitHubError(error);
    }
  }

  async getLatestRelease(owner: string, repo: string): Promise<string | null> {
    const tagCacheKey = `repo:${owner}/${repo}:latest`;
    const etagCacheKey = `repo:${owner}/${repo}:etag`;

    const [cachedTag, cachedEtag] = await Promise.all([
      this.cacheService.get<string | null>(tagCacheKey),
      this.cacheService.get<string>(etagCacheKey),
    ]);

    try {
      const response = await this.githubApi.get(
        `/repos/${owner}/${repo}/releases/latest`,
        {
          headers: {
            ...(cachedEtag && { 'If-None-Match': cachedEtag }),
          },
        },
      );

      if (response.status === 304) return cachedTag;

      const tag = response.data.tag_name || null;
      const newEtag = response.headers['etag'];

      await Promise.all([
        this.cacheService.set(tagCacheKey, tag),
        newEtag && this.cacheService.set(etagCacheKey, newEtag),
      ]);

      return tag;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await this.cacheService.set(tagCacheKey, null);
        return null;
      }

      this.handleGitHubError(error);
    }
  }

  private handleGitHubError(error: unknown): never {
    if (axios.isAxiosError(error) && error.response) {
      const { status, headers } = error.response;

      switch (status) {
        case 404:
          throw createHttpError(404, 'Repository not found');
        case 403:
          if (headers['x-ratelimit-remaining'] === '0') {
            throw createHttpError(429, 'GitHub rate limit exceeded');
          }
          throw createHttpError(403, 'GitHub access forbidden');
        case 429:
          throw createHttpError(429, 'GitHub rate limit exceeded');
      }
    }
    throw error;
  }
}
