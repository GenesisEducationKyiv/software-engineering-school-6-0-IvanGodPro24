import { EmailWorker } from '../queue/email.worker.js';
import { redis } from '../queue/redis.js';
import { PinoLogger } from '../utils/logger.js';
import { subscriptionEmailService } from './shared.container.js';

const workerLogger = new PinoLogger('Worker');

export const emailWorker = new EmailWorker(
  redis,
  subscriptionEmailService,
  workerLogger,
);
