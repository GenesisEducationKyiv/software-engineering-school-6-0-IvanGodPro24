import { NextFunction, Request, Response } from 'express';
import { ILogger } from '@github-notifier/shared';
import {
  RepositoryVerificationError,
  RepositoryVerificationErrorCode,
} from '../domain/repository-verification.error.js';

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

export const createErrorHandler =
  (logger: ILogger) =>
  (error: Error, _req: Request, res: Response, _next: NextFunction): void => {
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
  };
