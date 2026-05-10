import { Queue } from 'bullmq';
import { BulkEmailJob, IEmailQueue } from '../services/scanner.service.js';

export class EmailQueueAdapter implements IEmailQueue {
  constructor(private readonly queue: Queue) {}

  async addBulkEmails(jobs: BulkEmailJob[]): Promise<void> {
    await this.queue.addBulk(jobs);
  }
}
