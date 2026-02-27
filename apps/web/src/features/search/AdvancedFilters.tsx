import React, { useState, useEffect } from 'react';
import type { Filter } from '@afm/shared/search/dsl';
import { apiGet, apiPost } from '../../shared/api';
import { RangeSlider } from '../../shared/RangeSlider';
import { ColorPicker } from '../../shared/ColorPicker';

interface FilterField {
  field: string;
  label: string;
  type: 'text' | 'select' | 'range' | 'dateRange' | 'tags' | 'color';
  options?: Array<{ value: string; label: string }>;
  category: 'basic' | 'business' | 'media' | 'files' | 'tags';
}

const allFilterFields: FilterField[] = [
  // Основные
  { field: 'type', label: 'Тип', type: 'select', category: 'basic', options: [
    { value: 'image', label: 'Изображение' },
    { value: 'video', label: 'Видео' },
    { value: 'audio', label: 'Аудио' },
    { value: 'doc', label: 'Документ' },
  ]},
  { field: 'status', label: 'Статус', type: 'select', category: 'basic', options: [
    { value: 'draft', label: 'Черновик' },
    { value: 'review', label: 'На проверке' },
    { value: 'approved', label: 'Одобрено' },
    { value: 'rejected', label: 'Отклонено' },
  ]},
  { field: 'visibility', label: 'Видимость', type: 'select', category: 'basic', options: [
    { value: 'private', label: 'Приватный' },
    { value: 'team', label: 'Команда' },
    { value: 'public', label: 'Публичный' },
  ]},
  { field: 'rating', label: 'Рейтинг', type: 'range', category: 'basic' },
  { field: 'createdAt', label: 'Дата создания', type: 'dateRange', category: 'basic' },
  { field: 'capturedAt', label: 'Дата съёмки', type: 'dateRange', category: 'basic' },
  { field: 'folderId', label: 'Папка', type: 'select', category: 'basic' },
  
  // Бизнес
  { field: 'channel', label: 'Канал', type: 'text', category: 'business' },
  { field: 'brand', label: 'Бренд', type: 'text', category: 'business' },
  { field: 'region', label: 'Регион', type: 'text', category: 'business' },
  { field: 'language', label: 'Язык', type: 'text', category: 'business' },
  
  // Медиа
  { field: 'orientation', label: 'Ориентация', type: 'select', category: 'media', options: [
    { value: 'landscape', label: 'Альбомная' },
    { value: 'portrait', label: 'Портретная' },
    { value: 'square', label: 'Квадрат' },
  ]},
  { field: 'width', label: 'Ширина (px)', type: 'range', category: 'media' },
  { field: 'height', label: 'Высота (px)', type: 'range', category: 'media' },
  { field: 'durationSec', label: 'Длительность (сек)', type: 'range', category: 'media' },
  { field: 'fps', label: 'FPS', type: 'range', category: 'media' },
  { field: 'videoCodec', label: 'Видео кодек', type: 'text', category: 'media' },
  { field: 'audioCodec', label: 'Аудио кодек', type: 'text', category: 'media' },
  { field: 'aspectRatio', label: 'Соотношение сторон', type: 'text', category: 'media' },
  { field: 'color', label: 'Цвет', type: 'color', category: 'media' },
  
  // Файлы
  { field: 'sizeBytes', label: 'Размер файла', type: 'range', category: 'files' },
  { field: 'mimeType', label: 'MIME тип', type: 'text', category: 'files' },
  
  // Теги
  { field: 'tags', label: 'Теги', type: 'tags', category: 'tags' },
];

const categoryLabels: Record<string, string> = {
  basic: 'Основные',
  business: 'Бизнес',
  media: 'Медиа',
  files: 'Файлы',
  tags: 'Теги',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (filters: Filter[]) => void;
  activeFilters: Filter[];
  visibleFields?: string[];
}

export function AdvancedFilters({ open, onClose, onApply, activeFilters, visibleFields }: Props) {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [userSettings, setUserSettings] = useState<{ metadataFilters?: string[] } | null>(null);
  const [ranges, setRanges] = useState<{
    media?: {
      width?: { min: number | null; max: number | null };
      height?: { min: number | null; max: number | null };
      durationSec?: { min: number | null; max: number | null };
      fps?: { min: number | null; max: number | null };
    };
    files?: {
      sizeBytes?: { min: number | null; max: number | null };
    };
  } | null>(null);

  // Загружаем пользовательские настройки при открытии панели
  useEffect(() => {
    if (open && !visibleFields) {
      apiGet<{ metadataFilters?: string[] }>('/api/settings')
        .then(data => setUserSettings(data))
        .catch(() => {
          // Если настроек нет, используем все поля
          setUserSettings(null);
        });
    }
  }, [open, visibleFields]);

  // Загружаем диапазоны значений при открытии панели (всегда, независимо от visibleFields)
  useEffect(() => {
    if (open) {
      apiGet<typeof ranges>('/api/analytics/ranges')
        .then((data) => setRanges(data))
        .catch(() => {
          setRanges(null);
        });
    }
  }, [open]);

  // Определяем поля для отображения: сначала visibleFields из пропсов, затем настройки пользователя, затем все поля
  const fieldsToShow = visibleFields && visibleFields.length > 0
    ? allFilterFields.filter(f => visibleFields.includes(f.field))
    : userSettings?.metadataFilters && userSettings.metadataFilters.length > 0
    ? allFilterFields.filter(f => userSettings.metadataFilters!.includes(f.field))
    : allFilterFields;

  // Группируем поля по категориям
  const fieldsByCategory = fieldsToShow.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, FilterField[]>);

  useEffect(() => {
    if (open) {
      // Загружаем доступные теги (если есть соответствующий эндпоинт)
      apiGet<{ items: Array<{ name: string }> }>('/api/tags')
        .then(res => setAvailableTags(res.items?.map(t => t.name) || []))
        .catch(() => {
          // Если эндпоинта тегов нет — просто работаем без подсказок
          setAvailableTags([]);
        });
      
      // Инициализируем локальное состояние фильтров из activeFilters
      const initial: Record<string, any> = {};
      activeFilters.forEach((f: any) => {
        if ('field' in f && f.field) {
          initial[f.field] = f;
        }
      });
      setFilters(initial);
    }
  }, [open, activeFilters]);

  function updateFilter(field: string, value: any, op: string = 'eq') {
    setFilters(prev => {
      const next = { ...prev };
      if (value === null || value === undefined || value === '' || 
          (Array.isArray(value) && value.length === 0)) {
        delete next[field];
      } else {
        next[field] = { field, op, value };
      }
      return next;
    });
  }

  function handleApply() {
    const filterArray = Object.values(filters).filter(Boolean) as Filter[];
    onApply(filterArray);
    onClose();
  }

  function handleReset() {
    setFilters({});
    onApply([]);
  }

  function removeFilter(field: string) {
    setFilters(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const activeFiltersList = Object.values(filters).filter(Boolean) as any[];

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      
      {/* Filters Panel */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-96 transform border-l bg-white shadow-lg transition-transform duration-200 ease-in-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="shrink-0 border-b bg-white px-4 py-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Фильтры</h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Закрыть"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 [&>div:first-child]:!mt-0">
          {Object.entries(fieldsByCategory).map(([category, fields], index) => (
            <div 
              key={category} 
              className={index > 0 ? 'mt-4' : ''}
            >
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                {categoryLabels[category]}
              </h3>
              <div className="space-y-2">
                {fields.map(field => (
                  <FilterFieldInput
                    key={field.field}
                    field={field}
                    value={filters[field.field]?.value}
                    onChange={(value, op) => updateFilter(field.field, value, op)}
                    availableTags={field.field === 'tags' ? availableTags : undefined}
                    ranges={ranges}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t bg-white px-4 py-2">
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex-1 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Сбросить
            </button>
            <button
              onClick={handleApply}
              className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black"
            >
              Применить ({activeFiltersList.length})
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

interface FilterFieldInputProps {
  field: FilterField;
  value: any;
  onChange: (value: any, op?: string) => void;
  availableTags?: string[];
  ranges?: {
    media?: {
      width?: { min: number | null; max: number | null };
      height?: { min: number | null; max: number | null };
      durationSec?: { min: number | null; max: number | null };
      fps?: { min: number | null; max: number | null };
    };
    files?: {
      sizeBytes?: { min: number | null; max: number | null };
    };
  } | null;
}

function FilterFieldInput({ field, value, onChange, availableTags, ranges }: FilterFieldInputProps) {
  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {field.label}
        </label>
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null, 'eq')}
          className="w-full rounded-md border px-2 py-1 text-sm"
        >
          <option value="">—</option>
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'text') {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {field.label}
        </label>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null, 'prefix')}
          placeholder={`Введите ${field.label.toLowerCase()}`}
          className="w-full rounded-md border px-2 py-1 text-sm"
        />
      </div>
    );
  }

  if (field.type === 'range') {
    const rangeValue = Array.isArray(value) ? value : [null, null];
    
    // Определяем min/max в зависимости от поля
    const getRangeConfig = () => {
      switch (field.field) {
        case 'rating':
          return { min: 0, max: 5, step: 0.5 };
        case 'width':
        case 'height':
          // Для слайдера ограничиваемся 4096, но минимумы/максимумы берём из реальных данных
          const widthOrHeight = field.field as 'width' | 'height';
          const mediaRange = ranges?.media?.[widthOrHeight];
          return {
            min: (mediaRange?.min != null && !isNaN(mediaRange.min)) ? mediaRange.min : 0,
            max: Math.min(
              (mediaRange?.max != null && !isNaN(mediaRange.max)) ? mediaRange.max : 4096,
              4096
            ),
            step: 10,
          };
        case 'durationSec':
          const durationRange = ranges?.media?.durationSec;
          return {
            min: (durationRange?.min != null && !isNaN(durationRange.min)) ? durationRange.min : 0,
            max: (durationRange?.max != null && !isNaN(durationRange.max)) ? durationRange.max : 3600,
            step: 1,
          };
        case 'fps':
          const fpsRange = ranges?.media?.fps;
          return {
            min: (fpsRange?.min != null && !isNaN(fpsRange.min)) ? fpsRange.min : 0,
            max: (fpsRange?.max != null && !isNaN(fpsRange.max)) ? fpsRange.max : 120,
            step: 1,
          };
        case 'sizeBytes':
          const sizeRange = ranges?.files?.sizeBytes;
          return {
            min: (sizeRange?.min != null && !isNaN(sizeRange.min)) ? sizeRange.min : 0,
            max: (sizeRange?.max != null && !isNaN(sizeRange.max)) ? sizeRange.max : 10 * 1024 * 1024 * 1024,
            step: 1024 * 1024, // 1 MB
          };
        default:
          return { min: 0, max: 1000, step: 1 };
      }
    };

    const { min, max, step } = getRangeConfig();
    const formatValue = (v: number) => {
      if (field.field === 'sizeBytes') {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = v;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
          size /= 1024;
          unitIndex++;
        }
        return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
      }
      return String(Math.round(v));
    };

    return (
      <div>
        <RangeSlider
          min={min}
          max={max}
          step={step}
          // Передаём «сырые» значения фильтра; null означает отсутствие границы
          value={[rangeValue[0], rangeValue[1]]}
          onChange={(newValue) => {
            const [from, to] = newValue;
            const val =
              (from == null && to == null)
                ? null
                : [from, to];
            onChange(val as any, 'range');
          }}
          label={field.label}
          formatValue={formatValue}
        />
      </div>
    );
  }

  if (field.type === 'dateRange') {
    const rangeValue = Array.isArray(value) ? value : [null, null];
    const formatDate = (d: any) => {
      if (!d) return '';
      const date = new Date(d);
      return date.toISOString().split('T')[0];
    };
    return (
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {field.label}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={formatDate(rangeValue[0])}
            onChange={(e) => onChange([e.target.value ? new Date(e.target.value).toISOString() : null, rangeValue[1]], 'range')}
            className="flex-1 rounded-md border px-2 py-1 text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={formatDate(rangeValue[1])}
            onChange={(e) => onChange([rangeValue[0], e.target.value ? new Date(e.target.value).toISOString() : null], 'range')}
            className="flex-1 rounded-md border px-2 py-1 text-sm"
          />
        </div>
      </div>
    );
  }

  if (field.type === 'tags') {
    const selectedTags = Array.isArray(value) ? value : [];
    const [tagInput, setTagInput] = useState('');
    
    return (
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {field.label}
        </label>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  const newTags = [...selectedTags, tagInput.trim()];
                  onChange(newTags, 'containsAny');
                  setTagInput('');
                }
              }}
              placeholder="Введите тег и нажмите Enter"
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              list="tags-list"
            />
            <datalist id="tags-list">
              {availableTags?.filter(t => !selectedTags.includes(t)).map(tag => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </div>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs"
                >
                  {tag}
                  <button
                    onClick={() => {
                      const newTags = selectedTags.filter(t => t !== tag);
                      onChange(newTags.length > 0 ? newTags : null, 'containsAny');
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (field.type === 'color') {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {field.label}
        </label>
        <ColorPicker
          value={value as { r: number; g: number; b: number; threshold?: number } | undefined}
          onChange={(colorValue) => onChange(colorValue, 'similarTo')}
        />
      </div>
    );
  }

  return null;
}

