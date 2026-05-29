import path from 'node:path';
import axios from 'axios';
import { getEnvVar } from '../utils/getEnvVar.js';
import { prisma } from '../db/client.js';
import { redis } from '../queue/redis.js';
import { RedisCacheService } from '../services/cache.service.js';
import { PinoLogger } from '../utils/logger.js';
import { GitHubClient } from '../services/github.service.js';
import { NodemailerProvider } from '../services/email.service.js';
import { SubscriptionEmailService } from '../services/subscription-email.service.js';
import { TrackedRepoRepository } from '../repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../repositories/subscription.repository.js';
import { SubscriptionQueryRepository } from '../repositories/subscription-query.repository.js';

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

export const githubClient = new GitHubClient(cacheService, githubApi);

export const nodemailerProvider = new NodemailerProvider();

const templateDir = path.join(process.cwd(), 'src', 'templates');
export const subscriptionEmailService = new SubscriptionEmailService(
  nodemailerProvider,
  templateDir,
);
