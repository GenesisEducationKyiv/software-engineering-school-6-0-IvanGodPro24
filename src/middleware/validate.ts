import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import createHttpError from 'http-errors';

export const validate =
  (schema: z.ZodSchema) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');

        next(createHttpError(400, errorMessages));
      } else {
        next(error);
      }
    }
  };
