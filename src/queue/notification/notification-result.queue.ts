import { Queue } from 'bullmq';
import { redis } from '../../infrastructure/redis/redis.js';
import {
  NotificationResultEvent,
  NOTIFICATION_RESULT_QUEUE_NAME,
} from '@github-notifier/notification-contracts';

export const notificationResultQueue = new Queue<NotificationResultEvent>(
  NOTIFICATION_RESULT_QUEUE_NAME,
  {
    connection: redis,
  },
);
