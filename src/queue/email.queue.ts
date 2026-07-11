import { Queue } from 'bullmq';
import { redis } from '../infrastructure/redis/redis.js';
import { EmailJobData } from '@github-notifier/notification-contracts';

export const emailQueue = new Queue<EmailJobData>('email-queue', {
  connection: redis,
});
