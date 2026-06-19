import { jest } from '@jest/globals';
import { EmailJobHandler } from '../email-job.handler.js';
import { ISubscriptionEmailService } from '../subscription-email.service.js';

describe('EmailJobHandler', () => {
  const mockEmailService = {
    sendConfirmEmail: jest.fn(),
    sendNewReleaseEmail: jest.fn(),
  } as jest.Mocked<ISubscriptionEmailService>;

  let handler: EmailJobHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new EmailJobHandler(mockEmailService);
  });

  it('calls sendConfirmEmail for confirm-subscription job', async () => {
    mockEmailService.sendConfirmEmail.mockResolvedValue(undefined);

    await handler.handle({
      type: 'confirm-subscription',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      confirmToken: 'confirm-token-123',
    });

    expect(mockEmailService.sendConfirmEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendConfirmEmail).toHaveBeenCalledWith(
      'user@test.com',
      'facebook/react',
      'confirm-token-123',
    );

    expect(mockEmailService.sendNewReleaseEmail).not.toHaveBeenCalled();
  });

  it('calls sendNewReleaseEmail for new-release job', async () => {
    mockEmailService.sendNewReleaseEmail.mockResolvedValue(undefined);

    await handler.handle({
      type: 'new-release',
      email: 'user@test.com',
      repoName: 'facebook/react',
      tag: 'v19.0.0',
      unsubscribeToken: 'unsubscribe-token-123',
    });

    expect(mockEmailService.sendNewReleaseEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendNewReleaseEmail).toHaveBeenCalledWith(
      'user@test.com',
      'facebook/react',
      'v19.0.0',
      'unsubscribe-token-123',
    );

    expect(mockEmailService.sendConfirmEmail).not.toHaveBeenCalled();
  });

  it('propagates email service errors', async () => {
    const error = new Error('SMTP failed');

    mockEmailService.sendConfirmEmail.mockRejectedValue(error);

    await expect(
      handler.handle({
        type: 'confirm-subscription',
        sagaId: 'saga-1',
        subscriptionId: 'sub-1',
        email: 'user@test.com',
        repoName: 'facebook/react',
        confirmToken: 'confirm-token-123',
      }),
    ).rejects.toThrow('SMTP failed');
  });
});
