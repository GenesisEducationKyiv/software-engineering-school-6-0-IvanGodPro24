import { Redis } from 'ioredis';
import { getEnvVar } from '@github-notifier/shared';

export const redis = new Redis(getEnvVar('REDIS_URL'), {
  maxRetriesPerRequest: null,
});
