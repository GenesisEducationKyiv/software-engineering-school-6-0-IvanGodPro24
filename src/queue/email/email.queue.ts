import { Queue } from 'bullmq';
import { redis } from '../../infrastructure/redis/redis.js';
import {
  EmailJobData,
  EMAIL_QUEUE_NAME,
} from '@github-notifier/notification-contracts';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
});
