import React, { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../shared/api';

interface Settings {
  metadataFilters?: string[];
  presetProfile?: string;
}

const allMetadataFields = [
  // Основные
  { field: 'type', label: 'Тип', category: 'basic' },
  { field: 'status', label: 'Статус', category: 'basic' },
  { field: 'visibility', label: 'Видимость', category: 'basic' },
  { field: 'rating', label: 'Рейтинг', category: 'basic' },
  { field: 'createdAt', label: 'Дата создания', category: 'basic' },
  { field: 'capturedAt', label: 'Дата съёмки', category: 'basic' },
  { field: 'folderId', label: 'Папка', category: 'basic' },
  { field: 'ownerId', label: 'Владелец', category: 'basic' },
  
  // Бизнес
  { field: 'campaignId', label: 'Кампания', category: 'business' },
  { field: 'channel', label: 'Канал', category: 'business' },
  { field: 'brand', label: 'Бренд', category: 'business' },
  { field: 'region', label: 'Регион', category: 'business' },
  { field: 'language', label: 'Язык', category: 'business' },
  
  // Медиа
  { field: 'orientation', label: 'Ориентация', category: 'media' },
  { field: 'width', label: 'Ширина', category: 'media' },
  { field: 'height', label: 'Высота', category: 'media' },
  { field: 'durationSec', label: 'Длительность', category: 'media' },
  { field: 'fps', label: 'FPS', category: 'media' },
  { field: 'videoCodec', label: 'Видео кодек', category: 'media' },
  { field: 'audioCodec', label: 'Аудио кодек', category: 'media' },
  { field: 'aspectRatio', label: 'Соотношение сторон', category: 'media' },
  { field: 'color', label: 'Цвета', category: 'media' },
  
  // Файлы
  { field: 'sizeBytes', label: 'Размер файла', category: 'files' },
  { field: 'mimeType', label: 'MIME тип', category: 'files' },
  
  // Теги
  { field: 'tags', label: 'Теги', category: 'tags' },
];

const categoryLabels: Record<string, string> = {
  basic: 'Основные',
  business: 'Бизнес',
  media: 'Медиа',
  files: 'Файлы',
  tags: 'Теги',
};

// Предустановленные профили для разных групп пользователей
const presetProfiles: Record<string, { name: string; description: string; fields: string[] }> = {
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
      'orientation', 'width', 'height', 'durationSec', 'fps', 'videoCodec', 'audioCodec', 'aspectRatio', 'color',
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
    fields: allMetadataFields.map(f => f.field),
  },
  admin: {
    name: 'Администратор',
    description: 'Все метрики для полного управления системой',
    fields: allMetadataFields.map(f => f.field),
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

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const data = await apiGet<Settings>('/api/settings');
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    await saveSettingsWithData(settings);
  }

  async function saveSettingsWithData(data: Settings) {
    try {
      setSaving(true);
      setSaved(false);
      await apiPut('/api/settings', data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  }

  async function toggleMetadataField(field: string) {
    const current = settings.metadataFilters || [];
    const newFilters = current.includes(field)
      ? current.filter(f => f !== field)
      : [...current, field];
    // Если пользователь вручную изменил настройки, сбрасываем активный профиль
    const newSettings: Settings = { ...settings, metadataFilters: newFilters };
    // Проверяем, соответствует ли текущая конфигурация какому-либо профилю
    const matchingPreset = Object.entries(presetProfiles).find(
      ([_, preset]) => JSON.stringify([...preset.fields].sort()) === JSON.stringify([...newFilters].sort())
    );
    if (matchingPreset) {
      newSettings.presetProfile = matchingPreset[0];
    } else {
      // Если не соответствует ни одному профилю, убираем активный профиль
      newSettings.presetProfile = undefined;
    }
    setSettings(newSettings);
    // Автоматически сохраняем при ручном изменении
    await saveSettingsWithData(newSettings);
  }

  if (loading) {
    return (
      <div className="rounded-md border bg-white p-6">
        <div className="text-gray-500">Загрузка настроек…</div>
      </div>
    );
  }

  const selectedFields = settings.metadataFilters || [];
  const fieldsByCategory = allMetadataFields.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof allMetadataFields>);

  async function applyPreset(presetKey: string) {
    const preset = presetProfiles[presetKey];
    if (preset) {
      const newSettings = { ...settings, metadataFilters: preset.fields, presetProfile: presetKey };
      setSettings(newSettings);
      // Автоматически сохраняем настройки при выборе профиля
      try {
        setSaving(true);
        await apiPut('/api/settings', newSettings);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Не удалось сохранить настройки');
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-white p-6">
        <h2 className="mb-6 text-xl font-semibold">Настройки</h2>

        {/* Preset Profiles Section */}
        <div className="mb-6 rounded-md border bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">Предустановленные профили</h3>
          <p className="mb-4 text-xs text-gray-600">
            Выберите профиль, соответствующий вашей роли и задачам. Профиль автоматически настроит видимые метаданные в фильтрах.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(presetProfiles).map(([key, preset]) => {
              const isActive = settings.presetProfile === key;
              return (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    isActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-gray-900">{preset.name}</div>
                    {isActive && (
                      <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] text-white">
                        Активен
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{preset.description}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    {preset.fields.length} метаданных
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Metadata Filters Section */}
        <div className="mb-6">
          <h3 className="mb-4 text-lg font-medium">Настройки метаданных</h3>
          <p className="mb-4 text-sm text-gray-600">
            Выберите метаданные, которые будут отображаться в фильтрах и автоматически выделяться:
          </p>

          <div className="space-y-6">
            {Object.entries(fieldsByCategory).map(([category, fields]) => (
              <div key={category}>
                <h4 className="mb-3 text-sm font-medium text-gray-700">
                  {categoryLabels[category]}
                </h4>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {fields.map(field => (
                    <label
                      key={field.field}
                      className="flex items-center gap-2 rounded-md border p-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field.field)}
                        onChange={() => toggleMetadataField(field.field)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-md bg-gray-50 px-4 py-2">
            <div className="text-sm text-gray-600">
              Выбрано: {selectedFields.length} из {allMetadataFields.length}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const allFields = allMetadataFields.map(f => f.field);
                  const newSettings = { ...settings, metadataFilters: allFields, presetProfile: 'analyst' };
                  setSettings(newSettings);
                  // Автоматически сохраняем при выборе "Выбрать все"
                  saveSettingsWithData(newSettings);
                }}
                className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50"
              >
                Выбрать все
              </button>
              <button
                onClick={() => {
                  const newSettings = { ...settings, metadataFilters: [], presetProfile: undefined };
                  setSettings(newSettings);
                  // Автоматически сохраняем при выборе "Снять все"
                  saveSettingsWithData(newSettings);
                }}
                className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50"
              >
                Снять все
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          {saved && (
            <span className="text-sm text-green-600">Настройки сохранены</span>
          )}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

