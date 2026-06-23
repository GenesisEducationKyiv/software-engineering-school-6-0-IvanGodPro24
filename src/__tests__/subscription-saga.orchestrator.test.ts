import { jest } from '@jest/globals';
import {
  Prisma,
  SubscriptionSagaStatus,
  SubscriptionStatus,
  type PrismaClient,
  type Repository,
  type Subscription,
  type SubscriptionSaga,
} from '@prisma/client';
import { SubscriptionSagaOrchestrator } from '../modules/subscriptions/saga/subscription-saga.orchestrator.js';
import { SubscriptionSagaRepository } from '../modules/subscriptions/saga/subscription-saga.repository.js';
import { SubscriptionSagaCompensationService } from '../modules/subscriptions/saga/subscription-saga-compensation.service.js';
import { IRepositoryVerifier } from '../modules/github/repository-verifier.port.js';
import { IEmailQueue } from '../queue/email-queue.port.js';
import { ILogger } from '@github-notifier/shared';

type AsyncMock<Args extends unknown[], Result> = jest.Mock<
  (...args: Args) => Promise<Result>
>;

type RepositoryRecord = Pick<Repository, 'id' | 'name'>;
type ExistingSubscriptionRecord = Pick<
  Subscription,
  'id' | 'email' | 'status' | 'repositoryId'
>;
type SubscriptionRecord = Pick<
  Subscription,
  | 'id'
  | 'email'
  | 'status'
  | 'confirmToken'
  | 'unsubscribeToken'
  | 'repositoryId'
>;
type SagaRecord = Pick<
  SubscriptionSaga,
  | 'id'
  | 'email'
  | 'repoName'
  | 'repositoryId'
  | 'createdRepository'
  | 'createdSubscription'
  | 'status'
  | 'currentStep'
>;

type MockTransactionClient = {
  repository: {
    findUnique: AsyncMock<
      [Prisma.RepositoryFindUniqueArgs],
      RepositoryRecord | null
    >;
    create: AsyncMock<[Prisma.RepositoryCreateArgs], RepositoryRecord>;
  };
  subscription: {
    findUnique: AsyncMock<
      [Prisma.SubscriptionFindUniqueArgs],
      ExistingSubscriptionRecord | null
    >;
    create: AsyncMock<[Prisma.SubscriptionCreateArgs], SubscriptionRecord>;
    update: AsyncMock<[Prisma.SubscriptionUpdateArgs], SubscriptionRecord>;
  };
  subscriptionSaga: {
    create: AsyncMock<[Prisma.SubscriptionSagaCreateArgs], SagaRecord>;
    update: AsyncMock<[Prisma.SubscriptionSagaUpdateArgs], unknown>;
  };
};

type TransactionMock = <Result>(
  callback: (tx: MockTransactionClient) => Promise<Result>,
) => Promise<Result>;

type PrismaClientMock = {
  $transaction: jest.Mock<TransactionMock>;
  subscription: {
    deleteMany: AsyncMock<
      [Prisma.SubscriptionDeleteManyArgs],
      Prisma.BatchPayload
    >;
    updateMany: AsyncMock<
      [Prisma.SubscriptionUpdateManyArgs],
      Prisma.BatchPayload
    >;
    count: AsyncMock<[Prisma.SubscriptionCountArgs], number>;
  };
  repository: {
    deleteMany: AsyncMock<
      [Prisma.RepositoryDeleteManyArgs],
      Prisma.BatchPayload
    >;
  };
};

const asyncMock = <Args extends unknown[], Result>(): AsyncMock<Args, Result> =>
  jest.fn<(...args: Args) => Promise<Result>>();

const mockTx: MockTransactionClient = {
  repository: {
    findUnique: asyncMock(),
    create: asyncMock(),
  },
  subscription: {
    findUnique: asyncMock(),
    create: asyncMock(),
    update: asyncMock(),
  },
  subscriptionSaga: {
    create: asyncMock(),
    update: asyncMock(),
  },
};

const mockPrisma: PrismaClientMock = {
  $transaction: jest.fn(),
  subscription: {
    deleteMany: asyncMock(),
    updateMany: asyncMock(),
    count: asyncMock(),
  },
  repository: {
    deleteMany: asyncMock(),
  },
};

const mockSagaRepository = {
  markEmailSendRequested: jest.fn(),
  findById: jest.fn(),
  markCompensating: jest.fn(),
  markCompensated: jest.fn(),
  markCompleted: jest.fn(),
} as unknown as jest.Mocked<SubscriptionSagaRepository>;

const mockCompensationService = {
  compensate: jest.fn(),
} as unknown as jest.Mocked<SubscriptionSagaCompensationService>;

const mockRepositoryVerifier = {
  verifyRepository: jest.fn(),
} as jest.Mocked<IRepositoryVerifier>;

const mockEmailQueue = {
  addEmail: jest.fn(),
  addBulkEmails: jest.fn(),
} as jest.Mocked<IEmailQueue>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

describe('SubscriptionSagaOrchestrator', () => {
  let orchestrator: SubscriptionSagaOrchestrator;

  beforeEach(() => {
    jest.resetAllMocks();

    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(mockTx),
    );

    orchestrator = new SubscriptionSagaOrchestrator(
      mockPrisma as unknown as PrismaClient,
      mockSagaRepository,
      mockCompensationService,
      mockRepositoryVerifier,
      mockEmailQueue,
      mockLogger,
    );
  });

  it('starts saga, creates repository and subscription, then publishes confirmation email command', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue(null);
    mockTx.repository.create.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue(null);
    mockTx.subscription.create.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.PENDING,
      confirmToken: 'confirm-token-123',
      unsubscribeToken: 'unsubscribe-token-123',
      repositoryId: 'repo-1',
    });

    mockTx.subscriptionSaga.create.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      createdRepository: true,
      createdSubscription: false,
      status: SubscriptionSagaStatus.STARTED,
      currentStep: 'STARTED',
    });

    mockTx.subscriptionSaga.update.mockResolvedValue({});
    mockEmailQueue.addEmail.mockResolvedValue(undefined);

    const result = await orchestrator.start({
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(mockRepositoryVerifier.verifyRepository).toHaveBeenCalledWith(
      'facebook',
      'react',
    );

    expect(mockTx.repository.create).toHaveBeenCalledWith({
      data: { name: 'facebook/react' },
    });

    expect(mockTx.subscription.create).toHaveBeenCalledWith({
      data: {
        email: 'user@test.com',
        repositoryId: 'repo-1',
      },
    });

    expect(mockTx.subscriptionSaga.create).toHaveBeenCalledWith({
      data: {
        email: 'user@test.com',
        repoName: 'facebook/react',
        repositoryId: 'repo-1',
        createdRepository: true,
        status: SubscriptionSagaStatus.STARTED,
        currentStep: 'STARTED',
      },
    });

    expect(mockTx.subscriptionSaga.update).toHaveBeenCalledWith({
      where: { id: 'saga-1' },
      data: {
        subscriptionId: 'sub-1',
        createdSubscription: true,
        status: SubscriptionSagaStatus.SUBSCRIPTION_CREATED,
        currentStep: 'SUBSCRIPTION_CREATED',
      },
    });

    expect(mockSagaRepository.markEmailSendRequested).toHaveBeenCalledWith(
      'saga-1',
    );

    expect(mockEmailQueue.addEmail).toHaveBeenCalledWith({
      type: 'confirm-subscription',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      confirmToken: 'confirm-token-123',
    });

    expect(result).toEqual({
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      status: 'EMAIL_SEND_REQUESTED',
    });
  });

  it('throws 409 if subscription is already ACTIVE', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.ACTIVE,
      repositoryId: 'repo-1',
    });

    await expect(
      orchestrator.start({
        email: 'user@test.com',
        repoName: 'facebook/react',
      }),
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(mockEmailQueue.addEmail).not.toHaveBeenCalled();
    expect(mockTx.subscriptionSaga.create).not.toHaveBeenCalled();
  });

  it('throws 409 if subscription is already PENDING', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.PENDING,
      repositoryId: 'repo-1',
    });

    await expect(
      orchestrator.start({
        email: 'user@test.com',
        repoName: 'facebook/react',
      }),
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(mockEmailQueue.addEmail).not.toHaveBeenCalled();
    expect(mockTx.subscriptionSaga.create).not.toHaveBeenCalled();
  });

  it('throws 409 if Prisma unique constraint error happens during subscription creation', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue(null);

    mockTx.subscriptionSaga.create.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      createdRepository: false,
      createdSubscription: false,
      status: SubscriptionSagaStatus.STARTED,
      currentStep: 'STARTED',
    });

    mockTx.subscription.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          target: ['email', 'repositoryId'],
        },
      }),
    );

    await expect(
      orchestrator.start({
        email: 'user@test.com',
        repoName: 'facebook/react',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Subscription is processing or already exists.',
    });

    expect(mockEmailQueue.addEmail).not.toHaveBeenCalled();
    expect(mockSagaRepository.markEmailSendRequested).not.toHaveBeenCalled();
    expect(mockSagaRepository.markCompensating).not.toHaveBeenCalled();
    expect(mockSagaRepository.markCompensated).not.toHaveBeenCalled();
  });

  it('resubscribes UNSUBSCRIBED subscription and publishes confirmation email command', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.UNSUBSCRIBED,
      repositoryId: 'repo-1',
    });

    mockTx.subscription.update.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.PENDING,
      confirmToken: 'new-confirm-token',
      unsubscribeToken: 'new-unsubscribe-token',
      repositoryId: 'repo-1',
    });

    mockTx.subscriptionSaga.create.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      createdRepository: false,
      createdSubscription: false,
      status: SubscriptionSagaStatus.STARTED,
      currentStep: 'STARTED',
    });

    mockTx.subscriptionSaga.update.mockResolvedValue({});
    mockEmailQueue.addEmail.mockResolvedValue(undefined);

    const result = await orchestrator.start({
      email: 'user@test.com',
      repoName: 'facebook/react',
    });

    expect(mockTx.subscription.update).toHaveBeenCalledTimes(1);

    const subscriptionUpdateArgs = mockTx.subscription.update.mock.calls[0][0];

    expect(subscriptionUpdateArgs).toMatchObject({
      where: { id: 'sub-1' },
      data: {
        status: SubscriptionStatus.PENDING,
      },
    });
    expect(typeof subscriptionUpdateArgs.data.confirmToken).toBe('string');
    expect(typeof subscriptionUpdateArgs.data.unsubscribeToken).toBe('string');

    expect(mockTx.subscriptionSaga.update).toHaveBeenCalledWith({
      where: { id: 'saga-1' },
      data: {
        subscriptionId: 'sub-1',
        createdSubscription: false,
        status: SubscriptionSagaStatus.SUBSCRIPTION_CREATED,
        currentStep: 'SUBSCRIPTION_CREATED',
      },
    });

    expect(mockEmailQueue.addEmail).toHaveBeenCalledWith({
      type: 'confirm-subscription',
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      confirmToken: 'new-confirm-token',
    });

    expect(result).toEqual({
      sagaId: 'saga-1',
      subscriptionId: 'sub-1',
      status: 'EMAIL_SEND_REQUESTED',
    });
  });

  it('delegates compensation if email command publishing fails for newly created subscription', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue(null);
    mockTx.repository.create.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue(null);
    mockTx.subscription.create.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.PENDING,
      confirmToken: 'confirm-token-123',
      unsubscribeToken: 'unsubscribe-token-123',
      repositoryId: 'repo-1',
    });

    mockTx.subscriptionSaga.create.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      createdRepository: true,
      createdSubscription: true,
      status: SubscriptionSagaStatus.STARTED,
      currentStep: 'STARTED',
    });

    mockTx.subscriptionSaga.update.mockResolvedValue({});
    mockSagaRepository.markEmailSendRequested.mockResolvedValue({} as never);
    mockEmailQueue.addEmail.mockRejectedValue(new Error('Redis unavailable'));
    mockCompensationService.compensate.mockResolvedValue(undefined);

    await expect(
      orchestrator.start({
        email: 'user@test.com',
        repoName: 'facebook/react',
      }),
    ).rejects.toThrow('Redis unavailable');

    expect(mockCompensationService.compensate).toHaveBeenCalledWith(
      'saga-1',
      'Redis unavailable',
    );
  });

  it('delegates compensation if email command publishing fails for resubscribe flow', async () => {
    mockRepositoryVerifier.verifyRepository.mockResolvedValue(undefined);

    mockTx.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      name: 'facebook/react',
    });

    mockTx.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.UNSUBSCRIBED,
      repositoryId: 'repo-1',
    });

    mockTx.subscription.update.mockResolvedValue({
      id: 'sub-1',
      email: 'user@test.com',
      status: SubscriptionStatus.PENDING,
      confirmToken: 'new-confirm-token',
      unsubscribeToken: 'new-unsubscribe-token',
      repositoryId: 'repo-1',
    });

    mockTx.subscriptionSaga.create.mockResolvedValue({
      id: 'saga-1',
      email: 'user@test.com',
      repoName: 'facebook/react',
      repositoryId: 'repo-1',
      createdRepository: false,
      createdSubscription: false,
      status: SubscriptionSagaStatus.STARTED,
      currentStep: 'STARTED',
    });

    mockTx.subscriptionSaga.update.mockResolvedValue({});
    mockSagaRepository.markEmailSendRequested.mockResolvedValue({} as never);
    mockEmailQueue.addEmail.mockRejectedValue(new Error('Redis unavailable'));
    mockCompensationService.compensate.mockResolvedValue(undefined);

    await expect(
      orchestrator.start({
        email: 'user@test.com',
        repoName: 'facebook/react',
      }),
    ).rejects.toThrow('Redis unavailable');

    expect(mockCompensationService.compensate).toHaveBeenCalledWith(
      'saga-1',
      'Redis unavailable',
    );
  });
});
