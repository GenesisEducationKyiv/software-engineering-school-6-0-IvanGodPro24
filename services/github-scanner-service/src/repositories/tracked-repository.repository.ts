import { PrismaClient } from '../generated/prisma/client.js';
import { TrackedRepositoryEntity } from '../domain/tracked-repository.entity.js';

export interface ITrackedRepositoryRepository {
  activate(
    sourceRepositoryId: string,
    repoName: string,
  ): Promise<TrackedRepositoryEntity>;

  deactivate(sourceRepositoryId: string, repoName: string): Promise<void>;

  findActive(): Promise<TrackedRepositoryEntity[]>;

  updateLastSeenTag(id: string, tag: string): Promise<void>;
}

export class TrackedRepositoryRepository implements ITrackedRepositoryRepository {
  constructor(private readonly db: PrismaClient) {}

  async activate(
    sourceRepositoryId: string,
    repoName: string,
  ): Promise<TrackedRepositoryEntity> {
    return this.db.trackedRepository.upsert({
      where: {
        name: repoName,
      },
      update: {
        sourceRepositoryId,
        active: true,
      },
      create: {
        sourceRepositoryId,
        name: repoName,
        active: true,
      },
    });
  }

  async deactivate(
    sourceRepositoryId: string,
    repoName: string,
  ): Promise<void> {
    await this.db.trackedRepository.updateMany({
      where: {
        OR: [{ sourceRepositoryId }, { name: repoName }],
      },
      data: {
        active: false,
      },
    });
  }

  async findActive(): Promise<TrackedRepositoryEntity[]> {
    return this.db.trackedRepository.findMany({
      where: {
        active: true,
      },
    });
  }

  async updateLastSeenTag(id: string, tag: string): Promise<void> {
    await this.db.trackedRepository.update({
      where: { id },
      data: {
        lastSeenTag: tag,
      },
    });
  }
}
