import type { FastifyInstance } from 'fastify';
import { pool, withTransaction } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';
import { logEventAsync } from '../utils/eventLogger';

export async function registerCommentRoutes(app: FastifyInstance) {
  // Создать комментарий
  app.post('/api/assets/:id/comments', { preHandler: [requireAuth, requireRole(['viewer', 'uploader', 'editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;
    const body = (req.body ?? {}) as any;
    const text = String(body.text ?? '').trim();
    const parentId = body.parentId != null ? Number(body.parentId) : null;

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }
    if (!text || text.length === 0) {
      return reply.code(400).send({ error: 'Текст комментария не может быть пустым' });
    }
    if (text.length > 5000) {
      return reply.code(400).send({ error: 'Текст комментария слишком длинный (максимум 5000 символов)' });
    }

    // Проверяем, что файл существует и принадлежит команде пользователя
    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    // Если указан parent_id, убеждаемся, что он существует и относится к тому же файлу
    if (parentId !== null) {
      if (!Number.isFinite(parentId) || parentId <= 0) {
        return reply.code(400).send({ error: 'Некорректный parentId' });
      }
      const parentCheck = await pool.query(
        'SELECT id, asset_id FROM asset_comments WHERE id = $1 AND deleted_at IS NULL',
        [parentId]
      );
      if (!parentCheck.rows[0]) {
        return reply.code(404).send({ error: 'Родительский комментарий не найден' });
      }
      if (Number(parentCheck.rows[0].asset_id) !== assetId) {
        return reply.code(400).send({ error: 'Родительский комментарий принадлежит другому файлу' });
      }
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO asset_comments (asset_id, user_id, parent_id, text)
         VALUES ($1, $2, $3, $4)
         RETURNING id, asset_id, user_id, parent_id, text, created_at, updated_at, deleted_at`,
        [assetId, userId, parentId, text]
      );

      const comment = rows[0] as any;
      
      // Get user info
      const userRes = await pool.query(
        'SELECT id, email, display_name FROM users WHERE id = $1',
        [userId]
      );
      const user = userRes.rows[0] as any;

      const commentData = {
        id: Number(comment.id),
        assetId: Number(comment.asset_id),
        userId: Number(comment.user_id),
        parentId: comment.parent_id ? Number(comment.parent_id) : null,
        text: String(comment.text),
        createdAt: comment.created_at?.toISOString?.() ?? comment.created_at,
        updatedAt: comment.updated_at?.toISOString?.() ?? comment.updated_at,
        deletedAt: comment.deleted_at ? (comment.deleted_at?.toISOString?.() ?? comment.deleted_at) : null,
        user: {
          id: Number(user.id),
          email: String(user.email),
          displayName: user.display_name ?? null,
        },
      };

      // Логируем событие создания комментария
      logEventAsync({
        teamId,
        userId,
        assetId,
        eventType: 'comment',
        metadata: {
          assetId,
          commentId: commentData.id,
          parentId: commentData.parentId,
        },
      });

      return reply.send(commentData);
    } catch (e: any) {
      if (String(e?.code) === '23503') {
        return reply.code(400).send({ error: 'Некорректный parent_id' });
      }
      throw e;
    }
  });

  // Получить список комментариев
  app.get('/api/assets/:id/comments', { preHandler: [requireAuth, requireRole(['viewer', 'uploader', 'editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    try {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Проверяем, что файл существует и принадлежит команде пользователя
    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    // Получаем все комментарии для файла (включая удалённые, но помеченные)
    const { rows } = await pool.query(
      `SELECT
         ac.id, ac.asset_id, ac.user_id, ac.parent_id, ac.text,
         ac.created_at, ac.updated_at, ac.deleted_at,
         u.id AS user_id_val, u.email AS user_email, u.display_name AS user_display_name
       FROM asset_comments ac
       LEFT JOIN users u ON u.id = ac.user_id
       WHERE ac.asset_id = $1
       ORDER BY ac.created_at ASC`,
      [assetId]
    );

      const comments = rows.map((r: any) => ({
      id: Number(r.id),
      assetId: Number(r.asset_id),
      userId: Number(r.user_id),
      parentId: r.parent_id ? Number(r.parent_id) : null,
      text: String(r.text),
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      updatedAt: r.updated_at ? (r.updated_at?.toISOString?.() ?? r.updated_at) : null,
      deletedAt: r.deleted_at ? (r.deleted_at?.toISOString?.() ?? r.deleted_at) : null,
      user: r.user_id_val ? {
        id: Number(r.user_id_val),
        email: String(r.user_email),
        displayName: r.user_display_name ?? null,
      } : null,
    }));

    return reply.send({ items: comments });
    } catch (error: any) {
      app.log.error('Error in GET /api/assets/:id/comments:', error);
      // Check for specific database errors
      if (error?.code === '42P01') {
        return reply.code(500).send({ error: 'Таблица asset_comments не найдена в базе данных. Возможно, миграции не применены.' });
      }
      if (error?.code === '42P02') {
        return reply.code(500).send({ error: 'Колонка не найдена в базе данных. Возможно, миграции не применены.' });
      }
      return reply.code(500).send({ error: `Внутренняя ошибка сервера: ${error?.message || 'Неизвестная ошибка'}` });
    }
  });

  // Редактировать комментарий
  app.patch('/api/comments/:id', { preHandler: [requireAuth, requireRole(['viewer', 'uploader', 'editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const commentId = Number((req.params as any).id);
    const userId = req.auth!.userId;
    const teamId = req.auth!.teamId;
    const body = (req.body ?? {}) as any;
    const text = body.text != null ? String(body.text).trim() : undefined;

    if (!Number.isFinite(commentId) || commentId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }
    if (text === undefined) {
      return reply.code(400).send({ error: 'Текст комментария не указан' });
    }
    if (text.length === 0) {
      return reply.code(400).send({ error: 'Текст комментария не может быть пустым' });
    }
    if (text.length > 5000) {
      return reply.code(400).send({ error: 'Текст комментария слишком длинный (максимум 5000 символов)' });
    }

    // Проверяем, что комментарий существует, принадлежит пользователю, а файл — его команде
    const commentCheck = await pool.query(
      `SELECT ac.id, ac.user_id, ac.asset_id, a.team_id
       FROM asset_comments ac
       JOIN assets a ON a.id = ac.asset_id
       WHERE ac.id = $1 AND ac.deleted_at IS NULL`,
      [commentId]
    );
    if (!commentCheck.rows[0]) {
      return reply.code(404).send({ error: 'Комментарий не найден' });
    }

    const comment = commentCheck.rows[0] as any;
    if (Number(comment.user_id) !== userId) {
      return reply.code(403).send({ error: 'Вы можете редактировать только свои комментарии' });
    }
    if (Number(comment.team_id) !== teamId) {
      return reply.code(403).send({ error: 'Доступ запрещён' });
    }

    const { rows } = await pool.query(
      `UPDATE asset_comments
       SET text = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, asset_id, user_id, parent_id, text, created_at, updated_at, deleted_at`,
      [text, commentId]
    );

    const updated = rows[0] as any;
    
    // Загружаем данные пользователя для ответа
    const userRes = await pool.query(
      'SELECT id, email, display_name FROM users WHERE id = $1',
      [userId]
    );
    const user = userRes.rows[0] as any;

    return reply.send({
      id: Number(updated.id),
      assetId: Number(updated.asset_id),
      userId: Number(updated.user_id),
      parentId: updated.parent_id ? Number(updated.parent_id) : null,
      text: String(updated.text),
      createdAt: updated.created_at?.toISOString?.() ?? updated.created_at,
      updatedAt: updated.updated_at?.toISOString?.() ?? updated.updated_at,
      deletedAt: updated.deleted_at ? (updated.deleted_at?.toISOString?.() ?? updated.deleted_at) : null,
      user: {
        id: Number(user.id),
        email: String(user.email),
        displayName: user.display_name ?? null,
      },
    });
  });

  // Удалить комментарий (мягкое удаление, soft delete)
  app.delete('/api/comments/:id', { preHandler: [requireAuth, requireRole(['viewer', 'uploader', 'editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const commentId = Number((req.params as any).id);
    const userId = req.auth!.userId;
    const teamId = req.auth!.teamId;

    if (!Number.isFinite(commentId) || commentId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Проверяем, что комментарий существует, принадлежит пользователю, а файл — его команде
    const commentCheck = await pool.query(
      `SELECT ac.id, ac.user_id, ac.asset_id, a.team_id
       FROM asset_comments ac
       JOIN assets a ON a.id = ac.asset_id
       WHERE ac.id = $1 AND ac.deleted_at IS NULL`,
      [commentId]
    );
    if (!commentCheck.rows[0]) {
      return reply.code(404).send({ error: 'Комментарий не найден' });
    }

    const comment = commentCheck.rows[0] as any;
    if (Number(comment.user_id) !== userId) {
      return reply.code(403).send({ error: 'Вы можете удалять только свои комментарии' });
    }
    if (Number(comment.team_id) !== teamId) {
      return reply.code(403).send({ error: 'Доступ запрещён' });
    }

    await pool.query(
      'UPDATE asset_comments SET deleted_at = NOW() WHERE id = $1',
      [commentId]
    );

    return reply.send({ ok: true });
  });
}

