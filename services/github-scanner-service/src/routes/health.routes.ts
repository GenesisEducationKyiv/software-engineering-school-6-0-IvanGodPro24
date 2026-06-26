import { Router } from 'express';

export const createHealthRouter = (): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'github-scanner-service',
    });
  });

  return router;
};
