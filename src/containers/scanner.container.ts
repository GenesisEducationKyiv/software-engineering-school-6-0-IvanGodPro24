import { ScannerService } from '../services/scanner.service.js';
import { EmailQueueAdapter } from '../queue/email-queue.adapter.js';
import { emailQueue } from '../queue/email.queue.js';
import { PinoLogger } from '../utils/logger.js';
import {
  trackedRepoRepository,
  subscriptionQueryRepository,
  githubClient,
} from './shared.container.js';

const scannerLogger = new PinoLogger('Scanner');
const emailQueueAdapter = new EmailQueueAdapter(emailQueue);

export const scannerService = new ScannerService(
  trackedRepoRepository,
  subscriptionQueryRepository,
  githubClient,
  emailQueueAdapter,
  scannerLogger,
);
