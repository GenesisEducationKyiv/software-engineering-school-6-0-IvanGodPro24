import { PrismaClient } from '@prisma/client';
import { TrackedRepoEntity } from '../subscriptions/subscription.entity.js';

export interface ITrackedRepoRepository {
  upsert(name: string): Promise<TrackedRepoEntity>;
  findWithActiveSubscriptions(): Promise<TrackedRepoEntity[]>;
  updateLastSeenTag(id: string, tag: string): Promise<void>;
}

export class TrackedRepoRepository implements ITrackedRepoRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(name: string): Promise<TrackedRepoEntity> {
    return this.db.repository.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  async findWithActiveSubscriptions(): Promise<TrackedRepoEntity[]> {
    return this.db.repository.findMany({
      where: {
        subscriptions: { some: { status: 'ACTIVE' } },
      },
    });
  }

  async updateLastSeenTag(id: string, tag: string): Promise<void> {
    await this.db.repository.update({
      where: { id },
      data: { lastSeenTag: tag },
    });
  }
}
