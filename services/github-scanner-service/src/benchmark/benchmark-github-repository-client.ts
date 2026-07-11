import {
  IGitHubRepositoryClient,
  VerifiedRepository,
} from '../app/github-repository-client.port.js';

export class BenchmarkGitHubRepositoryClient implements IGitHubRepositoryClient {
  async verifyRepository(
    owner: string,
    repository: string,
  ): Promise<VerifiedRepository> {
    return {
      fullName: `${owner}/${repository}`,
    };
  }
}
