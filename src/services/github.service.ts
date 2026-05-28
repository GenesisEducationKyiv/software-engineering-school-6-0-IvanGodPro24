import axios, { AxiosInstance } from 'axios';
import createHttpError from 'http-errors';
import { ICacheService } from './cache.service.js';

export interface IGitHubClient {
  checkRepoExists(owner: string, repo: string): Promise<void>;
  getLatestRelease(owner: string, repo: string): Promise<string | null>;
}

export class GitHubClient implements IGitHubClient {
  constructor(
    private readonly cacheService: ICacheService,
    private readonly githubApi: AxiosInstance,
  ) {}

  async checkRepoExists(owner: string, repo: string): Promise<void> {
    try {
      await this.githubApi.get(`/repos/${owner}/${repo}`);
    } catch (error) {
      this.handleGitHubError(error);
    }
  }

  async getLatestRelease(owner: string, repo: string): Promise<string | null> {
    const cacheKey = `repo:${owner}/${repo}:latest`;

    const cached = await this.cacheService.get<string | null>(cacheKey);
    if (cached !== null) return cached;

    try {
      const response = await this.githubApi.get(
        `/repos/${owner}/${repo}/releases/latest`,
      );
      const tag = response.data.tag_name || null;
      await this.cacheService.set(cacheKey, tag);
      return tag;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await this.cacheService.set(cacheKey, null);
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
