import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchBar } from '../features/search/SearchBar';
import { FilterPanel } from '../features/search/FilterPanel';
import { SavedSearchModal } from '../features/search/SavedSearchModal';
import { apiDelete, apiGet, apiPost } from '../shared/api';

interface DriveFolder {
  id: number;
  parentId: number | null;
  name: string;
}

interface DriveFile {
  id: number;
  fileId: number | null;
  type: 'image' | 'video' | 'audio' | 'doc';
  name: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface DriveListResponse {
  folderId: number | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  folders: DriveFolder[];
  files: DriveFile[];
}

interface SearchResponse {
  items: Array<{
    id: number;
    fileId?: number | null;
    folderId?: number | null;
    type: 'image' | 'video' | 'audio' | 'doc';
    title: string | null;
    description: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    createdAt: string;
  }>;
  total: number;
}

type UploadState = 'queued' | 'uploading' | 'done' | 'error';

interface UploadItem {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  state: UploadState;
  assetId?: number;
  fileId?: number;
  error?: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function LibraryPage() {
  const [sp, setSp] = useSearchParams();
  const folderId = sp.get('folderId');
  const activeFolderId = folderId ? Number(folderId) : null;
  const initialQ = sp.get('q') ?? '';

  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<DriveListResponse | null>(null);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const inSearchMode = debouncedQ.trim() !== '';

  useEffect(() => {
    setQ(initialQ);
    setDebouncedQ(initialQ);
  }, [initialQ]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQ = q.trim();
      setDebouncedQ(nextQ);

      const next = new URLSearchParams(sp);
      if (nextQ) next.set('q', nextQ);
      else next.delete('q');

      const currentQ = sp.get('q') ?? '';
      if (currentQ !== nextQ) {
        setSp(next, { replace: true });
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (inSearchMode) {
        const filters: any[] = [];
        if (activeFolderId) filters.push({ field: 'folderId', op: 'eq', value: activeFolderId });
        const data = await apiPost<SearchResponse>('/api/search', {
          q: debouncedQ.trim(),
          filters,
          sort: [{ field: 'createdAt', dir: 'desc' }],
          page: 1,
          perPage: 50,
        });
        setSearch(data);
        setList(null);
      } else {
        const data = await apiGet<DriveListResponse>(`/api/drive/list${activeFolderId ? `?folderId=${activeFolderId}` : ''}`);
        setList(data);
        setSearch(null);
      }
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, inSearchMode, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const breadcrumbs = useMemo(() => {
    const bc = list?.breadcrumbs ?? [];
    return [{ id: 0, name: 'Мой диск' }, ...bc];
  }, [list?.breadcrumbs]);

  function openFolder(id: number | null) {
    const next = new URLSearchParams(sp);
    if (!id) next.delete('folderId');
    else next.set('folderId', String(id));
    next.delete('q');
    setQ('');
    setSp(next, { replace: true });
  }

  async function createFolder() {
    const name = window.prompt('Название папки');
    if (!name) return;
    await apiPost('/api/folders', { name, parentId: activeFolderId });
    await load();
  }

  async function deleteFolder(id: number) {
    if (!window.confirm('Удалить папку и всё внутри?')) return;
    await apiDelete(`/api/folders/${id}`);
    await load();
  }

  async function deleteFile(assetId: number) {
    if (!window.confirm('Переместить файл в корзину?')) return;
    await apiDelete(`/api/assets/${assetId}`);
    await load();
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const batch = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: f.name,
      sizeBytes: f.size,
      progress: 0,
      state: 'queued' as UploadState,
      file: f,
    }));

    setUploads((prev) => [
      ...batch.map(({ file, ...rest }) => rest),
      ...prev,
    ]);

    for (const it of batch) {
      setUploads((prev) => prev.map((x) => (x.id === it.id ? { ...x, state: 'uploading', progress: 0 } : x)));

      try {
        const result = await uploadSingleFile(it.file, activeFolderId, (pct) => {
          setUploads((prev) => prev.map((x) => (x.id === it.id ? { ...x, progress: pct } : x)));
        });

        const first = result?.items?.[0];
        setUploads((prev) =>
          prev.map((x) =>
            x.id === it.id
              ? {
                  ...x,
                  progress: 100,
                  state: 'done',
                  assetId: first?.assetId ? Number(first.assetId) : undefined,
                  fileId: first?.fileId ? Number(first.fileId) : undefined,
                }
              : x
          )
        );
      } catch (e: any) {
        setUploads((prev) =>
          prev.map((x) =>
            x.id === it.id
              ? { ...x, state: 'error', error: e?.message ? String(e.message) : 'Ошибка загрузки' }
              : x
          )
        );
      }
    }

    await load();
  }

  async function saveSearch(name: string) {
    const request: any = {
      q: debouncedQ.trim(),
      filters: activeFolderId ? [{ field: 'folderId', op: 'eq', value: activeFolderId }] : [],
      sort: [{ field: 'createdAt', dir: 'desc' }],
      page: 1,
      perPage: 50,
    };
    await apiPost('/api/saved-searches', { name, request });
  }

  function submitSearch() {
    const nextQ = q.trim();
    setDebouncedQ(nextQ);
    const next = new URLSearchParams(sp);
    if (nextQ) next.set('q', nextQ);
    else next.delete('q');
    setSp(next, { replace: true });
  }

  return (
    <div className="flex gap-6">
      <FilterPanel>
        <div className="space-y-2">
          <button onClick={createFolder} className="w-full rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
            + Новая папка
          </button>
          <label className="block">
            <span className="sr-only">Загрузить файлы</span>
            <input
              type="file"
              multiple
              onChange={(e) => uploadFiles(e.target.files)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-white hover:file:bg-black"
            />
          </label>
          {uploads.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-xs font-medium text-gray-600">Загрузки</div>
              <div className="space-y-2">
                {uploads.slice(0, 6).map((u) => (
                  <div key={u.id} className="rounded-md border bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{u.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {formatBytes(u.sizeBytes)} ·{' '}
                          {u.state === 'queued'
                            ? 'в очереди'
                            : u.state === 'uploading'
                              ? `загрузка ${u.progress}%`
                              : u.state === 'done'
                                ? 'готово'
                                : 'ошибка'}
                        </div>
                      </div>
                      {u.state === 'done' && u.assetId && (
                        <Link to={`/asset/${u.assetId}`} className="shrink-0 text-xs text-gray-900 underline">
                          Открыть
                        </Link>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-100">
                      <div
                        className={`h-full ${u.state === 'error' ? 'bg-red-500' : 'bg-gray-900'}`}
                        style={{ width: `${Math.max(2, Math.min(100, u.progress))}%` }}
                      />
                    </div>
                    {u.state === 'error' && u.error && (
                      <div className="mt-2 text-[11px] text-red-700">{u.error}</div>
                    )}
                  </div>
                ))}
                {uploads.length > 6 && (
                  <div className="text-[11px] text-gray-500">Ещё {uploads.length - 6}…</div>
                )}
                <button
                  onClick={() => setUploads([])}
                  className="w-full rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                >
                  Очистить
                </button>
              </div>
            </div>
          )}
          {inSearchMode && (
            <button
              onClick={() => setSaveModalOpen(true)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Сохранить поиск
            </button>
          )}
        </div>
      </FilterPanel>

      <div className="flex-1 space-y-4">
        <SearchBar value={q} onChange={setQ} onSearch={submitSearch} placeholder="Поиск по файлам и метаданным…" />

        {loading && <div className="rounded-md border bg-white p-6">Загрузка…</div>}

        {!loading && !inSearchMode && list && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              {breadcrumbs.map((b, idx) => (
                <button
                  key={b.id || idx}
                  onClick={() => openFolder(b.id === 0 ? null : b.id)}
                  className="rounded px-2 py-1 hover:bg-gray-100"
                >
                  {b.name}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-md border bg-white">
              <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                <div className="col-span-6">Имя</div>
                <div className="col-span-3">Тип</div>
                <div className="col-span-2 text-right">Размер</div>
                <div className="col-span-1" />
              </div>
              {list.folders.map((f) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                  <button className="col-span-6 text-left font-medium" onClick={() => openFolder(f.id)}>
                    📁 {f.name}
                  </button>
                  <div className="col-span-3 text-gray-500">Папка</div>
                  <div className="col-span-2 text-right text-gray-500">—</div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => deleteFolder(f.id)} className="text-xs text-red-600 hover:underline">Удалить</button>
                  </div>
                </div>
              ))}
              {list.files.map((f) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                  <Link to={`/asset/${f.id}`} className="col-span-6 truncate">
                    {f.name ?? `Файл #${f.id}`}
                  </Link>
                  <div className="col-span-3 truncate text-gray-500">{f.mimeType ?? f.type}</div>
                  <div className="col-span-2 text-right text-gray-500">{formatBytes(f.sizeBytes)}</div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => deleteFile(f.id)} className="text-xs text-red-600 hover:underline">В корзину</button>
                  </div>
                </div>
              ))}
              {list.folders.length === 0 && list.files.length === 0 && (
                <div className="p-6 text-sm text-gray-500">Папка пуста. Загрузите файлы или создайте папку.</div>
              )}
            </div>
          </div>
        )}

        {!loading && inSearchMode && search && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Найдено: <span className="font-medium text-gray-900">{search.total}</span>
              </div>
              <button
                onClick={() => {
                  setQ('');
                  const next = new URLSearchParams(sp);
                  next.delete('q');
                  setSp(next, { replace: true });
                }}
                className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Сбросить
              </button>
            </div>
            <div className="overflow-hidden rounded-md border bg-white">
              <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                <div className="col-span-6">Имя</div>
                <div className="col-span-3">Тип</div>
                <div className="col-span-2 text-right">Размер</div>
                <div className="col-span-1" />
              </div>
              {search.items.map((it) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                  <Link to={`/asset/${it.id}`} className="col-span-6 truncate">
                    {it.title ?? `Файл #${it.id}`}
                  </Link>
                  <div className="col-span-3 truncate text-gray-500">{it.mimeType ?? it.type}</div>
                  <div className="col-span-2 text-right text-gray-500">{formatBytes(it.sizeBytes ?? null)}</div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => deleteFile(it.id)} className="text-xs text-red-600 hover:underline">В корзину</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <SavedSearchModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={async (name) => {
          await saveSearch(name);
        }}
      />
    </div>
  );
}

async function uploadSingleFile(
  file: File,
  folderId: number | null,
  onProgress: (pct: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/api/files/upload${folderId ? `?folderId=${encodeURIComponent(String(folderId))}` : ''}`;
    xhr.open('POST', url, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress(Math.max(0, Math.min(100, pct)));
    };

    xhr.onerror = () => reject(new Error('Ошибка сети при загрузке'));
    xhr.onabort = () => reject(new Error('Загрузка отменена'));
    xhr.onload = () => {
      try {
        const data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error || `Ошибка загрузки (HTTP ${xhr.status})`));
      } catch {
        reject(new Error(`Ошибка загрузки (HTTP ${xhr.status})`));
      }
    };

    const fd = new FormData();
    if (folderId) fd.append('folderId', String(folderId));
    fd.append('files', file, file.name);
    xhr.send(fd);
  });
}








