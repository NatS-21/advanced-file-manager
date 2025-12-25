import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch } from '../shared/api';

export function SavedSearchesPage() {
  const [items, setItems] = useState<Array<{ id: number; name: string; request: any; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<Array<{ id: number; name: string; request: any; createdAt: string }>>('/api/saved-searches');
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="mb-3 text-sm font-medium">Сохранённые поиски</div>
      {loading ? (
        <div className="text-sm text-gray-500">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">Пока пусто. Сохраните поиск на странице “Библиотека”.</div>
      ) : (
        <div className="divide-y">
          {items.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  q: <span className="font-mono">{String(s.request?.q ?? '')}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={`/?q=${encodeURIComponent(String(s.request?.q ?? ''))}`}
                  className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
                >
                  Применить
                </Link>
                <button
                  onClick={async () => {
                    const name = window.prompt('Новое название', s.name);
                    if (!name) return;
                    await apiPatch(`/api/saved-searches/${s.id}`, { name });
                    await load();
                  }}
                  className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
                >
                  Переименовать
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm('Удалить сохранённый поиск?')) return;
                    await apiDelete(`/api/saved-searches/${s.id}`);
                    await load();
                  }}
                  className="rounded-md border px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}








