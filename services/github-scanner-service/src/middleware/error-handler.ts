import { NextFunction, Request, Response } from 'express';
import { ILogger } from '@github-notifier/shared';
import {
  RepositoryVerificationError,
} from '../domain/repository-verification.error.js';
import { mapRepositoryVerificationErrorCodeToHttpStatus } from '../domain/repository-verification-error.mapper.js';

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

      res
        .status(mapRepositoryVerificationErrorCodeToHttpStatus(error.code))
        .json({
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
