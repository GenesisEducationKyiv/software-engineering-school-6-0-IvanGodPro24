import { Queue } from 'bullmq';
import { IEmailQueue } from './email-queue.port.js';
import { EmailJobData } from '@github-notifier/notification-contracts';

export class EmailQueueAdapter implements IEmailQueue {
  constructor(private readonly queue: Queue<EmailJobData>) {}

  async addEmail(jobData: EmailJobData): Promise<void> {
    await this.queue.add(jobData.type, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async addBulkEmails(jobsData: EmailJobData[]): Promise<void> {
    const bullJobs = jobsData.map((data) => ({
      name: data.type,
      data,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }));

    await this.queue.addBulk(bullJobs);
  }
}
