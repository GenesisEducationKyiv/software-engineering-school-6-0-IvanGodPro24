export class GithubRepoId {
  public readonly owner: string;
  public readonly name: string;

  constructor(public readonly fullName: string) {
    const parts = fullName.split('/');

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid GitHub repository format: "${fullName}". Expected format: "owner/repoName"`,
      );
    }

    this.owner = parts[0];
    this.name = parts[1];
  }
}
