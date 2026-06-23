import express, { NextFunction, Request, Response } from 'express';
import { ILogger } from '@github-notifier/shared';
import { IRepositoryVerificationService } from './app/repository-verification.service.js';
import {
  RepositoryVerificationError,
  RepositoryVerificationErrorCode,
} from './domain/repository-verification.error.js';

const mapErrorCodeToHttpStatus = (
  code: RepositoryVerificationErrorCode,
): number => {
  switch (code) {
    case 'INVALID_ARGUMENT':
      return 400;

    case 'NOT_FOUND':
      return 404;

    case 'PERMISSION_DENIED':
      return 403;

    case 'RESOURCE_EXHAUSTED':
      return 429;

    case 'UNAVAILABLE':
      return 503;

    case 'INTERNAL':
      return 500;
  }
};

export const createApp = (
  repositoryVerificationService: IRepositoryVerificationService,
  logger: ILogger,
) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'github-scanner-service',
    });
  });

  app.post(
    '/internal/v1/repositories/verify',
    async (req: Request, res: Response) => {
      const owner = typeof req.body?.owner === 'string' ? req.body.owner : '';

      const repository =
        typeof req.body?.repository === 'string' ? req.body.repository : '';

      const verifiedRepository = await repositoryVerificationService.verify(
        owner,
        repository,
      );

      res.status(200).json(verifiedRepository);
    },
  );

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof RepositoryVerificationError) {
      logger.warn(
        {
          err: error,
          code: error.code,
        },
        'Repository verification failed',
      );

      res.status(mapErrorCodeToHttpStatus(error.code)).json({
        code: error.code,
        message: error.message,
      });

      return;
    }

    logger.error({ err: error }, 'Unhandled GitHub Scanner Service error');

    res.status(500).json({
      code: 'INTERNAL',
      message: 'Internal server error',
    });
  });

  return app;
};
