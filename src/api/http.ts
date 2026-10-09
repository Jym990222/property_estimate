// src/api/http.ts
// 统一 API 客户端：按《石化智云 API 开发规范》处理 {data, meta, _links} 信封与 {error: {...}} 错误包装。

export const API_ORIGIN = import.meta.env.VITE_API_BASE_URL;

export interface ApiLink {
  href: string;
  method: string;
  title?: string;
  templated?: boolean;
}

export interface ApiMeta {
  api_version: string;
  request_id: string;
  generated_at: string;
  elapsed_ms?: number;
  total?: number;
  count?: number;
  page?: number;
  page_size?: number;
  pages?: number;
  has_next?: boolean;
  has_prev?: boolean;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
  _links: Record<string, ApiLink>;
}

export interface ApiErrorDetail {
  field?: string | null;
  message: string;
  value?: string;
}

/** 规范错误包装：{error: {code, message, status, details, request_id}} */
export class ApiError extends Error {
  code: string;
  status: number;
  details: ApiErrorDetail[];
  requestId?: string;

  constructor(message: string, code = 'API_ERROR', status = 0, details: ApiErrorDetail[] = [], requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  /** 便于界面提示：把 details 拼成一行 */
  get detailText(): string {
    return this.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('；');
  }
}

export type QueryValue = string | number | boolean | undefined | null | (string | number)[];

/**
 * 拼接查询参数：
 * - 数组按规范用分号分隔（无次序集合），如 cities=北京;上海
 * - 空值 / 空数组不参与拼接
 */
export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      const items = value.filter((v) => v !== undefined && v !== null && String(v) !== '');
      if (items.length === 0) return;
      search.set(key, items.join(';'));
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  return `${path}${buildQuery(params)}`;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    status?: number;
    details?: ApiErrorDetail[];
    request_id?: string;
  };
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: ErrorEnvelope | null = null;
  try {
    payload = (await response.json()) as ErrorEnvelope;
  } catch {
    payload = null;
  }
  const error = payload?.error;
  if (error) {
    return new ApiError(error.message || `HTTP ${response.status}`, error.code, error.status ?? response.status,
      error.details ?? [], error.request_id);
  }
  return new ApiError(`HTTP ${response.status}`, 'HTTP_ERROR', response.status);
}

async function request<T>(method: string, path: string, params?: Record<string, QueryValue>, body?: unknown): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  const sentToken = authToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  const response = await fetch(buildUrl(path, params), {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await parseError(response);
    // 只有“确实带了令牌却被拒”才说明会话失效；没带令牌的 401 不能清掉本地登录态
    if (error.status === 401 && sentToken) unauthorizedHandler?.(error);
    throw error;
  }
  return (await response.json()) as ApiEnvelope<T>;
}

// ---------- 鉴权令牌（由 AuthProvider 注入，避免模块循环依赖） ----------
let authToken: string | null = null;
let unauthorizedHandler: ((error: ApiError) => void) | null = null;

/** 设置后续请求携带的 Bearer 令牌（传 null 表示未登录） */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** 注册 401 处理（如清理本地会话、跳登录页） */
export function setUnauthorizedHandler(handler: ((error: ApiError) => void) | null): void {
  unauthorizedHandler = handler;
}

/** GET 资源（返回完整信封，集合接口可读取 meta 分页信息与 _links 翻页链接） */
export function apiGet<T>(path: string, params?: Record<string, QueryValue>): Promise<ApiEnvelope<T>> {
  return request<T>('GET', path, params);
}

/**
 * 把应答 _links 里的相对 href 转成可直接请求 / 打开的绝对地址。
 * 超媒体链接的 href 都是相对 API 根路径的（如 /api/price/v1/provinces?…）。
 */
export function absoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${API_ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`;
}

/** 超媒体用法：直接跟随服务端给出的链接，无需客户端重新拼装参数 */
export function apiGetUrl<T>(href: string): Promise<ApiEnvelope<T>> {
  return request<T>('GET', absoluteUrl(href));
}

/** GET 资源并只取 data（界面多数场景只关心数据体） */
export async function apiGetData<T>(path: string, params?: Record<string, QueryValue>): Promise<T> {
  const envelope = await apiGet<T>(path, params);
  return envelope.data;
}

export function apiPost<T>(path: string, body?: unknown, params?: Record<string, QueryValue>): Promise<ApiEnvelope<T>> {
  return request<T>('POST', path, params, body ?? {});
}

export function apiPatch<T>(path: string, body: unknown, params?: Record<string, QueryValue>): Promise<ApiEnvelope<T>> {
  return request<T>('PATCH', path, params, body);
}

/** PUT：更新资源，客户端提供改变后的完整资源 */
export function apiPut<T>(path: string, body: unknown, params?: Record<string, QueryValue>): Promise<ApiEnvelope<T>> {
  return request<T>('PUT', path, params, body);
}

export function apiDelete<T>(path: string, params?: Record<string, QueryValue>, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>('DELETE', path, params, body);
}

/** 规范中的“试算”用法：先用同一条件 GET 拿到 meta.total，再决定是否 DELETE */
export async function apiCount(path: string, params?: Record<string, QueryValue>): Promise<number> {
  const envelope = await apiGet<unknown>(path, { ...params, page: 1, page_size: 1 });
  return Number(envelope.meta.total ?? 0);
}
