import { RepositoryTagUpdatedEvent } from '@github-notifier/scanner-contracts';

export interface IScannerEventPublisher {
  publish(event: RepositoryTagUpdatedEvent): Promise<void>;
}
