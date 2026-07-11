export type VerifiedRepository = {
  fullName: string;
};

export interface IGitHubRepositoryClient {
  verifyRepository(
    owner: string,
    repository: string,
  ): Promise<VerifiedRepository>;
}
