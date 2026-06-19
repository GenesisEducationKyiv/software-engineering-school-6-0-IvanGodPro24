import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  NotificationResultEvent,
  NOTIFICATION_RESULT_QUEUE_NAME,
} from '@github-notifier/notification-contracts';
import { ILogger } from '@github-notifier/shared';
import { NotificationResultHandler } from './notification-result.handler.js';

export class NotificationResultWorker {
  private worker: Worker<NotificationResultEvent> | null = null;

  constructor(
    private readonly redisConnection: Redis,
    private readonly handler: NotificationResultHandler,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.worker) return;

    this.logger.info('Starting Notification Result Worker...');

    this.worker = new Worker<NotificationResultEvent>(
      NOTIFICATION_RESULT_QUEUE_NAME,
      async (job: Job<NotificationResultEvent>) => {
        this.logger.info(
          { jobId: job.id, type: job.data.type, sagaId: job.data.sagaId },
          'Processing notification result event',
        );

        await this.handler.handle(job.data);
      },
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
      this.logger.info('Notification Result Worker gracefully shut down.');
    }
  }

  private setupListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.info(
        { jobId: job.id, sagaId: job.data.sagaId },
        'Notification result event processed',
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        { err, jobId: job?.id, sagaId: job?.data?.sagaId },
        'Notification result event failed',
      );
    });
  }
}
