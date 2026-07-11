import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  NotificationResultEvent,
  NOTIFICATION_RESULT_QUEUE_NAME,
} from '@github-notifier/notification-contracts';

export interface INotificationResultPublisher {
  publish(event: NotificationResultEvent): Promise<void>;
}

export class NotificationResultPublisher implements INotificationResultPublisher {
  private readonly queue: Queue<NotificationResultEvent>;

  constructor(redisConnection: Redis) {
    this.queue = new Queue<NotificationResultEvent>(
      NOTIFICATION_RESULT_QUEUE_NAME,
      {
        connection: redisConnection,
      },
    );
  }

  async publish(event: NotificationResultEvent): Promise<void> {
    await this.queue.add(event.type, event, {
      jobId: `${event.type}-${event.sagaId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
