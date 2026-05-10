import { redis } from './redis.js';
import { Worker, Job } from 'bullmq';
import { subscriptionEmailService } from '../container.js';
import { PinoLogger } from '../utils/logger.js';

type EmailJobData = {
  email: string;
  repoName: string;
  tag: string;
  unsubscribeToken: string;
};

const logger = new PinoLogger('Worker');

const processEmailJob = async (job: Job<EmailJobData>): Promise<void> => {
  const { email, repoName, tag, unsubscribeToken } = job.data;
  logger.info(`Sending email to ${email}`);

  await subscriptionEmailService.sendNewReleaseEmail(
    email,
    repoName,
    tag,
    unsubscribeToken,
  );
};

export const emailWorker = new Worker('email-queue', processEmailJob, {
  connection: redis,
  concurrency: 5,
});

emailWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed. Email sent to ${job.data.email}`);
});

emailWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed for ${job?.data.email}: ${err.message}`);
});
