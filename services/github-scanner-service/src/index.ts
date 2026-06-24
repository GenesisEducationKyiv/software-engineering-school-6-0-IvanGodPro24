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

const logger = new PinoLogger('GitHubScannerService');

const redis = new Redis(getEnvVar('REDIS_URL'), {
  maxRetriesPerRequest: null,
});

const releaseCache = new RedisReleaseCache(redis);

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

const scannerEventPublisher = new ScannerEventPublisher(redis);

const repositoryScannerService = new RepositoryScannerService(
  trackedRepositoryRepository,
  githubClient,
  scannerEventPublisher,
  logger,
);

const app = createApp(repositoryVerificationService, logger);

const PORT = Number(getEnvVar('SCANNER_SERVICE_REST_PORT', '3002'));

const scannerCronSchedule = getEnvVar('SCANNER_CRON_SCHEDULE', '*/10 * * * *');

if (!cron.validate(scannerCronSchedule))
  throw new Error(`Invalid SCANNER_CRON_SCHEDULE: ${scannerCronSchedule}`);

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`GitHub Scanner Service REST server is running on port ${PORT}`);
});

scannerCommandWorker.start();

const scannerCronTask = cron.schedule(scannerCronSchedule, () => {
  void repositoryScannerService.scanRepositories();
});

logger.info(
  {
    schedule: scannerCronSchedule,
  },
  'Repository scanner cron started',
);

let shuttingDown = false;

const closeHttpServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Shutting down GitHub Scanner Service...`);

  try {
    scannerCronTask.stop();

    await closeHttpServer();
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
