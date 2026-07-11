import { createHash } from 'node:crypto';
import { JobsOptions, Queue } from 'bullmq';
import { IEmailQueue } from './email-queue.port.js';
import { EmailJobData } from '@github-notifier/notification-contracts';

export const createNewReleaseJobId = (
  subscriptionId: string,
  tag: string,
): string => {
  const tagHash = createHash('sha256').update(tag).digest('hex');

  return `new-release-${subscriptionId}-${tagHash}`;
};

export class EmailQueueAdapter implements IEmailQueue {
  constructor(private readonly queue: Queue<EmailJobData>) {}

  async addEmail(jobData: EmailJobData): Promise<void> {
    await this.queue.add(jobData.type, jobData, this.createJobOptions(jobData));
  }

  async addBulkEmails(jobsData: EmailJobData[]): Promise<void> {
    const bullJobs = jobsData.map((data) => ({
      name: data.type,
      data,
      opts: this.createJobOptions(data),
    }));

    await this.queue.addBulk(bullJobs);
  }

  private createJobOptions(data: EmailJobData): JobsOptions {
    const options: JobsOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    };

    if (data.type === 'new-release') {
      options.jobId = createNewReleaseJobId(data.subscriptionId, data.tag);
    }

    return options;
  }
}
