import { Queue } from 'bullmq';
import { redis } from '../infrastructure/redis/redis.js';
import { EmailJobData } from '../modules/notifications/email-job.types.js';

export const emailQueue = new Queue<EmailJobData>('email-queue', {
  connection: redis,
});
