import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../shared/api';

type Overview = {
  totals: { files: number; sizeBytes: number };
  byType: Array<{ type: string; count: number; sizeBytes: number }>;
  topTags: Array<{ tag: string; count: number }>;
  topViewed: Array<{ id: number; title: string | null; views: number; saves: number }>;
};

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function typeLabel(t: string): string {
  if (t === 'image') return 'Изображения';
  if (t === 'video') return 'Видео';
  if (t === 'audio') return 'Аудио';
  if (t === 'doc') return 'Документы';
  return t;
}

export function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<Overview>('/api/analytics/overview');
      setData(res);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Не удалось загрузить аналитику');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalCount = data?.totals.files ?? 0;
  const maxTypeCount = useMemo(() => Math.max(1, ...(data?.byType.map((x) => x.count) ?? [1])), [data?.byType]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Аналитика</div>
          <div className="text-sm text-gray-600">Обзор контента и метаданных (по текущей команде)</div>
        </div>
        <button
          onClick={load}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      {loading && <div className="rounded-md border bg-white p-6">Загрузка…</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs text-gray-500">Файлов</div>
              <div className="mt-1 text-2xl font-semibold">{data.totals.files}</div>
            </div>
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs text-gray-500">Общий объём</div>
              <div className="mt-1 text-2xl font-semibold">{formatBytes(data.totals.sizeBytes)}</div>
            </div>
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs text-gray-500">Топ‑тегов</div>
              <div className="mt-1 text-2xl font-semibold">{data.topTags.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-md border bg-white p-4">
              <div className="mb-3 text-sm font-medium">Файлы по типам</div>
              <div className="space-y-3">
                {data.byType.map((t) => (
                  <div key={t.type}>
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-gray-800">{typeLabel(t.type)}</div>
                      <div className="text-gray-600">
                        {t.count} ({totalCount ? Math.round((t.count / totalCount) * 100) : 0}%) · {formatBytes(t.sizeBytes)}
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-100">
                      <div
                        className="h-full bg-gray-900"
                        style={{ width: `${Math.round((t.count / maxTypeCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {data.byType.length === 0 && <div className="text-sm text-gray-500">Нет данных.</div>}
              </div>
            </div>

            <div className="rounded-md border bg-white p-4">
              <div className="mb-3 text-sm font-medium">Топ‑теги</div>
              <div className="flex flex-wrap gap-2">
                {data.topTags.map((t) => (
                  <span key={t.tag} className="rounded-full border bg-white px-3 py-1 text-sm">
                    {t.tag} <span className="text-gray-500">{t.count}</span>
                  </span>
                ))}
                {data.topTags.length === 0 && <div className="text-sm text-gray-500">Тегов пока нет.</div>}
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <div className="mb-3 text-sm font-medium">Самые просматриваемые</div>
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                <div className="col-span-6">Файл</div>
                <div className="col-span-3 text-right">Просмотры</div>
                <div className="col-span-3 text-right">Сохранения</div>
              </div>
              {data.topViewed.map((it) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                  <Link to={`/asset/${it.id}`} className="col-span-6 truncate hover:underline">
                    {it.title ?? `Файл #${it.id}`}
                  </Link>
                  <div className="col-span-3 text-right text-gray-700">{it.views}</div>
                  <div className="col-span-3 text-right text-gray-700">{it.saves}</div>
                </div>
              ))}
              {data.topViewed.length === 0 && (
                <div className="p-4 text-sm text-gray-500">Пока нет просмотров.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


