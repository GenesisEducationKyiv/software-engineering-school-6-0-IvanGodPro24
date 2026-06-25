import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  ScannerEvent,
  SCANNER_EVENT_QUEUE_NAME,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';
import { ScannerEventHandler } from './scanner-event.handler.js';

export class ScannerEventWorker {
  private worker: Worker<ScannerEvent> | null = null;

  constructor(
    private readonly redisConnection: Redis,
    private readonly handler: ScannerEventHandler,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.worker) return;

    this.logger.info('Starting Scanner Event Worker...');

    this.worker = new Worker<ScannerEvent>(
      SCANNER_EVENT_QUEUE_NAME,
      async (job: Job<ScannerEvent>) => {
        this.logger.info(
          {
            jobId: job.id,
            type: job.data.type,
            repositoryId: job.data.repositoryId,
          },
          'Processing scanner event',
        );

        await this.handler.handle(job.data);
      },
      {
        connection: this.redisConnection,

        concurrency: 1,
      },
    );

    this.setupListeners();
  }

  async close(): Promise<void> {
    if (!this.worker) return;

    await this.worker.close();
    this.worker = null;

    this.logger.info('Scanner Event Worker gracefully shut down');
  }

  private setupListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.info(
        {
          jobId: job.id,
          repositoryId: job.data.repositoryId,
        },
        'Scanner event processed',
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        {
          err: error,
          jobId: job?.id,
          repositoryId: job?.data.repositoryId,
        },
        'Scanner event failed',
      );
    });

    this.worker.on('error', (error) => {
      this.logger.error({ err: error }, 'Scanner Event Worker error');
    });
  }
}
