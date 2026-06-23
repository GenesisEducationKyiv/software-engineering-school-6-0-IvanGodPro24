import { SyncRepositoryTrackingCommand } from '@github-notifier/scanner-contracts';
import { ITrackedRepositoryRepository } from '../repositories/tracked-repository.repository.js';

export interface IRepositoryTrackingService {
  sync(command: SyncRepositoryTrackingCommand): Promise<void>;
}

export class RepositoryTrackingService implements IRepositoryTrackingService {
  constructor(
    private readonly trackedRepositoryRepository: ITrackedRepositoryRepository,
  ) {}

  async sync(command: SyncRepositoryTrackingCommand): Promise<void> {
    if (command.active) {
      await this.trackedRepositoryRepository.activate(
        command.repositoryId,
        command.repoName,
      );

      return;
    }

    await this.trackedRepositoryRepository.deactivate(
      command.repositoryId,
      command.repoName,
    );
  }
}
