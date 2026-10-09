// src/auth/AuthContext.tsx
// 登录态：令牌存 localStorage，请求由 http.ts 自动带 Authorization。
// 本期权限模型：admin 可写全部；member 只读；未登录仅公开读。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setAuthToken, setUnauthorizedHandler } from '../api/http';
import {
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  type AuthUser,
} from '../api/auth';
import { AuthContext, type AuthState } from './context';

const TOKEN_KEY = 'dsh.auth.token';

// 关键：在模块加载时（任何组件挂载之前）就把令牌注入 http 客户端。
// 否则子组件的首个数据请求会早于 AuthProvider 的 effect 发出，导致没带令牌 → 401。
const initialToken = typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
if (initialToken) setAuthToken(initialToken);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setPermissions([]);
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      clearSession();
      setLoading(false);
      return;
    }
    setAuthToken(token);
    try {
      const result = await fetchCurrentUser();
      setUser(result.user);
      setPermissions(result.permissions);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // 令牌失效时（401）立刻清理本地登录态
    setUnauthorizedHandler(() => clearSession());
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    localStorage.setItem(TOKEN_KEY, result.token);
    setAuthToken(result.token);
    setUser(result.user);
    setPermissions(result.permissions);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* 令牌可能已失效，忽略 */
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthState>(() => ({
    user,
    permissions,
    loading,
    mustChangePassword: Boolean(user?.must_change_password),
    isAdmin: user?.role === 'admin' && user?.status === 'active',
    isLoggedIn: Boolean(user),
    login,
    logout,
    refresh,
  }), [user, permissions, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
