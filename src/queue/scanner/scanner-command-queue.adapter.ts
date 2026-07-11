import { Queue } from 'bullmq';
import {
  ScannerCommand,
  SyncRepositoryTrackingCommand,
} from '@github-notifier/scanner-contracts';
import { IScannerCommandPublisher } from './scanner-command-queue.port.js';

export class ScannerCommandQueueAdapter implements IScannerCommandPublisher {
  constructor(private readonly queue: Queue<ScannerCommand>) {}

  async publish(command: SyncRepositoryTrackingCommand): Promise<void> {
    await this.queue.add(command.type, command, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }
}
