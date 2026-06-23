import { getEnvVar, PinoLogger } from '@github-notifier/shared';
import { app } from './app.js';

const logger = new PinoLogger('GitHubScannerService');

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
