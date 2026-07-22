import { Queue } from 'bullmq';
import {
  ScannerCommand,
  SCANNER_COMMAND_QUEUE_NAME,
} from '@github-notifier/scanner-contracts';
import { redis } from '../../infrastructure/redis/redis.js';

export const scannerCommandQueue = new Queue<ScannerCommand>(
  SCANNER_COMMAND_QUEUE_NAME,
  {
    connection: redis,
  },
);
