import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';

export async function registerSettingsRoutes(app: FastifyInstance) {
  // Получить пользовательские настройки
  app.get('/api/settings', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const userId = req.auth!.userId;
      
      const { rows } = await pool.query(
        `SELECT settings FROM user_settings WHERE user_id = $1`,
        [userId]
      );

      if (rows.length === 0) {
        // Возвращаем настройки по умолчанию (базовый профиль пользователя)
        return reply.send({
          metadataFilters: [
            'type', 'status', 'visibility', 'createdAt', 'folderId',
            'tags',
          ],
          presetProfile: 'basic',
        });
      }

      const settings = rows[0].settings;
      // Гарантируем наличие presetProfile, если он не задан
      if (!settings.presetProfile) {
        settings.presetProfile = 'basic';
      }
      return reply.send(settings);
    } catch (error: any) {
      req.log.error('Failed to get settings:', error);
      return reply.code(500).send({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // Получить список доступных предустановленных профилей
  app.get('/api/settings/presets', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const presets = {
        marketer: {
          name: 'Маркетолог',
          description: 'Для работы с маркетинговыми кампаниями, каналами и брендами',
          fields: [
            'type', 'status', 'visibility', 'createdAt', 'capturedAt', 'folderId',
            'campaignId', 'channel', 'brand', 'region', 'language',
            'tags',
          ],
        },
        designer: {
          name: 'Дизайнер / Контент-менеджер',
          description: 'Для работы с техническими параметрами медиа-файлов',
          fields: [
            'type', 'status', 'visibility', 'rating', 'createdAt', 'capturedAt', 'folderId',
            'orientation', 'width', 'height', 'durationSec', 'fps', 'videoCodec', 'audioCodec', 'aspectRatio',
            'sizeBytes', 'mimeType',
            'tags',
          ],
        },
        moderator: {
          name: 'Модератор',
          description: 'Для модерации контента и управления статусами',
          fields: [
            'type', 'status', 'visibility', 'rating', 'createdAt', 'capturedAt', 'folderId', 'ownerId',
            'tags',
          ],
        },
        analyst: {
          name: 'Аналитик',
          description: 'Все метрики для комплексного анализа',
          fields: [
            'type', 'status', 'visibility', 'rating', 'createdAt', 'capturedAt', 'folderId', 'ownerId',
            'campaignId', 'channel', 'brand', 'region', 'language',
            'orientation', 'width', 'height', 'durationSec', 'fps', 'videoCodec', 'audioCodec', 'aspectRatio',
            'sizeBytes', 'mimeType',
            'tags',
          ],
        },
        admin: {
          name: 'Администратор',
          description: 'Все метрики для полного управления системой',
          fields: [
            'type', 'status', 'visibility', 'rating', 'createdAt', 'capturedAt', 'folderId', 'ownerId',
            'campaignId', 'channel', 'brand', 'region', 'language',
            'orientation', 'width', 'height', 'durationSec', 'fps', 'videoCodec', 'audioCodec', 'aspectRatio',
            'sizeBytes', 'mimeType',
            'tags',
          ],
        },
        basic: {
          name: 'Базовый пользователь',
          description: 'Минимальный набор для навигации и поиска',
          fields: [
            'type', 'status', 'visibility', 'createdAt', 'folderId',
            'tags',
          ],
        },
      };
      return reply.send(presets);
    } catch (error: any) {
      req.log.error('Failed to get presets:', error);
      return reply.code(500).send({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // Обновить пользовательские настройки
  app.put('/api/settings', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const userId = req.auth!.userId;
      const settings = req.body as any;

      // Валидируем структуру настроек
      if (typeof settings !== 'object' || settings === null) {
        return reply.code(400).send({ error: 'Некорректные настройки' });
      }

      // Вставляем или обновляем настройки пользователя (upsert)
      await pool.query(
        `INSERT INTO user_settings (user_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET settings = $2, updated_at = NOW()`,
        [userId, JSON.stringify(settings)]
      );

      return reply.send({ success: true });
    } catch (error: any) {
      req.log.error('Failed to update settings:', error);
      return reply.code(500).send({ error: 'Внутренняя ошибка сервера' });
    }
  });
}

