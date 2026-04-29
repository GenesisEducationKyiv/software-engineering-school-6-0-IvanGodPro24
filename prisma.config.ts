import { defineConfig } from 'prisma/config';
import { getEnvVar } from './src/utils/getEnvVar.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getEnvVar('DATABASE_URL'),
  },
});
