import { PinoLogger } from '@github-notifier/shared';
import { ScannerService } from '../modules/scanner/scanner.service.js';
import { EmailQueueAdapter } from '../queue/email-queue.adapter.js';
import { emailQueue } from '../queue/email.queue.js';
import {
  trackedRepoRepository,
  subscriptionQueryRepository,
  releaseProvider,
} from './shared.container.js';

const scannerLogger = new PinoLogger('Scanner');
const emailQueueAdapter = new EmailQueueAdapter(emailQueue);

export const scannerService = new ScannerService(
  trackedRepoRepository,
  subscriptionQueryRepository,
  releaseProvider,
  emailQueueAdapter,
  scannerLogger,
);
