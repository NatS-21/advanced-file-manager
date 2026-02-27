import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';
import { generateCSV } from '../utils/csvExport';

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  // Простые диапазоны для числовых медиа-полей, используются в UI фильтров
  app.get('/api/analytics/ranges', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;

    const { rows } = await pool.query(
      `SELECT
         MIN(am.width)        AS width_min,
         MAX(am.width)        AS width_max,
         MIN(am.height)       AS height_min,
         MAX(am.height)       AS height_max,
         MIN(am.duration_sec) AS duration_min,
         MAX(am.duration_sec) AS duration_max,
         MIN(am.fps)          AS fps_min,
         MAX(am.fps)          AS fps_max,
         MIN(af.size_bytes)   AS size_min,
         MAX(af.size_bytes)   AS size_max
       FROM assets a
       LEFT JOIN asset_media am ON am.asset_id = a.id
       LEFT JOIN asset_files af ON af.asset_id = a.id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL`,
      [teamId]
    );

    const r = rows[0] || {};

    return reply.send({
      media: {
        width:  { min: r.width_min  != null ? Number(r.width_min)  : null, max: r.width_max  != null ? Number(r.width_max)  : null },
        height: { min: r.height_min != null ? Number(r.height_min) : null, max: r.height_max != null ? Number(r.height_max) : null },
        durationSec: { min: r.duration_min != null ? Number(r.duration_min) : null, max: r.duration_max != null ? Number(r.duration_max) : null },
        fps: { min: r.fps_min != null ? Number(r.fps_min) : null, max: r.fps_max != null ? Number(r.fps_max) : null },
      },
      files: {
        sizeBytes: { min: r.size_min != null ? Number(r.size_min) : null, max: r.size_max != null ? Number(r.size_max) : null },
      },
    });
  });

  app.get('/api/analytics/overview', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;

    const totalsRes = await pool.query(
      `SELECT
         COUNT(*)::bigint AS files,
         COALESCE(SUM(af.size_bytes), 0)::bigint AS size_bytes
       FROM assets a
       LEFT JOIN asset_files af ON af.asset_id = a.id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL`,
      [teamId]
    );

    const byTypeRes = await pool.query(
      `SELECT
         a.type,
         COUNT(*)::bigint AS count,
         COALESCE(SUM(af.size_bytes), 0)::bigint AS size_bytes
       FROM assets a
       LEFT JOIN asset_files af ON af.asset_id = a.id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL
       GROUP BY a.type
       ORDER BY count DESC`,
      [teamId]
    );

    const topTagsRes = await pool.query(
      `SELECT t.name AS tag, COUNT(*)::bigint AS count
       FROM asset_tags at
       JOIN tags t ON t.id = at.tag_id
       JOIN assets a ON a.id = at.asset_id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL
       GROUP BY t.name
       ORDER BY count DESC
       LIMIT 20`,
      [teamId]
    );

    const topViewedRes = await pool.query(
      `SELECT a.id, a.title, e.views, e.saves
       FROM engagement e
       JOIN assets a ON a.id = e.asset_id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL
       ORDER BY e.views DESC NULLS LAST
       LIMIT 20`,
      [teamId]
    );

    return reply.send({
      totals: {
        files: Number(totalsRes.rows[0]?.files ?? 0),
        sizeBytes: Number(totalsRes.rows[0]?.size_bytes ?? 0),
      },
      byType: byTypeRes.rows.map((r: any) => ({
        type: r.type,
        count: Number(r.count),
        sizeBytes: Number(r.size_bytes),
      })),
      topTags: topTagsRes.rows.map((r: any) => ({ tag: String(r.tag), count: Number(r.count) })),
      topViewed: topViewedRes.rows.map((r: any) => ({
        id: Number(r.id),
        title: r.title ?? null,
        views: Number(r.views ?? 0),
        saves: Number(r.saves ?? 0),
      })),
    });
  });

  // Аналитика по событиям
  app.get('/api/analytics/events', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;

    const where: string[] = ['e.team_id = $1'];
    const params: any[] = [teamId];

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`e.created_at >= $${params.length}`);
        }
      } catch {
        // Некорректная дата — пропускаем фильтр по началу периода
      }
    }

    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          params.push(end.toISOString());
          where.push(`e.created_at <= $${params.length}`);
        }
      } catch {
        // Некорректная дата — пропускаем фильтр по концу периода
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Статистика по событиям по типам
    const byTypeRes = await pool.query(
      `SELECT event_type, COUNT(*)::bigint AS count
       FROM events e
       ${whereClause}
       GROUP BY event_type
       ORDER BY count DESC`,
      params
    );

    // Наиболее активные пользователи
    const topUsersRes = await pool.query(
      `SELECT u.id, u.email, u.display_name, COUNT(*)::bigint AS count
       FROM events e
       JOIN users u ON u.id = e.user_id
       ${whereClause}
       GROUP BY u.id, u.email, u.display_name
       ORDER BY count DESC
       LIMIT 20`,
      params
    );

    // Количество событий по дням (за последние 30 дней)
    const byDayRes = await pool.query(
      `SELECT DATE(e.created_at) AS day, COUNT(*)::bigint AS count
       FROM events e
       ${whereClause}
         AND e.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(e.created_at)
       ORDER BY day DESC`,
      params
    );

    // Наиболее «активные» объекты (с наибольшим числом событий)
    const topAssetsRes = await pool.query(
      `SELECT a.id, a.title, COUNT(*)::bigint AS count
       FROM events e
       JOIN assets a ON a.id = e.asset_id
       ${whereClause}
         AND e.asset_id IS NOT NULL
       GROUP BY a.id, a.title
       ORDER BY count DESC
       LIMIT 20`,
      params
    );

    return reply.send({
      byType: byTypeRes.rows.map((r: any) => ({
        eventType: String(r.event_type),
        count: Number(r.count),
      })),
      topUsers: topUsersRes.rows.map((r: any) => ({
        user: {
          id: Number(r.id),
          email: String(r.email),
          displayName: r.display_name ?? null,
        },
        count: Number(r.count),
      })),
      byDay: byDayRes.rows.map((r: any) => ({
        day: r.day?.toISOString?.() ?? r.day,
        count: Number(r.count),
      })),
      topAssets: topAssetsRes.rows.map((r: any) => ({
        asset: {
          id: Number(r.id),
          title: r.title ?? null,
        },
        count: Number(r.count),
      })),
    });
  });

  // KPI‑метрики
  app.get('/api/analytics/kpi', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    try {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;

    const where: string[] = ['a.team_id = $1', 'a.deleted_at IS NULL'];
    const params: any[] = [teamId];

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`a.created_at >= $${params.length}`);
        }
      } catch {
        // Некорректная дата — пропускаем фильтр по началу периода
      }
    }

    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          params.push(end.toISOString());
          where.push(`a.created_at <= $${params.length}`);
        }
      } catch {
        // Некорректная дата — пропускаем фильтр по концу периода
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      
      // Строим whereClause для подзапросов (без алиаса 'a')
      // В подзапросах без алиаса удаляем префикс 'a.' из выражений
      const whereClauseForSubquery = whereClause.replace(/a\./g, '');

    // Общее количество активов
    const totalAssetsRes = await pool.query(
      `SELECT COUNT(*)::bigint AS count FROM assets a ${whereClause}`,
      params
    );
    const totalAssets = Number(totalAssetsRes.rows[0]?.count ?? 0);

    // Общее количество событий
    const eventsWhere: string[] = ['e.team_id = $1'];
    const eventsParams: any[] = [teamId];
    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          eventsParams.push(start.toISOString());
          eventsWhere.push(`e.created_at >= $${eventsParams.length}`);
        }
      } catch {}
    }
    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          eventsParams.push(end.toISOString());
          eventsWhere.push(`e.created_at <= $${eventsParams.length}`);
        }
      } catch {}
    }
    const eventsWhereClause = eventsWhere.length > 0 ? `WHERE ${eventsWhere.join(' AND ')}` : '';
    const totalEventsRes = await pool.query(
      `SELECT COUNT(*)::bigint AS count FROM events e ${eventsWhereClause}`,
      eventsParams
    );
    const totalEvents = Number(totalEventsRes.rows[0]?.count ?? 0);

    // Медианное время утверждения (от статуса review до approved/rejected)
    // Для каждого актива ищем первый статус review и первое утверждение/отклонение после него
      let medianApprovalTime: number | null = null;
      try {
    const medianApprovalTimeRes = await pool.query(
      `WITH review_statuses AS (
        SELECT DISTINCT ON (asset_id) asset_id, changed_at
        FROM asset_status_history
        WHERE new_status = 'review'
              AND asset_id IN (SELECT id FROM assets ${whereClauseForSubquery})
        ORDER BY asset_id, changed_at DESC
      ),
      approval_statuses AS (
        SELECT DISTINCT ON (asset_id) asset_id, changed_at
        FROM asset_status_history
        WHERE new_status IN ('approved', 'rejected')
              AND asset_id IN (SELECT id FROM assets ${whereClauseForSubquery})
        ORDER BY asset_id, changed_at ASC
      ),
      approval_times AS (
        SELECT 
          r.asset_id,
          EXTRACT(EPOCH FROM (a.changed_at - r.changed_at)) / 3600 AS hours
        FROM review_statuses r
        JOIN approval_statuses a ON a.asset_id = r.asset_id
        WHERE a.changed_at > r.changed_at
      )
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours) AS median_hours
      FROM approval_times
      WHERE hours > 0`,
      params
    );
        medianApprovalTime = medianApprovalTimeRes.rows[0]?.median_hours != null 
      ? Number(medianApprovalTimeRes.rows[0].median_hours) 
      : null;
      } catch (error: any) {
        // Если таблица asset_status_history отсутствует или запрос падает, возвращаем null
        console.error('Error calculating median approval time:', error);
        medianApprovalTime = null;
      }

    // Заполненность обязательных полей (title и description)
    const requiredFieldsRes = await pool.query(
      `SELECT 
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE title IS NOT NULL AND title != '' AND description IS NOT NULL AND description != '')::bigint AS completed
      FROM assets a
      ${whereClause}`,
      params
    );
    const totalWithFields = Number(requiredFieldsRes.rows[0]?.total ?? 0);
    const completedFields = Number(requiredFieldsRes.rows[0]?.completed ?? 0);
    const requiredFieldsCompletion = totalWithFields > 0 
      ? Math.round((completedFields / totalWithFields) * 100) 
      : 0;

    // Количество доработок (переходов rejected → draft)
      let reworkCount = 0;
      try {
    const reworkWhere: string[] = ['ash.asset_id IN (SELECT id FROM assets WHERE team_id = $1 AND deleted_at IS NULL)'];
    const reworkParams: any[] = [teamId];
    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          reworkParams.push(start.toISOString());
          reworkWhere.push(`ash.changed_at >= $${reworkParams.length}`);
        }
      } catch {}
    }
    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          reworkParams.push(end.toISOString());
          reworkWhere.push(`ash.changed_at <= $${reworkParams.length}`);
        }
      } catch {}
    }
    const reworkWhereClause = reworkWhere.length > 0 ? `WHERE ${reworkWhere.join(' AND ')}` : '';
    const reworkRes = await pool.query(
      `SELECT COUNT(*)::bigint AS count
       FROM asset_status_history ash
       ${reworkWhereClause}
         AND ash.old_status = 'rejected'
         AND ash.new_status = 'draft'`,
      reworkParams
    );
        reworkCount = Number(reworkRes.rows[0]?.count ?? 0);
      } catch (error: any) {
        // Если таблица asset_status_history отсутствует или запрос падает, возвращаем 0
        console.error('Error calculating rework count:', error);
        reworkCount = 0;
      }

    // Количество дубликатов загрузок (по SHA256‑хэшу)
      const duplicatesWhere = whereClause 
        ? `${whereClause} AND af.sha256 IS NOT NULL`
        : `WHERE af.sha256 IS NOT NULL`;
    const duplicatesRes = await pool.query(
      `SELECT COUNT(*)::bigint AS count
       FROM (
         SELECT sha256, COUNT(*) AS cnt
         FROM asset_files af
         JOIN assets a ON a.id = af.asset_id
           ${duplicatesWhere}
         GROUP BY sha256
         HAVING COUNT(*) > 1
       ) duplicates`,
      params
    );
    const duplicateUploads = Number(duplicatesRes.rows[0]?.count ?? 0);

    return reply.send({
      medianApprovalTime,
      requiredFieldsCompletion,
      reworkCount,
      duplicateUploads,
      totalAssets,
      totalEvents,
    });
    } catch (error: any) {
      console.error('Error in /api/analytics/kpi:', error);
      return reply.code(500).send({ 
        error: 'Internal Server Error',
        message: error?.message || 'Failed to load KPI metrics'
      });
    }
  });

  // Активность по периодам
  app.get('/api/analytics/activity', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;
    const period = (q.period as string) || 'day'; // 'day', 'week', 'month'

    const where: string[] = ['e.team_id = $1'];
    const params: any[] = [teamId];

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`e.created_at >= $${params.length}`);
        }
      } catch {}
    }

    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          params.push(end.toISOString());
          where.push(`e.created_at <= $${params.length}`);
        }
      } catch {}
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Определяем, по какому интервалу агрегировать даты
    let dateGroup: string;
    if (period === 'week') {
      dateGroup = `DATE_TRUNC('week', e.created_at)`;
    } else if (period === 'month') {
      dateGroup = `DATE_TRUNC('month', e.created_at)`;
    } else {
      dateGroup = `DATE(e.created_at)`;
    }

    // Просмотры по периодам
    const viewsRes = await pool.query(
      `SELECT ${dateGroup} AS period, COUNT(*)::bigint AS count
       FROM events e
       ${whereClause}
         AND e.event_type = 'view'
       GROUP BY ${dateGroup}
       ORDER BY period ASC`,
      params
    );

    // Скачивания по периодам
    const downloadsRes = await pool.query(
      `SELECT ${dateGroup} AS period, COUNT(*)::bigint AS count
       FROM events e
       ${whereClause}
         AND e.event_type = 'download'
       GROUP BY ${dateGroup}
       ORDER BY period ASC`,
      params
    );

    // Загрузки по периодам
    const uploadsRes = await pool.query(
      `SELECT ${dateGroup} AS period, COUNT(*)::bigint AS count
       FROM events e
       ${whereClause}
         AND e.event_type = 'upload'
       GROUP BY ${dateGroup}
       ORDER BY period ASC`,
      params
    );

    return reply.send({
      views: viewsRes.rows.map((r: any) => ({
        period: r.period?.toISOString?.() ?? r.period,
        count: Number(r.count),
      })),
      downloads: downloadsRes.rows.map((r: any) => ({
        period: r.period?.toISOString?.() ?? r.period,
        count: Number(r.count),
      })),
      uploads: uploadsRes.rows.map((r: any) => ({
        period: r.period?.toISOString?.() ?? r.period,
        count: Number(r.count),
      })),
    });
  });

  // Аналитика по нагрузке и ролям
  app.get('/api/analytics/workload', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;

    const where: string[] = ['e.team_id = $1'];
    const params: any[] = [teamId];

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`e.created_at >= $${params.length}`);
        }
      } catch {}
    }

    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          params.push(end.toISOString());
          where.push(`e.created_at <= $${params.length}`);
        }
      } catch {}
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Активность по ролям пользователей
    const byRoleRes = await pool.query(
      `SELECT tm.role, COUNT(*)::bigint AS event_count, COUNT(DISTINCT e.user_id)::bigint AS user_count
       FROM events e
       JOIN team_members tm ON tm.user_id = e.user_id AND tm.team_id = $1
       ${whereClause}
       GROUP BY tm.role
       ORDER BY event_count DESC`,
      params
    );

    // Наиболее активные пользователи
    const topUsersRes = await pool.query(
      `SELECT 
         u.id, u.email, u.display_name,
         tm.role,
         COUNT(*)::bigint AS event_count,
         COUNT(DISTINCT CASE WHEN e.event_type = 'upload' THEN e.asset_id END)::bigint AS assets_created,
         COUNT(DISTINCT CASE WHEN e.event_type = 'edit' THEN e.asset_id END)::bigint AS assets_edited
       FROM events e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1
       ${whereClause}
       GROUP BY u.id, u.email, u.display_name, tm.role
       ORDER BY event_count DESC
       LIMIT 20`,
      params
    );

    // Изменения статусов по пользователям
    const statusChangesWhere: string[] = ['ash.asset_id IN (SELECT id FROM assets WHERE team_id = $1 AND deleted_at IS NULL)'];
    const statusChangesParams: any[] = [teamId];
    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          statusChangesParams.push(start.toISOString());
          statusChangesWhere.push(`ash.changed_at >= $${statusChangesParams.length}`);
        }
      } catch {}
    }
    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          statusChangesParams.push(end.toISOString());
          statusChangesWhere.push(`ash.changed_at <= $${statusChangesParams.length}`);
        }
      } catch {}
    }
    const statusChangesWhereClause = statusChangesWhere.length > 0 ? `WHERE ${statusChangesWhere.join(' AND ')}` : '';
    const statusChangesRes = await pool.query(
      `SELECT 
         u.id, u.email, u.display_name,
         COUNT(*)::bigint AS change_count,
         COUNT(*) FILTER (WHERE ash.new_status = 'approved')::bigint AS approved_count,
         COUNT(*) FILTER (WHERE ash.new_status = 'rejected')::bigint AS rejected_count,
         COUNT(*) FILTER (WHERE ash.new_status = 'review')::bigint AS review_count
       FROM asset_status_history ash
       JOIN users u ON u.id = ash.changed_by
       ${statusChangesWhereClause}
       GROUP BY u.id, u.email, u.display_name
       ORDER BY change_count DESC
       LIMIT 20`,
      statusChangesParams
    );

    return reply.send({
      byRole: byRoleRes.rows.map((r: any) => ({
        role: String(r.role),
        eventCount: Number(r.event_count),
        userCount: Number(r.user_count),
      })),
      topUsers: topUsersRes.rows.map((r: any) => ({
        user: {
          id: Number(r.id),
          email: String(r.email),
          displayName: r.display_name ?? null,
        },
        role: r.role ? String(r.role) : null,
        eventCount: Number(r.event_count),
        assetsCreated: Number(r.assets_created),
        assetsEdited: Number(r.assets_edited),
      })),
      statusChangesByUser: statusChangesRes.rows.map((r: any) => ({
        user: {
          id: Number(r.id),
          email: String(r.email),
          displayName: r.display_name ?? null,
        },
        changeCount: Number(r.change_count),
        approvedCount: Number(r.approved_count),
        rejectedCount: Number(r.rejected_count),
        reviewCount: Number(r.review_count),
      })),
    });
  });

  // Export assets metadata to CSV
  app.get('/api/analytics/export/csv', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;
    const fieldsParam = q.fields as string | undefined;

    // Default fields
    const defaultFields = ['id', 'title', 'type', 'status', 'created_at', 'updated_at', 'views', 'saves'];
    const availableFields: Record<string, string> = {
      id: 'ID',
      title: 'Название',
      type: 'Тип',
      status: 'Статус',
      created_at: 'Дата создания',
      updated_at: 'Дата обновления',
      views: 'Просмотры',
      saves: 'Сохранения',
      description: 'Описание',
      rating: 'Рейтинг',
      visibility: 'Видимость',
      keywords: 'Ключевые слова',
      tags: 'Теги',
      collections: 'Коллекции',
    };

    // Parse requested fields
    const requestedFields = fieldsParam 
      ? fieldsParam.split(',').map((f: string) => f.trim()).filter((f: string) => f && availableFields[f])
      : defaultFields;

    // Build WHERE clause
    const where: string[] = ['a.team_id = $1', 'a.deleted_at IS NULL'];
    const params: any[] = [teamId];

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`a.created_at >= $${params.length}`);
        }
      } catch {
        // Invalid date, ignore
      }
    }

    if (endDate) {
      try {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          params.push(end.toISOString());
          where.push(`a.created_at <= $${params.length}`);
        }
      } catch {
        // Invalid date, ignore
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Build SELECT clause based on requested fields
    const selectFields: string[] = [];
    const joins: string[] = [];
    const groupByFields: string[] = ['a.id'];

    if (requestedFields.includes('views') || requestedFields.includes('saves')) {
      joins.push('LEFT JOIN engagement e ON e.asset_id = a.id');
      if (requestedFields.includes('views')) {
        selectFields.push('COALESCE(e.views, 0)::bigint AS views');
      }
      if (requestedFields.includes('saves')) {
        selectFields.push('COALESCE(e.saves, 0)::bigint AS saves');
      }
    }

    if (requestedFields.includes('tags')) {
      joins.push('LEFT JOIN asset_tags at ON at.asset_id = a.id');
      joins.push('LEFT JOIN tags t ON t.id = at.tag_id');
      selectFields.push(`STRING_AGG(DISTINCT t.name, ', ') AS tags`);
    } else {
      groupByFields.push(...selectFields.filter(f => !f.includes('STRING_AGG')));
    }

    if (requestedFields.includes('collections')) {
      joins.push('LEFT JOIN collection_assets ca ON ca.asset_id = a.id');
      joins.push('LEFT JOIN collections c ON c.id = ca.collection_id');
      selectFields.push(`STRING_AGG(DISTINCT c.name, ', ') AS collections`);
    }

    // Add basic fields
    if (requestedFields.includes('id')) selectFields.push('a.id');
    if (requestedFields.includes('title')) selectFields.push('a.title');
    if (requestedFields.includes('type')) selectFields.push('a.type');
    if (requestedFields.includes('status')) selectFields.push('a.status');
    if (requestedFields.includes('created_at')) selectFields.push('a.created_at');
    if (requestedFields.includes('updated_at')) selectFields.push('a.updated_at');
    if (requestedFields.includes('description')) selectFields.push('a.description');
    if (requestedFields.includes('rating')) selectFields.push('a.rating');
    if (requestedFields.includes('visibility')) selectFields.push('a.visibility');
    if (requestedFields.includes('keywords')) selectFields.push('ARRAY_TO_STRING(a.keywords, \', \') AS keywords');

    const selectClause = selectFields.length > 0 ? selectFields.join(', ') : 'a.id';
    const joinClause = joins.length > 0 ? joins.join(' ') : '';
    const groupByClause = requestedFields.includes('tags') || requestedFields.includes('collections')
      ? `GROUP BY ${groupByFields.join(', ')}`
      : '';

    const sql = `
      SELECT ${selectClause}
      FROM assets a
      ${joinClause}
      ${whereClause}
      ${groupByClause}
      ORDER BY a.created_at DESC
    `;

    const result = await pool.query(sql, params);
    const rows = result.rows;

    // Map rows to CSV format
    const csvRows = rows.map((row: any) => {
      const csvRow: Record<string, any> = {};
      requestedFields.forEach((field: string) => {
        if (field === 'keywords') {
          csvRow[availableFields[field]] = row.keywords || '';
        } else if (field === 'tags') {
          csvRow[availableFields[field]] = row.tags || '';
        } else if (field === 'collections') {
          csvRow[availableFields[field]] = row.collections || '';
        } else {
          const dbField = field === 'created_at' || field === 'updated_at' 
            ? field 
            : field === 'views' || field === 'saves'
            ? field
            : `a.${field}`.replace('a.', '');
          const value = row[field] ?? row[dbField] ?? '';
          csvRow[availableFields[field]] = value;
        }
      });
      return csvRow;
    });

    // Generate CSV
    const headers = requestedFields.map((f: string) => availableFields[f]);
    const csv = generateCSV(csvRows, headers);

    // Set response headers
    const filename = `assets_${new Date().toISOString().split('T')[0]}.csv`;
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    
    return reply.send(csv);
  });
}


