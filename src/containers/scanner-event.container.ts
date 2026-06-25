import { PinoLogger } from '@github-notifier/shared';
import { redis } from '../infrastructure/redis/redis.js';
import {
  trackedRepoRepository,
  subscriptionQueryRepository,
} from './shared.container.js';
import { emailQueue } from '../queue/email.queue.js';
import { EmailQueueAdapter } from '../queue/email-queue.adapter.js';
import { ScannerEventHandler } from '../modules/scanner/scanner-event.handler.js';
import { ScannerEventWorker } from '../modules/scanner/scanner-event.worker.js';

const scannerEventLogger = new PinoLogger('ScannerEventWorker');

const emailQueueAdapter = new EmailQueueAdapter(emailQueue);

const scannerEventHandler = new ScannerEventHandler(
  trackedRepoRepository,
  subscriptionQueryRepository,
  emailQueueAdapter,
  scannerEventLogger,
);

export const scannerEventWorker = new ScannerEventWorker(
  redis,
  scannerEventHandler,
  scannerEventLogger,
);
