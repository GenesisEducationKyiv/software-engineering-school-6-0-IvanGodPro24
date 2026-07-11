import { Router } from 'express';
import { RepositoryVerificationController } from '../controllers/repository-verification.controller.js';

export const createRepositoryVerificationRouter = (
  repositoryVerificationController: RepositoryVerificationController,
): Router => {
  const router = Router();

  router.post(
    '/internal/v1/repositories/verify',
    repositoryVerificationController.verify,
  );

  return router;
};
