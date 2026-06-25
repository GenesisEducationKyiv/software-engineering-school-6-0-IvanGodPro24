import { Redis } from 'ioredis';
import { ILogger } from '@github-notifier/shared';
import { IReleaseCache, ReleaseCacheEntry } from '../app/release-cache.port.js';

export class RedisReleaseCache implements IReleaseCache {
  constructor(
    private readonly redis: Redis,
    private readonly logger: ILogger,
    private readonly ttlSeconds = 600,
  ) {}

  async get(repoName: string): Promise<ReleaseCacheEntry | null> {
    const key = this.createKey(repoName);
    const value = await this.redis.get(key);

    if (!value) {
      this.logger.debug(`MISS: ${key}`);
      return null;
    }

    this.logger.debug(`HIT: ${key}`);

    try {
      return JSON.parse(value) as ReleaseCacheEntry;
    } catch {
      await this.redis.del(key);
      this.logger.warn(`Invalid cache entry removed: ${key}`);
      return null;
    }
  }

  async set(repoName: string, entry: ReleaseCacheEntry): Promise<void> {
    await this.redis.set(
      this.createKey(repoName),
      JSON.stringify(entry),
      'EX',
      this.ttlSeconds,
    );
  }

  private createKey(repoName: string): string {
    return `scanner:release:${repoName}`;
  }
}
