import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metadrive',
});

pool.on('connect', () => {
  console.log('[Database] Connected to PostgreSQL database for the alliance');
});