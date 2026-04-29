import { redis } from './redis.js';
import { Worker, Job } from 'bullmq';
import { sendNewReleaseEmail } from '../services/subscription-email.service.js';

type EmailJobData = {
  email: string;
  repoName: string;
  tag: string;
  unsubscribeToken: string;
};

const processEmailJob = async (job: Job<EmailJobData>): Promise<void> => {
  const { email, repoName, tag, unsubscribeToken } = job.data;
  console.log(`[Worker] Sending email to ${email}`);
  await sendNewReleaseEmail(email, repoName, tag, unsubscribeToken);
};

export const emailWorker = new Worker('email-queue', processEmailJob, {
  connection: redis,
  concurrency: 5,
});

emailWorker.on('completed', (job) => {
  console.log(
    `[Worker] Job ${job.id} has completed! Email sent to ${job.data.email}`,
  );
});

emailWorker.on('failed', (job, err) => {
  console.error(
    `[Worker] Job ${job?.id} has failed for ${job?.data.email}: ${err.message}`,
  );
});
