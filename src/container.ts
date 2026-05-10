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
import { ScannerService } from './services/scanner.service.js';
import { RedisCacheService } from './services/cache.service.js';
import { PinoLogger } from './utils/logger.js';
import { EmailQueueAdapter } from './queue/email-queue.adapter.js';

const trackedRepoRepository = new TrackedRepoRepository(prisma);
const subscriptionRepository = new SubscriptionRepository(prisma);
const nodemailerProvider = new NodemailerProvider();

const cacheLogger = new PinoLogger('Cache');
const scannerLogger = new PinoLogger('Scanner');

const cacheService = new RedisCacheService(redis, cacheLogger);
const githubClient = new GitHubClient(cacheService);

const templateDir = path.join(process.cwd(), 'src', 'templates');
export const subscriptionEmailService = new SubscriptionEmailService(
  nodemailerProvider,
  templateDir,
);

const emailQueueAdapter = new EmailQueueAdapter(emailQueue);

export const scannerService = new ScannerService(
  trackedRepoRepository,
  subscriptionRepository,
  githubClient,
  emailQueueAdapter,
  scannerLogger,
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
