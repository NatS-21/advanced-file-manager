import { Pool } from 'pg';
import '../env';

export interface DatabaseConfig {
  connectionString?: string;
}

function buildConnectionStringFromParts() {
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5435';
  const db = process.env.POSTGRES_DB || 'advanced_file_manager';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

function getConnectionString(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || /\$\{[^}]+\}/.test(raw)) return buildConnectionStringFromParts();
  return raw;
}

const connectionString = getConnectionString();

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}




