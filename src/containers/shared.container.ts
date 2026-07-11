import { getEnvVar } from '@github-notifier/shared';
import { prisma } from '../infrastructure/db/client.js';
import { TrackedRepoRepository } from '../modules/repositories/tracked-repo.repository.js';
import { SubscriptionRepository } from '../modules/subscriptions/subscription.repository.js';
import { SubscriptionQueryRepository } from '../modules/subscriptions/subscription-query.repository.js';
import { credentials } from '@grpc/grpc-js';
import { RepositoryVerificationServiceClient } from '@github-notifier/scanner-contracts';
import { GrpcRepositoryVerifier } from '../infrastructure/scanner/grpc-repository-verifier.js';
import { IRepositoryVerifier } from '../modules/github/repository-verifier.port.js';

export const trackedRepoRepository = new TrackedRepoRepository(prisma);
export const subscriptionRepository = new SubscriptionRepository(prisma);
export const subscriptionQueryRepository = new SubscriptionQueryRepository(
  prisma,
);

const scannerGrpcAddress = getEnvVar(
  'SCANNER_SERVICE_GRPC_ADDRESS',
  'localhost:50051',
);

const scannerGrpcTimeoutMs = Number(
  getEnvVar('SCANNER_SERVICE_GRPC_TIMEOUT_MS', '3000'),
);

if (!Number.isFinite(scannerGrpcTimeoutMs) || scannerGrpcTimeoutMs <= 0)
  throw new Error('SCANNER_SERVICE_GRPC_TIMEOUT_MS must be a positive number');

const scannerGrpcClient = new RepositoryVerificationServiceClient(
  scannerGrpcAddress,
  credentials.createInsecure(),
);

export const repositoryVerifier: IRepositoryVerifier = new GrpcRepositoryVerifier(
  scannerGrpcClient,
  scannerGrpcTimeoutMs,
);
