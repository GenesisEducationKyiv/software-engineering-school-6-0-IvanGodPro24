import { Queue } from 'bullmq';
import {
  ScannerEvent,
  SCANNER_EVENT_QUEUE_NAME,
} from '@github-notifier/scanner-contracts';
import { redis } from '../infrastructure/redis/redis.js';

export const scannerEventQueue = new Queue<ScannerEvent>(
  SCANNER_EVENT_QUEUE_NAME,
  {
    connection: redis,
  },
);
