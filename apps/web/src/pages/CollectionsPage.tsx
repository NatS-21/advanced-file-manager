import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../shared/api';

export function CollectionsPage() {
  const [collections, setCollections] = useState<Array<{ id: number; name: string; items: number }>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<Array<{ id: number; title: string | null; type: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);

  async function loadCollections() {
    setLoading(true);
    try {
      const data = await apiGet<Array<{ id: number; name: string; items: number }>>('/api/collections');
      setCollections(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(id: number) {
    setLoading(true);
    try {
      const data = await apiGet<Array<{ id: number; title: string | null; type: string; createdAt: string }>>(`/api/collections/${id}/items`);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCollections();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="rounded-md border bg-white p-4 md:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Коллекции</div>
          <button
            onClick={async () => {
              const name = window.prompt('Название коллекции');
              if (!name) return;
              await apiPost('/api/collections', { name });
              await loadCollections();
            }}
            className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
          >
            + Создать
          </button>
        </div>

        {loading && collections.length === 0 ? (
          <div className="text-sm text-gray-500">Загрузка…</div>
        ) : (
          <div className="space-y-1">
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={async () => {
                  setSelectedId(c.id);
                  await loadItems(c.id);
                }}
                className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-gray-50 ${
                  selectedId === c.id ? 'bg-gray-50' : ''
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="ml-2 text-xs text-gray-500">{c.items}</span>
              </button>
            ))}
            {collections.length === 0 && <div className="text-sm text-gray-500">Пока пусто.</div>}
          </div>
        )}
      </div>

      <div className="rounded-md border bg-white p-4 md:col-span-2">
        {!selectedId ? (
          <div className="text-sm text-gray-500">Выберите коллекцию слева.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Содержимое</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const name = window.prompt('Новое название');
                    if (!name) return;
                    await apiPatch(`/api/collections/${selectedId}`, { name });
                    await loadCollections();
                  }}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                >
                  Переименовать
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm('Удалить коллекцию?')) return;
                    await apiDelete(`/api/collections/${selectedId}`);
                    setSelectedId(null);
                    setItems([]);
                    await loadCollections();
                  }}
                  className="rounded-md border px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Удалить
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-gray-500">Загрузка…</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-gray-500">В коллекции пока нет файлов.</div>
            ) : (
              <div className="divide-y">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between py-2 text-sm">
                    <Link to={`/asset/${it.id}`} className="truncate hover:underline">
                      {it.title ?? `Файл #${it.id}`}
                    </Link>
                    <button
                      onClick={async () => {
                        await apiDelete(`/api/collections/${selectedId}/assets/${it.id}`);
                        await loadItems(selectedId);
                        await loadCollections();
                      }}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Удалить из коллекции
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}








