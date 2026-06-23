import {
  IGitHubRepositoryClient,
  VerifiedRepository,
} from './github-repository-client.port.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';

export interface IRepositoryVerificationService {
  verify(owner: string, repository: string): Promise<VerifiedRepository>;
}

const REPOSITORY_PART_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export class RepositoryVerificationService implements IRepositoryVerificationService {
  constructor(private readonly githubClient: IGitHubRepositoryClient) {}

  async verify(owner: string, repository: string): Promise<VerifiedRepository> {
    if (
      !owner ||
      !repository ||
      !REPOSITORY_PART_PATTERN.test(owner) ||
      !REPOSITORY_PART_PATTERN.test(repository)
    ) {
      throw new RepositoryVerificationError(
        'INVALID_ARGUMENT',
        'Invalid repository coordinates',
      );
    }

    return this.githubClient.verifyRepository(owner, repository);
  }
}
