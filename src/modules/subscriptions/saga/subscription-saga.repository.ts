import { PrismaClient, SubscriptionSagaStatus } from '@prisma/client';

export class SubscriptionSagaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createStarted(email: string, repoName: string) {
    return this.prisma.subscriptionSaga.create({
      data: {
        email,
        repoName,
        status: SubscriptionSagaStatus.STARTED,
        currentStep: 'STARTED',
      },
    });
  }

  async markSubscriptionCreated(params: {
    sagaId: string;
    repositoryId: string;
    subscriptionId: string;
    createdRepository: boolean;
    createdSubscription: boolean;
  }) {
    return this.prisma.subscriptionSaga.update({
      where: { id: params.sagaId },
      data: {
        repositoryId: params.repositoryId,
        subscriptionId: params.subscriptionId,
        createdRepository: params.createdRepository,
        createdSubscription: params.createdSubscription,
        status: SubscriptionSagaStatus.SUBSCRIPTION_CREATED,
        currentStep: 'SUBSCRIPTION_CREATED',
      },
    });
  }

  async markEmailSendRequested(sagaId: string) {
    return this.prisma.subscriptionSaga.update({
      where: { id: sagaId },
      data: {
        status: SubscriptionSagaStatus.EMAIL_SEND_REQUESTED,
        currentStep: 'EMAIL_SEND_REQUESTED',
      },
    });
  }

  async markCompleted(sagaId: string) {
    return this.prisma.subscriptionSaga.update({
      where: { id: sagaId },
      data: {
        status: SubscriptionSagaStatus.COMPLETED,
        currentStep: 'COMPLETED',
        errorMessage: null,
      },
    });
  }

  async markCompensating(sagaId: string, errorMessage: string) {
    return this.prisma.subscriptionSaga.update({
      where: { id: sagaId },
      data: {
        status: SubscriptionSagaStatus.COMPENSATING,
        currentStep: 'COMPENSATING',
        errorMessage,
      },
    });
  }

  async markCompensated(sagaId: string, errorMessage?: string) {
    return this.prisma.subscriptionSaga.update({
      where: { id: sagaId },
      data: {
        status: SubscriptionSagaStatus.COMPENSATED,
        currentStep: 'COMPENSATED',
        errorMessage,
      },
    });
  }

  async findById(sagaId: string) {
    return this.prisma.subscriptionSaga.findUnique({
      where: { id: sagaId },
    });
  }
}
