import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../shared/api';
import { useAuth } from '../auth/AuthContext';

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password, displayName || undefined);
      nav('/', { replace: true });
    } catch (e: any) {
      if (e instanceof ApiError) setError(e.payload?.error || e.message);
      else setError('Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-md border bg-white p-6">
        <div className="mb-4 text-lg font-semibold">Регистрация</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <div className="mb-1 text-sm text-gray-600">Имя (опционально)</div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 outline-none focus:ring"
              autoComplete="name"
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-gray-600">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2 outline-none focus:ring"
              autoComplete="email"
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-gray-600">Пароль (минимум 8 символов)</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full rounded-md border px-3 py-2 outline-none focus:ring"
              autoComplete="new-password"
            />
          </div>
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black disabled:opacity-60"
          >
            {loading ? 'Создаём…' : 'Создать аккаунт'}
          </button>
        </form>
        <div className="mt-4 text-sm text-gray-600">
          Уже есть аккаунт? <Link to="/login" className="text-gray-900 underline">Войти</Link>
        </div>
      </div>
    </div>
  );
}


