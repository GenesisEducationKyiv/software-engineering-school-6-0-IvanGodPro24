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
    const githubToken = getEnvVar('GITHUB_TOKEN', '');

    this.githubApi = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(githubToken && { Authorization: `Bearer ${githubToken}` }),
      },
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
      if (axios.isAxiosError(error) && error.response) {
        switch (error.response.status) {
          case 404:
            await this.cacheService.set(cacheKey, null);
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
