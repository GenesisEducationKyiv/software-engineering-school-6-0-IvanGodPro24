import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  EmailJobData,
  EMAIL_QUEUE_NAME,
} from '@github-notifier/notification-contracts';
import { ILogger } from '@github-notifier/shared';
import { EmailJobHandler } from './email-job.handler.js';
import { INotificationResultPublisher } from './notification-result.publisher.js';

export class EmailWorker {
  private worker: Worker<EmailJobData> | null = null;

  constructor(
    private readonly redisConnection: Redis,
    private readonly emailJobHandler: EmailJobHandler,
    private readonly notificationResultPublisher: INotificationResultPublisher,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.worker) return;

    this.logger.info('Starting Email Worker...');

    this.worker = new Worker<EmailJobData>(
      EMAIL_QUEUE_NAME,
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

  protected async processJob(job: Job<EmailJobData>): Promise<void> {
    const data = job.data;

    this.logger.info(
      { jobId: job.id, email: data.email, type: data.type },
      'Processing email job',
    );

    try {
      await this.emailJobHandler.handle(data);

      if (data.type === 'confirm-subscription') {
        await this.notificationResultPublisher.publish({
          type: 'confirmation-email-sent',
          sagaId: data.sagaId,
          subscriptionId: data.subscriptionId,
          email: data.email,
          repoName: data.repoName,
        });
      }
    } catch (error) {
      if (data.type === 'confirm-subscription' && this.isFinalAttempt(job)) {
        await this.notificationResultPublisher.publish({
          type: 'confirmation-email-failed',
          sagaId: data.sagaId,
          subscriptionId: data.subscriptionId,
          email: data.email,
          repoName: data.repoName,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown email error',
        });
      }

      throw error;
    }
  }

  private isFinalAttempt(job: Job<EmailJobData>): boolean {
    const maxAttempts = job.opts.attempts ?? 1;
    return job.attemptsMade + 1 >= maxAttempts;
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
