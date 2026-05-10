import path from 'node:path';
import { prisma } from './db/client.js';
import { redis } from './queue/redis.js';
import { TrackedRepoRepository } from './repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from './repositories/subscription.repository.js';
import { SubscriptionService } from './services/subscription.service.js';
import { SubscriptionController } from './controllers/subscription.controller.js';
import { GitHubClient } from './services/github.service.js';
import { NodemailerProvider } from './services/email.service.js';
import { SubscriptionEmailService } from './services/subscription-email.service.js';
import { emailQueue } from './queue/email.queue.js';
import {
  ScannerService,
  IEmailQueue,
  BulkEmailJob,
} from './services/scanner.service.js';
import { RedisCacheService } from './services/cache.service.js';

const trackedRepoRepository = new TrackedRepoRepository(prisma);
const subscriptionRepository = new SubscriptionRepository(prisma);
const nodemailerProvider = new NodemailerProvider();

const cacheService = new RedisCacheService(redis);
export const githubClient = new GitHubClient(cacheService);

const templateDir = path.join(process.cwd(), 'src', 'templates');
export const subscriptionEmailService = new SubscriptionEmailService(
  nodemailerProvider,
  templateDir,
);

const emailQueueAdapter: IEmailQueue = {
  addBulkEmails: async (jobs: BulkEmailJob[]) => {
    await emailQueue.addBulk(jobs);
  },
};

export const scannerService = new ScannerService(
  trackedRepoRepository,
  subscriptionRepository,
  githubClient,
  emailQueueAdapter,
);

const subscriptionService = new SubscriptionService(
  trackedRepoRepository,
  subscriptionRepository,
  subscriptionEmailService,
  githubClient,
);

export const subscriptionController = new SubscriptionController(
  subscriptionService,
);
