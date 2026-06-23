export interface IReleaseProvider {
  getLatestRelease(owner: string, repository: string): Promise<string | null>;
}
