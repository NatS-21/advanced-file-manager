import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SearchBar } from '../features/search/SearchBar';
import { SavedSearchModal } from '../features/search/SavedSearchModal';
import { AdvancedFilters } from '../features/search/AdvancedFilters';
import { FileThumbnail } from '../shared/FileThumbnail';
import { apiDelete, apiGet, apiPost, apiPatch } from '../shared/api';
import type { Filter } from '@afm/shared/search/dsl';

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

interface FolderNode {
  id: number;
  parentId: number | null;
  name: string;
  depth: number;
  childrenIds: number[];
  isLoading: boolean;
  hasLoadedChildren: boolean;
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

type SavedSearch = {
  id: number;
  name: string;
  request: any;
  createdAt: string;
};

type DragItem = {
  kind: 'folder' | 'file';
  id: number;
};

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

function formatFileType(mimeType: string | null, type?: 'image' | 'video' | 'audio' | 'doc'): string {
  if (mimeType) {
    const mime = mimeType.toLowerCase();
    let subtype = '';
    if (mime.startsWith('image/')) subtype = mime.slice(6);
    else if (mime.startsWith('video/')) subtype = mime.slice(6);
    else if (mime.startsWith('audio/')) subtype = mime.slice(6);
    if (subtype) {
      if (subtype === 'jpeg' || subtype === 'jpg') return 'JPEG';
      if (subtype === 'svg+xml') return 'SVG';
      if (subtype === 'x-matroska') return 'MKV';
      if (subtype === 'mpeg' || subtype === 'mp3') return 'MP3';
      if (subtype === 'quicktime') return 'MOV';
      return subtype.replace(/^x-/, '').toUpperCase();
    }
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('word') || mime.includes('document')) return 'DOC';
    if (mime.includes('excel') || mime.includes('spreadsheet')) return 'XLS';
    if (mime.includes('powerpoint') || mime.includes('presentation')) return 'PPT';
    if (mime.includes('text') || mime.includes('plain')) return 'TXT';
    if (mime.includes('json')) return 'JSON';
    if (mime.includes('zip')) return 'ZIP';
    if (mime.includes('html')) return 'HTML';
    const slash = mime.indexOf('/');
    if (slash > 0) return mime.slice(slash + 1).replace(/^x-/, '').toUpperCase();
  }
  const typeLabels: Record<string, string> = {
    image: 'Изображение',
    video: 'Видео',
    audio: 'Аудио',
    doc: 'Документ',
  };
  return type ? (typeLabels[type] ?? type) : '—';
}

export function LibraryPage() {
  const location = useLocation();
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
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(new Set());
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const [filterVisibleFields, setFilterVisibleFields] = useState<string[] | undefined>(undefined);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [savedSearchesLoading, setSavedSearchesLoading] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);

  // Состояние дерева папок внутри текущей папки
  const [folderNodesById, setFolderNodesById] = useState<Record<number, FolderNode>>({});
  const [rootFolderIds, setRootFolderIds] = useState<number[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<number>>(new Set());

  const inSearchMode = debouncedQ.trim() !== '' || activeFilters.length > 0;

  // Если пришёл сохранённый поиск — применяем q и фильтры из сохранённого запроса
  useEffect(() => {
    const state = location.state as any;
    const savedRequest = state?.savedSearchRequest;
    if (!savedRequest) return;

    // Очищаем state после применения, чтобы не применять повторно при обновлении страницы
    window.history.replaceState({ ...state, savedSearchRequest: undefined }, '');

    const nextQ = String(savedRequest.q ?? '').trim();
    setQ(nextQ);
    setDebouncedQ(nextQ);

    const filtersFromSaved: Filter[] = Array.isArray(savedRequest.filters) ? savedRequest.filters : [];
    setActiveFilters(filtersFromSaved);

    const next = new URLSearchParams(sp);
    if (nextQ) next.set('q', nextQ);
    else next.delete('q');
    setSp(next, { replace: true });
  }, [location.state, sp, setSp]);

  async function loadSavedSearches() {
    setSavedSearchesLoading(true);
    try {
      const data = await apiGet<Array<SavedSearch>>('/api/saved-searches');
      setSavedSearches(data);
    } finally {
      setSavedSearchesLoading(false);
    }
  }

  function applySavedSearch(request: any) {
    const nextQ = String(request?.q ?? '').trim();
    setQ(nextQ);
    setDebouncedQ(nextQ);
    const filtersFromSaved: Filter[] = Array.isArray(request?.filters) ? request.filters : [];
    setActiveFilters(filtersFromSaved);

    const next = new URLSearchParams(sp);
    if (nextQ) next.set('q', nextQ);
    else next.delete('q');
    setSp(next, { replace: true });
  }

  function collectDescendantFolderIds(startId: number, acc: Set<number> = new Set()): Set<number> {
    const node = folderNodesById[startId];
    if (!node) return acc;
    for (const childId of node.childrenIds) {
      if (!acc.has(childId)) {
        acc.add(childId);
        collectDescendantFolderIds(childId, acc);
      }
    }
    return acc;
  }

  function canDropOnFolder(targetId: number | null): boolean {
    if (!dragItem) return false;
    // В корень можно перемещать любые элементы
    if (targetId === null) {
      if (dragItem.kind === 'folder') {
        // Нельзя перемещать корень самого в себя, но реальный корень не имеет id
        return true;
      }
      return true;
    }

    if (dragItem.kind === 'folder') {
      if (dragItem.id === targetId) return false;
      const descendants = collectDescendantFolderIds(dragItem.id, new Set());
      if (descendants.has(targetId)) return false;
    }

    return true;
  }

  async function handleDropOnFolder(targetFolderId: number | null) {
    if (!dragItem) return;
    try {
      if (dragItem.kind === 'file') {
        await apiPatch(`/api/assets/${dragItem.id}`, {
          folderId: targetFolderId,
        });
      } else {
        await apiPatch(`/api/folders/${dragItem.id}`, {
          parentId: targetFolderId,
        });
      }
      await load();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert(e?.message || 'Не удалось переместить');
    } finally {
      setDragItem(null);
      setDragOverFolderId(null);
    }
  }

  useEffect(() => {
    setQ(initialQ);
    setDebouncedQ(initialQ);
  }, [initialQ]);

  // При смене списка папок строим дерево и рекурсивно загружаем все подпапки,
  // чтобы по умолчанию всё было развёрнуто
  useEffect(() => {
    let cancelled = false;

    async function buildTree() {
      if (!list) {
        setFolderNodesById({});
        setRootFolderIds([]);
        setExpandedFolderIds(new Set());
        return;
      }

      const nodes: Record<number, FolderNode> = {};
      const expanded = new Set<number>();

      // Очередь для обхода в ширину: начинаем с корневых папок
      const queue: Array<{ folder: DriveFolder; depth: number; parentId: number | null }> = list.folders.map(
        (f) => ({
          folder: f,
          depth: 0,
          parentId: f.parentId ?? activeFolderId,
        })
      );

      while (queue.length && !cancelled) {
        const { folder, depth, parentId } = queue.shift()!;
        if (nodes[folder.id]) continue;

        expanded.add(folder.id);

        let children: DriveFolder[] = [];
        let files: DriveFile[] = [];

        try {
          const resp = await apiGet<DriveListResponse>(`/api/drive/list?folderId=${folder.id}`);
          children = resp.folders ?? [];
          files = resp.files ?? [];
        } catch {
          // Если не удалось загрузить подпапки — считаем, что их нет
          children = [];
          files = [];
        }

        const childIds = children.map((c) => c.id);

        nodes[folder.id] = {
          id: folder.id,
          parentId,
          name: folder.name,
          depth,
          childrenIds: childIds,
          isLoading: false,
          hasLoadedChildren: true,
          files,
        };

        for (const child of children) {
          queue.push({
            folder: child,
            depth: depth + 1,
            parentId: child.parentId ?? folder.id,
          });
        }
      }

      if (!cancelled) {
        setFolderNodesById(nodes);
        setRootFolderIds(list.folders.map((f) => f.id));
        setExpandedFolderIds(expanded);
      }
    }

    void buildTree();

    return () => {
      cancelled = true;
    };
  }, [list, activeFolderId]);

  // Загружаем пользовательские настройки для видимости полей фильтров
  useEffect(() => {
    apiGet<{ metadataFilters?: string[] }>('/api/settings')
      .then(data => {
        if (data.metadataFilters && data.metadataFilters.length > 0) {
          setFilterVisibleFields(data.metadataFilters);
        }
      })
      .catch(() => {
        // Если настроек нет, показываем все поля (undefined = показывать всё)
        setFilterVisibleFields(undefined);
      });
  }, []);

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
        const filters: any[] = [...activeFilters];
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
  }, [activeFolderId, inSearchMode, debouncedQ, activeFilters]);

  useEffect(() => {
    load();
  }, [load]);

  type DriveRow =
    | { kind: 'folder'; node: FolderNode }
    | { kind: 'file'; file: DriveFile; depth: number; parentFolderId: number | null };

  // Построение плоского списка строк (папки + файлы) для отображения в таблице
  const driveRows = useMemo(() => {
    const rows: DriveRow[] = [];

    function walk(ids: number[]) {
      for (const id of ids) {
        const node = folderNodesById[id];
        if (!node) continue;
        rows.push({ kind: 'folder', node });
        if (expandedFolderIds.has(id)) {
          if (node.files?.length) {
            for (const f of node.files) {
              rows.push({ kind: 'file', file: f, depth: node.depth + 1, parentFolderId: node.id });
            }
          }
          if (node.childrenIds.length > 0) walk(node.childrenIds);
        }
      }
    }

    walk(rootFolderIds);

    // Файлы текущей папки (как и раньше) показываем после списка папок
    if (list?.files?.length) {
      const parentId = list.folderId != null ? Number(list.folderId) : null;
      for (const f of list.files) {
        rows.push({ kind: 'file', file: f, depth: 0, parentFolderId: parentId });
      }
    }

    return rows;
  }, [folderNodesById, rootFolderIds, expandedFolderIds, list?.files]);

  const visibleFileIds = useMemo(() => {
    const ids: number[] = [];
    for (const r of driveRows) {
      if (r.kind === 'file') ids.push(r.file.id);
    }
    return ids;
  }, [driveRows]);

  const toggleFolderExpand = useCallback(
    async (id: number) => {
      const node = folderNodesById[id];
      if (!node) return;

      // Свернуть уже раскрытую папку
      if (expandedFolderIds.has(id)) {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return;
      }

      // Отметить как раскрытую
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      // Если дети уже загружены — ничего больше не делаем
      if (node.hasLoadedChildren || node.isLoading) {
        return;
      }

      // Загрузить дочерние папки лениво
      setFolderNodesById((prev) => ({
        ...prev,
        [id]: { ...prev[id], isLoading: true },
      }));

      try {
        const data = await apiGet<DriveListResponse>(`/api/drive/list?folderId=${id}`);
        setFolderNodesById((prev) => {
          const current = prev[id];
          if (!current) return prev;

          const next: Record<number, FolderNode> = { ...prev };
          const childIds: number[] = [];

          for (const f of data.folders) {
            const existing = next[f.id];
            next[f.id] = {
              id: f.id,
              parentId: f.parentId ?? id,
              name: f.name,
              depth: (current.depth ?? 0) + 1,
              childrenIds: existing?.childrenIds ?? [],
              isLoading: false,
              hasLoadedChildren: existing?.hasLoadedChildren ?? false,
              files: existing?.files ?? [],
            };
            childIds.push(f.id);
          }

          next[id] = {
            ...current,
            isLoading: false,
            hasLoadedChildren: true,
            childrenIds: childIds,
            files: data.files ?? [],
          };

          return next;
        });
      } catch {
        // В случае ошибки просто снимаем флаг загрузки
        setFolderNodesById((prev) => {
          const current = prev[id];
          if (!current) return prev;
          return {
            ...prev,
            [id]: { ...current, isLoading: false },
          };
        });
      }
    },
    [folderNodesById, expandedFolderIds]
  );

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

  async function deleteSelectedFiles() {
    if (selectedAssetIds.size === 0) return;
    if (!window.confirm(`Переместить ${selectedAssetIds.size} файл${selectedAssetIds.size !== 1 ? 'ов' : ''} в корзину?`)) return;
    
    const promises = Array.from(selectedAssetIds).map((id) => apiDelete(`/api/assets/${id}`));
    await Promise.all(promises);
    clearSelection();
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
    const filters: any[] = [...activeFilters];
    if (activeFolderId) filters.push({ field: 'folderId', op: 'eq', value: activeFolderId });
    const request: any = {
      q: debouncedQ.trim(),
      filters,
      sort: [{ field: 'createdAt', dir: 'desc' }],
      page: 1,
      perPage: 50,
    };
    await apiPost('/api/saved-searches', { name, request });
    // Обновляем список сохранённых поисков в выпадающем меню
    if (!savedSearchesLoading) {
      await loadSavedSearches();
    }
  }

  function submitSearch() {
    const nextQ = q.trim();
    setDebouncedQ(nextQ);
    const next = new URLSearchParams(sp);
    if (nextQ) next.set('q', nextQ);
    else next.delete('q');
    setSp(next, { replace: true });
  }

  function toggleSelection(assetId: number) {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  function selectAll() {
    const allIds = new Set<number>();
    if (inSearchMode && search) {
      search.items.forEach((item) => {
        if (item.id) allIds.add(item.id);
      });
    } else {
      // В обычном режиме выбираем все видимые файлы (включая раскрытые подпапки)
      for (const id of visibleFileIds) allIds.add(id);
    }
    setSelectedAssetIds(allIds);
  }

  function clearSelection() {
    setSelectedAssetIds(new Set());
  }

  async function handleExport() {
    if (selectedAssetIds.size === 0) return;

    setExporting(true);
    try {
      const response = await fetch('/api/assets/export', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssetIds),
          includeMetadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Не удалось экспортировать файлы' }));
        throw new Error(error.error || 'Не удалось экспортировать файлы');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `assets_export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setExportModalOpen(false);
      clearSelection();
    } catch (error: any) {
      console.error('Export error:', error);
      alert(error?.message || 'Не удалось экспортировать файлы');
    } finally {
      setExporting(false);
    }
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div>
      {/* Header with action buttons and search */}
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={createFolder}
            title="Новая папка"
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-6zM12 10v6m-3-3h6" />
            </svg>
          </button>
          <label>
            <span className="sr-only">Загрузить файлы</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => uploadFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Загрузить"
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
          </label>
                        </div>
        <div className="flex-1">
          <SearchBar value={q} onChange={setQ} onSearch={submitSearch} placeholder="Поиск по файлам и метаданным…" />
                      </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <button
              onClick={() => setFiltersOpen(true)}
              className={`rounded-md border p-2 hover:bg-gray-50 ${
                activeFilters.length > 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white text-gray-600'
              }`}
              title="Фильтры"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {activeFilters.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </div>
          <div className="relative">
            <button
              onClick={async () => {
                if (!savedSearchesOpen && savedSearches.length === 0 && !savedSearchesLoading) {
                  await loadSavedSearches();
                }
                setSavedSearchesOpen((prev) => !prev);
              }}
              className="rounded-md border p-2 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              title="Сохранённые поиски"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
              </svg>
            </button>
            {savedSearchesOpen && (
              <div className="absolute right-0 z-50 mt-2 w-72 rounded-md border bg-white shadow-xl ring-1 ring-black/5">
                <div className="border-b px-3 py-2 text-sm font-medium text-gray-700">
                  Сохранённые поиски
                </div>
                <div className="max-h-80 overflow-y-auto px-3 py-2 text-sm">
                  {savedSearchesLoading ? (
                    <div className="text-gray-500">Загрузка…</div>
                  ) : savedSearches.length === 0 ? (
                    <div className="text-gray-500">Пока нет сохранённых поисков</div>
                  ) : (
                    <ul className="space-y-1">
                      {savedSearches.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => {
                              applySavedSearch(s.request);
                              setSavedSearchesOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-gray-50"
                          >
                            <span className="truncate">{s.name}</span>
                            <span className="ml-2 text-[10px] text-gray-400">
                              {String(s.request?.q ?? '').slice(0, 20)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
          {inSearchMode && (
            <button
              onClick={() => setSaveModalOpen(true)}
            className="shrink-0 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Сохранить поиск
            </button>
          )}
        </div>

      <div>
        {/* Active filters chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((f: any, idx) => {
              const fieldLabel = f.field === 'type' ? 'Тип' :
                f.field === 'status' ? 'Статус' :
                f.field === 'visibility' ? 'Видимость' :
                f.field === 'rating' ? 'Рейтинг' :
                f.field === 'createdAt' ? 'Дата создания' :
                f.field === 'capturedAt' ? 'Дата съёмки' :
                f.field === 'width' ? 'Ширина' :
                f.field === 'height' ? 'Высота' :
                f.field === 'durationSec' ? 'Длительность' :
                f.field === 'sizeBytes' ? 'Размер' :
                f.field === 'tags' ? 'Теги' :
                f.field;
              const valueLabel = Array.isArray(f.value) 
                ? f.value.length > 0 ? `${f.value[0]}–${f.value[1] || '∞'}` : ''
                : String(f.value || '');
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800"
                >
                  {fieldLabel}: {valueLabel}
                  <button
                    onClick={() => {
                      const newFilters = activeFilters.filter((_, i) => i !== idx);
                      setActiveFilters(newFilters);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            <button
              onClick={() => setActiveFilters([])}
              className="text-xs text-gray-600 hover:text-gray-900 underline"
            >
              Сбросить все
            </button>
          </div>
        )}

        {loading && <div className="rounded-md border bg-white p-6">Загрузка…</div>}

        {!loading && !inSearchMode && list && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              {breadcrumbs.map((b, idx) => (
                <button
                  key={b.id || idx}
                  onClick={() => openFolder(b.id === 0 ? null : b.id)}
                  className="rounded px-2 py-1 hover:bg-gray-100"
                  onDragOver={(e) => {
                    if (!dragItem) return;
                    const targetFolderId = b.id === 0 ? null : b.id;
                    if (canDropOnFolder(targetFolderId)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const targetFolderId = b.id === 0 ? null : b.id;
                    if (!canDropOnFolder(targetFolderId)) return;
                    void handleDropOnFolder(targetFolderId);
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {selectedAssetIds.size > 0 && (
                <div className="flex items-center justify-between rounded-md border bg-blue-50 px-4 py-2">
                  <div className="text-sm text-blue-900">
                    Выбрано: {selectedAssetIds.size} файл{selectedAssetIds.size !== 1 ? 'ов' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearSelection}
                      className="rounded-md border bg-white px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      Снять выбор
                    </button>
                    <button
                      onClick={deleteSelectedFiles}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                    >
                      Удалить выбранные
                    </button>
                    <button
                      onClick={() => setExportModalOpen(true)}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      Экспорт выбранных
                    </button>
                  </div>
                </div>
              )}
            <div className="overflow-hidden rounded-md border bg-white">
              {/* Фиксируем ширину под чекбокс и иконку, чтобы на узких экранах текст не налезал на thumbnail */}
              <div className="grid grid-cols-[2.5rem_6rem_minmax(0,1fr)_8rem_6rem_1rem] gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                <div>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) selectAll();
                      else clearSelection();
                    }}
                    checked={visibleFileIds.length > 0 && visibleFileIds.every((id) => selectedAssetIds.has(id))}
                    className="rounded border-gray-300"
                  />
                </div>
                <div />
                <div>Имя</div>
                <div>Тип</div>
                <div className="text-right">Размер</div>
                <div />
              </div>
              {driveRows.map((row, index) => {
                if (row.kind === 'folder') {
                  const node = row.node;
                  const isExpanded = expandedFolderIds.has(node.id);
                  // До первой загрузки показываем стрелку всегда; после загрузки скрываем, если папка пуста
                  const canToggle = !node.hasLoadedChildren || node.childrenIds.length > 0 || node.files.length > 0;
                  const isGroupHighlighted = dragOverFolderId === node.id;
                  const next = driveRows[index + 1];
                  const hasHighlightedFiles =
                    isGroupHighlighted && next && next.kind === 'file' && next.parentFolderId === node.id;
                  return (
                    <div
                      key={`folder-${node.id}`}
                      data-folder-id={node.id}
                      draggable
                      onDragStart={(e) => {
                        setDragItem({ kind: 'folder', id: node.id });
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDragItem(null);
                        setDragOverFolderId(null);
                      }}
                      onDragOver={(e) => {
                        if (!canDropOnFolder(node.id)) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverFolderId !== node.id) {
                          setDragOverFolderId(node.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (dragOverFolderId !== node.id) return;
                        const relatedTarget = e.relatedTarget as HTMLElement | null;
                        if (relatedTarget) {
                          // Если уходим на файл из этой же папки — не сбрасываем подсветку
                          const relatedFileRow = relatedTarget.closest('[data-file-id]');
                          if (relatedFileRow) {
                            const relatedFileId = relatedFileRow.getAttribute('data-file-id');
                            const relatedRow = driveRows.find(
                              (r) => r.kind === 'file' && String(r.file.id) === relatedFileId
                            );
                            if (
                              relatedRow &&
                              relatedRow.kind === 'file' &&
                              relatedRow.parentFolderId === node.id
                            ) {
                              return;
                            }
                          }
                        }
                        setDragOverFolderId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!canDropOnFolder(node.id)) return;
                        void handleDropOnFolder(node.id);
                      }}
                      className={`grid grid-cols-[2.5rem_6rem_minmax(0,1fr)_8rem_6rem_1rem] gap-2 px-3 py-2 text-sm ${
                        isGroupHighlighted
                          ? hasHighlightedFiles
                            ? 'rounded-t-md border border-b-0 border-blue-400 bg-blue-50'
                            : 'rounded-md border border-blue-400 bg-blue-50'
                          : 'rounded-md border border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <div />
                      <div className="flex items-center">
                        <div className="flex items-center" style={{ marginLeft: node.depth * 10 }}>
                          {canToggle ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolderExpand(node.id);
                              }}
                              disabled={node.isLoading}
                              className="mr-1 flex h-4 w-4 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-50"
                              aria-label={isExpanded ? 'Свернуть папку' : 'Развернуть папку'}
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isExpanded ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                )}
                              </svg>
                            </button>
                          ) : (
                            <span className="mr-1 h-4 w-4" />
                          )}
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border bg-gray-50 text-2xl">
                            📁
                          </div>
                        </div>
                      </div>
                      <button
                        className="min-w-0 text-left font-medium"
                        onClick={() => openFolder(node.id)}
                        title={node.name}
                      >
                        <span className="block truncate">{node.name}</span>
                      </button>
                      <div className="text-gray-500">Папка</div>
                      <div className="text-right text-gray-500">—</div>
                      <div />
                    </div>
                  );
                }

                const f = row.file;
                const parentFolderId = row.parentFolderId ?? null;
                const isGroupHighlighted =
                  dragOverFolderId != null && parentFolderId != null && dragOverFolderId === parentFolderId;
                const next = driveRows[index + 1];
                const isLastInGroup =
                  isGroupHighlighted &&
                  !(next && next.kind === 'file' && next.parentFolderId === parentFolderId);
                return (
                  <div
                    key={`file-${f.id}`}
                    data-file-id={f.id}
                    draggable
                    onDragStart={(e) => {
                      setDragItem({ kind: 'file', id: f.id });
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (parentFolderId == null) return;
                      if (!canDropOnFolder(parentFolderId)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverFolderId !== parentFolderId) {
                        setDragOverFolderId(parentFolderId);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (dragOverFolderId !== parentFolderId) return;
                      const relatedTarget = e.relatedTarget as HTMLElement | null;
                      if (relatedTarget) {
                        // Переход на другой файл той же папки
                        const relatedFileRow = relatedTarget.closest('[data-file-id]');
                        if (relatedFileRow) {
                          const relatedFileId = relatedFileRow.getAttribute('data-file-id');
                          const relatedFileRowData = driveRows.find(
                            (r) => r.kind === 'file' && String(r.file.id) === relatedFileId
                          );
                          if (
                            relatedFileRowData &&
                            relatedFileRowData.kind === 'file' &&
                            relatedFileRowData.parentFolderId === parentFolderId
                          ) {
                            return;
                          }
                        }
                        // Переход обратно на строку папки
                        const relatedFolderRow = relatedTarget.closest('[data-folder-id]');
                        if (relatedFolderRow) {
                          const relatedFolderId = Number(relatedFolderRow.getAttribute('data-folder-id'));
                          if (relatedFolderId === parentFolderId) {
                            return;
                          }
                        }
                      }
                      // Покидаем группу папки целиком — сбрасываем подсветку
                      setDragOverFolderId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (parentFolderId == null) return;
                      if (!canDropOnFolder(parentFolderId)) return;
                      void handleDropOnFolder(parentFolderId);
                    }}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDragOverFolderId(null);
                    }}
                    className={`grid grid-cols-[2.5rem_6rem_minmax(0,1fr)_8rem_6rem_1rem] gap-2 px-3 py-2 text-sm ${
                      isGroupHighlighted
                        ? isLastInGroup
                          ? 'border border-t-0 border-blue-400 bg-blue-50 rounded-b-md'
                          : 'border-l border-r border-b-0 border-blue-400 bg-blue-50'
                        : 'border border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.has(f.id)}
                        onChange={() => toggleSelection(f.id)}
                        className="rounded border-gray-300"
                      />
                    </div>
                    <div className="flex items-center">
                      <div className="flex items-center" style={{ marginLeft: row.depth * 10 }}>
                        {/* Плейсхолдер под стрелку, чтобы иконки файлов и папок не \"прыгали\" */}
                        <span className="mr-1 h-4 w-4" />
                        <FileThumbnail fileId={f.fileId} mimeType={f.mimeType} type={f.type} />
                      </div>
                    </div>
                    <Link
                      to={`/asset/${f.id}`}
                      className="min-w-0 flex items-center"
                      title={f.name ?? `Файл #${f.id}`}
                    >
                      <span className="block truncate">{f.name ?? `Файл #${f.id}`}</span>
                    </Link>
                    <div className="truncate text-gray-500">{formatFileType(f.mimeType, f.type)}</div>
                    <div className="text-right text-gray-500">{formatBytes(f.sizeBytes)}</div>
                    <div />
                  </div>
                );
              })}
              {list.folders.length === 0 && list.files.length === 0 && (
                <div className="p-6 text-sm text-gray-500">Папка пуста. Загрузите файлы или создайте папку.</div>
              )}
              </div>
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
            <div className="space-y-2">
              {selectedAssetIds.size > 0 && (
                <div className="flex items-center justify-between rounded-md border bg-blue-50 px-4 py-2">
                  <div className="text-sm text-blue-900">
                    Выбрано: {selectedAssetIds.size} файл{selectedAssetIds.size !== 1 ? 'ов' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearSelection}
                      className="rounded-md border bg-white px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      Снять выбор
                    </button>
                    <button
                      onClick={deleteSelectedFiles}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                    >
                      Удалить выбранные
                    </button>
                    <button
                      onClick={() => setExportModalOpen(true)}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      Экспорт выбранных
                    </button>
                  </div>
                </div>
              )}
            <div className="overflow-hidden rounded-md border bg-white">
              <div className="grid grid-cols-[2.5rem_6rem_minmax(0,1fr)_8rem_6rem_1rem] gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                  <div>
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) selectAll();
                        else clearSelection();
                      }}
                      checked={selectedAssetIds.size > 0 && search?.items.length === selectedAssetIds.size}
                      className="rounded border-gray-300"
                    />
                  </div>
                  <div />
                  <div>Имя</div>
                <div>Тип</div>
                <div className="text-right">Размер</div>
                <div />
              </div>
              {search.items.map((it) => {
                const parentFolderId = (it as any).folderId ?? null;
                return (
                  <div
                    key={it.id}
                    data-file-id={it.id}
                    draggable
                    onDragStart={(e) => {
                      setDragItem({ kind: 'file', id: it.id });
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (parentFolderId == null) return;
                      if (!canDropOnFolder(parentFolderId)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverFolderId !== parentFolderId) {
                        setDragOverFolderId(parentFolderId);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (dragOverFolderId !== parentFolderId) return;
                      // Проверяем, не переходим ли мы на другой файл той же папки
                      const relatedTarget = e.relatedTarget as HTMLElement | null;
                      if (relatedTarget) {
                        const relatedRow = relatedTarget.closest('[data-file-id]');
                        if (relatedRow) {
                          const relatedFileId = relatedRow.getAttribute('data-file-id');
                          const relatedFile = search.items.find((item) => String(item.id) === relatedFileId);
                          if (relatedFile && (relatedFile as any).folderId === parentFolderId) {
                            // Переходим на другой файл той же папки - не сбрасываем подсветку
                            return;
                          }
                        }
                      }
                      // Покидаем группу файлов - сбрасываем подсветку
                      setDragOverFolderId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (parentFolderId == null) return;
                      if (!canDropOnFolder(parentFolderId)) return;
                      void handleDropOnFolder(parentFolderId);
                    }}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDragOverFolderId(null);
                    }}
                    className={`grid grid-cols-[2.5rem_6rem_minmax(0,1fr)_8rem_6rem_1rem] gap-2 px-3 py-2 text-sm rounded-md border ${
                      dragOverFolderId != null && dragOverFolderId === parentFolderId
                        ? 'bg-blue-50 border-blue-400'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.has(it.id)}
                        onChange={() => toggleSelection(it.id)}
                        className="rounded border-gray-300"
                      />
                    </div>
                    <div className="flex items-center">
                      <FileThumbnail fileId={it.fileId ?? null} mimeType={it.mimeType ?? null} type={it.type} />
                    </div>
                    <Link to={`/asset/${it.id}`} className="min-w-0 flex items-center" title={it.title ?? `Файл #${it.id}`}>
                    <span className="block truncate">{it.title ?? `Файл #${it.id}`}</span>
                  </Link>
                  <div className="truncate text-gray-500">{formatFileType(it.mimeType ?? null, it.type)}</div>
                    <div className="text-right text-gray-500">{formatBytes(it.sizeBytes ?? null)}</div>
                    <div />
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating upload status window */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="text-sm font-medium">Загрузки</div>
            <button
              onClick={() => setUploads([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            <div className="space-y-2">
              {uploads.slice(0, 10).map((u) => (
                <div key={u.id} className="rounded-md border bg-gray-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
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
                      <Link
                        to={`/asset/${u.assetId}`}
                        className="shrink-0 text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        Открыть
                      </Link>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-200">
                    <div
                      className={`h-full transition-all ${u.state === 'error' ? 'bg-red-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.max(2, Math.min(100, u.progress))}%` }}
                    />
                  </div>
                  {u.state === 'error' && u.error && (
                    <div className="mt-1 text-[11px] text-red-700">{u.error}</div>
                  )}
                </div>
              ))}
              {uploads.length > 10 && (
                <div className="text-center text-[11px] text-gray-500">
                  Ещё {uploads.length - 10} загрузок…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AdvancedFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onApply={(filters) => {
          setActiveFilters(filters);
        }}
        activeFilters={activeFilters}
        visibleFields={filterVisibleFields}
      />

      <SavedSearchModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={async (name) => {
          await saveSearch(name);
        }}
      />

      {/* Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-md border bg-white p-6 shadow-lg" style={{ width: '400px' }}>
            <h3 className="mb-4 text-lg font-semibold">Экспорт файлов</h3>
            <div className="mb-4 text-sm text-gray-600">
              Будет экспортировано {selectedAssetIds.size} файл{selectedAssetIds.size !== 1 ? 'ов' : ''} в ZIP архив.
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Включить метаданные (JSON файлы)</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setExportModalOpen(false);
                  setIncludeMetadata(false);
                }}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                disabled={exporting}
              >
                Отмена
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? 'Экспорт…' : 'Экспортировать'}
              </button>
            </div>
          </div>
        </div>
      )}
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








