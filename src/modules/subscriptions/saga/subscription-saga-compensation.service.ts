import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { ILogger } from '@github-notifier/shared';
import { SubscriptionSagaRepository } from './subscription-saga.repository.js';

export class SubscriptionSagaCompensationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sagaRepository: SubscriptionSagaRepository,
    private readonly logger: ILogger,
  ) {}

  async compensate(sagaId: string, errorMessage: string): Promise<void> {
    const saga = await this.sagaRepository.findById(sagaId);

    if (!saga) {
      this.logger.warn({ sagaId }, 'Saga not found for compensation');
      return;
    }

    if (saga.status === 'COMPENSATED') {
      this.logger.info({ sagaId }, 'Saga already compensated');
      return;
    }

    if (saga.status === 'COMPLETED') {
      this.logger.warn(
        { sagaId },
        'Compensation skipped because saga is already completed',
      );
      return;
    }

    await this.sagaRepository.markCompensating(sagaId, errorMessage);

    if (saga.subscriptionId) {
      if (saga.createdSubscription) {
        await this.prisma.subscription.deleteMany({
          where: {
            id: saga.subscriptionId,
            status: SubscriptionStatus.PENDING,
          },
        });
      } else {
        await this.prisma.subscription.updateMany({
          where: {
            id: saga.subscriptionId,
            status: SubscriptionStatus.PENDING,
          },
          data: {
            status: SubscriptionStatus.UNSUBSCRIBED,
          },
        });
      }
    }

    if (saga.createdRepository && saga.repositoryId) {
      const subscriptionsCount = await this.prisma.subscription.count({
        where: { repositoryId: saga.repositoryId },
      });

      if (subscriptionsCount === 0) {
        await this.prisma.repository.deleteMany({
          where: { id: saga.repositoryId },
        });
      }
    }

    await this.sagaRepository.markCompensated(sagaId, errorMessage);

    this.logger.info({ sagaId }, 'Subscription saga compensated');
  }
}
