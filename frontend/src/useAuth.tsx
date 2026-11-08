import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, type User } from './api';

type AuthState = {
  user: User | null;
  loading: boolean;
  /** `true` si la sesión se perdió (401) mientras el usuario navegaba. */
  expired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ user: User }>('/api/auth/me')
      .then(({ user }) => active && setUser(user))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onExpired = () =>
      setUser((current) => {
        if (current) setExpired(true);
        return null;
      });
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await apiFetch<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setExpired(false);
    setUser(user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { user } = await apiFetch<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setExpired(false);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      setExpired(false);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, expired, login, register, logout }),
    [user, loading, expired, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
