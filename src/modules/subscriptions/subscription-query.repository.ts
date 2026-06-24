import { PrismaClient } from '@prisma/client';
import {
  SubStatus,
  SubscriptionEntity,
  SubscriptionWithRepoEntity,
} from './subscription.entity.js';
import { TrackedRepoEntity } from '../repositories/tracked-repo.entity.js';

export interface ISubscriptionQueryRepository {
  findByEmailAndStatusWithRepo(
    email: string,
    status: SubStatus,
  ): Promise<SubscriptionWithRepoEntity[]>;

  findByRepoIdAndStatus(
    repositoryId: string,
    status: SubStatus,
  ): Promise<SubscriptionEntity[]>;

  findRepositoryById(repositoryId: string): Promise<TrackedRepoEntity | null>;

  countByRepoIdAndStatus(
    repositoryId: string,
    status: SubStatus,
  ): Promise<number>;
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

  async findRepositoryById(
    repositoryId: string,
  ): Promise<TrackedRepoEntity | null> {
    return this.db.repository.findUnique({
      where: {
        id: repositoryId,
      },
    });
  }

  async countByRepoIdAndStatus(
    repositoryId: string,
    status: SubStatus,
  ): Promise<number> {
    return this.db.subscription.count({
      where: {
        repositoryId,
        status,
      },
    });
  }
}
