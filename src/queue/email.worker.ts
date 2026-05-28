import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ISubscriptionEmailService } from '../services/subscription.service.js';
import { ILogger } from '../utils/logger.js';

export type EmailJobData = {
  email: string;
  repoName: string;
  tag: string;
  unsubscribeToken: string;
};

export class EmailWorker {
  private worker: Worker<EmailJobData> | null = null;

  constructor(
    private readonly redisConnection: Redis,
    private readonly emailService: ISubscriptionEmailService,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.worker) return;

    this.logger.info('Starting Email Worker...');

    this.worker = new Worker<EmailJobData>(
      'email-queue',
      async (job: Job<EmailJobData>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: 5,
      },
    );

    this.setupListeners();
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.info('Email Worker gracefully shut down.');
    }
  }

  private async processJob(job: Job<EmailJobData>): Promise<void> {
    const { email, repoName, tag, unsubscribeToken } = job.data;

    this.logger.info(`Processing job ${job.id}: Sending email to ${email}`);

    await this.emailService.sendNewReleaseEmail(
      email,
      repoName,
      tag,
      unsubscribeToken,
    );
  }

  private setupListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.info(
        `Job ${job.id} completed. Email sent to ${job.data.email}`,
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id} failed for ${job?.data.email}: ${err.message}`,
      );
    });
  }
}
