import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../shared/api';

type Event = {
  id: number;
  eventType: string;
  createdAt: string;
  metadata: any;
  user: { id: number; email: string; displayName: string | null } | null;
  asset: { id: number; title: string | null } | null;
};

type EventsResponse = {
  items: Event[];
  total: number;
  page: number;
  perPage: number;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEventType(type: string): string {
  const types: Record<string, string> = {
    upload: 'Загрузка',
    view: 'Просмотр',
    download: 'Скачивание',
    edit: 'Редактирование',
    delete: 'Удаление',
    status_change: 'Изменение статуса',
    comment: 'Комментарий',
    version_create: 'Создание версии',
  };
  return types[type] || type;
}

function formatMetadata(metadata: any): string {
  if (!metadata) return '—';
  if (typeof metadata === 'string') return metadata;
  if (typeof metadata === 'object') {
    const parts: string[] = [];
    if (metadata.fileName) parts.push(`Файл: ${metadata.fileName}`);
    if (metadata.fileSize) parts.push(`Размер: ${Math.round(metadata.fileSize / 1024)} KB`);
    if (metadata.fields) parts.push(`Поля: ${metadata.fields.join(', ')}`);
    if (metadata.versionNumber) parts.push(`Версия: ${metadata.versionNumber}`);
    if (metadata.oldStatus && metadata.newStatus) {
      parts.push(`${metadata.oldStatus} → ${metadata.newStatus}`);
    }
    return parts.length > 0 ? parts.join(' · ') : JSON.stringify(metadata);
  }
  return String(metadata);
}

function EventRowSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-2 px-3 py-2">
      <div className="col-span-2 h-4 animate-pulse rounded bg-gray-200" />
      <div className="col-span-2 h-4 animate-pulse rounded bg-gray-200" />
      <div className="col-span-2 h-4 animate-pulse rounded bg-gray-200" />
      <div className="col-span-3 h-4 animate-pulse rounded bg-gray-200" />
      <div className="col-span-3 h-4 animate-pulse rounded bg-gray-200" />
    </div>
  );
}

const PER_PAGE = 50;

export function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Фильтры
  const [eventType, setEventType] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [assetId, setAssetId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  function buildParams(pageNum: number) {
    const params = new URLSearchParams();
    if (eventType) params.append('eventType', eventType);
    if (userId) params.append('userId', userId);
    if (assetId) params.append('assetId', assetId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('page', String(pageNum));
    params.append('perPage', String(PER_PAGE));
    return params;
  }

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<EventsResponse>(`/api/events?${buildParams(1).toString()}`);
      setEvents(res.items);
      setTotal(res.total);
      setPage(1);
      setHasMore(res.items.length === PER_PAGE);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Не удалось загрузить события');
      setEvents([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [eventType, userId, assetId, startDate, endDate]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await apiGet<EventsResponse>(`/api/events?${buildParams(nextPage).toString()}`);
      setEvents((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setPage(nextPage);
      setHasMore(res.items.length === PER_PAGE);
    } catch (e: any) {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, page, eventType, userId, assetId, startDate, endDate]);

  useEffect(() => {
    setPage(1);
    setEvents([]);
    setHasMore(true);
    loadInitial();
  }, [eventType, userId, assetId, startDate, endDate, loadInitial]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMore]);

  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (eventType) params.append('eventType', eventType);
      if (userId) params.append('userId', userId);
      if (assetId) params.append('assetId', assetId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const url = `/api/events/export/csv?${params.toString()}`;
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Не удалось скачать файл');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `events_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export error:', error);
      alert('Не удалось скачать файл');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Журнал событий</div>
          <div className="text-sm text-gray-600">История действий пользователей</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPage(1);
              setEvents([]);
              setHasMore(true);
              loadInitial();
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            disabled={loading}
          >
            Обновить
          </button>
          <button
            onClick={handleExport}
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            disabled={loading || exporting}
          >
            {exporting ? 'Экспорт…' : 'Экспорт CSV'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-md border bg-white p-4">
        <div className="mb-2 text-sm font-medium">Фильтры</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-gray-600">Тип события</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Все типы</option>
              <option value="upload">Загрузка</option>
              <option value="view">Просмотр</option>
              <option value="download">Скачивание</option>
              <option value="edit">Редактирование</option>
              <option value="delete">Удаление</option>
              <option value="status_change">Изменение статуса</option>
              <option value="comment">Комментарий</option>
              <option value="version_create">Создание версии</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Пользователь (ID)</label>
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="ID пользователя"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Файл (ID)</label>
            <input
              type="number"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="ID файла"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Начальная дата</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Конечная дата</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-md border bg-white p-4">
        <div className="mb-2 text-sm text-gray-600">
          Всего событий: <span className="font-medium text-gray-900">{total}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
          <div className="col-span-2">Дата</div>
          <div className="col-span-2">Пользователь</div>
          <div className="col-span-2">Тип</div>
          <div className="col-span-3">Файл</div>
          <div className="col-span-3">Дополнительно</div>
        </div>
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => <EventRowSkeleton key={`skeleton-${i}`} />)
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Событий не найдено</div>
        ) : (
          <>
            {events.map((event) => (
              <div key={event.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                <div className="col-span-2 text-gray-700">{formatDate(event.createdAt)}</div>
                <div className="col-span-2 text-gray-700">
                  {event.user?.displayName || event.user?.email || 'Система'}
                </div>
                <div className="col-span-2 text-gray-700">{formatEventType(event.eventType)}</div>
                <div className="col-span-3 text-gray-700">
                  {event.asset ? (
                    <Link to={`/asset/${event.asset.id}`} className="text-blue-600 hover:underline">
                      {event.asset.title || `Файл #${event.asset.id}`}
                    </Link>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="col-span-3 text-gray-600 text-xs">{formatMetadata(event.metadata)}</div>
              </div>
            ))}
            {loadingMore && Array.from({ length: 5 }).map((_, i) => <EventRowSkeleton key={`skeleton-more-${i}`} />)}
            <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

