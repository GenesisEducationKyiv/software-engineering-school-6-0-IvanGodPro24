import { jest } from '@jest/globals';
import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ILogger } from '@github-notifier/shared';
import { EmailWorker, EMAIL_SENT_PROGRESS } from '../email.worker.js';
import { EmailJobHandler } from '../email-job.handler.js';
import { INotificationResultPublisher } from '../notification-result.publisher.js';
import { EmailJobData } from '@github-notifier/notification-contracts';

class TestableEmailWorker extends EmailWorker {
  runJob(job: Job<EmailJobData>): Promise<void> {
    return this.processJob(job);
  }
}

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
  initialProgress: string | number = 0,
): Job<EmailJobData> => {
  const job = {
    id: 'job-1',
    data,
    attemptsMade,
    opts: { attempts },
    progress: initialProgress,
    updateProgress: jest.fn(async (progress: string | number) => {
      job.progress = progress;
    }),
  };

  return job as unknown as Job<EmailJobData>;
};

describe('EmailWorker result publishing', () => {
  let worker: TestableEmailWorker;

  beforeEach(() => {
    jest.resetAllMocks();

    worker = new TestableEmailWorker(
      mockRedis,
      mockEmailJobHandler,
      mockNotificationResultPublisher,
      mockLogger,
    );
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

    await worker.runJob(job);

    expect(mockEmailJobHandler.handle).toHaveBeenCalledWith(job.data);
    expect(job.updateProgress).toHaveBeenCalledWith(EMAIL_SENT_PROGRESS);

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

    await worker.runJob(job);

    expect(job.updateProgress).not.toHaveBeenCalled();
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

    await expect(worker.runJob(job)).rejects.toThrow('SMTP failed');

    expect(job.updateProgress).not.toHaveBeenCalled();
    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledWith({
      type: 'confirmation-email-failed',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      errorMessage: 'SMTP failed',
    });
  });

  it('does not resend email when success result publishing is retried', async () => {
    mockEmailJobHandler.handle.mockResolvedValue(undefined);

    mockNotificationResultPublisher.publish
      .mockRejectedValueOnce(new Error('Redis temporarily unavailable'))
      .mockResolvedValueOnce(undefined);

    const data: EmailJobData = {
      type: 'confirm-subscription',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      confirmToken: 'confirm-token-123',
    };

    const firstAttemptJob = createJob(data);

    await expect(worker.runJob(firstAttemptJob)).rejects.toThrow(
      'Redis temporarily unavailable',
    );

    expect(mockEmailJobHandler.handle).toHaveBeenCalledTimes(1);
    expect(firstAttemptJob.progress).toBe(EMAIL_SENT_PROGRESS);

    const retryJob = createJob(data, 1, 3, EMAIL_SENT_PROGRESS);

    await worker.runJob(retryJob);

    expect(retryJob.updateProgress).not.toHaveBeenCalled();
    expect(mockEmailJobHandler.handle).toHaveBeenCalledTimes(1);
    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledTimes(2);
    expect(mockNotificationResultPublisher.publish).toHaveBeenLastCalledWith({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });
  });

  it('does not publish failure event when email was sent but success result publishing failed', async () => {
    mockEmailJobHandler.handle.mockResolvedValue(undefined);
    mockNotificationResultPublisher.publish.mockRejectedValue(
      new Error('Redis unavailable'),
    );

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

    await expect(worker.runJob(job)).rejects.toThrow('Redis unavailable');

    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledWith({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });
  });

  it('skips email sending when job is retried with email-sent progress', async () => {
    mockNotificationResultPublisher.publish.mockResolvedValue(undefined);

    const job = createJob(
      {
        type: 'confirm-subscription',
        sagaId: 'saga-1',
        subscriptionId: 'sub-1',
        email: 'user@test.com',
        repoName: 'facebook/react',
        confirmToken: 'confirm-token-123',
      },
      1,
      3,
      EMAIL_SENT_PROGRESS,
    );

    await worker.runJob(job);

    expect(mockEmailJobHandler.handle).not.toHaveBeenCalled();

    expect(mockNotificationResultPublisher.publish).toHaveBeenCalledWith({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(job.updateProgress).not.toHaveBeenCalled();
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

    await expect(worker.runJob(job)).rejects.toThrow('SMTP failed');

    expect(mockNotificationResultPublisher.publish).not.toHaveBeenCalled();
  });
});
