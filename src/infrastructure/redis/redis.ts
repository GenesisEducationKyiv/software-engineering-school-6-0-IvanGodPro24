import { Redis } from 'ioredis';
import { getEnvVar } from '../../shared/getEnvVar.js';

export const redis = new Redis(getEnvVar('REDIS_URL'), {
  maxRetriesPerRequest: null,
});
