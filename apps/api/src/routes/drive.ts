import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';

function parseOptionalId(value: unknown): number | null {
  if (value == null || value === '' || value === 'null') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function registerDriveRoutes(app: FastifyInstance) {
  app.get('/api/drive/list', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;
    const folderId = parseOptionalId(q.folderId);

    let breadcrumbs: Array<{ id: number; name: string }> = [];
    if (folderId) {
      const bc = await pool.query(
        `WITH RECURSIVE chain AS (
          SELECT id, parent_id, name, 0 AS depth
          FROM folders
          WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL
          UNION ALL
          SELECT f.id, f.parent_id, f.name, c.depth + 1
          FROM folders f
          JOIN chain c ON c.parent_id = f.id
          WHERE f.team_id = $2 AND f.deleted_at IS NULL
        )
        SELECT id, name FROM chain ORDER BY depth DESC`,
        [folderId, teamId]
      );
      breadcrumbs = bc.rows.map((r: any) => ({ id: Number(r.id), name: String(r.name) }));
      if (breadcrumbs.length === 0) return reply.code(404).send({ error: 'Папка не найдена' });
    }

    const foldersRes = await pool.query(
      `SELECT id, parent_id, name, created_at, updated_at
       FROM folders
       WHERE team_id = $1
         AND deleted_at IS NULL
         AND parent_id IS NOT DISTINCT FROM $2
       ORDER BY name ASC`,
      [teamId, folderId]
    );

    const filesRes = await pool.query(
      `SELECT a.id, a.type, a.title, a.description, a.created_at, a.updated_at, a.folder_id,
              af.id AS file_id, af.size_bytes, af.mime_type
       FROM assets a
       LEFT JOIN asset_files af ON af.asset_id = a.id
       WHERE a.team_id = $1
         AND a.deleted_at IS NULL
         AND a.folder_id IS NOT DISTINCT FROM $2
       ORDER BY a.created_at DESC, a.id DESC`,
      [teamId, folderId]
    );

    return reply.send({
      folderId,
      breadcrumbs,
      folders: foldersRes.rows.map((r: any) => ({
        id: Number(r.id),
        parentId: r.parent_id ? Number(r.parent_id) : null,
        name: String(r.name),
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
      })),
      files: filesRes.rows.map((r: any) => ({
        id: Number(r.id),
        fileId: r.file_id ? Number(r.file_id) : null,
        type: r.type,
        name: r.title ?? null,
        description: r.description ?? null,
        folderId: r.folder_id ? Number(r.folder_id) : null,
        mimeType: r.mime_type ?? null,
        sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
      })),
    });
  });

  app.post('/api/folders', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;
    const body = (req.body ?? {}) as any;
    const name = String(body.name ?? '').trim();
    const parentId = parseOptionalId(body.parentId);
    if (!name) return reply.code(400).send({ error: 'Введите название папки' });

    if (parentId) {
      const p = await pool.query(
        'SELECT id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
        [parentId, teamId]
      );
      if (!p.rows[0]) return reply.code(404).send({ error: 'Родительская папка не найдена' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO folders (team_id, owner_id, parent_id, name)
         VALUES ($1,$2,$3,$4)
         RETURNING id, parent_id, name, created_at, updated_at`,
        [teamId, userId, parentId, name]
      );
      const r = rows[0] as any;
      return reply.send({
        id: Number(r.id),
        parentId: r.parent_id ? Number(r.parent_id) : null,
        name: String(r.name),
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
      });
    } catch (e: any) {
      if (String(e?.code) === '23505') {
        return reply.code(409).send({ error: 'Папка с таким названием уже существует' });
      }
      throw e;
    }
  });

  app.patch('/api/folders/:id', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    const body = (req.body ?? {}) as any;
    const name = body.name != null ? String(body.name).trim() : undefined;
    const parentId = body.parentId !== undefined ? parseOptionalId(body.parentId) : undefined;
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    if (name !== undefined && !name) return reply.code(400).send({ error: 'Некорректное имя' });

    const existing = await pool.query(
      'SELECT id, parent_id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [id, teamId]
    );
    if (!existing.rows[0]) return reply.code(404).send({ error: 'Не найдено' });

    if (parentId !== undefined) {
      if (parentId === id) return reply.code(400).send({ error: 'Нельзя переместить папку саму в себя' });
      if (parentId) {
        const p = await pool.query(
          'SELECT id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
          [parentId, teamId]
        );
        if (!p.rows[0]) return reply.code(404).send({ error: 'Родительская папка не найдена' });
      }
    }

    const updates: string[] = [];
    const params: any[] = [id, teamId];
    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (parentId !== undefined) {
      params.push(parentId);
      updates.push(`parent_id = $${params.length}`);
    }
    if (updates.length === 0) return reply.send({ ok: true });

    try {
      const { rows } = await pool.query(
        `UPDATE folders
         SET ${updates.join(', ')}
         WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL
         RETURNING id, parent_id, name, created_at, updated_at`,
        params
      );
      const r = rows[0] as any;
      return reply.send({
        id: Number(r.id),
        parentId: r.parent_id ? Number(r.parent_id) : null,
        name: String(r.name),
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
      });
    } catch (e: any) {
      if (String(e?.code) === '23505') {
        return reply.code(409).send({ error: 'Папка с таким названием уже существует' });
      }
      throw e;
    }
  });

  app.delete('/api/folders/:id', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });

    const res = await pool.query(
      `WITH RECURSIVE sub AS (
        SELECT id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL
        UNION ALL
        SELECT f.id FROM folders f
        JOIN sub s ON f.parent_id = s.id
        WHERE f.team_id = $2 AND f.deleted_at IS NULL
      )
      UPDATE folders
      SET deleted_at = NOW()
      WHERE id IN (SELECT id FROM sub)
      RETURNING id`,
      [id, teamId]
    );

    if (res.rowCount === 0) return reply.code(404).send({ error: 'Не найдено' });

    await pool.query(
      `UPDATE assets
       SET deleted_at = NOW()
       WHERE team_id = $1
         AND deleted_at IS NULL
         AND folder_id IN (
           WITH RECURSIVE sub AS (
             SELECT id FROM folders WHERE id = $2 AND team_id = $1
             UNION ALL
             SELECT f.id FROM folders f JOIN sub s ON f.parent_id = s.id WHERE f.team_id = $1
           )
           SELECT id FROM sub
         )`,
      [teamId, id]
    );

    return reply.send({ ok: true });
  });
}


