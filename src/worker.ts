import { emailWorker } from './containers/worker.container.js';
import { PinoLogger } from './infrastructure/logger/logger.js';
import { redis } from './infrastructure/redis/redis.js';

const logger = new PinoLogger('StandaloneWorker');

const bootstrap = async () => {
  try {
    emailWorker.start();
    logger.info('Email Worker started successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to start Email Worker');
    process.exit(1);
  }

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down worker...`);
    await emailWorker.close();
    redis.quit();
    logger.info('Worker disconnected. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
};

bootstrap();
