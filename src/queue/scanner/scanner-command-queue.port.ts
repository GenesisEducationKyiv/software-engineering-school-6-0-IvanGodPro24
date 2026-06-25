import { SyncRepositoryTrackingCommand } from '@github-notifier/scanner-contracts';

export interface IScannerCommandPublisher {
  publish(command: SyncRepositoryTrackingCommand): Promise<void>;
}
