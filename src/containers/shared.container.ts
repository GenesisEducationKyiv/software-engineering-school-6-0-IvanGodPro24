import axios from 'axios';
import { getEnvVar } from '@github-notifier/shared';
import { prisma } from '../infrastructure/db/client.js';
import { TrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../modules/subscriptions/subscription.repository.js';
import { SubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { IRepositoryVerifier } from '../modules/github/repository-verifier.port.js';
import { RestRepositoryVerifier } from '../infrastructure/scanner/rest-repository-verifier.js';

export const trackedRepoRepository = new TrackedRepoRepository(prisma);
export const subscriptionRepository = new SubscriptionRepository(prisma);
export const subscriptionQueryRepository = new SubscriptionQueryRepository(
  prisma,
);

const scannerRestApi = axios.create({
  baseURL: getEnvVar('SCANNER_SERVICE_REST_URL', 'http://localhost:3002'),
  timeout: Number(getEnvVar('SCANNER_SERVICE_REST_TIMEOUT_MS', '3000')),
});

export const repositoryVerifier: IRepositoryVerifier =
  new RestRepositoryVerifier(scannerRestApi);
