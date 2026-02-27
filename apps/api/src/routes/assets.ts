import { FastifyInstance } from 'fastify';
import { pool, withTransaction } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';
import { getStorageDir, resolveObjectPath, storeUploadToLocalFs } from '../storage/local';
import { ingestAssetMetadata } from '../ingest/ingestAssetMetadata';
import { createReadStream, promises as fs } from 'fs';
import { logAssetChanges } from '../utils/changeLogger';
import { logEventAsync } from '../utils/eventLogger';
import { validateStatusTransition, canChangeStatus, type AssetStatus } from '../utils/workflow';

export async function registerAssetRoutes(app: FastifyInstance) {
  app.get('/api/assets/:id', { preHandler: requireAuth }, async (req, reply) => {
    try {
    const id = Number((req.params as any).id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: 'Некорректный id' });
      }
    const teamId = req.auth!.teamId;
    const { rows } = await pool.query(
      `SELECT a.*, am.*, ar.*, ab.*,
              af.id AS file_id, af.mime_type AS file_mime_type, af.size_bytes AS file_size_bytes, af.original_name AS file_original_name,
              COALESCE(e.views, 0) AS engagement_views,
              COALESCE(e.saves, 0) AS engagement_saves,
              e.last_viewed_at AS engagement_last_viewed_at,
              e.last_saved_at AS engagement_last_saved_at,
              av.version_number AS current_version_number,
              (SELECT COUNT(*)::bigint FROM asset_versions av2 WHERE av2.asset_id = a.id) AS total_versions,
              ac.distinct_colors, ac.vibrant_rgb, ac.muted_rgb, ac.dark_vibrant_rgb, ac.dark_muted_rgb, ac.light_vibrant_rgb, ac.light_muted_rgb
       FROM assets a
       LEFT JOIN asset_media am ON am.asset_id = a.id
       LEFT JOIN asset_rights ar ON ar.asset_id = a.id
       LEFT JOIN asset_business ab ON ab.asset_id = a.id
       LEFT JOIN asset_versions av ON av.asset_id = a.id AND av.is_current = TRUE
       LEFT JOIN asset_files af ON af.id = av.file_id
       LEFT JOIN engagement e ON e.asset_id = a.id
       LEFT JOIN asset_colors ac ON ac.asset_id = a.id
       WHERE a.id = $1 AND a.team_id = $2 AND a.deleted_at IS NULL
       LIMIT 1`,
      [id, teamId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    const r = rows[0] as any;
    // Фолбэк к первому файлу, если версия ещё не создана (обратная совместимость)
    if (!r.file_id) {
        try {
      const fallback = await pool.query(
        `SELECT af.id AS file_id, af.mime_type AS file_mime_type, af.size_bytes AS file_size_bytes, af.original_name AS file_original_name
         FROM asset_files af
         WHERE af.asset_id = $1
         ORDER BY af.id ASC
         LIMIT 1`,
        [id]
      );
      if (fallback.rows[0]) {
        const f = fallback.rows[0] as any;
        r.file_id = f.file_id;
        r.file_mime_type = f.file_mime_type;
        r.file_size_bytes = f.file_size_bytes;
        r.file_original_name = f.file_original_name;
          }
        } catch (fallbackError: any) {
          app.log.warn('Failed to load fallback file:', fallbackError);
      }
    }
    
    // Загружаем теги
      try {
    const tagsRes = await pool.query(
      `SELECT t.name
       FROM asset_tags at
       JOIN tags t ON t.id = at.tag_id
       WHERE at.asset_id = $1
       ORDER BY t.name`,
      [id]
    );
    r.tags = tagsRes.rows.map((row: any) => String(row.name));
      } catch (tagsError: any) {
        app.log.warn('Failed to load tags:', tagsError);
        r.tags = [];
      }
    
    return reply.send(r);
    } catch (error: any) {
      app.log.error('Error in GET /api/assets/:id:', error);
      // Обрабатываем специфичные ошибки базы данных
      if (error?.code === '42P01') {
        return reply.code(500).send({ error: 'Таблица не найдена в базе данных. Возможно, миграции не применены.' });
      }
      if (error?.code === '42P02') {
        return reply.code(500).send({ error: 'Колонка не найдена в базе данных. Возможно, миграции не применены.' });
      }
      return reply.code(500).send({ error: `Внутренняя ошибка сервера: ${error?.message || 'Неизвестная ошибка'}` });
    }
  });

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

  app.patch('/api/assets/:id', { preHandler: [requireAuth, requireRole(['editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;
    const body = (req.body ?? {}) as any;

    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });

    // Валидируем и парсим поля из тела запроса
    const title = body.title !== undefined ? (body.title == null ? null : String(body.title).trim() || null) : undefined;
    const description = body.description !== undefined ? (body.description == null ? null : String(body.description).trim() || null) : undefined;
    const status = body.status !== undefined ? body.status : undefined;
    const visibility = body.visibility !== undefined ? body.visibility : undefined;
    const rating = body.rating !== undefined ? (body.rating == null ? null : Number(body.rating)) : undefined;
    const keywords = body.keywords !== undefined ? body.keywords : undefined;
    const language = body.language !== undefined ? (body.language == null ? null : String(body.language).trim() || null) : undefined;
    const capturedAt = body.captured_at !== undefined ? (body.captured_at == null ? null : body.captured_at) : undefined;
    const folderId = body.folderId !== undefined ? (body.folderId == null || body.folderId === '' ? null : Number(body.folderId)) : undefined;
    
    // Бизнес‑метаданные
    const campaign = body.campaign !== undefined ? (body.campaign == null ? null : String(body.campaign).trim() || null) : undefined;
    const channel = body.channel !== undefined ? (body.channel == null ? null : String(body.channel).trim() || null) : undefined;
    const brand = body.brand !== undefined ? (body.brand == null ? null : String(body.brand).trim() || null) : undefined;
    const region = body.region !== undefined ? (body.region == null ? null : String(body.region).trim() || null) : undefined;
    
    // Метаданные прав и ограничений
    const copyrightHolder = body.copyright_holder !== undefined ? (body.copyright_holder == null ? null : String(body.copyright_holder).trim() || null) : undefined;
    const usageRights = body.usage_rights !== undefined ? (body.usage_rights == null ? null : String(body.usage_rights).trim() || null) : undefined;
    const expiresAt = body.expires_at !== undefined ? (body.expires_at == null ? null : body.expires_at) : undefined;
    
    // Теги
    const tags = body.tags !== undefined ? body.tags : undefined;

    // Валидация входных данных
    if (title !== undefined && title !== null && !title) {
      return reply.code(400).send({ error: 'Название не может быть пустым' });
    }
    if (status !== undefined && !['draft', 'review', 'approved', 'rejected'].includes(status)) {
      return reply.code(400).send({ error: 'Некорректный статус' });
    }
    if (visibility !== undefined && !['private', 'team', 'public'].includes(visibility)) {
      return reply.code(400).send({ error: 'Некорректная видимость' });
    }
    if (rating !== undefined && rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      return reply.code(400).send({ error: 'Рейтинг должен быть от 0 до 5' });
    }
    if (keywords !== undefined && !Array.isArray(keywords)) {
      return reply.code(400).send({ error: 'Keywords должен быть массивом строк' });
    }
    if (keywords !== undefined && keywords.some((k: any) => typeof k !== 'string')) {
      return reply.code(400).send({ error: 'Все элементы keywords должны быть строками' });
    }
    if (capturedAt !== undefined && capturedAt !== null) {
      const capturedDate = new Date(capturedAt);
      if (isNaN(capturedDate.getTime())) {
        return reply.code(400).send({ error: 'Некорректная дата captured_at' });
      }
    }
    if (expiresAt !== undefined && expiresAt !== null) {
      const expiresDate = new Date(expiresAt);
      if (isNaN(expiresDate.getTime())) {
        return reply.code(400).send({ error: 'Некорректная дата expires_at' });
      }
    }
    if (folderId !== undefined && folderId !== null && (!Number.isFinite(folderId) || folderId <= 0)) {
      return reply.code(400).send({ error: 'Некорректная папка (folderId)' });
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      return reply.code(400).send({ error: 'Tags должен быть массивом строк' });
    }
    if (tags !== undefined && tags.some((t: any) => typeof t !== 'string')) {
      return reply.code(400).send({ error: 'Все элементы tags должны быть строками' });
    }

    // Если указана папка — проверяем, что она существует
    if (folderId !== undefined && folderId !== null) {
      const p = await pool.query(
        'SELECT id FROM folders WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
        [folderId, teamId]
      );
      if (!p.rows[0]) return reply.code(404).send({ error: 'Папка не найдена' });
    }

    // Get current values before update for change logging
    const currentRes = await pool.query(
      `SELECT a.*, ab.*, ar.*
       FROM assets a
       LEFT JOIN asset_business ab ON ab.asset_id = a.id
       LEFT JOIN asset_rights ar ON ar.asset_id = a.id
       WHERE a.id = $1 AND a.team_id = $2 AND a.deleted_at IS NULL`,
      [id, teamId]
    );
    if (!currentRes.rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    const current = currentRes.rows[0] as any;

    // Используем транзакцию, чтобы изменения были атомарными
    await withTransaction(async (client) => {
      // Обновляем запись в таблице assets
      const assetUpdates: string[] = [];
      const assetParams: any[] = [id, teamId];
      
      if (title !== undefined) {
        assetParams.push(title);
        assetUpdates.push(`title = $${assetParams.length}`);
      }
      if (description !== undefined) {
        assetParams.push(description);
        assetUpdates.push(`description = $${assetParams.length}`);
      }
      if (status !== undefined) {
        assetParams.push(status);
        assetUpdates.push(`status = $${assetParams.length}`);
      }
      if (visibility !== undefined) {
        assetParams.push(visibility);
        assetUpdates.push(`visibility = $${assetParams.length}`);
      }
      if (rating !== undefined) {
        assetParams.push(rating);
        assetUpdates.push(`rating = $${assetParams.length}`);
      }
      if (keywords !== undefined) {
        assetParams.push(keywords);
        assetUpdates.push(`keywords = $${assetParams.length}`);
      }
      if (language !== undefined) {
        assetParams.push(language);
        assetUpdates.push(`language = $${assetParams.length}`);
      }
      if (capturedAt !== undefined) {
        assetParams.push(capturedAt ? new Date(capturedAt).toISOString() : null);
        assetUpdates.push(`captured_at = $${assetParams.length}`);
      }
      if (folderId !== undefined) {
        assetParams.push(folderId);
        assetUpdates.push(`folder_id = $${assetParams.length}`);
      }

      if (assetUpdates.length > 0) {
        assetUpdates.push('updated_at = NOW()');
        await client.query(
          `UPDATE assets
           SET ${assetUpdates.join(', ')}
           WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
          assetParams
        );
      }

      // Обновляем или создаём запись в asset_business
      // Важно: asset_business.language — отдельное поле, не связанное напрямую с assets.language
      const businessLanguage = body.business_language !== undefined ? (body.business_language == null ? null : String(body.business_language).trim() || null) : undefined;
      
      if (campaign !== undefined || channel !== undefined || brand !== undefined || region !== undefined || businessLanguage !== undefined) {
        const businessParams: any[] = [id];
        const businessFields: string[] = [];
        const businessFieldNames: string[] = [];
        let paramIndex = 2;

        if (campaign !== undefined) {
          businessParams.push(campaign);
          businessFields.push(`campaign = $${paramIndex}`);
          businessFieldNames.push('campaign');
          paramIndex++;
        }
        if (channel !== undefined) {
          businessParams.push(channel);
          businessFields.push(`channel = $${paramIndex}`);
          businessFieldNames.push('channel');
          paramIndex++;
        }
        if (brand !== undefined) {
          businessParams.push(brand);
          businessFields.push(`brand = $${paramIndex}`);
          businessFieldNames.push('brand');
          paramIndex++;
        }
        if (region !== undefined) {
          businessParams.push(region);
          businessFields.push(`region = $${paramIndex}`);
          businessFieldNames.push('region');
          paramIndex++;
        }
        if (businessLanguage !== undefined) {
          businessParams.push(businessLanguage);
          businessFields.push(`language = $${paramIndex}`);
          businessFieldNames.push('language');
          paramIndex++;
        }

        if (businessFields.length > 0) {
          await client.query(
            `INSERT INTO asset_business (asset_id, ${businessFieldNames.join(', ')})
             VALUES ($1, ${businessParams.slice(1).map((_, i) => `$${i + 2}`).join(', ')})
             ON CONFLICT (asset_id) DO UPDATE SET ${businessFields.join(', ')}`,
            businessParams
          );
        }
      }

      // Обновляем или создаём запись в asset_rights
      // Важно: API использует поля usage_rights и expires_at, в БД им соответствуют usage_terms и embargo_until
      if (copyrightHolder !== undefined || usageRights !== undefined || expiresAt !== undefined) {
        const rightsParams: any[] = [id];
        const rightsFields: string[] = [];
        const rightsFieldNames: string[] = [];
        let paramIndex = 2;

        if (copyrightHolder !== undefined) {
          rightsParams.push(copyrightHolder);
          rightsFields.push(`copyright_holder = $${paramIndex}`);
          rightsFieldNames.push('copyright_holder');
          paramIndex++;
        }
        if (usageRights !== undefined) {
          rightsParams.push(usageRights);
          rightsFields.push(`usage_terms = $${paramIndex}`);
          rightsFieldNames.push('usage_terms');
          paramIndex++;
        }
        if (expiresAt !== undefined) {
          rightsParams.push(expiresAt ? new Date(expiresAt).toISOString() : null);
          rightsFields.push(`embargo_until = $${paramIndex}`);
          rightsFieldNames.push('embargo_until');
          paramIndex++;
        }

        if (rightsFields.length > 0) {
          await client.query(
            `INSERT INTO asset_rights (asset_id, ${rightsFieldNames.join(', ')})
             VALUES ($1, ${rightsParams.slice(1).map((_, i) => `$${i + 2}`).join(', ')})
             ON CONFLICT (asset_id) DO UPDATE SET ${rightsFields.join(', ')}`,
            rightsParams
          );
        }
      }

      // Обновляем теги, если они переданы
      if (tags !== undefined) {
        // Получаем текущие теги
        const currentTagsRes = await client.query(
          `SELECT t.id, t.name
           FROM asset_tags at
           JOIN tags t ON t.id = at.tag_id
           WHERE at.asset_id = $1`,
          [id]
        );
        const currentTagNames = new Set<string>(currentTagsRes.rows.map((r: any) => String(r.name).toLowerCase()));
        const newTagNames = new Set<string>(tags.map((t: string) => t.trim().toLowerCase()).filter((t: string) => t));

        // Удаляем теги, которых нет в новом списке
        const tagsToRemove = Array.from(currentTagNames).filter((t: string) => !newTagNames.has(t));
        if (tagsToRemove.length > 0) {
          await client.query(
            `DELETE FROM asset_tags
             WHERE asset_id = $1
               AND tag_id IN (
                 SELECT id FROM tags
                 WHERE team_id = $2
                   AND LOWER(name) = ANY($3::text[])
               )`,
            [id, teamId, tagsToRemove]
          );
        }

        // Добавляем новые теги
        const tagsToAdd = Array.from(newTagNames).filter((t: string) => !currentTagNames.has(t));
        for (const tagName of tagsToAdd) {
          // Создаём тег, если он ещё не существует
          const tagRes = await client.query(
            `INSERT INTO tags (team_id, name)
             VALUES ($1, $2)
             ON CONFLICT (team_id, name) DO UPDATE SET name = tags.name
             RETURNING id`,
            [teamId, tagName]
          );
          const tagId = tagRes.rows[0].id;

          // Создаём связь asset_tag
          await client.query(
            `INSERT INTO asset_tags (asset_id, tag_id)
             VALUES ($1, $2)
             ON CONFLICT (asset_id, tag_id) DO NOTHING`,
            [id, tagId]
          );
        }
      }
    });

    // Получаем обновлённые данные актива
    const updatedRes = await pool.query(
      `SELECT a.*, ab.*, ar.*
       FROM assets a
       LEFT JOIN asset_business ab ON ab.asset_id = a.id
       LEFT JOIN asset_rights ar ON ar.asset_id = a.id
       WHERE a.id = $1 AND a.team_id = $2 AND a.deleted_at IS NULL`,
      [id, teamId]
    );
    if (!updatedRes.rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    const updated = updatedRes.rows[0] as any;

    // Асинхронно формируем и сохраняем логи изменений
    const changesToLog: Array<{
      assetId: number;
      userId: number;
      changeType: 'metadata' | 'folder' | 'tags';
      fieldName: string;
      oldValue: any;
      newValue: any;
    }> = [];

    // Сравниваем и логируем изменения полей актива
    if (title !== undefined && title !== current.title) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'title',
        oldValue: current.title,
        newValue: title,
      });
    }
    if (description !== undefined && description !== current.description) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'description',
        oldValue: current.description,
        newValue: description,
      });
    }
    if (status !== undefined && status !== current.status) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'status',
        oldValue: current.status,
        newValue: status,
      });
    }
    if (visibility !== undefined && visibility !== current.visibility) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'visibility',
        oldValue: current.visibility,
        newValue: visibility,
      });
    }
    if (rating !== undefined && rating !== current.rating) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'rating',
        oldValue: current.rating,
        newValue: rating,
      });
    }
    if (keywords !== undefined && JSON.stringify(keywords) !== JSON.stringify(current.keywords || [])) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'keywords',
        oldValue: current.keywords || [],
        newValue: keywords,
      });
    }
    if (language !== undefined && language !== current.language) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'language',
        oldValue: current.language,
        newValue: language,
      });
    }
    if (capturedAt !== undefined) {
      const oldCaptured = current.captured_at ? new Date(current.captured_at).toISOString() : null;
      const newCaptured = capturedAt ? new Date(capturedAt).toISOString() : null;
      if (oldCaptured !== newCaptured) {
        changesToLog.push({
          assetId: id,
          userId,
          changeType: 'metadata',
          fieldName: 'captured_at',
          oldValue: oldCaptured,
          newValue: newCaptured,
        });
      }
    }
    if (folderId !== undefined) {
      const newFolderId = folderId === null ? null : Number(folderId);
      const oldFolderId = current.folder_id === null ? null : Number(current.folder_id);
      if (newFolderId !== oldFolderId) {
        changesToLog.push({
          assetId: id,
          userId,
          changeType: 'folder',
          fieldName: 'folder_id',
          oldValue: oldFolderId,
          newValue: newFolderId,
        });
      }
    }

    // Сравниваем и логируем изменения бизнес‑полей
    if (campaign !== undefined && campaign !== (current.campaign || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'campaign',
        oldValue: current.campaign || null,
        newValue: campaign,
      });
    }
    if (channel !== undefined && channel !== (current.channel || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'channel',
        oldValue: current.channel || null,
        newValue: channel,
      });
    }
    if (brand !== undefined && brand !== (current.brand || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'brand',
        oldValue: current.brand || null,
        newValue: brand,
      });
    }
    if (region !== undefined && region !== (current.region || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'region',
        oldValue: current.region || null,
        newValue: region,
      });
    }

    // Сравниваем и логируем изменения полей прав
    if (copyrightHolder !== undefined && copyrightHolder !== (current.copyright_holder || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'copyright_holder',
        oldValue: current.copyright_holder || null,
        newValue: copyrightHolder,
      });
    }
    if (usageRights !== undefined && usageRights !== (current.usage_terms || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'usage_rights',
        oldValue: current.usage_terms || null,
        newValue: usageRights,
      });
    }
    if (expiresAt !== undefined) {
      const oldExpires = current.embargo_until ? new Date(current.embargo_until).toISOString() : null;
      const newExpires = expiresAt ? new Date(expiresAt).toISOString() : null;
      if (oldExpires !== newExpires) {
        changesToLog.push({
          assetId: id,
          userId,
          changeType: 'metadata',
          fieldName: 'expires_at',
          oldValue: oldExpires,
          newValue: newExpires,
        });
      }
    }
    
    // Сравниваем и логируем бизнес‑язык, если он был передан
    const businessLanguage = body.business_language !== undefined ? (body.business_language == null ? null : String(body.business_language).trim() || null) : undefined;
    if (businessLanguage !== undefined && businessLanguage !== (current.language || null)) {
      changesToLog.push({
        assetId: id,
        userId,
        changeType: 'metadata',
        fieldName: 'business_language',
        oldValue: current.language || null,
        newValue: businessLanguage,
      });
    }

    // Логируем изменения списка тегов
    if (tags !== undefined) {
      const currentTagsRes = await pool.query(
        `SELECT t.name
         FROM asset_tags at
         JOIN tags t ON t.id = at.tag_id
         WHERE at.asset_id = $1
         ORDER BY t.name`,
        [id]
      );
      const currentTagNames = currentTagsRes.rows.map((r: any) => String(r.name)).sort();
      const newTagNames = tags.map((t: string) => t.trim()).filter((t: string) => t).sort();
      if (JSON.stringify(currentTagNames) !== JSON.stringify(newTagNames)) {
        changesToLog.push({
          assetId: id,
          userId,
          changeType: 'tags',
          fieldName: 'tags',
          oldValue: currentTagNames,
          newValue: newTagNames,
        });
      }
    }

    // Асинхронно отправляем логи изменений
    if (changesToLog.length > 0) {
      void logAssetChanges(changesToLog).catch((e) => app.log.warn('Failed to log asset changes:', e));
    }

    // Логируем событие редактирования
    if (changesToLog.length > 0) {
      const fieldsChanged = changesToLog.map((c) => c.fieldName);
      logEventAsync({
        teamId,
        userId,
        assetId: id,
        eventType: 'edit',
        metadata: {
          assetId: id,
          fields: fieldsChanged,
        },
      });
    }

    return reply.send({ ok: true, asset: updated });
  });

  app.delete('/api/assets/:id', { preHandler: [requireAuth, requireRole(['moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Некорректный id' });
    const { rowCount } = await pool.query(
      `UPDATE assets
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
      [id, teamId]
    );
    if (!rowCount) return reply.code(404).send({ error: 'Не найдено' });

    // Log delete event
    logEventAsync({
      teamId,
      userId,
      assetId: id,
      eventType: 'delete',
      metadata: {
        assetId: id,
      },
    });

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

  // Versions endpoints
  app.post('/api/assets/:id/versions', { preHandler: [requireAuth, requireRole(['editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Check asset exists and belongs to team
    const assetCheck = await pool.query(
      'SELECT id, type FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    const mp: any = (req as any);
    if (typeof mp.parts !== 'function') {
      return reply.code(500).send({ error: 'Загрузка файлов не настроена (multipart)' });
    }

    let description: string | null = null;
    let filePart: any = null;

    // Parse multipart data
    for await (const part of mp.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'description') {
          description = String(part.value ?? '').trim() || null;
        }
        continue;
      }
      if (part.type === 'file') {
        if (filePart) {
          return reply.code(400).send({ error: 'Можно загрузить только один файл' });
        }
        filePart = part;
      }
    }

    if (!filePart) {
      return reply.code(400).send({ error: 'Файл не предоставлен' });
    }

    const originalName = (filePart.filename || 'file').replace(/[\\/\0]/g, '_').slice(0, 180) || 'file';
    const mimeType = String(filePart.mimetype || 'application/octet-stream');

    // Store file
    let stored: { objectKey: string; absolutePath: string; sizeBytes: number; sha256: string } | null = null;
    try {
      stored = await storeUploadToLocalFs({
        teamId,
        originalName,
        stream: filePart.file,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: `Не удалось сохранить файл: ${e?.message ?? String(e)}` });
    }

    try {
      const result = await withTransaction(async (client) => {
        // Get next version number
        const versionRes = await client.query<{ max_version: number | null }>(
          'SELECT MAX(version_number) AS max_version FROM asset_versions WHERE asset_id = $1',
          [assetId]
        );
        const nextVersion = (versionRes.rows[0]?.max_version ?? 0) + 1;

        // Create asset_file
        const fileRes = await client.query<{ id: number }>(
          `INSERT INTO asset_files (asset_id, storage_provider, bucket, object_key, size_bytes, mime_type, sha256, checksum_verified, original_name)
           VALUES ($1,'local','local',$2,$3,$4,$5,TRUE,$6)
           RETURNING id`,
          [assetId, stored.objectKey, stored.sizeBytes, mimeType, stored.sha256, originalName]
        );
        const fileId = Number(fileRes.rows[0].id);

        // Create version (trigger will automatically unset is_current on other versions)
        const versionRes2 = await client.query<{ id: number; version_number: number; created_at: Date }>(
          `INSERT INTO asset_versions (asset_id, file_id, version_number, description, created_by, is_current)
           VALUES ($1,$2,$3,$4,$5,TRUE)
           RETURNING id, version_number, created_at`,
          [assetId, fileId, nextVersion, description, userId]
        );

        return {
          versionId: Number(versionRes2.rows[0].id),
          versionNumber: Number(versionRes2.rows[0].version_number),
          fileId,
          createdAt: versionRes2.rows[0].created_at,
        };
      });

      // Ingest metadata asynchronously
      void ingestAssetMetadata(assetId, stored.absolutePath).catch((e) => app.log.warn(e));

      // Log version_create event
      logEventAsync({
        teamId,
        userId,
        assetId,
        eventType: 'version_create',
        metadata: {
          assetId,
          versionNumber: result.versionNumber,
          versionId: result.versionId,
          fileId: result.fileId,
        },
      });

      return reply.send({
        id: result.versionId,
        assetId,
        fileId: result.fileId,
        versionNumber: result.versionNumber,
        description,
        createdAt: result.createdAt.toISOString(),
        isCurrent: true,
      });
    } catch (e: any) {
      // Cleanup file on error
      try {
        await fs.unlink(stored.absolutePath);
      } catch {}
      if (String(e?.code) === '23505') {
        return reply.code(409).send({ error: 'Версия с таким номером уже существует' });
      }
      throw e;
    }
  });

  app.get('/api/assets/:id/versions', { preHandler: requireAuth }, async (req, reply) => {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Check asset exists and belongs to team
    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    const { rows } = await pool.query(
      `SELECT
         av.id, av.version_number, av.description, av.created_at, av.is_current,
         af.id AS file_id, af.size_bytes AS file_size_bytes, af.mime_type AS file_mime_type, af.original_name AS file_original_name,
         u.id AS created_by_id, u.email AS created_by_email, u.display_name AS created_by_display_name
       FROM asset_versions av
       JOIN asset_files af ON af.id = av.file_id
       LEFT JOIN users u ON u.id = av.created_by
       WHERE av.asset_id = $1
       ORDER BY av.version_number DESC`,
      [assetId]
    );

    const versions = rows.map((r: any) => ({
      id: Number(r.id),
      assetId,
      fileId: Number(r.file_id),
      versionNumber: Number(r.version_number),
      description: r.description ?? null,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      isCurrent: Boolean(r.is_current),
      createdBy: r.created_by_id ? {
        id: Number(r.created_by_id),
        email: String(r.created_by_email),
        displayName: r.created_by_display_name ?? null,
      } : null,
      file: {
        id: Number(r.file_id),
        sizeBytes: Number(r.file_size_bytes),
        mimeType: String(r.file_mime_type),
        originalName: String(r.file_original_name ?? 'file'),
      },
    }));

    return reply.send({ items: versions });
  });

  app.post('/api/assets/:id/versions/:versionId/restore', { preHandler: [requireAuth, requireRole(['editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const assetId = Number((req.params as any).id);
    const versionId = Number((req.params as any).versionId);
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;

    if (!Number.isFinite(assetId) || assetId <= 0 || !Number.isFinite(versionId) || versionId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Check asset exists and belongs to team
    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    // Get version and its file
    const versionCheck = await pool.query(
      `SELECT av.id, av.version_number, av.file_id, af.object_key, af.mime_type, af.size_bytes, af.sha256, af.original_name
       FROM asset_versions av
       JOIN asset_files af ON af.id = av.file_id
       WHERE av.id = $1 AND av.asset_id = $2`,
      [versionId, assetId]
    );
    if (!versionCheck.rows[0]) {
      return reply.code(404).send({ error: 'Версия не найдена' });
    }

    const v = versionCheck.rows[0] as any;
    const sourceFileId = Number(v.file_id);
    const sourceVersionNumber = Number(v.version_number);

    // Copy the file (create new asset_file pointing to same physical file)
    // For simplicity, we'll create a new asset_file entry but reuse the same object_key
    // In a production system, you might want to actually copy the file
    try {
      const result = await withTransaction(async (client) => {
        // Get next version number
        const versionRes = await client.query<{ max_version: number | null }>(
          'SELECT MAX(version_number) AS max_version FROM asset_versions WHERE asset_id = $1',
          [assetId]
        );
        const nextVersion = (versionRes.rows[0]?.max_version ?? 0) + 1;

        // Create new asset_file (reusing same file on disk)
        const fileRes = await client.query<{ id: number }>(
          `INSERT INTO asset_files (asset_id, storage_provider, bucket, object_key, size_bytes, mime_type, sha256, checksum_verified, original_name)
           VALUES ($1,'local','local',$2,$3,$4,$5,TRUE,$6)
           RETURNING id`,
          [assetId, v.object_key, Number(v.size_bytes), String(v.mime_type), v.sha256, String(v.original_name)]
        );
        const newFileId = Number(fileRes.rows[0].id);

        // Create version
        const versionRes2 = await client.query<{ id: number; version_number: number; created_at: Date }>(
          `INSERT INTO asset_versions (asset_id, file_id, version_number, description, created_by, is_current)
           VALUES ($1,$2,$3,$4,$5,TRUE)
           RETURNING id, version_number, created_at`,
          [assetId, newFileId, nextVersion, `Восстановлена версия ${sourceVersionNumber}`, userId]
        );

        return {
          versionId: Number(versionRes2.rows[0].id),
          versionNumber: Number(versionRes2.rows[0].version_number),
          fileId: newFileId,
          createdAt: versionRes2.rows[0].created_at,
        };
      });

      return reply.send({
        id: result.versionId,
        assetId,
        fileId: result.fileId,
        versionNumber: result.versionNumber,
        description: `Восстановлена версия ${versionId}`,
        createdAt: result.createdAt.toISOString(),
        isCurrent: true,
      });
    } catch (e: any) {
      if (String(e?.code) === '23505') {
        return reply.code(409).send({ error: 'Версия с таким номером уже существует' });
      }
      throw e;
    }
  });

  // Change asset status
  app.post('/api/assets/:id/status', { preHandler: [requireAuth, requireRole(['moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;
    const body = (req.body ?? {}) as any;
    const newStatus = body.status as string;
    const comment = body.comment as string | undefined;

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    const validStatuses: AssetStatus[] = ['draft', 'review', 'approved', 'rejected'];
    if (!validStatuses.includes(newStatus as AssetStatus)) {
      return reply.code(400).send({ error: 'Некорректный статус' });
    }

    // Get current asset status
    const assetRes = await pool.query<{ status: AssetStatus }>(
      'SELECT status FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );

    if (!assetRes.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    const oldStatus = assetRes.rows[0].status;

    // Validate status transition
    if (!validateStatusTransition(oldStatus, newStatus as AssetStatus)) {
      return reply.code(400).send({ error: 'Недопустимый переход статуса' });
    }

    // Check if status can be changed
    if (!canChangeStatus(oldStatus)) {
      return reply.code(400).send({ error: 'Статус нельзя изменить' });
    }

    // Update status in transaction
    await withTransaction(async (client) => {
      // Update asset status
      await client.query(
        `UPDATE assets
         SET status = $1, status_changed_at = NOW(), status_changed_by = $2, updated_at = NOW()
         WHERE id = $3`,
        [newStatus, userId, assetId]
      );

      // Record in status history
      await client.query(
        `INSERT INTO asset_status_history (asset_id, old_status, new_status, changed_by, comment)
         VALUES ($1, $2, $3, $4, $5)`,
        [assetId, oldStatus, newStatus, userId, comment || null]
      );

      // Log in asset_changes
      await logAssetChanges([{
        assetId,
        userId,
        changeType: 'status',
        fieldName: 'status',
        oldValue: oldStatus,
        newValue: newStatus,
      }]);

      // Log event
      logEventAsync({
        teamId,
        userId,
        assetId,
        eventType: 'status_change',
        metadata: {
          assetId,
          oldStatus,
          newStatus,
          comment: comment || null,
        },
      });
    });

    return reply.send({
      id: assetId,
      status: newStatus,
      oldStatus,
      changedAt: new Date().toISOString(),
    });
  });

  // Get status history
  app.get('/api/assets/:id/status-history', { preHandler: [requireAuth, requireRole(['viewer', 'uploader', 'editor', 'moderator', 'admin', 'analyst', 'owner'])], }, async (req, reply) => {
    try {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Check asset exists and belongs to team
    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    const { rows } = await pool.query(
      `SELECT
         ash.id, ash.old_status, ash.new_status, ash.changed_at, ash.comment,
         u.id AS user_id, u.email AS user_email, u.display_name AS user_display_name
       FROM asset_status_history ash
       LEFT JOIN users u ON u.id = ash.changed_by
       WHERE ash.asset_id = $1
       ORDER BY ash.changed_at DESC`,
      [assetId]
    );

    const history = rows.map((r: any) => ({
      id: Number(r.id),
      assetId,
      oldStatus: r.old_status ? String(r.old_status) : null,
      newStatus: String(r.new_status),
      changedAt: r.changed_at?.toISOString?.() ?? r.changed_at,
      comment: r.comment ?? null,
      user: r.user_id ? {
        id: Number(r.user_id),
        email: String(r.user_email),
        displayName: r.user_display_name ?? null,
      } : null,
    }));

    return reply.send({ items: history });
    } catch (error: any) {
      app.log.error('Error in GET /api/assets/:id/status-history:', error);
      // Check for specific database errors
      if (error?.code === '42P01') {
        return reply.code(500).send({ error: 'Таблица asset_status_history не найдена в базе данных. Возможно, миграции не применены.' });
      }
      if (error?.code === '42P02') {
        return reply.code(500).send({ error: 'Колонка не найдена в базе данных. Возможно, миграции не применены.' });
      }
      return reply.code(500).send({ error: `Внутренняя ошибка сервера: ${error?.message || 'Неизвестная ошибка'}` });
    }
  });

  // Changes history endpoint
  app.get('/api/assets/:id/changes', { preHandler: requireAuth }, async (req, reply) => {
    const assetId = Number((req.params as any).id);
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;
    const changeType = q.changeType as string | undefined;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));

    if (!Number.isFinite(assetId) || assetId <= 0) {
      return reply.code(400).send({ error: 'Некорректный id' });
    }

    // Check asset exists and belongs to team
    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL',
      [assetId, teamId]
    );
    if (!assetCheck.rows[0]) {
      return reply.code(404).send({ error: 'Asset не найден' });
    }

    // Build query with optional filter
    let whereClause = 'WHERE ac.asset_id = $1';
    const params: any[] = [assetId];
    if (changeType && ['metadata', 'status', 'tags', 'folder'].includes(changeType)) {
      params.push(changeType);
      whereClause += ` AND ac.change_type = $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT
         ac.id, ac.changed_at, ac.change_type, ac.field_name, ac.old_value, ac.new_value,
         u.id AS user_id, u.email AS user_email, u.display_name AS user_display_name
       FROM asset_changes ac
       LEFT JOIN users u ON u.id = ac.user_id
       ${whereClause}
       ORDER BY ac.changed_at DESC
       LIMIT $${params.length}`,
      params
    );

    const changes = rows.map((r: any) => {
      // Parse JSONB values
      let oldValue: any = null;
      let newValue: any = null;
      try {
        oldValue = r.old_value != null ? (typeof r.old_value === 'string' ? JSON.parse(r.old_value) : r.old_value) : null;
      } catch {
        oldValue = r.old_value;
      }
      try {
        newValue = r.new_value != null ? (typeof r.new_value === 'string' ? JSON.parse(r.new_value) : r.new_value) : null;
      } catch {
        newValue = r.new_value;
      }

      return {
        id: Number(r.id),
        assetId,
        changedAt: r.changed_at?.toISOString?.() ?? r.changed_at,
        changeType: String(r.change_type),
        fieldName: String(r.field_name),
        oldValue,
        newValue,
        user: r.user_id ? {
          id: Number(r.user_id),
          email: String(r.user_email),
          displayName: r.user_display_name ?? null,
        } : null,
      };
    });

    return reply.send({ items: changes });
  });
}




