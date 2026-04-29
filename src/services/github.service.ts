import axios from 'axios';
import createHttpError from 'http-errors';
import { getEnvVar } from '../utils/getEnvVar.js';
import { getCache, setCache } from './cache.service.js';

const githubToken = getEnvVar('GITHUB_TOKEN', '');

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github.v3+json',
    ...(githubToken && {
      Authorization: `Bearer ${githubToken}`,
    }),
  },
});

export const checkRepoExists = async (
  owner: string,
  repo: string,
): Promise<void> => {
  try {
    await githubApi.get(`/repos/${owner}/${repo}`);
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
};

export const getLatestRelease = async (
  owner: string,
  repo: string,
): Promise<string | null> => {
  const cacheKey = `repo:${owner}/${repo}:latest`;

  const cached = await getCache<string | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    const response = await githubApi.get(
      `/repos/${owner}/${repo}/releases/latest`,
    );

    const tag = response.data.tag_name || null;

    await setCache(cacheKey, tag);

    return tag;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      switch (error.response.status) {
        case 404:
          await setCache(cacheKey, null);
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
};
