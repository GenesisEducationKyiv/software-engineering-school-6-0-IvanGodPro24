export class GitHubRepositoryId {
  readonly owner: string;
  readonly repository: string;

  constructor(readonly fullName: string) {
    const parts = fullName.split('/');

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid GitHub repository format: "${fullName}"`);
    }

    this.owner = parts[0];
    this.repository = parts[1];
  }
}
