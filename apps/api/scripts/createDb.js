#!/usr/bin/env node
// Create the target database if it does not exist.
// Usage: node apps/api/scripts/createDb.js

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Minimal .env loader (no dependency on dotenv) – keep in sync with migrate.js
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

function buildConnParts() {
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5435';
  const db = process.env.POSTGRES_DB || 'advanced_file_manager';
  return { user, password, host, port, db };
}

function safeDbIdent(name) {
  // Restrict to common safe identifiers to avoid SQL injection in CREATE DATABASE.
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(
      `Unsafe POSTGRES_DB value "${name}". Use only letters, digits, underscore (e.g. advanced_file_manager).`
    );
  }
  return `"${name}"`;
}

async function main() {
  loadEnv();

  // If DATABASE_URL is explicitly set, we assume user manages DB externally.
  // For local dev convenience we support POSTGRES_*.
  const parts = buildConnParts();
  const adminDb = process.env.POSTGRES_ADMIN_DB || 'postgres';

  const adminConnectionString = `postgres://${encodeURIComponent(parts.user)}:${encodeURIComponent(
    parts.password
  )}@${parts.host}:${parts.port}/${adminDb}`;

  const client = new Client({ connectionString: adminConnectionString, keepAlive: true });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [parts.db]);
    if (exists.rowCount > 0) {
      console.log(`Database "${parts.db}" already exists.`);
      return;
    }
    const ident = safeDbIdent(parts.db);
    console.log(`Creating database ${ident} ...`);
    await client.query(`CREATE DATABASE ${ident}`);
    console.log('✔ Created.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});


