import React, { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiDelete, apiPost } from '../shared/api';
import { useAuth } from '../auth/AuthContext';

type UserRole = 'viewer' | 'uploader' | 'editor' | 'moderator' | 'admin' | 'analyst' | 'owner';

type TeamMember = {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
};

type TeamMembersResponse = {
  items: TeamMember[];
};

function formatRole(role: UserRole): string {
  const roles: Record<UserRole, string> = {
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

export function TeamMembersPage() {
  const { me } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('viewer');
  
  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<TeamMembersResponse>('/api/team/members');
      setMembers(res.items);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Не удалось загрузить участников');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateRole(memberId: number, role: UserRole) {
    try {
      await apiPatch(`/api/team/members/${memberId}`, { role });
      await loadMembers();
      setEditingRole(null);
    } catch (e: any) {
      alert(e?.message ? String(e.message) : 'Не удалось изменить роль');
    }
  }

  async function handleDeleteMember(memberId: number) {
    if (!confirm('Вы уверены, что хотите удалить этого участника из команды?')) {
      return;
    }

    try {
      await apiDelete(`/api/team/members/${memberId}`);
      await loadMembers();
    } catch (e: any) {
      alert(e?.message ? String(e.message) : 'Не удалось удалить участника');
    }
  }

  function startEditRole(member: TeamMember) {
    setEditingRole(member.id);
    setNewRole(member.role);
  }

  function cancelEditRole() {
    setEditingRole(null);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    
    // Client-side validation
    if (!inviteEmail || !inviteEmail.includes('@')) {
      setInviteError('Некорректный email');
      return;
    }

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await apiPost<{ ok: boolean; member: { id: number; email: string; role: UserRole; isNewUser: boolean } }>(
        '/api/team/members',
        { email: inviteEmail.trim().toLowerCase(), role: inviteRole }
      );
      
      setInviteEmail('');
      setInviteRole('viewer');
      setInviteSuccess(
        res.member.isNewUser
          ? `Пользователь ${res.member.email} создан и добавлен в команду. Он сможет зарегистрироваться с этим email.`
          : `Пользователь ${res.member.email} добавлен в команду.`
      );
      
      // Reload members list
      await loadMembers();
      
      // Clear success message after 5 seconds
      setTimeout(() => setInviteSuccess(null), 5000);
    } catch (e: any) {
      setInviteError(e?.message ? String(e.message) : 'Не удалось пригласить пользователя');
    } finally {
      setInviting(false);
    }
  }

  const roleOptions: UserRole[] = ['viewer', 'uploader', 'editor', 'moderator', 'admin', 'analyst'];
  const canInvite = me?.role === 'admin' || me?.role === 'owner';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Участники команды</div>
          <div className="text-sm text-gray-600">Управление участниками и ролями</div>
        </div>
        <button
          onClick={loadMembers}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      {loading && <div className="rounded-md border bg-white p-6 text-center text-sm text-gray-500">Загрузка участников…</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {canInvite && (
        <div className="rounded-md border bg-white p-4">
          <div className="mb-3 text-sm font-medium text-gray-900">Пригласить пользователя</div>
          <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError(null);
                }}
                placeholder="user@example.com"
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
                disabled={inviting}
              />
            </div>
            <div className="min-w-[150px]">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Роль
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                disabled={inviting}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {formatRole(role)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviting ? 'Приглашение…' : 'Пригласить'}
            </button>
          </form>
          {inviteError && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">
              {inviteSuccess}
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500">
            Если пользователь с таким email не существует, он будет создан автоматически. Пользователь сможет зарегистрироваться с этим email.
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {members.length === 0 ? (
            <div className="rounded-md border bg-white p-6 text-center text-sm text-gray-500">
              Участников не найдено
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Имя</div>
                <div className="col-span-2">Роль</div>
                <div className="col-span-3">Дата добавления</div>
                <div className="col-span-2">Действия</div>
              </div>
              {members.map((member) => (
                <div key={member.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                  <div className="col-span-3 text-gray-700">{member.email}</div>
                  <div className="col-span-2 text-gray-700">{member.displayName || '—'}</div>
                  <div className="col-span-2 text-gray-700">
                    {editingRole === member.id ? (
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="w-full rounded-md border px-2 py-1 text-xs"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {formatRole(role)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      formatRole(member.role)
                    )}
                  </div>
                  <div className="col-span-3 text-gray-600 text-xs">
                    {new Date(member.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    {editingRole === member.id ? (
                      <>
                        <button
                          onClick={() => handleUpdateRole(member.id, newRole)}
                          className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={cancelEditRole}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        {member.role !== 'owner' && (
                          <>
                            <button
                              onClick={() => startEditRole(member)}
                              className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                            >
                              Изменить роль
                            </button>
                            <button
                              onClick={() => handleDeleteMember(member.id)}
                              className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              Удалить
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

