import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';

export async function registerAssetRoutes(app: FastifyInstance) {
  app.get('/api/assets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const { rows } = await pool.query(
      `SELECT a.*, am.*, ar.*, ab.*,
              af.id AS file_id, af.mime_type AS file_mime_type, af.size_bytes AS file_size_bytes, af.original_name AS file_original_name,
              COALESCE(e.views, 0) AS engagement_views,
              COALESCE(e.saves, 0) AS engagement_saves,
              e.last_viewed_at AS engagement_last_viewed_at,
              e.last_saved_at AS engagement_last_saved_at
       FROM assets a
       LEFT JOIN asset_media am ON am.asset_id = a.id
       LEFT JOIN asset_rights ar ON ar.asset_id = a.id
       LEFT JOIN asset_business ab ON ab.asset_id = a.id
       LEFT JOIN asset_files af ON af.asset_id = a.id
       LEFT JOIN engagement e ON e.asset_id = a.id
       WHERE a.id = $1 AND a.team_id = $2 AND a.deleted_at IS NULL
       ORDER BY af.id ASC
       LIMIT 1`,
      [id, teamId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send(rows[0]);
  });

  // Increment "saved" counter
  app.post('/api/assets/:id/save', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });

    const exists = await pool.query(
      `SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
      [id, teamId]
    );
    if (!exists.rows[0]) return reply.code(404).send({ error: 'Не найдено' });

    const { rows } = await pool.query(
      `INSERT INTO engagement (asset_id, saves, last_saved_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (asset_id) DO UPDATE SET
         saves = engagement.saves + 1,
         last_saved_at = NOW()
       RETURNING saves, last_saved_at`,
      [id]
    );

    const r = rows[0] as any;
    return reply.send({
      ok: true,
      saves: Number(r?.saves ?? 0),
      lastSavedAt: r?.last_saved_at?.toISOString?.() ?? r?.last_saved_at ?? null,
    });
  });

  // Rename / move asset
  app.patch('/api/assets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const body = (req.body ?? {}) as any;
    const name = body.name != null ? String(body.name).trim() : undefined;
    const folderId = body.folderId !== undefined ? (body.folderId == null || body.folderId === '' ? null : Number(body.folderId)) : undefined;
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    if (name !== undefined && !name) return reply.code(400).send({ error: 'Некорректное имя' });
    if (folderId !== undefined && folderId !== null && (!Number.isFinite(folderId) || folderId <= 0)) {
      return reply.code(400).send({ error: 'Некорректная папка (folderId)' });
    }

    if (folderId !== undefined && folderId !== null) {
      const p = await pool.query(
        'SELECT id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
        [folderId, teamId]
      );
      if (!p.rows[0]) return reply.code(404).send({ error: 'Папка не найдена' });
    }

    const updates: string[] = [];
    const params: any[] = [id, teamId];
    if (name !== undefined) {
      params.push(name);
      updates.push(`title = $${params.length}`);
    }
    if (folderId !== undefined) {
      params.push(folderId);
      updates.push(`folder_id = $${params.length}`);
    }
    if (updates.length === 0) return reply.send({ ok: true });

    const { rows } = await pool.query(
      `UPDATE assets
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL
       RETURNING id, team_id, folder_id, title, description, type, created_at, updated_at`,
      params
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send(rows[0]);
  });

  // Move asset to trash (soft delete)
  app.delete('/api/assets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    const { rowCount } = await pool.query(
      `UPDATE assets
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
      [id, teamId]
    );
    if (!rowCount) return reply.code(404).send({ error: 'Не найдено' });
    return reply.send({ ok: true });
  });

  app.get('/api/filters-config', { preHandler: requireAuth }, async (_req, reply) => {
    const config = {
      drive: ['folderId', 'type', 'mimeType', 'sizeBytes', 'createdAt', 'capturedAt', 'tags'],
      media: ['orientation', 'width', 'height', 'durationSec', 'fps', 'videoCodec', 'audioCodec', 'aspectRatio'],
      business: ['campaignId', 'channel', 'brand', 'region', 'language', 'status'],
      common: ['ownerId', 'rating', 'visibility']
    };
    return reply.send(config);
  });
}




