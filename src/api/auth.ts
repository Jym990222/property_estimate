// src/api/auth.ts
// 账号与鉴权：/api/auth/v1（自助注册 + 管理员审批 + 服务端令牌会话）
import { API_ORIGIN, apiDelete, apiGet, apiGetData, apiPatch, apiPost, type ApiEnvelope } from './http';

const BASE = `${API_ORIGIN}/api/auth/v1`;

export type Role = 'admin' | 'staff' | 'member';
export type UserStatus = 'pending' | 'active' | 'disabled' | 'rejected';

export interface AuthUser {
  user_id: number;
  username: string;
  real_name: string;
  employee_no: string | null;
  department: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  cert_no: string | null;
  cert_valid_to: string | null;
  role: Role;
  role_label: string;
  status: UserStatus;
  status_label: string;
  must_change_password: number | boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  login_count: number;
  approved_by: string | null;
  approved_at: string | null;
  reject_note: string | null;
  created_at?: string;
  remark?: string | null;
}

export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
  permissions: string[];
}

export interface CurrentUserResult {
  user: AuthUser;
  permissions: string[];
  must_change_password: boolean;
}

export interface RoleItem {
  role: Role;
  label: string;
  permissions: string[];
}

export interface LoginLog {
  log_id: number;
  username: string | null;
  user_id: number | null;
  success: number | boolean;
  reason: string | null;
  client_ip: string | null;
  created_at: string;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  return (await apiPost<LoginResult>(`${BASE}/sessions`, { username, password })).data;
}

export async function logout(): Promise<void> {
  await apiDelete(`${BASE}/sessions/current`);
}

export async function fetchCurrentUser(): Promise<CurrentUserResult> {
  return apiGetData<CurrentUserResult>(`${BASE}/users/current`);
}

export async function register(payload: {
  username: string;
  real_name: string;
  password: string;
  employee_no?: string;
  department?: string;
  title?: string;
  phone?: string;
  email?: string;
  remark?: string;
}): Promise<{ user_id: number; username: string; status: UserStatus; status_label: string }> {
  const envelope = await apiPost<{ user_id: number; username: string; status: UserStatus; status_label: string }>(
    `${BASE}/registrations`, payload);
  return envelope.data;
}

export async function changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiPost(`${BASE}/users/current/password`, { old_password: oldPassword, new_password: newPassword });
}

export async function fetchUsers(params?: {
  status?: string;
  role?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}): Promise<{ total: number; items: AuthUser[] }> {
  const envelope: ApiEnvelope<AuthUser[]> = await apiGet(`${BASE}/users`, params);
  return { total: Number(envelope.meta.total ?? 0), items: envelope.data };
}

export async function approveUser(userId: number, role: Role, note?: string): Promise<AuthUser> {
  return (await apiPost<AuthUser>(`${BASE}/users/${userId}/approvals`, { role, note })).data;
}

export async function rejectUser(userId: number, note?: string): Promise<AuthUser> {
  return (await apiPost<AuthUser>(`${BASE}/users/${userId}/rejections`, { note })).data;
}

export async function patchUser(userId: number, fields: Record<string, unknown>): Promise<AuthUser> {
  return (await apiPatch<AuthUser>(`${BASE}/users/${userId}`, fields)).data;
}

export async function resetUserPassword(userId: number): Promise<{
  user_id: number;
  username: string;
  initial_password: string;
}> {
  const envelope = await apiPost<{ user_id: number; username: string; initial_password: string }>(
    `${BASE}/users/${userId}/password-resets`);
  return envelope.data;
}

export async function fetchLoginLogs(params?: { username?: string; page_size?: number }): Promise<LoginLog[]> {
  return apiGetData<LoginLog[]>(`${BASE}/login-logs`, params);
}

export async function fetchRoles(): Promise<RoleItem[]> {
  return apiGetData<RoleItem[]>(`${BASE}/roles`);
}
