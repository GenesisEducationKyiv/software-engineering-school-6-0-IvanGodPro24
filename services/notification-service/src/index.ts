import path from 'node:path';
import { Redis } from 'ioredis';
import { getEnvVar } from '@github-notifier/shared';
import { PinoLogger } from '@github-notifier/shared';
import { NodemailerProvider } from './email.service.js';
import { SubscriptionEmailService } from './subscription-email.service.js';
import { EmailWorker } from './email.worker.js';
import { EmailJobHandler } from './email-job.handler.js';
import { NotificationResultPublisher } from './notification-result.publisher.js';

const logger = new PinoLogger('NotificationService');

const redis = new Redis(getEnvVar('REDIS_URL'), {
  maxRetriesPerRequest: null,
});

const emailProvider = new NodemailerProvider();

const templateDir = path.join(process.cwd(), 'src', 'templates');
const emailService = new SubscriptionEmailService(emailProvider, templateDir);

const emailJobHandler = new EmailJobHandler(emailService);
const notificationResultPublisher = new NotificationResultPublisher(redis);

const emailWorker = new EmailWorker(
  redis,
  emailJobHandler,
  notificationResultPublisher,
  logger,
);

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down notification service...`);

  await emailWorker.close();
  await notificationResultPublisher.close();
  await redis.quit();

  logger.info('Notification service stopped.');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

emailWorker.start();

logger.info('Notification service started successfully');
