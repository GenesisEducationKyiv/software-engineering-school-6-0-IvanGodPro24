import { jest } from '@jest/globals';
import { Queue } from 'bullmq';
import { EmailJobData } from '@github-notifier/notification-contracts';
import {
  createNewReleaseJobId,
  EmailQueueAdapter,
} from '../queue/email-queue.adapter.js';

describe('EmailQueueAdapter', () => {
  const queue = {
    add: jest.fn(),
    addBulk: jest.fn(),
  } as unknown as jest.Mocked<Queue<EmailJobData>>;

  let adapter: EmailQueueAdapter;

  beforeEach(() => {
    jest.resetAllMocks();

    queue.addBulk.mockResolvedValue([]);

    adapter = new EmailQueueAdapter(queue);
  });

  it('uses deterministic job ID for new release email', async () => {
    const job: EmailJobData = {
      type: 'new-release',
      subscriptionId: 'subscription-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      tag: 'v19.0.0',
      unsubscribeToken: 'unsubscribe-token',
    };

    await adapter.addBulkEmails([job]);

    expect(queue.addBulk).toHaveBeenCalledWith([
      {
        name: 'new-release',
        data: job,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          jobId: createNewReleaseJobId('subscription-1', 'v19.0.0'),
        },
      },
    ]);
  });

  it('produces the same job ID for the same subscription and tag', () => {
    const firstId = createNewReleaseJobId('subscription-1', 'v19.0.0');

    const secondId = createNewReleaseJobId('subscription-1', 'v19.0.0');

    expect(firstId).toBe(secondId);
  });

  it('produces different job IDs for different tags', () => {
    const firstId = createNewReleaseJobId('subscription-1', 'v19.0.0');

    const secondId = createNewReleaseJobId('subscription-1', 'v20.0.0');

    expect(firstId).not.toBe(secondId);
  });
});
