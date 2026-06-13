import { Redis } from 'ioredis';
import { ILogger } from '@github-notifier/shared';

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
}

export class RedisCacheService implements ICacheService {
  constructor(
    private readonly redis: Redis,
    private readonly logger: ILogger,
    private readonly ttl = 600,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);

    if (!data) {
      this.logger.debug(`MISS: ${key}`);
      return null;
    }
    this.logger.debug(`HIT: ${key}`);
    return JSON.parse(data);
  }

  async set(key: string, value: unknown, ttl = this.ttl): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
  }
}
