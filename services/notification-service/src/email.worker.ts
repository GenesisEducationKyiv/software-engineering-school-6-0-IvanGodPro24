import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { EmailJobData } from '@github-notifier/notification-contracts';
import { EmailJobHandler } from './email-job.handler.js';
import { ILogger } from './logger.js';

export class EmailWorker {
  private worker: Worker<EmailJobData> | null = null;

  constructor(
    private readonly redisConnection: Redis,
    private readonly emailJobHandler: EmailJobHandler,
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
    const data = job.data;

    this.logger.info(
      { jobId: job.id, email: data.email, type: data.type },
      'Processing email job',
    );

    await this.emailJobHandler.handle(data);
  }

  private setupListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.info(
        { jobId: job.id, email: job.data.email },
        'Job completed. Email sent',
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        { err, jobId: job?.id, email: job?.data?.email },
        'Job failed',
      );
    });
  }
}
