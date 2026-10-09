// src/auth/context.ts
// 登录态的类型、Context 与 hook（与组件文件分开，避免 react-refresh 警告）
import { createContext, useContext } from 'react';
import type { AuthUser } from '../api/auth';

export interface AuthState {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  mustChangePassword: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}
