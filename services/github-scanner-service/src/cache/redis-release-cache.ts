import { Redis } from 'ioredis';
import { IReleaseCache, ReleaseCacheEntry } from '../app/release-cache.port.js';

export class RedisReleaseCache implements IReleaseCache {
  constructor(private readonly redis: Redis) {}

  async get(repoName: string): Promise<ReleaseCacheEntry | null> {
    const key = this.createKey(repoName);
    const value = await this.redis.get(key);

    if (!value) return null;

    try {
      return JSON.parse(value) as ReleaseCacheEntry;
    } catch {
      await this.redis.del(key);
      return null;
    }
  }

  async set(repoName: string, entry: ReleaseCacheEntry): Promise<void> {
    await this.redis.set(this.createKey(repoName), JSON.stringify(entry));
  }

  private createKey(repoName: string): string {
    return `scanner:release:${repoName}`;
  }
}
