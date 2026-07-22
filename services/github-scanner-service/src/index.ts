import { Redis } from 'ioredis';
import cron from 'node-cron';
import axios from 'axios';
import { getEnvVar, PinoLogger } from '@github-notifier/shared';
import { createApp } from './app.js';
import { GitHubRepositoryClient } from './github/github.client.js';
import { RepositoryVerificationService } from './app/repository-verification.service.js';
import { scannerPrisma } from './db/client.js';
import { TrackedRepositoryRepository } from './repositories/tracked-repository.repository.js';
import { RepositoryTrackingService } from './app/repository-tracking.service.js';
import { ScannerCommandWorker } from './workers/scanner-command.worker.js';
import { RedisReleaseCache } from './cache/redis-release-cache.js';
import { RepositoryScannerService } from './app/repository-scanner.service.js';
import { ScannerEventPublisher } from './publishers/scanner-event.publisher.js';
import { RepositoryVerificationGrpcService } from './grpc/repository-verification.grpc-service.js';
import { GrpcServer } from './grpc/grpc-server.js';

const logger = new PinoLogger('GitHubScannerService');
const releaseCacheLogger = new PinoLogger('ReleaseCache');

const redis = new Redis(getEnvVar('REDIS_URL'), {
  maxRetriesPerRequest: null,
});

const releaseCache = new RedisReleaseCache(redis, releaseCacheLogger);

const trackedRepositoryRepository = new TrackedRepositoryRepository(
  scannerPrisma,
);

const repositoryTrackingService = new RepositoryTrackingService(
  trackedRepositoryRepository,
);

const scannerCommandWorker = new ScannerCommandWorker(
  redis,
  repositoryTrackingService,
  logger,
);

const githubToken = getEnvVar('GH_TOKEN', '');

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github.v3+json',
    ...(githubToken && {
      Authorization: `Bearer ${githubToken}`,
    }),
  },
  validateStatus: (status) => status === 200 || status === 304,
  timeout: Number(getEnvVar('GITHUB_API_TIMEOUT_MS', '5000')),
});

const githubClient = new GitHubRepositoryClient(githubApi, releaseCache);

const repositoryVerificationService = new RepositoryVerificationService(
  githubClient,
);

const repositoryVerificationGrpcService = new RepositoryVerificationGrpcService(
  repositoryVerificationService,
  logger,
);

const grpcServer = new GrpcServer(
  repositoryVerificationGrpcService.handlers,
  logger,
);

const scannerEventPublisher = new ScannerEventPublisher(redis);

const repositoryScannerService = new RepositoryScannerService(
  trackedRepositoryRepository,
  githubClient,
  scannerEventPublisher,
  logger,
);

const app = createApp(repositoryVerificationService, logger);

const REST_PORT = Number(getEnvVar('SCANNER_SERVICE_REST_PORT', '3002'));

const GRPC_PORT = Number(getEnvVar('SCANNER_SERVICE_GRPC_PORT', '50051'));

const GRPC_ADDRESS = `0.0.0.0:${GRPC_PORT}`;

const scannerCronSchedule = getEnvVar('SCANNER_CRON_SCHEDULE', '*/10 * * * *');

if (!cron.validate(scannerCronSchedule))
  throw new Error(`Invalid SCANNER_CRON_SCHEDULE: ${scannerCronSchedule}`);

let restServer: ReturnType<typeof app.listen> | null = null;
let scannerCronTask: ReturnType<typeof cron.schedule> | null = null;
let shuttingDown = false;

const closeHttpServer = (): Promise<void> => {
  if (!restServer) return Promise.resolve();

  return new Promise((resolve, reject) => {
    restServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      restServer = null;
      resolve();
    });
  });
};

const bootstrap = async (): Promise<void> => {
  await grpcServer.start(GRPC_ADDRESS);

  restServer = app.listen(REST_PORT, '0.0.0.0', () => {
    logger.info(
      `GitHub Scanner Service REST server is running on port ${REST_PORT}`,
    );
  });

  scannerCommandWorker.start();

  scannerCronTask = cron.schedule(scannerCronSchedule, () => {
    void repositoryScannerService.scanRepositories();
  });

  logger.info(
    {
      schedule: scannerCronSchedule,
    },
    'Repository scanner cron started',
  );
};

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Shutting down GitHub Scanner Service...`);

  try {
    scannerCronTask?.stop();

    await closeHttpServer();
    await grpcServer.close();
    await scannerCommandWorker.close();
    await scannerEventPublisher.close();
    await scannerPrisma.$disconnect();
    await redis.quit();

    logger.info('GitHub Scanner Service stopped');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop GitHub Scanner Service');

    process.exit(1);
  }
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

bootstrap().catch(async (error) => {
  logger.error({ err: error }, 'Failed to start GitHub Scanner Service');

  try {
    await grpcServer.close();
    await scannerCommandWorker.close();
    await scannerEventPublisher.close();
    await scannerPrisma.$disconnect();
    await redis.quit();
  } finally {
    process.exit(1);
  }
});
