import { TrackedRepoEntity } from '../repositories/tracked-repo.entity.js';

export type SubStatus = 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED';

export interface SubscriptionEntity {
  id: string;
  email: string;
  status: SubStatus;
  confirmToken: string;
  unsubscribeToken: string;
  repositoryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionWithRepoEntity extends SubscriptionEntity {
  repository: TrackedRepoEntity;
}
