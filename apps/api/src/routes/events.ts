import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';
import { generateCSV } from '../utils/csvExport';

export async function registerEventRoutes(app: FastifyInstance) {
  // Получить события с фильтрацией и пагинацией
  app.get('/api/events', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    try {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const eventType = q.eventType as string | undefined;
    const userId = q.userId != null ? Number(q.userId) : undefined;
    const assetId = q.assetId != null ? Number(q.assetId) : undefined;
    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;
    const page = Math.max(1, Number(q.page) || 1);
    const perPage = Math.min(200, Math.max(1, Number(q.perPage) || 50));

    // Собираем WHERE-условие для фильтрации
    const where: string[] = ['e.team_id = $1'];
    const params: any[] = [teamId];
    let paramIndex = 2;

    if (eventType && ['upload', 'view', 'download', 'edit', 'delete', 'status_change', 'comment', 'version_create'].includes(eventType)) {
      params.push(eventType);
      where.push(`e.event_type = $${paramIndex}`);
      paramIndex++;
    }

    if (userId !== undefined && Number.isFinite(userId) && userId > 0) {
      params.push(userId);
      where.push(`e.user_id = $${paramIndex}`);
      paramIndex++;
    }

    if (assetId !== undefined && Number.isFinite(assetId) && assetId > 0) {
      params.push(assetId);
      where.push(`e.asset_id = $${paramIndex}`);
      paramIndex++;
    }

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`e.created_at >= $${paramIndex}`);
          paramIndex++;
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
          where.push(`e.created_at <= $${paramIndex}`);
          paramIndex++;
        }
      } catch {
        // Некорректная дата — пропускаем фильтр по концу периода
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * perPage;

    // Загружаем список событий
    const eventsSql = `
      SELECT
        e.id, e.event_type, e.created_at, e.metadata,
        u.id AS user_id, u.email AS user_email, u.display_name AS user_display_name,
        a.id AS asset_id, a.title AS asset_title
      FROM events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN assets a ON a.id = e.asset_id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(perPage, offset);

    // Считаем общее количество записей для пагинации
    const countSql = `
      SELECT COUNT(*)::bigint AS total
      FROM events e
      ${whereClause}
    `;
    const countParams = params.slice(0, -2); // Убираем limit и offset из параметров подсчёта

    const [eventsRes, countRes] = await Promise.all([
      pool.query(eventsSql, params),
      pool.query(countSql, countParams),
    ]);

    const items = eventsRes.rows.map((r: any) => {
      let metadata: any = null;
      try {
        metadata = r.metadata != null ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null;
      } catch {
        metadata = r.metadata;
      }

      return {
        id: Number(r.id),
        eventType: String(r.event_type),
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        metadata,
        user: r.user_id ? {
          id: Number(r.user_id),
          email: String(r.user_email),
          displayName: r.user_display_name ?? null,
        } : null,
        asset: r.asset_id ? {
          id: Number(r.asset_id),
          title: r.asset_title ?? null,
        } : null,
      };
    });

    const total = Number(countRes.rows[0]?.total ?? 0);

    return reply.send({
      items,
      total,
      page,
      perPage,
    });
    } catch (error: any) {
      app.log.error('Error in GET /api/events:', error);
      // Обрабатываем специфичные ошибки базы данных
      if (error?.code === '42P01') {
        return reply.code(500).send({ error: 'Таблица events не найдена в базе данных. Возможно, миграции не применены.' });
      }
      if (error?.code === '42P02') {
        return reply.code(500).send({ error: 'Колонка не найдена в базе данных. Возможно, миграции не применены.' });
      }
      return reply.code(500).send({ error: `Внутренняя ошибка сервера: ${error?.message || 'Неизвестная ошибка'}` });
    }
  });

  // Экспорт событий в CSV
  app.get('/api/events/export/csv', { preHandler: [requireAuth, requireRole(['analyst', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const q = (req.query ?? {}) as any;

    const eventType = q.eventType as string | undefined;
    const userId = q.userId != null ? Number(q.userId) : undefined;
    const assetId = q.assetId != null ? Number(q.assetId) : undefined;
    const startDate = q.startDate as string | undefined;
    const endDate = q.endDate as string | undefined;

    // Собираем WHERE-условие (то же, что и в GET /api/events, но без пагинации)
    const where: string[] = ['e.team_id = $1'];
    const params: any[] = [teamId];
    let paramIndex = 2;

    if (eventType && ['upload', 'view', 'download', 'edit', 'delete', 'status_change', 'comment', 'version_create'].includes(eventType)) {
      params.push(eventType);
      where.push(`e.event_type = $${paramIndex}`);
      paramIndex++;
    }

    if (userId !== undefined && Number.isFinite(userId) && userId > 0) {
      params.push(userId);
      where.push(`e.user_id = $${paramIndex}`);
      paramIndex++;
    }

    if (assetId !== undefined && Number.isFinite(assetId) && assetId > 0) {
      params.push(assetId);
      where.push(`e.asset_id = $${paramIndex}`);
      paramIndex++;
    }

    if (startDate) {
      try {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          params.push(start.toISOString());
          where.push(`e.created_at >= $${paramIndex}`);
          paramIndex++;
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
          where.push(`e.created_at <= $${paramIndex}`);
          paramIndex++;
        }
      } catch {
        // Некорректная дата — пропускаем фильтр по концу периода
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Получаем все события (без пагинации, для экспорта)
    const eventsSql = `
      SELECT
        e.id, e.event_type, e.created_at, e.metadata,
        u.id AS user_id, u.email AS user_email, u.display_name AS user_display_name,
        a.id AS asset_id, a.title AS asset_title
      FROM events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN assets a ON a.id = e.asset_id
      ${whereClause}
      ORDER BY e.created_at DESC
    `;

    const eventsRes = await pool.query(eventsSql, params);

    // Форматируем события для записи в CSV
    const formatEventType = (type: string): string => {
      const map: Record<string, string> = {
        upload: 'Загрузка',
        view: 'Просмотр',
        download: 'Скачивание',
        edit: 'Редактирование',
        delete: 'Удаление',
        status_change: 'Изменение статуса',
        comment: 'Комментарий',
        version_create: 'Создание версии',
      };
      return map[type] || type;
    };

    const formatMetadata = (metadata: any): string => {
      if (!metadata) return '—';
      try {
        const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        if (typeof parsed === 'object') {
          const parts: string[] = [];
          if (parsed.status) parts.push(`Статус: ${parsed.status}`);
          if (parsed.version) parts.push(`Версия: ${parsed.version}`);
          if (parsed.comment) parts.push(`Комментарий: ${parsed.comment}`);
          return parts.length > 0 ? parts.join('; ') : JSON.stringify(parsed);
        }
        return String(parsed);
      } catch {
        return String(metadata);
      }
    };

    const csvRows = eventsRes.rows.map((r: any) => {
      let metadata: any = null;
      try {
        metadata = r.metadata != null ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null;
      } catch {
        metadata = r.metadata;
      }

      return {
        'Дата': r.created_at?.toISOString?.() ?? r.created_at ?? '',
        'Пользователь': r.user_display_name || r.user_email || '—',
        'Тип события': formatEventType(String(r.event_type)),
        'Файл': r.asset_title || (r.asset_id ? `Файл #${r.asset_id}` : '—'),
        'Дополнительно': formatMetadata(metadata),
      };
    });

    const headers = ['Дата', 'Пользователь', 'Тип события', 'Файл', 'Дополнительно'];
    const csv = generateCSV(csvRows, headers);

    // Устанавливаем заголовки ответа для скачивания CSV
    const filename = `events_${new Date().toISOString().split('T')[0]}.csv`;
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    
    return reply.send(csv);
  });
}

