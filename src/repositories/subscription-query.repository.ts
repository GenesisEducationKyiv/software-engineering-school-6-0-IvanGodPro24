import { PrismaClient } from '@prisma/client';
import {
  SubStatus,
  SubscriptionEntity,
  SubscriptionWithRepoEntity,
} from '../domain/subscription.entity.js';

export interface ISubscriptionQueryRepository {
  findByEmailAndStatusWithRepo(
    email: string,
    status: SubStatus,
  ): Promise<SubscriptionWithRepoEntity[]>;
  findByRepoIdAndStatus(
    repositoryId: string,
    status: SubStatus,
  ): Promise<SubscriptionEntity[]>;
}

export class SubscriptionQueryRepository implements ISubscriptionQueryRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmailAndStatusWithRepo(
    email: string,
    status: SubStatus,
  ): Promise<SubscriptionWithRepoEntity[]> {
    return this.db.subscription.findMany({
      where: { email, status },
      include: { repository: true },
    });
  }

  async findByRepoIdAndStatus(
    repositoryId: string,
    status: SubStatus,
  ): Promise<SubscriptionEntity[]> {
    return this.db.subscription.findMany({
      where: { repositoryId, status },
    });
  }
}
