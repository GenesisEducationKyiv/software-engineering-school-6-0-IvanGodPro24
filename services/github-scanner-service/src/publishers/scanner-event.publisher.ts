import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  RepositoryTagUpdatedEvent,
  ScannerEvent,
  SCANNER_EVENT_QUEUE_NAME,
} from '@github-notifier/scanner-contracts';
import { IScannerEventPublisher } from '../app/scanner-event-publisher.port.js';

export class ScannerEventPublisher implements IScannerEventPublisher {
  private readonly queue: Queue<ScannerEvent>;

  constructor(redisConnection: Redis) {
    this.queue = new Queue<ScannerEvent>(SCANNER_EVENT_QUEUE_NAME, {
      connection: redisConnection,
    });
  }

  async publish(event: RepositoryTagUpdatedEvent): Promise<void> {
    await this.queue.add(event.type, event, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
