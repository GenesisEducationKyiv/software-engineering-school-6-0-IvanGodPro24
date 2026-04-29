import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { getEnvVar } from '../utils/getEnvVar.js';

const pool = new Pool({ connectionString: getEnvVar('DATABASE_URL') });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
