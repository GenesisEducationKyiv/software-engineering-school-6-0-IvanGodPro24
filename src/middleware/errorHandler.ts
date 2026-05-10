import { Request, Response, NextFunction } from 'express';
import { HttpError } from 'http-errors';
import { PinoLogger } from '../utils/logger.js';

const logger = new PinoLogger('ErrorHandler');

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      status: err.status,
      message: err.name,
      data: err,
    });
    return;
  }

  logger.error(`Unhandled error: ${err.message}`);
  res
    .status(500)
    .json({ message: 'Something went wrong!', error: err.message });
};
