import { Redis } from 'ioredis';

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
}

export class RedisCacheService implements ICacheService {
  constructor(
    private readonly redis: Redis,
    private readonly ttl = 600,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);

    if (!data) {
      console.log(`[Cache] MISS: ${key}`);
      return null;
    }

    console.log(`[Cache] HIT: ${key}`);
    return JSON.parse(data);
  }

  async set(key: string, value: unknown, ttl = this.ttl): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
  }
}
