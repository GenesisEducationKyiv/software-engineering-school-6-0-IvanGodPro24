import { jest } from '@jest/globals';
import {
  PrismaClient,
  SubscriptionSagaStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { ILogger } from '@github-notifier/shared';
import { SubscriptionSagaRepository } from '../modules/subscriptions/saga/subscription-saga.repository.js';
import { SubscriptionSagaCompensationService } from '../modules/subscriptions/saga/subscription-saga-compensation.service.js';

const mockPrisma = {
  subscription: {
    deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    count: jest.fn<(...args: unknown[]) => Promise<number>>(),
  },
  repository: {
    deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
  },
};

const mockSagaRepository = {
  findById: jest.fn(),
  markCompensating: jest.fn(),
  markCompensated: jest.fn(),
} as unknown as jest.Mocked<SubscriptionSagaRepository>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

describe('SubscriptionSagaCompensationService', () => {
  let service: SubscriptionSagaCompensationService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new SubscriptionSagaCompensationService(
      mockPrisma as unknown as PrismaClient,
      mockSagaRepository,
      mockLogger,
    );
  });

  it('deletes newly created PENDING subscription and empty repository', async () => {
    mockSagaRepository.findById.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      subscriptionId: 'sub-1',
      createdRepository: true,
      createdSubscription: true,
      status: SubscriptionSagaStatus.EMAIL_SEND_REQUESTED,
      currentStep: 'EMAIL_SEND_REQUESTED',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockSagaRepository.markCompensating.mockResolvedValue({} as never);
    mockSagaRepository.markCompensated.mockResolvedValue({} as never);
    mockPrisma.subscription.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.subscription.count.mockResolvedValue(0);
    mockPrisma.repository.deleteMany.mockResolvedValue({ count: 1 });

    await service.compensate('saga-1', 'SMTP failed');

    expect(mockSagaRepository.markCompensating).toHaveBeenCalledWith(
      'saga-1',
      'SMTP failed',
    );

    expect(mockPrisma.subscription.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'sub-1',
        status: SubscriptionStatus.PENDING,
      },
    });

    expect(mockPrisma.subscription.count).toHaveBeenCalledWith({
      where: { repositoryId: 'repo-1' },
    });

    expect(mockPrisma.repository.deleteMany).toHaveBeenCalledWith({
      where: { id: 'repo-1' },
    });

    expect(mockSagaRepository.markCompensated).toHaveBeenCalledWith(
      'saga-1',
      'SMTP failed',
    );
  });

  it('restores UNSUBSCRIBED status for existing resubscribe flow', async () => {
    mockSagaRepository.findById.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      subscriptionId: 'sub-1',
      createdRepository: false,
      createdSubscription: false,
      status: SubscriptionSagaStatus.EMAIL_SEND_REQUESTED,
      currentStep: 'EMAIL_SEND_REQUESTED',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockSagaRepository.markCompensating.mockResolvedValue({} as never);
    mockSagaRepository.markCompensated.mockResolvedValue({} as never);
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

    await service.compensate('saga-1', 'SMTP failed');

    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'sub-1',
        status: SubscriptionStatus.PENDING,
      },
      data: {
        status: SubscriptionStatus.UNSUBSCRIBED,
      },
    });

    expect(mockPrisma.subscription.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.repository.deleteMany).not.toHaveBeenCalled();

    expect(mockSagaRepository.markCompensated).toHaveBeenCalledWith(
      'saga-1',
      'SMTP failed',
    );
  });

  it('does not delete repository if it still has subscriptions', async () => {
    mockSagaRepository.findById.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      subscriptionId: 'sub-1',
      createdRepository: true,
      createdSubscription: true,
      status: SubscriptionSagaStatus.EMAIL_SEND_REQUESTED,
      currentStep: 'EMAIL_SEND_REQUESTED',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockSagaRepository.markCompensating.mockResolvedValue({} as never);
    mockSagaRepository.markCompensated.mockResolvedValue({} as never);
    mockPrisma.subscription.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.subscription.count.mockResolvedValue(1);

    await service.compensate('saga-1', 'SMTP failed');

    expect(mockPrisma.repository.deleteMany).not.toHaveBeenCalled();
  });

  it('skips compensation if saga is already COMPLETED', async () => {
    mockSagaRepository.findById.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      subscriptionId: 'sub-1',
      createdRepository: true,
      createdSubscription: true,
      status: SubscriptionSagaStatus.COMPLETED,
      currentStep: 'COMPLETED',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.compensate('saga-1', 'SMTP failed');

    expect(mockSagaRepository.markCompensating).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.deleteMany).not.toHaveBeenCalled();
    expect(mockSagaRepository.markCompensated).not.toHaveBeenCalled();
  });

  it('skips compensation if saga is already COMPENSATED', async () => {
    mockSagaRepository.findById.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      subscriptionId: 'sub-1',
      createdRepository: true,
      createdSubscription: true,
      status: SubscriptionSagaStatus.COMPENSATED,
      currentStep: 'COMPENSATED',
      errorMessage: 'Already failed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.compensate('saga-1', 'SMTP failed');

    expect(mockSagaRepository.markCompensating).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.deleteMany).not.toHaveBeenCalled();
    expect(mockSagaRepository.markCompensated).not.toHaveBeenCalled();
  });

  it('logs and returns if saga is not found', async () => {
    mockSagaRepository.findById.mockResolvedValue(null);

    await service.compensate('missing-saga', 'SMTP failed');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { sagaId: 'missing-saga' },
      'Saga not found for compensation',
    );

    expect(mockSagaRepository.markCompensating).not.toHaveBeenCalled();
  });
});
