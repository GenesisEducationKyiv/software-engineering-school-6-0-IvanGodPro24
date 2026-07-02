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
