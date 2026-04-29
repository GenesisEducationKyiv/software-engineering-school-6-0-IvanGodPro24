import { redis } from '../queue/redis.js';

const TTL = 60 * 10;

export const getCache = async <T>(key: string): Promise<T | null> => {
  const data = await redis.get(key);

  if (!data) {
    console.log(`[Cache] MISS: ${key}`);
    return null;
  }

  console.log(`[Cache] HIT: ${key}`);
  return JSON.parse(data);
};

export const setCache = async (key: string, value: unknown) => {
  await redis.set(key, JSON.stringify(value), 'EX', TTL);
};
