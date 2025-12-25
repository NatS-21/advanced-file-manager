#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

function loadEnv() {
  const root = path.resolve(__dirname, '../../..');
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER
    );
  `);
}

function listSqlMigrations(dir) {
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  all.sort();
  return all.map((name) => ({ name, path: path.join(dir, name) }));
}

async function alreadyApplied(client) {
  const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
  const map = new Map();
  for (const r of rows) map.set(r.filename, r.checksum);
  return map;
}

async function runMigrations(direction = 'up') {
  loadEnv();
  const migrationsDir = process.env.MIGRATIONS_DIR || path.resolve(__dirname, '../db/migrations');
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString || /\$\{[^}]+\}/.test(connectionString)) {
    const user = process.env.POSTGRES_USER || 'postgres';
    const password = process.env.POSTGRES_PASSWORD || 'postgres';
    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = process.env.POSTGRES_PORT || '5435';
    const db = process.env.POSTGRES_DB || 'advanced_file_manager';
    connectionString = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  }
  async function connectWithRetry(maxAttempts = 30) {
    let lastErr;
    for (let i = 1; i <= maxAttempts; i++) {
      const client = new Client({ connectionString, keepAlive: true });
      try {
        await client.connect();
        await client.query('SELECT 1');
        return client;
      } catch (e) {
        lastErr = e;
        try { await client.end(); } catch {}
        const delay = Math.min(1000 * i, 5000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  let client;
  try {
    client = await connectWithRetry();
  } catch (e) {
    if (e && e.code === '3D000') {
      console.error(`error: database "${process.env.POSTGRES_DB || 'advanced_file_manager'}" does not exist`);
      console.error('Hint: create it first (local dev): yarn db:create');
      process.exit(1);
    }
    throw e;
  }
  try {
    await ensureMigrationsTable(client);
    const applied = await alreadyApplied(client);
    const files = listSqlMigrations(migrationsDir);

    if (direction === 'status') {
      for (const f of files) {
        const status = applied.has(f.name) ? 'APPLIED' : 'PENDING';
        console.log(`${status}\t${f.name}`);
      }
      return;
    }

    for (const f of files) {
      if (applied.has(f.name)) continue;
      const sql = fs.readFileSync(f.path, 'utf8');
      const checksum = sha256(sql);
      console.log(`Applying ${f.name} ...`);
      const start = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        const ms = Date.now() - start;
        await client.query('INSERT INTO schema_migrations(filename, checksum, execution_ms) VALUES ($1,$2,$3)', [f.name, checksum, ms]);
        await client.query('COMMIT');
        console.log(`✔ Applied ${f.name} in ${ms}ms`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`✖ Failed ${f.name}:`, e.message);
        process.exit(1);
      }
    }
    console.log('Migrations complete.');
  } finally {
    await client.end();
  }
}

const cmd = process.argv[2] || 'up';
runMigrations(cmd).catch((e) => {
  console.error(e);
  process.exit(1);
});




