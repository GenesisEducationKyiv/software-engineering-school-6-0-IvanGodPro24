import { PrismaClient, Repository as DbRepository } from '@prisma/client';

export interface ITrackedRepoRepository {
  upsert(name: string): Promise<DbRepository>;
  findWithActiveSubscriptions(): Promise<DbRepository[]>;
  updateLastSeenTag(id: string, tag: string): Promise<void>;
}

export class TrackedRepoRepository implements ITrackedRepoRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(name: string): Promise<DbRepository> {
    return this.db.repository.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  async findWithActiveSubscriptions(): Promise<DbRepository[]> {
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
