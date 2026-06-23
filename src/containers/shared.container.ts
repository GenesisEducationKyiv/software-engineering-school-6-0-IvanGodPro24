import axios from 'axios';
import { getEnvVar } from '@github-notifier/shared';
import { PinoLogger } from '@github-notifier/shared';
import { prisma } from '../infrastructure/db/client.js';
import { redis } from '../infrastructure/redis/redis.js';
import { RedisCacheService } from '../infrastructure/cache/cache.service.js';
import { GitHubClient } from '../modules/github/github.service.js';
import { TrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../modules/subscriptions/subscription.repository.js';
import { SubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { IRepositoryVerifier } from '../modules/github/repository-verifier.port.js';
import { IReleaseProvider } from '../modules/github/release-provider.port.js';

export const trackedRepoRepository = new TrackedRepoRepository(prisma);
export const subscriptionRepository = new SubscriptionRepository(prisma);
export const subscriptionQueryRepository = new SubscriptionQueryRepository(
  prisma,
);

const cacheLogger = new PinoLogger('Cache');

export const cacheService = new RedisCacheService(redis, cacheLogger);

const githubToken = getEnvVar('GH_TOKEN', '');

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github.v3+json',
    ...(githubToken && { Authorization: `Bearer ${githubToken}` }),
  },
  validateStatus: (status) => status === 200 || status === 304,
});

const githubClient = new GitHubClient(cacheService, githubApi);

export const repositoryVerifier: IRepositoryVerifier = githubClient;
export const releaseProvider: IReleaseProvider = githubClient;
