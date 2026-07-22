import createHttpError from 'http-errors';
import swaggerUI from 'swagger-ui-express';
import fs from 'node:fs';
import path from 'node:path';
import { NextFunction, Request, Response } from 'express';

const SWAGGER_PATH = path.join(process.cwd(), 'docs', 'swagger.json');

export const swaggerDocs = () => {
  try {
    const swaggerDoc = JSON.parse(fs.readFileSync(SWAGGER_PATH).toString());
    return [...swaggerUI.serve, swaggerUI.setup(swaggerDoc)];
  } catch {
    return (_req: Request, _res: Response, next: NextFunction) =>
      next(createHttpError(500, "Can't load swagger docs"));
  }
};
