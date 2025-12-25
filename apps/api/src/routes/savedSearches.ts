import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';

export async function registerSavedSearchRoutes(app: FastifyInstance) {
  app.get('/api/saved-searches', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const { rows } = await pool.query(
      `SELECT id, name, request, created_at, updated_at
       FROM saved_searches
       WHERE team_id = $1
       ORDER BY created_at DESC, id DESC`,
      [teamId]
    );
    return reply.send(rows.map((r: any) => ({
      id: Number(r.id),
      name: String(r.name),
      request: r.request,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
    })));
  });

  app.post('/api/saved-searches', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const ownerId = req.auth!.userId;
    const body = (req.body ?? {}) as any;
    const name = String(body.name ?? '').trim();
    const request = body.request;
    if (!name) return reply.code(400).send({ error: 'Введите название' });
    if (!request || typeof request !== 'object') return reply.code(400).send({ error: 'Некорректный запрос поиска' });

    const { rows } = await pool.query(
      `INSERT INTO saved_searches (team_id, owner_id, name, request)
       VALUES ($1,$2,$3,$4::jsonb)
       RETURNING id, name, request, created_at, updated_at`,
      [teamId, ownerId, name, JSON.stringify(request)]
    );
    const r = rows[0] as any;
    return reply.send({
      id: Number(r.id),
      name: String(r.name),
      request: r.request,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
    });
  });

  app.patch('/api/saved-searches/:id', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    const body = (req.body ?? {}) as any;
    const name = body.name != null ? String(body.name).trim() : undefined;
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    if (name !== undefined && !name) return reply.code(400).send({ error: 'Некорректное имя' });

    const updates: string[] = [];
    const params: any[] = [id, teamId];
    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (!updates.length) return reply.send({ ok: true });

    const { rows } = await pool.query(
      `UPDATE saved_searches
       SET ${updates.join(', ')}
       WHERE id = $1 AND team_id = $2
       RETURNING id, name, request, created_at, updated_at`,
      params
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    const r = rows[0] as any;
    return reply.send({
      id: Number(r.id),
      name: String(r.name),
      request: r.request,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
    });
  });

  app.delete('/api/saved-searches/:id', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    const { rowCount } = await pool.query('DELETE FROM saved_searches WHERE id = $1 AND team_id = $2', [id, teamId]);
    if (!rowCount) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send({ ok: true });
  });
}


