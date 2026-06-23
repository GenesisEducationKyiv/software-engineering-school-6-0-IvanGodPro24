import axios from 'axios';
import { getEnvVar, PinoLogger } from '@github-notifier/shared';
import { createApp } from './app.js';
import { GitHubRepositoryClient } from './github/github.client.js';
import { RepositoryVerificationService } from './app/repository-verification.service.js';

const logger = new PinoLogger('GitHubScannerService');

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

const shutdown = (signal: string): void => {
  logger.info(`Received ${signal}. Shutting down GitHub Scanner Service...`);

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Failed to stop REST server');
      process.exit(1);
    }

    logger.info('GitHub Scanner Service stopped');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
