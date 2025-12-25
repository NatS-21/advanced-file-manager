import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';

export async function registerCollectionRoutes(app: FastifyInstance) {
  app.get('/api/collections', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const { rows } = await pool.query(
      `SELECT c.id, c.name, COUNT(ac.asset_id)::bigint AS items
       FROM collections c
       LEFT JOIN asset_collections ac ON ac.collection_id = c.id
       WHERE c.team_id = $1
       GROUP BY c.id
       ORDER BY c.id DESC`,
      [teamId]
    );
    return reply.send(rows.map((r: any) => ({ id: Number(r.id), name: String(r.name), items: Number(r.items) })));
  });

  app.post('/api/collections', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const body = (req.body ?? {}) as any;
    const name = String(body.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'Введите название' });
    const { rows } = await pool.query(
      `INSERT INTO collections (team_id, name) VALUES ($1,$2) RETURNING id, name`,
      [teamId, name]
    );
    return reply.send({ id: Number(rows[0].id), name: String(rows[0].name) });
  });

  app.patch('/api/collections/:id', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    const body = (req.body ?? {}) as any;
    const name = String(body.name ?? '').trim();
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    if (!name) return reply.code(400).send({ error: 'Введите название' });
    const { rows } = await pool.query(
      `UPDATE collections SET name = $3
       WHERE id = $1 AND team_id = $2
       RETURNING id, name`,
      [id, teamId, name]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send({ id: Number(rows[0].id), name: String(rows[0].name) });
  });

  app.delete('/api/collections/:id', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    const { rowCount } = await pool.query('DELETE FROM collections WHERE id = $1 AND team_id = $2', [id, teamId]);
    if (!rowCount) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send({ ok: true });
  });

  app.get('/api/collections/:id/items', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    const { rows } = await pool.query(
      `SELECT a.id, a.title, a.type, a.created_at
       FROM asset_collections ac
       JOIN assets a ON a.id = ac.asset_id
       WHERE ac.collection_id = $1 AND a.team_id = $2 AND a.deleted_at IS NULL
       ORDER BY ac.position ASC, a.id DESC`,
      [id, teamId]
    );
    return reply.send(rows.map((r: any) => ({
      id: Number(r.id),
      title: r.title ?? null,
      type: r.type,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    })));
  });

  app.post('/api/collections/:id/assets', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    const body = (req.body ?? {}) as any;
    const assetId = Number(body.assetId);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id коллекции' });
    if (!Number.isFinite(assetId) || assetId <= 0) return reply.code(400).send({ error: 'Некорректный assetId' });

    const c = await pool.query('SELECT id FROM collections WHERE id = $1 AND team_id = $2', [id, teamId]);
    if (!c.rows[0]) return reply.code(404).send({ error: 'Коллекция не найдена' });

    const a = await pool.query('SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL', [assetId, teamId]);
    if (!a.rows[0]) return reply.code(404).send({ error: 'Файл не найден' });

    await pool.query(
      `INSERT INTO asset_collections (asset_id, collection_id, position)
       VALUES ($1,$2,0)
       ON CONFLICT DO NOTHING`,
      [assetId, id]
    );
    return reply.send({ ok: true });
  });

  app.delete('/api/collections/:id/assets/:assetId', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const assetId = Number((req.params as any).assetId);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id коллекции' });
    if (!Number.isFinite(assetId) || assetId <= 0) return reply.code(400).send({ error: 'Некорректный assetId' });
    await pool.query('DELETE FROM asset_collections WHERE collection_id = $1 AND asset_id = $2', [id, assetId]);
    return reply.send({ ok: true });
  });
}


