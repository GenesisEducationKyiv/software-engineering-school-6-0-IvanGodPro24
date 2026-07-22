import { jest } from '@jest/globals';
import { SubscriptionSagaStatus } from '@prisma/client';
import { ILogger } from '@github-notifier/shared';
import { NotificationResultHandler } from '../modules/subscriptions/saga/notification-result.handler.js';
import { SubscriptionSagaRepository } from '../modules/subscriptions/saga/subscription-saga.repository.js';
import { SubscriptionSagaCompensationService } from '../modules/subscriptions/saga/subscription-saga-compensation.service.js';
import { createSubscriptionSaga } from './test-factories.js';

const mockSagaRepository = {
  findById: jest.fn(),
  markCompleted: jest.fn(),
} as unknown as jest.Mocked<SubscriptionSagaRepository>;

const mockCompensationService = {
  compensate: jest.fn(),
} as unknown as jest.Mocked<SubscriptionSagaCompensationService>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

describe('NotificationResultHandler', () => {
  let handler: NotificationResultHandler;

  beforeEach(() => {
    jest.resetAllMocks();

    handler = new NotificationResultHandler(
      mockSagaRepository,
      mockCompensationService,
      mockLogger,
    );
  });

  it('marks saga as COMPLETED when confirmation email was sent', async () => {
    mockSagaRepository.findById.mockResolvedValue(createSubscriptionSaga());

    mockSagaRepository.markCompleted.mockResolvedValue({} as never);

    await handler.handle({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(mockSagaRepository.markCompleted).toHaveBeenCalledWith('saga-1');
    expect(mockCompensationService.compensate).not.toHaveBeenCalled();
  });

  it('does not complete saga if it is already COMPLETED', async () => {
    mockSagaRepository.findById.mockResolvedValue(
      createSubscriptionSaga({
        status: SubscriptionSagaStatus.COMPLETED,
        currentStep: 'COMPLETED',
      }),
    );

    await handler.handle({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(mockSagaRepository.markCompleted).not.toHaveBeenCalled();
  });

  it('ignores email sent event for compensated saga', async () => {
    mockSagaRepository.findById.mockResolvedValue(
      createSubscriptionSaga({
        status: SubscriptionSagaStatus.COMPENSATED,
        currentStep: 'COMPENSATED',
        errorMessage: 'SMTP failed',
      }),
    );

    await handler.handle({
      type: 'confirmation-email-sent',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(mockSagaRepository.markCompleted).not.toHaveBeenCalled();
  });

  it('delegates compensation when confirmation email failed', async () => {
    mockCompensationService.compensate.mockResolvedValue(undefined);

    await handler.handle({
      type: 'confirmation-email-failed',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      errorMessage: 'SMTP failed',
    });

    expect(mockCompensationService.compensate).toHaveBeenCalledWith(
      'saga-1',
      'SMTP failed',
    );

    expect(mockSagaRepository.markCompleted).not.toHaveBeenCalled();
  });

  it('logs and returns if saga is not found for email sent event', async () => {
    mockSagaRepository.findById.mockResolvedValue(null);

    await handler.handle({
      type: 'confirmation-email-sent',
      sagaId: 'missing-saga',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { sagaId: 'missing-saga' },
      'Saga not found for email sent event',
    );

    expect(mockSagaRepository.markCompleted).not.toHaveBeenCalled();
  });
});
