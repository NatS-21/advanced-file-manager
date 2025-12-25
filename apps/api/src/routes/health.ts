import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';

function getDbTargetSummary() {
  const raw = process.env.DATABASE_URL;
  const hasTemplate = raw && /\$\{[^}]+\}/.test(raw);
  if (raw && !hasTemplate) {
    try {
      const u = new URL(raw);
      return {
        source: 'DATABASE_URL',
        host: u.hostname || null,
        port: u.port || null,
        database: u.pathname ? u.pathname.replace(/^\//, '') : null,
        user: u.username ? decodeURIComponent(u.username) : null,
      };
    } catch {
      // fall through
    }
  }
  return {
    source: 'POSTGRES_*',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || '5435',
    database: process.env.POSTGRES_DB || 'advanced_file_manager',
    user: process.env.POSTGRES_USER || 'postgres',
  };
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_req, reply) => {
    const includeTarget = process.env.NODE_ENV !== 'production';
    try {
      const r = await pool.query('SELECT 1 AS ok');
      return reply.send({
        ok: true,
        db: r.rows?.[0]?.ok === 1 ? 'up' : 'unknown',
        ...(includeTarget ? { target: getDbTargetSummary() } : {}),
      });
    } catch (e: any) {
      const message =
        e?.message ??
        (Array.isArray(e?.aggregateErrors) ? e.aggregateErrors.map((x: any) => x?.message).filter(Boolean).join('; ') : '') ??
        String(e);
      return reply.code(503).send({
        ok: false,
        db: 'down',
        error: message,
        code: e?.code ?? null,
        ...(includeTarget ? { target: getDbTargetSummary() } : {}),
      });
    }
  });
}


