import type { FastifyInstance } from 'fastify';
import { pool, withTransaction } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { getStorageDir, resolveObjectPath, storeUploadToLocalFs } from '../storage/local';
import { ingestAssetMetadata } from '../ingest/ingestAssetMetadata';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';

function inferAssetType(mimeType: string): 'image' | 'video' | 'audio' | 'doc' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'doc';
}

function safeFilename(name: string): string {
  const base = (name || 'file').replace(/[\\/\0]/g, '_').slice(0, 180);
  return base || 'file';
}

function parseRange(rangeHeader: string | undefined, size: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  let start = startStr ? Number(startStr) : NaN;
  let end = endStr ? Number(endStr) : NaN;

    if (Number.isNaN(start) && Number.isNaN(end)) return null;
    if (Number.isNaN(start)) {
      const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isFinite(start) || start < 0 || start >= size) return null;
    if (Number.isNaN(end) || !Number.isFinite(end) || end >= size) end = size - 1;
    if (end < start) return null;
  }
  return { start, end };
}

export async function registerFileRoutes(app: FastifyInstance) {
  app.post('/api/files/upload', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const ownerId = req.auth!.userId;

    const mp: any = (req as any);
    if (typeof mp.parts !== 'function') return reply.code(500).send({ error: 'Загрузка файлов не настроена (multipart)' });

    const q = (req.query ?? {}) as any;
    let folderId: number | null = q.folderId == null || q.folderId === '' ? null : Number(q.folderId);
    if (folderId !== null && (!Number.isFinite(folderId) || folderId <= 0)) {
      return reply.code(400).send({ error: 'Некорректная папка (folderId)' });
    }
    const results: any[] = [];

    for await (const part of mp.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'folderId') {
          const v = String(part.value ?? '');
          folderId = v === '' || v === 'null' ? null : Number(v);
          if (folderId !== null && (!Number.isFinite(folderId) || folderId <= 0)) {
          return reply.code(400).send({ error: 'Некорректная папка (folderId)' });
          }
        }
        continue;
      }

      if (part.type !== 'file') continue;

      if (folderId !== null) {
        const p = await pool.query(
          'SELECT id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
          [folderId, teamId]
        );
        if (!p.rows[0]) return reply.code(404).send({ error: 'Папка не найдена' });
      }

      const originalName = safeFilename(part.filename);
      const mimeType = String(part.mimetype || 'application/octet-stream');
      const type = inferAssetType(mimeType);

      let stored: { objectKey: string; absolutePath: string; sizeBytes: number; sha256: string } | null = null;
      try {
        stored = await storeUploadToLocalFs({
          teamId,
          originalName,
          stream: part.file,
        });
      } catch (e: any) {
        return reply.code(500).send({ error: `Не удалось сохранить файл: ${e?.message ?? String(e)}` });
      }

      try {
        const created = await withTransaction(async (client) => {
          const assetRes = await client.query<{ id: number }>(
            `INSERT INTO assets (team_id, owner_id, type, title, status, folder_id)
             VALUES ($1,$2,$3,$4,'draft',$5)
             RETURNING id`,
            [teamId, ownerId, type, originalName, folderId]
          );
          const assetId = Number(assetRes.rows[0].id);

          const fileRes = await client.query<{ id: number }>(
            `INSERT INTO asset_files (asset_id, storage_provider, bucket, object_key, size_bytes, mime_type, sha256, checksum_verified, original_name)
             VALUES ($1,'local','local',$2,$3,$4,$5,TRUE,$6)
             RETURNING id`,
            [assetId, stored.objectKey, stored.sizeBytes, mimeType, stored.sha256, originalName]
          );
          const fileId = Number(fileRes.rows[0].id);
          return { assetId, fileId };
        });

        results.push({
          assetId: created.assetId,
          fileId: created.fileId,
          name: originalName,
          mimeType,
          sizeBytes: stored.sizeBytes,
        });

        void ingestAssetMetadata(created.assetId, stored.absolutePath).catch((e) => app.log.warn(e));
      } catch (e: any) {
        try {
          await fs.unlink(stored.absolutePath);
        } catch {}
        if (String(e?.code) === '23503') {
          return reply.code(400).send({ error: 'Некорректная папка (folderId)' });
        }
        throw e;
      }
    }

    return reply.send({ items: results });
  });

  app.get('/api/files/:id/download', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });

    const { rows } = await pool.query(
      `SELECT af.id, af.object_key, af.mime_type, af.original_name, af.size_bytes,
              a.id AS asset_id, a.deleted_at
       FROM asset_files af
       JOIN assets a ON a.id = af.asset_id
       WHERE af.id = $1 AND a.team_id = $2`,
      [id, teamId]
    );
    const r = rows[0] as any;
    if (!r || r.deleted_at) return reply.code(404).send({ error: 'Не найдено' });

    await pool.query(
      `INSERT INTO engagement (asset_id, views, last_viewed_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (asset_id) DO UPDATE SET
         views = engagement.views + 1,
         last_viewed_at = NOW()`,
      [Number(r.asset_id)]
    );

    const storageDir = getStorageDir();
    const absPath = resolveObjectPath(storageDir, String(r.object_key));

    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile()) return reply.code(404).send({ error: 'Файл не найден' });

    const filename = safeFilename(String(r.original_name ?? 'file'));
    reply.header('Content-Type', r.mime_type ?? 'application/octet-stream');
    reply.header('Content-Length', stat.size);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(createReadStream(absPath));
  });

  app.get('/api/files/:id/preview', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });

    const { rows } = await pool.query(
      `SELECT af.id, af.object_key, af.mime_type, af.original_name,
              a.id AS asset_id, a.deleted_at
       FROM asset_files af
       JOIN assets a ON a.id = af.asset_id
       WHERE af.id = $1 AND a.team_id = $2`,
      [id, teamId]
    );
    const r = rows[0] as any;
    if (!r || r.deleted_at) return reply.code(404).send({ error: 'Не найдено' });

    await pool.query(
      `INSERT INTO engagement (asset_id, views, last_viewed_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (asset_id) DO UPDATE SET
         views = engagement.views + 1,
         last_viewed_at = NOW()`,
      [Number(r.asset_id)]
    );

    const storageDir = getStorageDir();
    const absPath = resolveObjectPath(storageDir, String(r.object_key));
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile()) return reply.code(404).send({ error: 'Файл не найден' });

    const mimeType = String(r.mime_type ?? 'application/octet-stream');
    const filename = safeFilename(String(r.original_name ?? 'file'));

    reply.header('Content-Type', mimeType);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Disposition', `inline; filename="${filename}"`);

    const range = parseRange((req.headers as any).range, stat.size);
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      reply.code(206);
      reply.header('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      reply.header('Content-Length', range.end - range.start + 1);
      return reply.send(createReadStream(absPath, { start: range.start, end: range.end }));
    }

    reply.header('Content-Length', stat.size);
    return reply.send(createReadStream(absPath));
  });
}


