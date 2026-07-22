import express from 'express';
import { ILogger } from '@github-notifier/shared';
import { IRepositoryVerificationService } from './app/repository-verification.service.js';
import { RepositoryVerificationController } from './controllers/repository-verification.controller.js';
import { createRepositoryVerificationRouter } from './routes/repository-verification.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createErrorHandler } from './middleware/error-handler.js';

export const createApp = (
  repositoryVerificationService: IRepositoryVerificationService,
  logger: ILogger,
) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  const repositoryVerificationController =
    new RepositoryVerificationController(repositoryVerificationService);

  app.use(createHealthRouter());
  app.use(
    createRepositoryVerificationRouter(repositoryVerificationController),
  );

  app.use(createErrorHandler(logger));

  return app;
};
