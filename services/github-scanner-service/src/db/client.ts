import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnvVar } from '@github-notifier/shared';
import { PrismaClient } from '../generated/prisma/client.js';

const pool = new Pool({ connectionString: getEnvVar('SCANNER_DATABASE_URL') });

const adapter = new PrismaPg(pool);

export const scannerPrisma = new PrismaClient({ adapter });
