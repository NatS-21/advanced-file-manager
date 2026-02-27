import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const roleLabels: Record<string, string> = {
  viewer: 'Наблюдатель',
  uploader: 'Загрузчик',
  editor: 'Редактор',
  moderator: 'Модератор',
  admin: 'Администратор',
  analyst: 'Аналитик',
  owner: 'Владелец',
};

export function ProfilePage() {
  const { me, logout } = useAuth();
  const nav = useNavigate();

  if (!me) return null;

  async function handleLogout() {
    await logout();
    nav('/login', { replace: true });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Профиль</h1>
      <div className="rounded-md border bg-white p-6">
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Email</dt>
            <dd className="mt-1 text-gray-900">{me.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Имя</dt>
            <dd className="mt-1 text-gray-900">{me.displayName || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Роль</dt>
            <dd className="mt-1 text-gray-900">{roleLabels[me.role || ''] || me.role || '—'}</dd>
          </div>
        </dl>
        <div className="mt-6 pt-6 border-t">
          <button
            onClick={handleLogout}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}

