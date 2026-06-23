import { Redis } from 'ioredis';
import axios from 'axios';
import { getEnvVar, PinoLogger } from '@github-notifier/shared';
import { createApp } from './app.js';
import { GitHubRepositoryClient } from './github/github.client.js';
import { RepositoryVerificationService } from './app/repository-verification.service.js';
import { scannerPrisma } from './db/client.js';
import { TrackedRepositoryRepository } from './repositories/tracked-repository.repository.js';
import { RepositoryTrackingService } from './app/repository-tracking.service.js';
import { ScannerCommandWorker } from './workers/scanner-command.worker.js';

const logger = new PinoLogger('GitHubScannerService');

const redis = new Redis(getEnvVar('REDIS_URL'), {
  maxRetriesPerRequest: null,
});

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
  timeout: Number(getEnvVar('GITHUB_API_TIMEOUT_MS', '5000')),
});

const githubClient = new GitHubRepositoryClient(githubApi);

const repositoryVerificationService = new RepositoryVerificationService(
  githubClient,
);

const app = createApp(repositoryVerificationService, logger);

const PORT = Number(getEnvVar('SCANNER_SERVICE_REST_PORT', '3002'));

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`GitHub Scanner Service REST server is running on port ${PORT}`);
});

scannerCommandWorker.start();

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
    await closeHttpServer();
    await scannerCommandWorker.close();
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
