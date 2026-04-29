import { Request, Response, NextFunction } from 'express';
import createHttpError from 'http-errors';
import { getEnvVar } from '../utils/getEnvVar.js';

export const auth = (req: Request, _res: Response, next: NextFunction) => {
  const apiKey = req.header('x-api-key');

  if (!apiKey) return next(createHttpError(401, 'API key is missing'));

  const validApiKey = getEnvVar('API_KEY');

  if (apiKey !== validApiKey)
    return next(createHttpError(403, 'Invalid API key'));

  next();
};
