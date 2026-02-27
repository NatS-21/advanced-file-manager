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

async function downloadCSV(url: string, filename: string) {
  try {
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
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Error downloading CSV:', error);
    alert('Не удалось скачать файл');
  }
}

export function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'kpi' | 'activity' | 'workload'>('overview');
  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [activityData, setActivityData] = useState<any>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [workloadData, setWorkloadData] = useState<any>(null);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');

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

  useEffect(() => {
    if (activeTab === 'kpi') {
      loadKpi();
    } else if (activeTab === 'activity') {
      loadActivity();
    } else if (activeTab === 'workload') {
      loadWorkload();
    }
  }, [activeTab, startDate, endDate, period]);

  async function loadKpi() {
    setKpiLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await apiGet<any>(`/api/analytics/kpi?${params.toString()}`);
      setKpiData(res);
    } catch (e: any) {
      console.error('Failed to load KPI:', e);
      setKpiData(null);
    } finally {
      setKpiLoading(false);
    }
  }

  async function loadActivity() {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('period', period);
      const res = await apiGet<any>(`/api/analytics/activity?${params.toString()}`);
      setActivityData(res);
    } catch (e: any) {
      console.error('Failed to load activity:', e);
      setActivityData(null);
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadWorkload() {
    setWorkloadLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await apiGet<any>(`/api/analytics/workload?${params.toString()}`);
      setWorkloadData(res);
    } catch (e: any) {
      console.error('Failed to load workload:', e);
      setWorkloadData(null);
    } finally {
      setWorkloadLoading(false);
    }
  }

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
          onClick={() => {
            if (activeTab === 'overview') load();
            else if (activeTab === 'kpi') loadKpi();
            else if (activeTab === 'activity') loadActivity();
            else if (activeTab === 'workload') loadWorkload();
          }}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading || kpiLoading || activityLoading || workloadLoading}
        >
          Обновить
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'overview'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Обзор
        </button>
        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'kpi'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          KPI метрики
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'activity'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Активность
        </button>
        <button
          onClick={() => setActiveTab('workload')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'workload'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Нагрузка
        </button>
      </div>

      {/* Date filters */}
      {(activeTab === 'kpi' || activeTab === 'activity' || activeTab === 'workload') && (
        <div className="flex items-center gap-4 rounded-md border bg-white p-4">
          <div>
            <label className="mb-1 block text-xs text-gray-600">Начальная дата</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Конечная дата</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </div>
          {activeTab === 'activity' && (
            <div>
              <label className="mb-1 block text-xs text-gray-600">Период</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month')}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="day">День</option>
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
              </select>
            </div>
          )}
        </div>
      )}

      {activeTab === 'overview' && (
        <>
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
        </>
      )}

      {activeTab === 'kpi' && (
        <KPISection data={kpiData} loading={kpiLoading} startDate={startDate} endDate={endDate} />
      )}

      {activeTab === 'activity' && (
        <ActivitySection data={activityData} loading={activityLoading} period={period} />
      )}

      {activeTab === 'workload' && (
        <WorkloadSection data={workloadData} loading={workloadLoading} />
      )}
    </div>
  );
}

function KPISection({ data, loading, startDate, endDate }: { data: any; loading: boolean; startDate: string; endDate: string }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const url = `/api/analytics/export/csv?${params.toString()}`;
      await downloadCSV(url, `assets_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="rounded-md border bg-white p-6">Загрузка KPI метрик…</div>;
  }

  if (!data) {
    return <div className="rounded-md border bg-white p-6 text-sm text-gray-500">Не удалось загрузить данные</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? 'Экспорт…' : 'Экспорт CSV'}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-md border bg-white p-4">
        <div className="text-xs text-gray-500">Медианное время согласования</div>
        <div className="mt-1 text-2xl font-semibold">
          {data.medianApprovalTime != null
            ? `${Math.round(data.medianApprovalTime)} ч`
            : '—'}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {data.medianApprovalTime != null && `${Math.round(data.medianApprovalTime / 24)} дн`}
        </div>
      </div>
      <div className="rounded-md border bg-white p-4">
        <div className="text-xs text-gray-500">Заполнено обязательных полей</div>
        <div className="mt-1 text-2xl font-semibold">{data.requiredFieldsCompletion}%</div>
        <div className="mt-1 text-xs text-gray-500">из всех файлов</div>
      </div>
      <div className="rounded-md border bg-white p-4">
        <div className="text-xs text-gray-500">Возвраты на доработку</div>
        <div className="mt-1 text-2xl font-semibold">{data.reworkCount}</div>
        <div className="mt-1 text-xs text-gray-500">переходов rejected → draft</div>
      </div>
      <div className="rounded-md border bg-white p-4">
        <div className="text-xs text-gray-500">Повторные загрузки</div>
        <div className="mt-1 text-2xl font-semibold">{data.duplicateUploads}</div>
        <div className="mt-1 text-xs text-gray-500">файлов с одинаковым SHA256</div>
      </div>
      <div className="rounded-md border bg-white p-4">
        <div className="text-xs text-gray-500">Всего файлов</div>
        <div className="mt-1 text-2xl font-semibold">{data.totalAssets}</div>
      </div>
      <div className="rounded-md border bg-white p-4">
        <div className="text-xs text-gray-500">Всего событий</div>
        <div className="mt-1 text-2xl font-semibold">{data.totalEvents}</div>
      </div>
    </div>
    </div>
  );
}

function ActivitySection({ data, loading, period }: { data: any; loading: boolean; period: string }) {
  if (loading) {
    return <div className="rounded-md border bg-white p-6">Загрузка активности…</div>;
  }

  if (!data) {
    return <div className="rounded-md border bg-white p-6 text-sm text-gray-500">Не удалось загрузить данные</div>;
  }

  // Combine all periods and find max count for scaling
  const allPeriods = new Set<string>();
  data.views?.forEach((v: any) => allPeriods.add(v.period));
  data.downloads?.forEach((d: any) => allPeriods.add(d.period));
  data.uploads?.forEach((u: any) => allPeriods.add(u.period));

  const periodData = Array.from(allPeriods).sort().map((p) => {
    const views = data.views?.find((v: any) => v.period === p)?.count ?? 0;
    const downloads = data.downloads?.find((d: any) => d.period === p)?.count ?? 0;
    const uploads = data.uploads?.find((u: any) => u.period === p)?.count ?? 0;
    return { period: p, views, downloads, uploads };
  });

  const maxCount = Math.max(1, ...periodData.map((p) => Math.max(p.views, p.downloads, p.uploads)));

  function formatPeriod(periodStr: string): string {
    const d = new Date(periodStr);
    if (period === 'month') {
      return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
    }
    if (period === 'week') {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      return weekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-white p-4">
        <div className="mb-4 text-sm font-medium">Активность по периодам</div>
        <div className="space-y-4">
          {periodData.length === 0 ? (
            <div className="text-sm text-gray-500">Нет данных за выбранный период</div>
          ) : (
            periodData.map((item) => (
              <div key={item.period}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-700">{formatPeriod(item.period)}</span>
                  <span className="text-gray-500">
                    Просмотры: {item.views} · Скачивания: {item.downloads} · Загрузки: {item.uploads}
                  </span>
                </div>
                <div className="flex gap-1">
                  {item.views > 0 && (
                    <div
                      className="h-6 bg-blue-500"
                      style={{ width: `${(item.views / maxCount) * 100}%` }}
                      title={`Просмотры: ${item.views}`}
                    />
                  )}
                  {item.downloads > 0 && (
                    <div
                      className="h-6 bg-green-500"
                      style={{ width: `${(item.downloads / maxCount) * 100}%` }}
                      title={`Скачивания: ${item.downloads}`}
                    />
                  )}
                  {item.uploads > 0 && (
                    <div
                      className="h-6 bg-purple-500"
                      style={{ width: `${(item.uploads / maxCount) * 100}%` }}
                      title={`Загрузки: ${item.uploads}`}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 bg-blue-500" />
            <span>Просмотры</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 bg-green-500" />
            <span>Скачивания</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 bg-purple-500" />
            <span>Загрузки</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkloadSection({ data, loading }: { data: any; loading: boolean }) {
  if (loading) {
    return <div className="rounded-md border bg-white p-6">Загрузка нагрузки…</div>;
  }

  if (!data) {
    return <div className="rounded-md border bg-white p-6 text-sm text-gray-500">Не удалось загрузить данные</div>;
  }

  function formatRole(role: string): string {
    const roles: Record<string, string> = {
      viewer: 'Просмотр',
      uploader: 'Загрузка',
      editor: 'Редактор',
      moderator: 'Модератор',
      admin: 'Администратор',
      analyst: 'Аналитик',
      owner: 'Владелец',
    };
    return roles[role] || role;
  }

  return (
    <div className="space-y-6">
      {/* Activity by role */}
      <div className="rounded-md border bg-white p-4">
        <div className="mb-4 text-sm font-medium">Активность по ролям</div>
        {data.byRole && data.byRole.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              <div className="col-span-4">Роль</div>
              <div className="col-span-4 text-right">Событий</div>
              <div className="col-span-4 text-right">Пользователей</div>
            </div>
            {data.byRole.map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                <div className="col-span-4 text-gray-700">{formatRole(item.role)}</div>
                <div className="col-span-4 text-right text-gray-700">{item.eventCount}</div>
                <div className="col-span-4 text-right text-gray-700">{item.userCount}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Нет данных</div>
        )}
      </div>

      {/* Top active users */}
      <div className="rounded-md border bg-white p-4">
        <div className="mb-4 text-sm font-medium">Топ активных пользователей</div>
        {data.topUsers && data.topUsers.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              <div className="col-span-4">Пользователь</div>
              <div className="col-span-2">Роль</div>
              <div className="col-span-2 text-right">Событий</div>
              <div className="col-span-2 text-right">Создано</div>
              <div className="col-span-2 text-right">Изменено</div>
            </div>
            {data.topUsers.map((item: any) => (
              <div key={item.user.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                <div className="col-span-4 text-gray-700">
                  {item.user.displayName || item.user.email}
                </div>
                <div className="col-span-2 text-gray-600">{item.role ? formatRole(item.role) : '—'}</div>
                <div className="col-span-2 text-right text-gray-700">{item.eventCount}</div>
                <div className="col-span-2 text-right text-gray-700">{item.assetsCreated}</div>
                <div className="col-span-2 text-right text-gray-700">{item.assetsEdited}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Нет данных</div>
        )}
      </div>

      {/* Status changes by user */}
      <div className="rounded-md border bg-white p-4">
        <div className="mb-4 text-sm font-medium">Изменения статусов по пользователям</div>
        {data.statusChangesByUser && data.statusChangesByUser.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              <div className="col-span-4">Пользователь</div>
              <div className="col-span-2 text-right">Всего</div>
              <div className="col-span-2 text-right">Утверждено</div>
              <div className="col-span-2 text-right">Отклонено</div>
              <div className="col-span-2 text-right">На согласовании</div>
            </div>
            {data.statusChangesByUser.map((item: any) => (
              <div key={item.user.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                <div className="col-span-4 text-gray-700">
                  {item.user.displayName || item.user.email}
                </div>
                <div className="col-span-2 text-right text-gray-700">{item.changeCount}</div>
                <div className="col-span-2 text-right text-green-700">{item.approvedCount}</div>
                <div className="col-span-2 text-right text-red-700">{item.rejectedCount}</div>
                <div className="col-span-2 text-right text-blue-700">{item.reviewCount}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Нет данных</div>
        )}
      </div>
    </div>
  );
}


