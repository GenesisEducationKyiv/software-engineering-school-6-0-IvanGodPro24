import { PrismaClient, Prisma } from '@prisma/client';
import { UniqueConstraintError } from '../domain/errors.js';
import {
  SubscriptionEntity,
  SubStatus,
} from '../domain/subscription.entity.js';

export interface ISubscriptionRepository {
  findByEmailAndRepoId(
    email: string,
    repositoryId: string,
  ): Promise<SubscriptionEntity | null>;
  findByConfirmToken(token: string): Promise<SubscriptionEntity | null>;
  findByUnsubscribeToken(token: string): Promise<SubscriptionEntity | null>;
  create(email: string, repositoryId: string): Promise<SubscriptionEntity>;
  updateStatus(
    id: string,
    status: SubStatus,
    extraData?: Partial<Pick<SubscriptionEntity, 'confirmToken'>>,
  ): Promise<SubscriptionEntity>;
}

export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmailAndRepoId(
    email: string,
    repositoryId: string,
  ): Promise<SubscriptionEntity | null> {
    return this.db.subscription.findUnique({
      where: {
        email_repositoryId: { email, repositoryId },
      },
    });
  }

  async findByConfirmToken(token: string): Promise<SubscriptionEntity | null> {
    return this.db.subscription.findUnique({ where: { confirmToken: token } });
  }

  async findByUnsubscribeToken(
    token: string,
  ): Promise<SubscriptionEntity | null> {
    return this.db.subscription.findUnique({
      where: { unsubscribeToken: token },
    });
  }

  async create(
    email: string,
    repositoryId: string,
  ): Promise<SubscriptionEntity> {
    try {
      return await this.db.subscription.create({
        data: { email, repositoryId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new UniqueConstraintError('Subscription already exists');
      }
      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: SubStatus,
    extraData: Partial<SubscriptionEntity> = {},
  ): Promise<SubscriptionEntity> {
    return this.db.subscription.update({
      where: { id },
      data: { status, ...extraData },
    });
  }
}
