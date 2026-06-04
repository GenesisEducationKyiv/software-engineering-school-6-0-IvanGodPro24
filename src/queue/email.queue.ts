import { Queue } from 'bullmq';
import { redis } from '../infrastructure/redis/redis.js';

export const emailQueue = new Queue('email-queue', {
  connection: redis,
});
