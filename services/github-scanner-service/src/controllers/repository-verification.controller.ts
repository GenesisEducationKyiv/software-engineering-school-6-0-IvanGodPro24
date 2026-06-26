import { Request, Response } from 'express';
import { IRepositoryVerificationService } from '../app/repository-verification.service.js';

export class RepositoryVerificationController {
  constructor(
    private readonly repositoryVerificationService: IRepositoryVerificationService,
  ) {}

  verify = async (req: Request, res: Response): Promise<void> => {
    const owner = typeof req.body?.owner === 'string' ? req.body.owner : '';

    const repository =
      typeof req.body?.repository === 'string' ? req.body.repository : '';

    const verifiedRepository = await this.repositoryVerificationService.verify(
      owner,
      repository,
    );

    res.status(200).json(verifiedRepository);
  };
}
