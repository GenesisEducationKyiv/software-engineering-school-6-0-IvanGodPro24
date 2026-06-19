import { jest } from '@jest/globals';
import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ILogger } from '@github-notifier/shared';
import { EmailWorker } from '../email.worker.js';
import { EmailJobHandler } from '../email-job.handler.js';
import { INotificationResultPublisher } from '../notification-result.publisher.js';
import { EmailJobData } from '@github-notifier/notification-contracts';

type TestableEmailWorker = EmailWorker & {
  processJob(job: Job<EmailJobData>): Promise<void>;
};

const mockRedis = {} as Redis;

const mockEmailJobHandler = {
  handle: jest.fn(),
} as unknown as jest.Mocked<EmailJobHandler>;

const mockNotificationResultPublisher = {
  publish: jest.fn(),
} as jest.Mocked<INotificationResultPublisher>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

const createJob = (
  data: EmailJobData,
  attemptsMade = 0,
  attempts = 3,
): Job<EmailJobData> =>
  ({
    id: 'job-1',
    data,
    attemptsMade,
    opts: { attempts },
  }) as Job<EmailJobData>;

describe('EmailWorker result publishing', () => {
  let worker: TestableEmailWorker;

  beforeEach(() => {
    jest.resetAllMocks();

    worker = new EmailWorker(
      mockRedis,
      mockEmailJobHandler,
      mockNotificationResultPublisher,
      mockLogger,
    ) as TestableEmailWorker;
  });

  it('publishes confirmation-email-sent after successful confirm-subscription email', async () => {
    mockEmailJobHandler.handle.mockResolvedValue(undefined);

    const job = createJob({
      type: 'confirm-subscription',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      confirmToken: 'confirm-token-123',
    });

    await worker.processJob(job);

    expect(mockEmailJobHandler.handle).toHaveBeenCalledWith(job.data);

    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledWith({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });
  });

  it('does not publish result event for new-release email', async () => {
    mockEmailJobHandler.handle.mockResolvedValue(undefined);

    const job = createJob({
      type: 'new-release',
      email: 'user@test.com',
      repoName: 'facebook/react',
      tag: 'v19.0.0',
      unsubscribeToken: 'unsubscribe-token-123',
    });

    await worker.processJob(job);

    expect(mockEmailJobHandler.handle).toHaveBeenCalledWith(job.data);
    expect(mockNotificationResultPublisher.publish).not.toHaveBeenCalled();
  });

  it('publishes confirmation-email-failed on final failed attempt', async () => {
    mockEmailJobHandler.handle.mockRejectedValue(new Error('SMTP failed'));

    const job = createJob(
      {
        type: 'confirm-subscription',
        sagaId: 'saga-1',
        subscriptionId: 'sub-1',
        email: 'user@test.com',
        repoName: 'facebook/react',
        confirmToken: 'confirm-token-123',
      },
      2,
      3,
    );

    await expect(worker.processJob(job)).rejects.toThrow('SMTP failed');

    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledWith({
      type: 'confirmation-email-failed',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      errorMessage: 'SMTP failed',
    });
  });

  it('does not publish failed event before final attempt', async () => {
    mockEmailJobHandler.handle.mockRejectedValue(new Error('SMTP failed'));

    const job = createJob(
      {
        type: 'confirm-subscription',
        sagaId: 'saga-1',
        subscriptionId: 'sub-1',
        email: 'user@test.com',
        repoName: 'facebook/react',
        confirmToken: 'confirm-token-123',
      },
      0,
      3,
    );

    await expect(worker.processJob(job)).rejects.toThrow('SMTP failed');

    expect(mockNotificationResultPublisher.publish).not.toHaveBeenCalled();
  });
});
