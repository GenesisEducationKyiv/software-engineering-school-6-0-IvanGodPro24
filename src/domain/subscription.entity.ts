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

export interface TrackedRepoEntity {
  id: string;
  name: string;
  lastSeenTag: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionWithRepoEntity extends SubscriptionEntity {
  repository: TrackedRepoEntity;
}
