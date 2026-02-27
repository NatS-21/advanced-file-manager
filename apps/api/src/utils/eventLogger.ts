import { pool } from '../db/pool';

export type EventType =
  | 'upload'
  | 'view'
  | 'download'
  | 'edit'
  | 'delete'
  | 'status_change'
  | 'comment'
  | 'version_create'
  | 'team_member_added';

export interface LogEventParams {
  teamId: number;
  userId: number;
  assetId?: number;
  eventType: EventType;
  metadata?: Record<string, any>;
}

/**
 * Асинхронно записывает событие в таблицу events.
 * Эта функция не блокирует основной запрос, ошибки тихо перехватываются.
 */
export async function logEvent(params: LogEventParams): Promise<void> {
  const { teamId, userId, assetId, eventType, metadata } = params;

  try {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    await pool.query(
      `INSERT INTO events (team_id, user_id, asset_id, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [teamId, userId, assetId || null, eventType, metadataJson]
    );
  } catch (error: any) {
    // Ошибку логирования не пробрасываем — она не должна ломать основной поток
    // В production можно писать такие ошибки в отдельный лог
    // Отдельно проверяем ситуацию, когда таблица ещё не создана
    if (error?.code === '42P01') {
      console.error('Failed to log event: таблица events не существует. Необходимо применить миграции базы данных.');
    } else {
    console.error('Failed to log event:', error);
    }
  }
}

/**
 * Логирует событие в «fire‑and‑forget» режиме (без ожидания выполнения).
 * Используется, когда не нужно ждать, пока событие будет записано.
 */
export function logEventAsync(params: LogEventParams): void {
  void logEvent(params).catch(() => {
    // Ошибка уже обработана внутри logEvent
  });
}

