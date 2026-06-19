import {
  Prisma,
  PrismaClient,
  SubscriptionSagaStatus,
  SubscriptionStatus,
} from '@prisma/client';
import createHttpError from 'http-errors';
import { randomUUID } from 'node:crypto';
import { EmailJobData } from '@github-notifier/notification-contracts';
import { ILogger } from '@github-notifier/shared';
import { IGitHubClient } from '../../github/github.service.js';
import { GithubRepoId } from '../../repositories/github-repo-id.js';
import { SubscriptionSagaRepository } from './subscription-saga.repository.js';

export interface EmailCommandPublisher {
  addEmail(data: EmailJobData): Promise<void>;
}

export type StartSubscriptionSagaInput = {
  email: string;
  repoName: string;
};

export type StartSubscriptionSagaResult = {
  sagaId: string;
  subscriptionId: string;
  status: 'EMAIL_SEND_REQUESTED';
};

export class SubscriptionSagaOrchestrator {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sagaRepository: SubscriptionSagaRepository,
    private readonly githubClient: IGitHubClient,
    private readonly emailPublisher: EmailCommandPublisher,
    private readonly logger: ILogger,
  ) {}

  async start(
    input: StartSubscriptionSagaInput,
  ): Promise<StartSubscriptionSagaResult> {
    const { email, repoName } = input;
    const repoId = new GithubRepoId(repoName);

    await this.githubClient.checkRepoExists(repoId.owner, repoId.name);

    let sagaId: string | null = null;

    try {
      const { saga, repository, subscription } = await this.prisma.$transaction(
        async (tx) => {
          let repository = await tx.repository.findUnique({
            where: { name: repoId.fullName },
          });

          let createdRepository = false;

          if (!repository) {
            repository = await tx.repository.create({
              data: { name: repoId.fullName },
            });

            createdRepository = true;
          }

          const existingSubscription = await tx.subscription.findUnique({
            where: {
              email_repositoryId: {
                email,
                repositoryId: repository.id,
              },
            },
          });

          if (existingSubscription?.status === SubscriptionStatus.ACTIVE)
            throw createHttpError(409, 'Already subscribed to this repository');

          if (existingSubscription?.status === SubscriptionStatus.PENDING)
            throw createHttpError(
              409,
              'Subscription is pending. Please check your email.',
            );

          const saga = await tx.subscriptionSaga.create({
            data: {
              email,
              repoName: repoId.fullName,
              repositoryId: repository.id,
              createdRepository,
              status: SubscriptionSagaStatus.STARTED,
              currentStep: 'STARTED',
            },
          });

          const createdSubscription = !existingSubscription;

          const subscription =
            existingSubscription?.status === SubscriptionStatus.UNSUBSCRIBED
              ? await tx.subscription.update({
                  where: { id: existingSubscription.id },
                  data: {
                    status: SubscriptionStatus.PENDING,
                    confirmToken: randomUUID(),
                    unsubscribeToken: randomUUID(),
                  },
                })
              : await tx.subscription.create({
                  data: {
                    email,
                    repositoryId: repository.id,
                  },
                });

          await tx.subscriptionSaga.update({
            where: { id: saga.id },
            data: {
              subscriptionId: subscription.id,
              createdSubscription,
              status: SubscriptionSagaStatus.SUBSCRIPTION_CREATED,
              currentStep: 'SUBSCRIPTION_CREATED',
            },
          });

          return {
            saga,
            repository,
            subscription,
          };
        },
      );

      sagaId = saga.id;

      await this.sagaRepository.markEmailSendRequested(saga.id);

      await this.emailPublisher.addEmail({
        type: 'confirm-subscription',
        sagaId: saga.id,
        subscriptionId: subscription.id,
        email,
        repoName: repository.name,
        confirmToken: subscription.confirmToken,
      });

      this.logger.info(
        {
          sagaId: saga.id,
          subscriptionId: subscription.id,
          email,
          repoName: repository.name,
        },
        'Subscription saga started',
      );

      return {
        sagaId: saga.id,
        subscriptionId: subscription.id,
        status: 'EMAIL_SEND_REQUESTED',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown saga start error';

      this.logger.error(
        { err: error, sagaId, email, repoName },
        'Subscription saga failed during start',
      );

      if (sagaId) await this.compensateStartedSaga(sagaId, errorMessage);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw createHttpError(
          409,
          'Subscription is processing or already exists.',
        );
      }

      throw error;
    }
  }

  private async compensateStartedSaga(sagaId: string, errorMessage: string) {
    const saga = await this.sagaRepository.findById(sagaId);

    if (!saga) return;

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
  }
}
