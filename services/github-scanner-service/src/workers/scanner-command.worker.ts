import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  ScannerCommand,
  SCANNER_COMMAND_QUEUE_NAME,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';
import { IRepositoryTrackingService } from '../app/repository-tracking.service.js';

export class ScannerCommandWorker {
  private worker: Worker<ScannerCommand> | null = null;

  constructor(
    private readonly redisConnection: Redis,
    private readonly repositoryTrackingService: IRepositoryTrackingService,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.worker) return;

    this.logger.info('Starting Scanner Command Worker...');

    this.worker = new Worker<ScannerCommand>(
      SCANNER_COMMAND_QUEUE_NAME,
      async (job: Job<ScannerCommand>) => {
        await this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 5,
      },
    );

    this.setupListeners();
  }

  async close(): Promise<void> {
    if (!this.worker) return;

    await this.worker.close();
    this.worker = null;

    this.logger.info('Scanner Command Worker gracefully shut down');
  }

  protected async processJob(job: Job<ScannerCommand>): Promise<void> {
    this.logger.info(
      {
        jobId: job.id,
        type: job.data.type,
        repositoryId: job.data.repositoryId,
        repoName: job.data.repoName,
      },
      'Processing scanner command',
    );

    switch (job.data.type) {
      case 'sync-repository-tracking':
        await this.repositoryTrackingService.sync(job.data);
        return;

      default:
        throw new Error('Unsupported scanner command type');
    }
  }

  private setupListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.info(
        {
          jobId: job.id,
          repositoryId: job.data.repositoryId,
          active: job.data.active,
        },
        'Scanner command processed',
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        {
          err: error,
          jobId: job?.id,
          repositoryId: job?.data.repositoryId,
        },
        'Scanner command failed',
      );
    });

    this.worker.on('error', (error) => {
      this.logger.error({ err: error }, 'Scanner Command Worker error');
    });
  }
}
