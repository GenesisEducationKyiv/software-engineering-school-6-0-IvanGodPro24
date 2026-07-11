export interface IGitHubReleaseClient {
  getLatestRelease(owner: string, repository: string): Promise<string | null>;
}
