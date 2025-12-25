import React from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { LibraryPage } from './pages/LibraryPage';
import { AssetPage } from './pages/AssetPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { SavedSearchesPage } from './pages/SavedSearchesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { me, loading, logout } = useAuth();
  const nav = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <main className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-md border bg-white p-6">Загрузка…</div>
        </main>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="font-semibold"><Link to="/">Cloud Drive</Link></div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-10">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold"><Link to="/">Cloud Drive</Link></div>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link to="/" className="hover:text-gray-900">Библиотека</Link>
            <Link to="/collections" className="hover:text-gray-900">Коллекции</Link>
            <Link to="/saved" className="hover:text-gray-900">Сохранённые</Link>
            <Link to="/analytics" className="hover:text-gray-900">Аналитика</Link>
            <button
              onClick={async () => {
                await logout();
                nav('/login', { replace: true });
              }}
              className="rounded-md border px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Выйти
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/asset/:id" element={<AssetPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/saved" element={<SavedSearchesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}




