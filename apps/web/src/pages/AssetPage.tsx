import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AssetPreview } from '../entities/asset/AssetPreview';
import { apiDelete, apiGet, apiPost } from '../shared/api';

export function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Array<{ id: number; name: string }>>([]);
  const [collectionId, setCollectionId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/assets/${id}`);
      if (!ignore) {
        setData(await res.json());
        setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [id]);

  useEffect(() => {
    apiGet<Array<{ id: number; name: string }>>('/api/collections')
      .then((cs) => setCollections(cs.map((c: any) => ({ id: Number(c.id), name: String(c.name) }))))
      .catch(() => setCollections([]));
  }, []);

  if (loading) return <div className="rounded-md border bg-white p-6">Загрузка...</div>;
  if (!data) return <div className="rounded-md border bg-white p-6">Не найдено</div>;

  const fileId = data.file_id ? Number(data.file_id) : null;
  const previewSrc = fileId ? `/api/files/${fileId}/preview` : undefined;
  const downloadHref = fileId ? `/api/files/${fileId}/download` : undefined;
  const views = Number(data.engagement_views ?? 0);
  const saves = Number(data.engagement_saves ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <Link to="/" className="hover:underline">← Назад</Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={saving}
            onClick={async () => {
              if (!id) return;
              setSaving(true);
              setSaveToast(null);
              try {
                const res = await apiPost<{ ok: boolean; saves: number }>(`/api/assets/${id}/save`, {});
                setData((prev: any) => ({ ...prev, engagement_saves: res?.saves ?? (Number(prev?.engagement_saves ?? 0) + 1) }));
                setSaveToast('Сохранено');
                window.setTimeout(() => setSaveToast(null), 1200);
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Переместить файл в корзину?')) return;
              await apiDelete(`/api/assets/${id}`);
              nav('/', { replace: true });
            }}
            className="rounded-md border px-3 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            В корзину
          </button>
        </div>
      </div>

      <div className="rounded-md border bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{data.title ?? `Файл #${id}`}</div>
            <div className="mt-1 text-sm text-gray-600">
              {data.file_mime_type ?? data.type} · {data.file_size_bytes != null ? `${Number(data.file_size_bytes)} B` : '—'}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Просмотры: <span className="text-gray-700">{views}</span> · Сохранения:{' '}
              <span className="text-gray-700">{saves}</span>
              {saveToast && <span className="ml-2 text-green-700">{saveToast}</span>}
            </div>
          </div>
          {downloadHref && (
            <a
              href={downloadHref}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black"
            >
              Скачать
            </a>
          )}
        </div>

        <div className="overflow-hidden rounded-md border bg-gray-50">
          <AssetPreview src={previewSrc} type={data.type} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value ? Number(e.target.value) : '')}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Добавить в коллекцию…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={!collectionId}
            onClick={async () => {
              if (!collectionId) return;
              await apiPost(`/api/collections/${collectionId}/assets`, { assetId: Number(id) });
              setCollectionId('');
              window.alert('Добавлено');
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Добавить
          </button>
        </div>

        {data.description && (
          <div className="mt-4 text-sm text-gray-700">{data.description}</div>
        )}
      </div>

      <details className="rounded-md border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
        <pre className="mt-3 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}








