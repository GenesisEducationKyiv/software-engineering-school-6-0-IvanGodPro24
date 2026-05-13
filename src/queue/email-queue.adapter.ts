import { Queue } from 'bullmq';
import { IEmailQueue } from '../services/scanner.service.js';
import { EmailJobData } from './email.worker.js';

export class EmailQueueAdapter implements IEmailQueue {
  constructor(private readonly queue: Queue) {}

  async addBulkEmails(jobsData: EmailJobData[]): Promise<void> {
    const bullJobs = jobsData.map((data) => ({
      name: 'send-email',
      data,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }));

    await this.queue.addBulk(bullJobs);
  }
}
