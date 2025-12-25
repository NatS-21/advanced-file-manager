import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../shared/api';

export interface Me {
  id: number;
  email: string;
  displayName: string | null;
  teamId: number;
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await apiGet<Me>('/api/me');
      setMe(data);
    } catch {
      setMe(null);
    }
  }

  async function login(email: string, password: string) {
    await apiPost('/api/auth/login', { email, password });
    await refresh();
  }

  async function register(email: string, password: string, displayName?: string) {
    await apiPost('/api/auth/register', { email, password, displayName });
    await refresh();
  }

  async function logout() {
    await apiPost('/api/auth/logout', {});
    setMe(null);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(() => ({ me, loading, refresh, login, register, logout }), [me, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}


