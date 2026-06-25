import { SubscriptionSagaStatus } from '@prisma/client';
import { SubscriptionEntity } from '../modules/subscriptions/subscription.entity.js';
import { TrackedRepoEntity } from '../modules/repositories/tracked-repo.entity.js';

type SubscriptionSagaFixture = {
  id: string;
  email: string;
  repoName: string;
  repositoryId: string;
  subscriptionId: string | null;
  createdRepository: boolean;
  createdSubscription: boolean;
  status: SubscriptionSagaStatus;
  currentStep: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const createSubscriptionEntity = (
  overrides: Partial<SubscriptionEntity> = {},
): SubscriptionEntity => ({
  id: 'sub-1',
  email: 'test@test.com',
  status: 'PENDING',
  confirmToken: 'token-123',
  unsubscribeToken: 'unsub-token',
  repositoryId: 'repository-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTrackedRepoEntity = (
  overrides: Partial<TrackedRepoEntity> = {},
): TrackedRepoEntity => ({
  id: 'repository-1',
  name: 'facebook/react',
  lastSeenTag: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createSubscriptionSaga = (
  overrides: Partial<SubscriptionSagaFixture> = {},
): SubscriptionSagaFixture => ({
  id: 'saga-1',
  email: 'user@test.com',
  repoName: 'facebook/react',
  repositoryId: 'repo-1',
  subscriptionId: 'sub-1',
  createdRepository: true,
  createdSubscription: true,
  status: SubscriptionSagaStatus.EMAIL_SEND_REQUESTED,
  currentStep: 'EMAIL_SEND_REQUESTED',
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});
