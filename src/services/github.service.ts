import axios, { AxiosInstance } from 'axios';
import createHttpError from 'http-errors';
import { getEnvVar } from '../utils/getEnvVar.js';
import { ICacheService } from './cache.service.js';

export interface IGitHubClient {
  checkRepoExists(owner: string, repo: string): Promise<void>;
  getLatestRelease(owner: string, repo: string): Promise<string | null>;
}

export class GitHubClient implements IGitHubClient {
  private readonly githubApi: AxiosInstance;

  constructor(private readonly cacheService: ICacheService) {
    const githubToken = getEnvVar('GH_TOKEN', '');

    this.githubApi = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(githubToken && { Authorization: `Bearer ${githubToken}` }),
      },
      validateStatus: (status) => status === 200 || status === 304,
    });
  }

  async checkRepoExists(owner: string, repo: string): Promise<void> {
    try {
      await this.githubApi.get(`/repos/${owner}/${repo}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        switch (error.response.status) {
          case 404:
            throw createHttpError(404, 'Repository not found');
          case 403:
          case 429:
            throw createHttpError(429, 'GitHub rate limit exceeded');
          default:
            throw createHttpError(500, `GitHub API error: ${error.message}`);
        }
      }
      throw createHttpError(500, 'Internal Server Error');
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
      if (axios.isAxiosError(error) && error.response) {
        switch (error.response.status) {
          case 404:
            await this.cacheService.set(tagCacheKey, null);
            return null;
          case 403:
          case 429:
            throw createHttpError(429, 'GitHub rate limit exceeded');
          default:
            throw createHttpError(500, `GitHub API error: ${error.message}`);
        }
      }
      throw createHttpError(500, 'Internal Server Error');
    }
  }
}
