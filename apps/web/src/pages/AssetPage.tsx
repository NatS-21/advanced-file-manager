import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AssetPreview } from '../entities/asset/AssetPreview';
import { apiDelete, apiGet, apiPost, apiPatch } from '../shared/api';
import { useAuth } from '../auth/AuthContext';

type AssetVersion = {
  id: number;
  assetId: number;
  fileId: number;
  versionNumber: number;
  description: string | null;
  createdAt: string;
  isCurrent: boolean;
  createdBy: { id: number; email: string; displayName: string | null } | null;
  file: {
    id: number;
    sizeBytes: number;
    mimeType: string;
    originalName: string;
  };
};

type AssetComment = {
  id: number;
  assetId: number;
  userId: number;
  parentId: number | null;
  text: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  user: {
    id: number;
    email: string;
    displayName: string | null;
  };
};

export function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Array<{ id: number; name: string }>>([]);
  const [collectionId, setCollectionId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'versions' | 'changes'>('info');
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showCreateVersionModal, setShowCreateVersionModal] = useState(false);
  const [changes, setChanges] = useState<any[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [comments, setComments] = useState<AssetComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [visibleFields, setVisibleFields] = useState<string[] | undefined>(undefined);
  const { me } = useAuth();

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/assets/${id}`);
      if (!ignore) {
        const assetData = await res.json();
        setData(assetData);
        setLoading(false);
        // Инициализируем форму редактирования текущими данными
        if (!isEditing) {
          initializeEditForm(assetData);
        }
      }
    }
    load();
    return () => { ignore = true; };
  }, [id]);

  function initializeEditForm(assetData: any) {
    const form: any = {
      title: assetData.title || '',
      description: assetData.description || '',
      status: assetData.status || 'draft',
      visibility: assetData.visibility || 'private',
      rating: assetData.rating != null ? assetData.rating : null,
      keywords: assetData.keywords || [],
      language: assetData.language || '',
      captured_at: assetData.captured_at ? assetData.captured_at.split('T')[0] : '',
      campaign: assetData.campaign || '',
      channel: assetData.channel || '',
      brand: assetData.brand || '',
      region: assetData.region || '',
      copyright_holder: assetData.copyright_holder || '',
      usage_rights: assetData.usage_terms || '',
      expires_at: assetData.embargo_until ? assetData.embargo_until.split('T')[0] : '',
    };
    setEditForm(form);
    setChangedFields(new Set());
    
    // Инициализируем теги
    if (assetData.tags && Array.isArray(assetData.tags)) {
      setTags(assetData.tags.map((t: any) => String(t)));
    } else {
      setTags([]);
    }
  }

  useEffect(() => {
    if (data && !isEditing) {
      initializeEditForm(data);
      loadTags();
    }
  }, [data]);

  async function loadTags() {
    if (!id || !data) return;
    setTagsLoading(true);
    try {
      // Теги теперь приходят прямо в данных актива
      if (data.tags && Array.isArray(data.tags)) {
        setTags(data.tags.map((t: any) => String(t)));
      } else {
        setTags([]);
      }
    } catch (e: any) {
      console.error('Failed to load tags:', e);
      setTags([]);
    } finally {
      setTagsLoading(false);
    }
  }

  function handleFieldChange(field: string, value: any) {
    setEditForm((prev: any) => ({ ...prev, [field]: value }));
    
    // Отслеживаем изменённые поля, сравнивая с исходными данными
    let original: any = null;
    
    if (field === 'title') {
      original = data?.title || '';
    } else if (field === 'description') {
      original = data?.description || '';
    } else if (field === 'status') {
      original = data?.status || 'draft';
    } else if (field === 'visibility') {
      original = data?.visibility || 'private';
    } else if (field === 'rating') {
      original = data?.rating != null ? data.rating : null;
    } else if (field === 'keywords') {
      original = data?.keywords || [];
    } else if (field === 'language') {
      original = data?.language || '';
    } else if (field === 'captured_at') {
      original = data?.captured_at ? data.captured_at.split('T')[0] : '';
    } else if (field === 'campaign') {
      original = data?.campaign || '';
    } else if (field === 'channel') {
      original = data?.channel || '';
    } else if (field === 'brand') {
      original = data?.brand || '';
    } else if (field === 'region') {
      original = data?.region || '';
    } else if (field === 'copyright_holder') {
      original = data?.copyright_holder || '';
    } else if (field === 'usage_rights') {
      original = data?.usage_terms || '';
    } else if (field === 'expires_at') {
      original = data?.embargo_until ? data.embargo_until.split('T')[0] : '';
    } else if (field === 'tags') {
      original = data?.tags || [];
    }
    
    const currentValue = value;
    
    setChangedFields((prev) => {
      const next = new Set(prev);
      if (JSON.stringify(original) === JSON.stringify(currentValue)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!id) return;
    
    // Клиентская валидация
    if (!editForm.title || !editForm.title.trim()) {
      alert('Название обязательно для заполнения');
      return;
    }
    if (editForm.rating !== null && editForm.rating !== '' && (editForm.rating < 0 || editForm.rating > 5)) {
      alert('Рейтинг должен быть от 0 до 5');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {};
      
      // Отправляем только изменившиеся поля
      if (changedFields.has('title')) payload.title = editForm.title || null;
      if (changedFields.has('description')) payload.description = editForm.description || null;
      if (changedFields.has('status')) payload.status = editForm.status;
      if (changedFields.has('visibility')) payload.visibility = editForm.visibility;
      if (changedFields.has('rating')) payload.rating = editForm.rating === '' ? null : editForm.rating;
      if (changedFields.has('keywords')) payload.keywords = editForm.keywords || [];
      if (changedFields.has('language')) payload.language = editForm.language || null;
      if (changedFields.has('captured_at')) {
        payload.captured_at = editForm.captured_at ? `${editForm.captured_at}T00:00:00Z` : null;
      }
      if (changedFields.has('campaign')) payload.campaign = editForm.campaign || null;
      if (changedFields.has('channel')) payload.channel = editForm.channel || null;
      if (changedFields.has('brand')) payload.brand = editForm.brand || null;
      if (changedFields.has('region')) payload.region = editForm.region || null;
      if (changedFields.has('copyright_holder')) payload.copyright_holder = editForm.copyright_holder || null;
      if (changedFields.has('usage_rights')) payload.usage_rights = editForm.usage_rights || null;
      if (changedFields.has('expires_at')) {
        payload.expires_at = editForm.expires_at ? `${editForm.expires_at}T00:00:00Z` : null;
      }
      if (changedFields.has('tags')) payload.tags = tags;

      // Если изменений нет — просто выходим из режима редактирования
      if (Object.keys(payload).length === 0) {
        setIsEditing(false);
        setSaving(false);
        return;
      }

      await apiPatch(`/api/assets/${id}`, payload);
      
      // Перезагружаем данные актива
      const res = await fetch(`/api/assets/${id}`);
      const updatedData = await res.json();
      setData(updatedData);
      initializeEditForm(updatedData);
      setIsEditing(false);
      setSaveToast('Изменения сохранены');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (e: any) {
      alert(e?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    initializeEditForm(data);
    setIsEditing(false);
    setChangedFields(new Set());
  }

  useEffect(() => {
    apiGet<Array<{ id: number; name: string }>>('/api/collections')
      .then((cs) => setCollections(cs.map((c: any) => ({ id: Number(c.id), name: String(c.name) }))))
      .catch(() => setCollections([]));
    
    // Load visibility settings
    apiGet<{ metadataFilters?: string[] }>('/api/settings')
      .then((data) => {
        if (data.metadataFilters && data.metadataFilters.length > 0) {
      setVisibleFields(data.metadataFilters);
        } else {
          setVisibleFields(undefined); // Показываем все поля
        }
      })
      .catch(() => {
        setVisibleFields(undefined); // В случае ошибки также показываем все поля
      });
  }, []);

  useEffect(() => {
    if (id && activeTab === 'info') {
      loadComments();
      loadStatusHistory();
    }
  }, [id, activeTab]);

  useEffect(() => {
    if (activeTab === 'versions' && id) {
      loadVersions();
    }
    if (activeTab === 'changes' && id) {
      loadChanges();
    }
  }, [activeTab, id]);

  async function loadVersions() {
    if (!id) return;
    setVersionsLoading(true);
    try {
      const res = await apiGet<{ items: AssetVersion[] }>(`/api/assets/${id}/versions`);
      setVersions(res.items);
    } catch (e: any) {
      console.error('Failed to load versions:', e);
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function loadChanges() {
    if (!id) return;
    setChangesLoading(true);
    try {
      const res = await apiGet<{ items: any[] }>(`/api/assets/${id}/changes`);
      setChanges(res.items);
    } catch (e: any) {
      console.error('Failed to load changes:', e);
      setChanges([]);
    } finally {
      setChangesLoading(false);
    }
  }

  async function loadComments() {
    if (!id) return;
    setCommentsLoading(true);
    try {
      const res = await apiGet<{ items: AssetComment[] }>(`/api/assets/${id}/comments`);
      setComments(res.items);
    } catch (e: any) {
      console.error('Failed to load comments:', e);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function loadStatusHistory() {
    if (!id) return;
    setStatusHistoryLoading(true);
    try {
      const res = await apiGet<{ items: any[] }>(`/api/assets/${id}/status-history`);
      setStatusHistory(res.items);
    } catch (e: any) {
      console.error('Failed to load status history:', e);
      setStatusHistory([]);
    } finally {
      setStatusHistoryLoading(false);
    }
  }

  async function handleStatusChange(newStatus: string, comment?: string) {
    if (!id) return;
    setChangingStatus(true);
    try {
      await apiPost(`/api/assets/${id}/status`, { status: newStatus, comment });
      // Перезагружаем данные актива и историю статусов
      const res = await fetch(`/api/assets/${id}`);
      const newData = await res.json();
      setData(newData);
      await loadStatusHistory();
    } catch (e: any) {
      alert(e?.message || 'Не удалось изменить статус');
    } finally {
      setChangingStatus(false);
    }
  }

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
              {data.current_version_number && (
                <span className="ml-2">· Версия {data.current_version_number}</span>
              )}
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

        {/* Tabs */}
        <div className="mb-4 border-b">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'info'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Информация
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'versions'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Версии {data.total_versions ? `(${data.total_versions})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('changes')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'changes'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              История
            </button>
          </div>
        </div>

        {activeTab === 'info' && (
          <>
        <div className="overflow-hidden rounded-md border bg-gray-50">
          <AssetPreview 
            src={previewSrc} 
            type={data.type} 
            width={data.width ? Number(data.width) : null}
            height={data.height ? Number(data.height) : null}
          />
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
          {!isEditing && (me?.role === 'editor' || me?.role === 'moderator' || me?.role === 'admin' || me?.role === 'owner') && (
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-md border bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            >
              Редактировать
            </button>
          )}
        </div>

        {isEditing ? (
          <MetadataEditForm
            form={editForm}
            tags={tags}
            changedFields={changedFields}
            onFieldChange={handleFieldChange}
            onTagsChange={(newTags) => {
              setTags(newTags);
              // Compare with original tags from data
              const originalTags = (data?.tags || []).map((t: any) => String(t)).sort();
              const newTagsSorted = [...newTags].sort();
              setChangedFields((prev) => {
                const next = new Set(prev);
                if (JSON.stringify(originalTags) === JSON.stringify(newTagsSorted)) {
                  next.delete('tags');
                } else {
                  next.add('tags');
                }
                return next;
              });
            }}
            onSave={handleSave}
            onCancel={handleCancel}
            saving={saving}
          />
        ) : null}
        
        {/* Metadata display */}
        <div className="mt-6">
          <MetadataDisplay
            data={data}
            visibleFields={visibleFields}
            isEditing={isEditing}
            editForm={editForm}
            onFieldChange={handleFieldChange}
          />
        </div>

            <div className="mt-6">
              <StatusSection
                assetId={Number(id)}
                currentStatus={data.status}
                statusHistory={statusHistory}
                statusHistoryLoading={statusHistoryLoading}
                onStatusChange={handleStatusChange}
                changingStatus={changingStatus}
                canChangeStatus={me?.role === 'moderator' || me?.role === 'admin' || me?.role === 'owner'}
              />
            </div>

            <div className="mt-6">
              <CommentsSection
                assetId={Number(id)}
                comments={comments}
                loading={commentsLoading}
                onRefresh={loadComments}
              />
            </div>
          </>
        )}

        {activeTab === 'versions' && (
          <VersionsTab
            assetId={Number(id)}
            versions={versions}
            loading={versionsLoading}
            onRefresh={loadVersions}
            onCreateVersion={() => setShowCreateVersionModal(true)}
          />
        )}

        {activeTab === 'changes' && (
          <ChangesTab
            assetId={Number(id)}
            changes={changes}
            loading={changesLoading}
            onRefresh={loadChanges}
          />
        )}
      </div>

      {showCreateVersionModal && (
        <CreateVersionModal
          assetId={Number(id)}
          onClose={() => {
            setShowCreateVersionModal(false);
            loadVersions();
            // Перезагружаем данные актива, чтобы обновить информацию о версиях
            if (id) {
              fetch(`/api/assets/${id}`)
                .then((res) => res.json())
                .then((d) => setData(d))
                .catch(() => {});
            }
          }}
        />
      )}

      <details className="rounded-md border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
        <pre className="mt-3 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

function VersionsTab({
  assetId,
  versions,
  loading,
  onRefresh,
  onCreateVersion,
}: {
  assetId: number;
  versions: AssetVersion[];
  loading: boolean;
  onRefresh: () => void;
  onCreateVersion: () => void;
}) {
  const [restoring, setRestoring] = useState<number | null>(null);

  function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function handleRestore(versionId: number) {
    if (!window.confirm('Восстановить эту версию? Будет создана новая версия с этим файлом.')) {
      return;
    }
    setRestoring(versionId);
    try {
      await apiPost(`/api/assets/${assetId}/versions/${versionId}/restore`, {});
      onRefresh();
      window.alert('Версия восстановлена');
    } catch (e: any) {
      window.alert('Ошибка: ' + (e?.message || 'Не удалось восстановить версию'));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">История версий файла</div>
        <button
          onClick={onCreateVersion}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black"
        >
          Создать новую версию
        </button>
      </div>

      {loading ? (
        <div className="rounded-md border bg-gray-50 p-6 text-center text-sm text-gray-500">
          Загрузка версий…
        </div>
      ) : versions.length === 0 ? (
        <div className="rounded-md border bg-gray-50 p-6 text-center text-sm text-gray-500">
          Версий пока нет
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            <div className="col-span-1">Версия</div>
            <div className="col-span-2">Дата</div>
            <div className="col-span-2">Автор</div>
            <div className="col-span-2">Размер</div>
            <div className="col-span-3">Описание</div>
            <div className="col-span-2 text-right">Действия</div>
          </div>
          {versions.map((v) => (
            <div
              key={v.id}
              className={`grid grid-cols-12 gap-2 px-3 py-2 text-sm ${
                v.isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="col-span-1">
                {v.versionNumber}
                {v.isCurrent && (
                  <span className="ml-1 text-xs text-blue-600">(текущая)</span>
                )}
              </div>
              <div className="col-span-2 text-gray-700">{formatDate(v.createdAt)}</div>
              <div className="col-span-2 text-gray-700">
                {v.createdBy?.displayName || v.createdBy?.email || '—'}
              </div>
              <div className="col-span-2 text-gray-700">{formatBytes(v.file.sizeBytes)}</div>
              <div className="col-span-3 text-gray-600">{v.description || '—'}</div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                <a
                  href={`/api/files/${v.fileId}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs"
                >
                  Просмотр
                </a>
                {!v.isCurrent && (
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoring === v.id}
                    className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                  >
                    {restoring === v.id ? 'Восстановление…' : 'Восстановить'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateVersionModal({
  assetId,
  onClose,
}: {
  assetId: number;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Выберите файл');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      const res = await fetch(`/api/assets/${assetId}/versions`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      onClose();
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать версию');
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-md border bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Создать новую версию</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={uploading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Файл <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={uploading}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Описание изменений
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Что изменилось в этой версии?"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-black disabled:opacity-50"
            >
              {uploading ? 'Создание…' : 'Создать версию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MetadataEditForm({
  form,
  tags,
  changedFields,
  onFieldChange,
  onTagsChange,
  onSave,
  onCancel,
  saving,
}: {
  form: any;
  tags: string[];
  changedFields: Set<string>;
  onFieldChange: (field: string, value: any) => void;
  onTagsChange: (tags: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  function handleTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      }
      e.currentTarget.value = '';
    }
  }

  function removeTag(tagToRemove: string) {
    onTagsChange(tags.filter((t) => t !== tagToRemove));
  }

  function handleKeywordsChange(value: string) {
    const keywords = value.split(',').map((k) => k.trim()).filter((k) => k);
    onFieldChange('keywords', keywords);
  }

  const isFieldChanged = (field: string) => changedFields.has(field);

  return (
    <div className="mt-4 space-y-6 rounded-md border bg-white p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Редактирование метаданных</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Основные метаданные */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Основные метаданные</h4>
          
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Название <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title || ''}
              onChange={(e) => onFieldChange('title', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('title') ? 'border-blue-500 bg-blue-50' : ''
              }`}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Описание</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => onFieldChange('description', e.target.value)}
              rows={4}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('description') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Статус</label>
            <select
              value={form.status || 'draft'}
              onChange={(e) => onFieldChange('status', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('status') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <option value="draft">Черновик</option>
              <option value="review">На согласовании</option>
              <option value="approved">Утверждено</option>
              <option value="rejected">Отклонено</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Видимость</label>
            <select
              value={form.visibility || 'private'}
              onChange={(e) => onFieldChange('visibility', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('visibility') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <option value="private">Приватный</option>
              <option value="team">Команда</option>
              <option value="public">Публичный</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Рейтинг (0-5)</label>
            <input
              type="number"
              min="0"
              max="5"
              value={form.rating != null ? form.rating : ''}
              onChange={(e) => onFieldChange('rating', e.target.value === '' ? null : Number(e.target.value))}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('rating') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ключевые слова (через запятую)</label>
            <input
              type="text"
              value={(form.keywords || []).join(', ')}
              onChange={(e) => handleKeywordsChange(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('keywords') ? 'border-blue-500 bg-blue-50' : ''
              }`}
              placeholder="keyword1, keyword2, keyword3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Язык</label>
            <input
              type="text"
              value={form.language || ''}
              onChange={(e) => onFieldChange('language', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('language') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Дата съёмки</label>
            <input
              type="date"
              value={form.captured_at || ''}
              onChange={(e) => onFieldChange('captured_at', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('captured_at') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>
        </div>

        {/* Бизнес-метаданные и права */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Бизнес-метаданные</h4>
          
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Кампания</label>
            <input
              type="text"
              value={form.campaign || ''}
              onChange={(e) => onFieldChange('campaign', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('campaign') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Канал</label>
            <input
              type="text"
              value={form.channel || ''}
              onChange={(e) => onFieldChange('channel', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('channel') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Бренд</label>
            <input
              type="text"
              value={form.brand || ''}
              onChange={(e) => onFieldChange('brand', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('brand') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Регион</label>
            <input
              type="text"
              value={form.region || ''}
              onChange={(e) => onFieldChange('region', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('region') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <h4 className="mt-6 font-medium text-gray-900">Права</h4>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Правообладатель</label>
            <input
              type="text"
              value={form.copyright_holder || ''}
              onChange={(e) => onFieldChange('copyright_holder', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('copyright_holder') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Условия использования</label>
            <textarea
              value={form.usage_rights || ''}
              onChange={(e) => onFieldChange('usage_rights', e.target.value)}
              rows={3}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('usage_rights') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Срок действия</label>
            <input
              type="date"
              value={form.expires_at || ''}
              onChange={(e) => onFieldChange('expires_at', e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                isFieldChanged('expires_at') ? 'border-blue-500 bg-blue-50' : ''
              }`}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Теги</label>
            <div className="flex flex-wrap gap-2 rounded-md border p-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                onKeyDown={handleTagInputKeyDown}
                placeholder="Добавить тег (Enter)"
                className="flex-1 border-0 bg-transparent text-sm outline-none"
              />
            </div>
            {isFieldChanged('tags') && (
              <div className="mt-1 text-xs text-blue-600">Теги изменены</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type AssetChange = {
  id: number;
  assetId: number;
  changedAt: string;
  changeType: string;
  fieldName: string;
  oldValue: any;
  newValue: any;
  user: { id: number; email: string; displayName: string | null } | null;
};

function ChangesTab({
  assetId,
  changes,
  loading,
  onRefresh,
}: {
  assetId: number;
  changes: AssetChange[];
  loading: boolean;
  onRefresh: () => void;
}) {
  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatChangeType(type: string): string {
    const types: Record<string, string> = {
      metadata: 'Метаданные',
      status: 'Статус',
      tags: 'Теги',
      folder: 'Папка',
    };
    return types[type] || type;
  }

  function formatFieldName(fieldName: string): string {
    const fields: Record<string, string> = {
      title: 'Название',
      description: 'Описание',
      status: 'Статус',
      folder_id: 'Папка',
      rating: 'Рейтинг',
      visibility: 'Видимость',
    };
    return fields[fieldName] || fieldName;
  }

  function formatValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) return '—';
    
    // Handle status values
    if (fieldName === 'status') {
      const statuses: Record<string, string> = {
        draft: 'Черновик',
        review: 'На согласовании',
        approved: 'Утверждено',
        rejected: 'Отклонено',
      };
      return statuses[String(value)] || String(value);
    }

    // Handle folder_id - just show ID for now (could be enhanced to show folder name)
    if (fieldName === 'folder_id') {
      return value === null ? 'Корень' : `Папка #${value}`;
    }

    // Handle other values
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    
    return String(value);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">История изменений метаданных</div>
        <button
          onClick={onRefresh}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      {loading ? (
        <div className="rounded-md border bg-gray-50 p-6 text-center text-sm text-gray-500">
          Загрузка истории…
        </div>
      ) : changes.length === 0 ? (
        <div className="rounded-md border bg-gray-50 p-6 text-center text-sm text-gray-500">
          Изменений пока нет
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            <div className="col-span-2">Дата</div>
            <div className="col-span-2">Автор</div>
            <div className="col-span-2">Тип</div>
            <div className="col-span-2">Поле</div>
            <div className="col-span-4">Изменение</div>
          </div>
          {changes.map((change) => (
            <div
              key={change.id}
              className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <div className="col-span-2 text-gray-700">{formatDate(change.changedAt)}</div>
              <div className="col-span-2 text-gray-700">
                {change.user?.displayName || change.user?.email || 'Система'}
              </div>
              <div className="col-span-2 text-gray-700">{formatChangeType(change.changeType)}</div>
              <div className="col-span-2 text-gray-700">{formatFieldName(change.fieldName)}</div>
              <div className="col-span-4 text-gray-600">
                <span className="text-red-600 line-through">
                  {formatValue(change.oldValue, change.fieldName)}
                </span>
                {' → '}
                <span className="text-green-600 font-medium">
                  {formatValue(change.newValue, change.fieldName)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusSection({
  assetId,
  currentStatus,
  statusHistory,
  statusHistoryLoading,
  onStatusChange,
  changingStatus,
  canChangeStatus,
}: {
  assetId: number;
  currentStatus: string;
  statusHistory: any[];
  statusHistoryLoading: boolean;
  onStatusChange: (status: string, comment?: string) => void;
  changingStatus: boolean;
  canChangeStatus: boolean;
}) {
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [comment, setComment] = useState<string>('');

  function formatStatus(status: string): string {
    const statuses: Record<string, string> = {
      draft: 'Черновик',
      review: 'На согласовании',
      approved: 'Утвержден',
      rejected: 'Отклонен',
    };
    return statuses[status] || status;
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 border-gray-300',
      review: 'bg-blue-100 text-blue-800 border-blue-300',
      approved: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  }

  function getAllowedTransitions(current: string): string[] {
    if (current === 'draft') return ['review'];
    if (current === 'review') return ['approved', 'rejected'];
    if (current === 'rejected') return ['draft'];
    return []; // approved cannot be changed
  }

  const allowedTransitions = getAllowedTransitions(currentStatus);
  const canChange = canChangeStatus && allowedTransitions.length > 0 && currentStatus !== 'approved';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatus) return;
    onStatusChange(newStatus, comment.trim() || undefined);
    setShowChangeForm(false);
    setNewStatus('');
    setComment('');
  }

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="mb-3 text-sm font-medium">Статус</div>
      
      <div className="mb-4 flex items-center gap-3">
        <span className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium ${getStatusColor(currentStatus)}`}>
          {formatStatus(currentStatus)}
        </span>
        {canChange && !showChangeForm && (
          <button
            onClick={() => setShowChangeForm(true)}
            className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50"
            disabled={changingStatus}
          >
            Изменить статус
          </button>
        )}
      </div>

      {showChangeForm && canChange && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-3 rounded-md border bg-gray-50 p-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600">Новый статус</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            >
              <option value="">Выберите статус</option>
              {allowedTransitions.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Комментарий (необязательно)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              placeholder="Укажите причину изменения статуса..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!newStatus || changingStatus}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {changingStatus ? 'Изменение...' : 'Изменить'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowChangeForm(false);
                setNewStatus('');
                setComment('');
              }}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Status history */}
      {statusHistory.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-gray-600">История изменений статуса</div>
          <div className="space-y-2">
            {statusHistory.map((item) => (
              <div key={item.id} className="rounded-md border bg-gray-50 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.oldStatus && (
                      <>
                        <span className={`rounded border px-2 py-0.5 ${getStatusColor(item.oldStatus)}`}>
                          {formatStatus(item.oldStatus)}
                        </span>
                        <span className="text-gray-400">→</span>
                      </>
                    )}
                    <span className={`rounded border px-2 py-0.5 ${getStatusColor(item.newStatus)}`}>
                      {formatStatus(item.newStatus)}
                    </span>
                  </div>
                  <div className="text-gray-500">
                    {new Date(item.changedAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                {item.user && (
                  <div className="mt-1 text-gray-600">
                    {item.user.displayName || item.user.email}
                  </div>
                )}
                {item.comment && (
                  <div className="mt-1 text-gray-700 italic">{item.comment}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentsSection({
  assetId,
  comments,
  loading,
  onRefresh,
}: {
  assetId: number;
  comments: AssetComment[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [newCommentText, setNewCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    // Get current user ID
    apiGet<{ id: number }>('/api/me')
      .then((me) => setCurrentUserId(me.id))
      .catch(() => setCurrentUserId(null));
  }, []);

  // Build comment tree from flat list
  type CommentNode = AssetComment & { replies?: CommentNode[]; depth: number };
  
  function buildCommentTree(flatComments: AssetComment[]): Array<CommentNode> {
    const commentMap = new Map<number, CommentNode>();
    const rootComments: CommentNode[] = [];

    // First pass: create all comment nodes
    flatComments.forEach((comment) => {
      commentMap.set(comment.id, { ...comment, replies: [], depth: 0 });
    });

    // Second pass: build tree
    flatComments.forEach((comment) => {
      const node = commentMap.get(comment.id)!;
      if (comment.parentId === null) {
        rootComments.push(node);
      } else {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          if (!parent.replies) parent.replies = [];
          node.depth = (parent.depth || 0) + 1;
          parent.replies.push(node);
        }
      }
    });

    // Flatten tree for rendering (DFS)
    function flattenTree(nodes: CommentNode[]): CommentNode[] {
      const result: CommentNode[] = [];
      nodes.forEach((node) => {
        const { replies, ...nodeWithoutReplies } = node;
        result.push(nodeWithoutReplies as CommentNode);
        if (node.replies && node.replies.length > 0) {
          result.push(...flattenTree(node.replies));
        }
      });
      return result;
    }

    return flattenTree(rootComments);
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    setSubmitting(true);
    try {
      await apiPost(`/api/assets/${assetId}/comments`, { text: newCommentText.trim() });
      setNewCommentText('');
      onRefresh();
    } catch (e: any) {
      window.alert('Ошибка: ' + (e?.message || 'Не удалось создать комментарий'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitReply(parentId: number) {
    if (!replyText.trim()) return;

    setSubmitting(true);
    try {
      await apiPost(`/api/assets/${assetId}/comments`, { text: replyText.trim(), parentId });
      setReplyText('');
      setReplyingTo(null);
      onRefresh();
    } catch (e: any) {
      window.alert('Ошибка: ' + (e?.message || 'Не удалось создать ответ'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(commentId: number) {
    if (!editText.trim()) return;

    setSubmitting(true);
    try {
      await apiPatch(`/api/comments/${commentId}`, { text: editText.trim() });
      setEditingId(null);
      setEditText('');
      onRefresh();
    } catch (e: any) {
      window.alert('Ошибка: ' + (e?.message || 'Не удалось обновить комментарий'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: number) {
    if (!window.confirm('Удалить комментарий?')) return;

    try {
      await apiDelete(`/api/comments/${commentId}`);
      onRefresh();
    } catch (e: any) {
      window.alert('Ошибка: ' + (e?.message || 'Не удалось удалить комментарий'));
    }
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const commentTree = buildCommentTree(comments);

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="mb-4 text-sm font-medium">Комментарии</div>

      {/* Форма для нового комментария */}
      <form onSubmit={handleSubmitComment} className="mb-6">
        <textarea
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          placeholder="Добавить комментарий..."
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm"
          disabled={submitting}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={submitting || !newCommentText.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-black disabled:opacity-50"
          >
            {submitting ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      </form>

      {/* Список комментариев */}
      {loading ? (
        <div className="text-center text-sm text-gray-500">Загрузка комментариев…</div>
      ) : commentTree.length === 0 ? (
        <div className="text-center text-sm text-gray-500">Комментариев пока нет</div>
      ) : (
        <div className="space-y-4">
          {commentTree.map((comment) => (
            <div
              key={comment.id}
              className="rounded-md border bg-gray-50 p-3"
              style={{ marginLeft: `${comment.depth * 2}rem` }}
            >
              {comment.deletedAt ? (
                <div className="text-sm italic text-gray-400">[Комментарий удалён]</div>
              ) : editingId === comment.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    disabled={submitting}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(comment.id)}
                      disabled={submitting || !editText.trim()}
                      className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black disabled:opacity-50"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditText('');
                      }}
                      className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">
                        {comment.user?.displayName || comment.user?.email || 'Неизвестный'}
                      </span>
                      {' · '}
                      <span>{formatDate(comment.createdAt)}</span>
                      {comment.updatedAt && comment.updatedAt !== comment.createdAt && (
                        <span className="text-gray-400"> (изменён)</span>
                      )}
                    </div>
                    {currentUserId === comment.userId && !comment.deletedAt && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditText(comment.text);
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mb-2 text-sm text-gray-800 whitespace-pre-wrap">{comment.text}</div>
                  {replyingTo === comment.id ? (
                    <div className="mt-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Написать ответ..."
                        rows={2}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        disabled={submitting}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleSubmitReply(comment.id)}
                          disabled={submitting || !replyText.trim()}
                          className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white hover:bg-black disabled:opacity-50"
                        >
                          Отправить
                        </button>
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyText('');
                          }}
                          className="rounded-md border px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReplyingTo(comment.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ответить
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Field labels mapping
const fieldLabels: Record<string, string> = {
  // Основные
  type: 'Тип',
  status: 'Статус',
  visibility: 'Видимость',
  rating: 'Рейтинг',
  created_at: 'Дата создания',
  captured_at: 'Дата съёмки',
  folder_id: 'Папка',
  owner_id: 'Владелец',
  title: 'Название',
  description: 'Описание',
  keywords: 'Ключевые слова',
  language: 'Язык',
  
  // Бизнес
  campaign_id: 'Кампания',
  channel: 'Канал',
  brand: 'Бренд',
  region: 'Регион',
  
  // Медиа
  orientation: 'Ориентация',
  width: 'Ширина',
  height: 'Высота',
  duration_sec: 'Длительность',
  fps: 'FPS',
  video_codec: 'Видео кодек',
  audio_codec: 'Аудио кодек',
  aspect_ratio: 'Соотношение сторон',
  color_space: 'Цветовое пространство',
  dpi: 'DPI',
  bit_depth: 'Глубина цвета',
  compression: 'Сжатие',
  has_transparency: 'Прозрачность',
  frame_count: 'Количество кадров',
  audio_channels_layout: 'Аудио каналы',
  distinct_colors: 'Палитра цветов',
  vibrant_rgb: 'Яркий цвет',
  muted_rgb: 'Приглушенный цвет',
  dark_vibrant_rgb: 'Темный яркий',
  dark_muted_rgb: 'Темный приглушенный',
  light_vibrant_rgb: 'Светлый яркий',
  light_muted_rgb: 'Светлый приглушенный',
  
  // Файлы
  file_mime_type: 'MIME тип',
  file_size_bytes: 'Размер файла',
  file_original_name: 'Имя файла',
  
  // Теги
  tags: 'Теги',
};

// Field categories
const fieldCategories: Record<string, string[]> = {
  basic: ['type', 'status', 'visibility', 'rating', 'created_at', 'captured_at', 'folder_id', 'owner_id', 'title', 'description', 'keywords', 'language'],
  business: ['campaign_id', 'channel', 'brand', 'region'],
  media: ['orientation', 'width', 'height', 'duration_sec', 'fps', 'video_codec', 'audio_codec', 'aspect_ratio', 'color_space', 'dpi', 'bit_depth', 'compression', 'has_transparency', 'frame_count', 'audio_channels_layout', 'distinct_colors', 'vibrant_rgb', 'muted_rgb', 'dark_vibrant_rgb', 'dark_muted_rgb', 'light_vibrant_rgb', 'light_muted_rgb'],
  files: ['file_mime_type', 'file_size_bytes', 'file_original_name'],
  tags: ['tags'],
};

// Editable fields
const editableFields = [
  'title', 'description', 'status', 'visibility', 'rating', 
  'keywords', 'language', 'captured_at', 'campaign', 'channel', 
  'brand', 'region', 'copyright_holder', 'usage_rights', 'expires_at', 'tags'
];

// Category labels
const categoryLabels: Record<string, string> = {
  basic: 'Основные',
  business: 'Бизнес',
  media: 'Медиа',
  files: 'Файлы',
  tags: 'Теги',
};

// Color swatch component
function ColorSwatch({ r, g, b }: { r: number; g: number; b: number }) {
  return (
    <div className="flex items-center gap-2">
      <div 
        className="w-6 h-6 rounded-full border border-gray-300 shadow-sm"
        style={{ backgroundColor: `rgb(${r},${g},${b})` }}
      />
      <span className="text-sm text-gray-700">RGB({r}, {g}, {b})</span>
    </div>
  );
}

// Format field value
function formatFieldValue(value: any, field: string): string {
  if (value === null || value === undefined) return '—';
  
  // Dates
  if (field === 'created_at' || field === 'captured_at' || field === 'expires_at') {
    if (typeof value === 'string') {
      try {
        return new Date(value).toLocaleDateString('ru-RU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      } catch {
        return value;
      }
    }
  }
  
  // File size
  if (field === 'file_size_bytes') {
    const bytes = Number(value);
    if (isNaN(bytes)) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
  
  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет';
  }
  
  // Arrays
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '—';
  }
  
  // Numbers
  if (typeof value === 'number') {
    return String(value);
  }
  
  return String(value);
}

// Map settings field names (camelCase) to database field names (snake_case)
const fieldNameMap: Record<string, string> = {
  // Basic
  type: 'type',
  status: 'status',
  visibility: 'visibility',
  rating: 'rating',
  createdAt: 'created_at',
  capturedAt: 'captured_at',
  folderId: 'folder_id',
  ownerId: 'owner_id',
  title: 'title',
  description: 'description',
  keywords: 'keywords',
  language: 'language',
  
  // Business
  campaignId: 'campaign_id',
  channel: 'channel',
  brand: 'brand',
  region: 'region',
  
  // Media
  orientation: 'orientation',
  width: 'width',
  height: 'height',
  durationSec: 'duration_sec',
  fps: 'fps',
  videoCodec: 'video_codec',
  audioCodec: 'audio_codec',
  aspectRatio: 'aspect_ratio',
  color: 'distinct_colors', // Map 'color' from settings to 'distinct_colors' in DB
  
  // Files
  sizeBytes: 'file_size_bytes',
  mimeType: 'file_mime_type',
  
  // Tags
  tags: 'tags',
};

// Reverse map: database field -> settings field
const reverseFieldNameMap: Record<string, string> = Object.fromEntries(
  Object.entries(fieldNameMap).map(([k, v]) => [v, k])
);

// Metadata display component
function MetadataDisplay({
  data,
  visibleFields,
  isEditing,
  editForm,
  onFieldChange,
}: {
  data: any;
  visibleFields?: string[];
  isEditing: boolean;
  editForm: any;
  onFieldChange: (field: string, value: any) => void;
}) {
  // Filter fields by visibility - map settings field names to DB field names
  const shouldShowField = (dbField: string): boolean => {
    if (!visibleFields || visibleFields.length === 0) return true;
    // Check if settings field name maps to this DB field
    const settingsField = reverseFieldNameMap[dbField] || dbField;
    return visibleFields.includes(settingsField) || visibleFields.includes(dbField);
  };
  
  // Get fields for each category
  const getCategoryFields = (category: string) => {
    return fieldCategories[category]
      .filter(field => shouldShowField(field))
      .filter(field => {
        // Map campaign_id to campaign for display
        const displayField = field === 'campaign_id' ? 'campaign' : field;
        // Check if field has data
        const hasData = data[field] != null && data[field] !== '' || data[displayField] != null && data[displayField] !== '';
        // Check if field is editable
        const isEditable = editableFields.includes(displayField);
        // Special case: distinct_colors should always show if selected in settings (even if empty)
        const isColorField = field === 'distinct_colors';
        const settingsField = reverseFieldNameMap[field] || field;
        const isSelectedInSettings = visibleFields && visibleFields.includes(settingsField);
        
        return hasData || isEditable || (isColorField && isSelectedInSettings);
      });
  };
  
  // Render field value or input
  const renderField = (field: string, category: string) => {
    const label = fieldLabels[field] || field;
    // Map campaign_id to campaign for display/editing
    const displayField = field === 'campaign_id' ? 'campaign' : field;
    const value = data[field] != null ? data[field] : data[displayField];
    const isEditable = editableFields.includes(displayField);
    
    // Special handling for colors
    if (field === 'distinct_colors') {
      let colors: Array<{ r: number; g: number; b: number }> = [];
      if (value) {
        if (typeof value === 'string') {
          try {
            colors = JSON.parse(value);
          } catch {
            // Invalid JSON, show empty
          }
        } else if (Array.isArray(value)) {
          colors = value;
        }
      }
      
      // Show field even if empty if it's selected in settings
      const settingsField = reverseFieldNameMap[field] || field;
      const isSelectedInSettings = visibleFields && visibleFields.includes(settingsField);
      
      if (colors.length === 0 && !isSelectedInSettings) return null;
      
      return (
        <div className="py-2">
          <div className="mb-2 text-sm font-medium text-gray-700">{label}</div>
          {colors.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {colors.map((color, idx) => (
                <ColorSwatch key={idx} r={color.r} g={color.g} b={color.b} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">—</div>
          )}
        </div>
      );
    }
    
    // Special handling for other color fields (vibrant_rgb, muted_rgb, etc.)
    if (field.endsWith('_rgb') && typeof value === 'string') {
      const parts = value.split(',');
      if (parts.length === 3) {
        const r = parseInt(parts[0].trim(), 10);
        const g = parseInt(parts[1].trim(), 10);
        const b = parseInt(parts[2].trim(), 10);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          return (
            <div className="py-2">
              <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
              <ColorSwatch r={r} g={g} b={b} />
            </div>
          );
        }
      }
    }
    
    // Editable fields in edit mode
    if (isEditing && isEditable) {
      if (displayField === 'description') {
        return (
          <div className="py-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <textarea
              value={editForm[displayField] || ''}
              onChange={(e) => onFieldChange(displayField, e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        );
      }
      
      if (displayField === 'status') {
        return (
          <div className="py-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <select
              value={editForm[displayField] || 'draft'}
              onChange={(e) => onFieldChange(displayField, e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="draft">Черновик</option>
              <option value="review">На согласовании</option>
              <option value="approved">Утверждено</option>
              <option value="rejected">Отклонено</option>
            </select>
          </div>
        );
      }
      
      if (displayField === 'visibility') {
        return (
          <div className="py-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <select
              value={editForm[displayField] || 'private'}
              onChange={(e) => onFieldChange(displayField, e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="private">Приватный</option>
              <option value="team">Команда</option>
              <option value="public">Публичный</option>
            </select>
          </div>
        );
      }
      
      if (displayField === 'rating') {
        return (
          <div className="py-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={editForm[displayField] != null ? editForm[displayField] : ''}
              onChange={(e) => onFieldChange(displayField, e.target.value === '' ? null : Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        );
      }
      
      if (displayField === 'captured_at' || displayField === 'expires_at') {
        return (
          <div className="py-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <input
              type="date"
              value={editForm[displayField] || ''}
              onChange={(e) => onFieldChange(displayField, e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        );
      }
      
      if (displayField === 'keywords') {
        return (
          <div className="py-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
            <input
              type="text"
              value={(editForm[displayField] || []).join(', ')}
              onChange={(e) => {
                const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
                onFieldChange(displayField, keywords);
              }}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="keyword1, keyword2"
            />
          </div>
        );
      }
      
      // Default text input
      return (
        <div className="py-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <input
            type="text"
            value={editForm[displayField] || ''}
            onChange={(e) => onFieldChange(displayField, e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      );
    }
    
    // Read-only display
    const displayValue = formatFieldValue(value, field);
    if (displayValue === '—' && !isEditable) return null;
    
    return (
      <div className="py-2">
        <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
        <div className="text-sm text-gray-900">{displayValue}</div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {Object.keys(fieldCategories).map(category => {
        const fields = getCategoryFields(category);
        if (fields.length === 0) return null;
        
        return (
          <div key={category} className="rounded-md border bg-white p-4">
            <h3 className="mb-4 text-base font-semibold text-gray-900">{categoryLabels[category]}</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {fields.map(field => (
                <div key={field}>
                  {renderField(field, category)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
