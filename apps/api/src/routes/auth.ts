import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { withTransaction } from '../db/pool';
import { pool } from '../db/pool';
import type { AuthJwtPayload } from '../auth/types';
import { requireAuth } from '../auth/requireAuth';

function setAuthCookie(app: FastifyInstance, reply: any, payload: AuthJwtPayload) {
  const token = app.jwt.sign(payload, { expiresIn: '7d' });
  reply.setCookie('afm_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const displayName = body.displayName != null ? String(body.displayName) : null;

    if (!email || !email.includes('@')) return reply.code(400).send({ error: 'Некорректный email' });
    if (!password || password.length < 8) return reply.code(400).send({ error: 'Пароль должен быть минимум 8 символов' });

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows[0]) {
        return { ok: false as const, error: 'Пользователь с таким email уже зарегистрирован' };
      }

      const userRes = await client.query<{ id: number }>(
        'INSERT INTO users (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id',
        [email, displayName, passwordHash]
      );
      const userId = Number(userRes.rows[0].id);

      const teamName = displayName ? `${displayName}` : email;
      const teamRes = await client.query<{ id: number }>(
        'INSERT INTO teams (name) VALUES ($1) RETURNING id',
        [`${teamName} (Personal)`]
      );
      const teamId = Number(teamRes.rows[0].id);

      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,$3)',
        [teamId, userId, 'owner']
      );

      return { ok: true as const, userId, teamId };
    });

    if (!result.ok) return reply.code(409).send({ error: result.error });

    setAuthCookie(app, reply, { uid: result.userId, tid: result.teamId, email });
    return reply.send({ userId: result.userId, teamId: result.teamId, email, displayName });
  });

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!email || !email.includes('@')) return reply.code(400).send({ error: 'Некорректный email' });
    if (!password) return reply.code(400).send({ error: 'Введите пароль' });

    let rows: any[] = [];
    try {
      const res = await pool.query(
        `SELECT u.id, u.email, u.display_name, u.password_hash, tm.team_id
         FROM users u
         JOIN team_members tm ON tm.user_id = u.id
         WHERE u.email = $1
         ORDER BY tm.team_id ASC
         LIMIT 1`,
        [email]
      );
      rows = res.rows as any[];
    } catch (e: any) {
      if (e?.code === 'ECONNREFUSED') {
        return reply.code(503).send({
          error:
            'Database is not reachable. Check that Postgres is running and POSTGRES_HOST/POSTGRES_PORT (or DATABASE_URL) are correct.',
        });
      }
      if (e?.code === '42P01') {
        return reply.code(503).send({
          error: 'Database schema is missing (migrations not applied). Run: yarn db:up && yarn db:migrate',
        });
      }
      throw e;
    }

    const row = rows[0] as any;
    if (!row || !row.password_hash) return reply.code(401).send({ error: 'Неверный email или пароль' });
    const ok = await bcrypt.compare(password, String(row.password_hash));
    if (!ok) return reply.code(401).send({ error: 'Неверный email или пароль' });

    const userId = Number(row.id);
    const teamId = Number(row.team_id);

    setAuthCookie(app, reply, { uid: userId, tid: teamId, email: String(row.email) });
    return reply.send({ userId, teamId, email: String(row.email), displayName: row.display_name ?? null });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('afm_token', { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth!;
    const { rows } = await pool.query('SELECT id, email, display_name FROM users WHERE id = $1', [auth.userId]);
    const u = rows[0] as any;
    if (!u) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send({ id: Number(u.id), email: String(u.email), displayName: u.display_name ?? null, teamId: auth.teamId });
  });
}


