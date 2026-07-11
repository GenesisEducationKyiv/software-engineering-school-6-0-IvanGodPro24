export type ReleaseCacheEntry = {
  tag: string | null;
  etag: string | null;
};

export interface IReleaseCache {
  get(repoName: string): Promise<ReleaseCacheEntry | null>;

  set(repoName: string, entry: ReleaseCacheEntry): Promise<void>;
}
