export interface IRepositoryVerifier {
  verifyRepository(owner: string, repository: string): Promise<void>;
}
