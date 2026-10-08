// src/api/logs.ts
// 日志维护模块：/api/log/v1
// 规范要点：GET 取资源、PATCH 局部更新、DELETE 删除；清理采用“先试算（GET 同条件）再执行（DELETE）”两步。
import {
  API_ORIGIN,
  absoluteUrl,
  apiCount,
  apiDelete,
  apiGet,
  apiGetData,
  apiGetUrl,
  apiPatch,
  buildQuery,
  type ApiEnvelope,
  type ApiLink,
  type QueryValue,
} from './http';

const BASE = `${API_ORIGIN}/api/log/v1`;

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type LogType = 'api' | 'business' | 'ai' | 'db' | 'crawler' | 'system';

export interface LogItem {
  log_id: number;
  created_at: string;
  last_seen_at: string;
  repeat_count: number;
  level: LogLevel;
  log_type: LogType;
  action: string;
  message: string;
  detail?: string;
  detail_preview?: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  client_ip: string | null;
  trace_id: string | null;
  is_key: number;
}

export interface LogQueryPayload {
  page?: number;
  page_size?: number;
  order?: 'asc' | 'desc';
  level?: string[];
  log_type?: string[];
  keyword?: string;
  date_from?: string;
  date_to?: string;
  created_before?: string;
  status_code?: number;
  min_duration_ms?: number;
  is_important?: boolean;
  include_important?: boolean;
  trace_id?: string;
}

export interface LogListResp {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: LogItem[];
  /** 服务端给出的超媒体链接：self / next / prev / first / last / log_exports / delete / item … */
  links: Record<string, ApiLink>;
  degraded?: boolean;
  note?: string;
}

export interface LogDetailResp {
  item: LogItem;
  /** 单条日志的超媒体链接：self / update / delete / same_trace … */
  links: Record<string, ApiLink>;
}

export interface LogDailyItem {
  date: string;
  total: number;
  ERROR: number;
  WARN: number;
  INFO: number;
  DEBUG: number;
  /** 仅当日存在 FATAL 级日志时后端才会返回该字段 */
  FATAL?: number;
}

export interface LogStats {
  days: number;
  total: number;
  today: number;
  error_total: number;
  warn_total: number;
  key_total: number;
  by_level: { level: string; count: number }[];
  by_type: { log_type: string; count: number }[];
  daily: LogDailyItem[];
  table: { rows: number | null; size_mb: number | null };
  fallback_files: number;
  retention_days: number;
  slow_ms: number;
  degraded: boolean;
}

export interface LogStoreInfo {
  db_ready: boolean;
  pymysql: boolean;
  table: string;
  database: string;
  log_dir: string;
  fallback_files: number;
  fallback_size_kb: number;
  fallback_lines: number;
  retention_days: number;
  slow_ms: number;
  save_all_info: boolean;
  dedup_window: number;
  level_values: string[];
}

export interface LogFileInfo {
  name: string;
  date: string;
  size_kb: number;
  lines: number;
  modified: string;
}

export interface LogFileListResp {
  total: number;
  items: LogFileInfo[];
  log_dir: string;
}

export interface LogFileContentResp {
  name: string;
  total: number;
  items: Record<string, unknown>[];
}

/** DELETE /logs 的结果（清理结果） */
export interface CleanupResult {
  deleted: number;
  criteria: Record<string, unknown>;
  protected_important: number;
  remaining_matching: number;
}

function toParams(payload: LogQueryPayload): Record<string, QueryValue> {
  const params: Record<string, QueryValue> = {
    page: payload.page,
    page_size: payload.page_size,
    order: payload.order,
    level: payload.level && payload.level.length > 0 ? payload.level : undefined,
    log_type: payload.log_type && payload.log_type.length > 0 ? payload.log_type : undefined,
    keyword: payload.keyword?.trim() || undefined,
    date_from: payload.date_from,
    date_to: payload.date_to,
    created_before: payload.created_before,
    status_code: payload.status_code,
    min_duration_ms: payload.min_duration_ms,
    trace_id: payload.trace_id,
  };
  if (payload.is_important !== undefined) params.is_important = payload.is_important;
  if (payload.include_important !== undefined) params.include_important = payload.include_important;
  return params;
}

function toListResp(envelope: ApiEnvelope<LogItem[]>): LogListResp {
  return {
    total: Number(envelope.meta.total ?? 0),
    page: Number(envelope.meta.page ?? 1),
    page_size: Number(envelope.meta.page_size ?? 20),
    pages: Number(envelope.meta.pages ?? 1),
    items: envelope.data ?? [],
    links: envelope._links ?? {},
    degraded: Boolean(envelope.meta.degraded),
    note: typeof envelope.meta.note === 'string' ? envelope.meta.note : undefined,
  };
}

export async function fetchLogs(payload: LogQueryPayload): Promise<LogListResp> {
  return toListResp(await apiGet<LogItem[]>(`${BASE}/logs`, toParams(payload)));
}

/**
 * 超媒体用法：直接跟随服务端给出的翻页链接（_links.next / prev / first / last）。
 * 好处是链接里已经带着当前全部过滤条件，客户端不需要重新拼装，也不会漏参数。
 */
export async function followLogs(href: string): Promise<LogListResp> {
  return toListResp(await apiGetUrl<LogItem[]>(href));
}

export async function fetchLogStats(days = 7): Promise<LogStats> {
  return apiGetData<LogStats>(`${BASE}/logs/statistics`, { days });
}

export async function fetchLogInfo(): Promise<LogStoreInfo> {
  return apiGetData<LogStoreInfo>(`${BASE}/log-store`);
}

export async function fetchLogDetail(logId: number): Promise<LogDetailResp> {
  const envelope = await apiGet<LogItem>(`${BASE}/logs/${logId}`);
  return { item: envelope.data, links: envelope._links ?? {} };
}

/** PATCH 局部更新：人工标记重要（清理时保留） */
export async function markLogKey(logId: number, isImportant: boolean): Promise<void> {
  await apiPatch<LogItem>(`${BASE}/logs/${logId}`, { is_important: isImportant });
}

export async function deleteLogs(ids: number[]): Promise<number> {
  const envelope = await apiDelete<{ deleted: number }>(`${BASE}/logs`, { ids });
  return Number(envelope.data?.deleted ?? 0);
}

/** 清理试算：GET 同条件，返回将被删除的条数（默认不含人工标记的重要日志） */
export async function previewCleanup(createdBefore: string, includeImportant = false): Promise<number> {
  return apiCount(`${BASE}/logs`, { created_before: createdBefore, include_important: includeImportant });
}

/** 执行清理：DELETE 同条件 */
export async function executeCleanup(createdBefore: string, includeImportant = false): Promise<CleanupResult> {
  const envelope = await apiDelete<CleanupResult>(`${BASE}/logs`, {
    created_before: createdBefore,
    include_important: includeImportant,
  });
  return envelope.data;
}

export async function fetchLogFiles(): Promise<LogFileListResp> {
  return apiGetData<LogFileListResp>(`${BASE}/log-files`);
}

export async function fetchLogFile(name: string, limit = 200, keyword = '', level = ''): Promise<LogFileContentResp> {
  return apiGetData<LogFileContentResp>(`${BASE}/log-files/${encodeURIComponent(name)}`, {
    limit,
    keyword: keyword || undefined,
    level: level || undefined,
  });
}

export async function deleteLogFile(name: string): Promise<number> {
  const envelope = await apiDelete<{ deleted: number }>(`${BASE}/log-files/${encodeURIComponent(name)}`);
  return Number(envelope.data?.deleted ?? 0);
}

/** 删除 before（YYYY-MM-DD）之前的兜底日志文件 */
export async function cleanupLogFiles(before: string): Promise<number> {
  const envelope = await apiDelete<{ deleted: number }>(`${BASE}/log-files`, { before });
  return Number(envelope.data?.deleted ?? 0);
}

/** 导出 CSV：直接交给浏览器下载，条件与列表页一致 */
export function logExportUrl(payload: LogQueryPayload): string {
  const query = buildQuery(toParams({ ...payload, page: undefined, page_size: undefined }));
  return `${BASE}/log-exports${query}`;
}

/**
 * 超媒体用法：优先使用服务端在列表应答里给出的 _links.log_exports，
 * 这样"导出的条件"与"列表看到的数据"永远一致（客户端不必重拼参数）。
 */
export function exportUrlFromLinks(links: Record<string, ApiLink> | undefined): string | null {
  const href = links?.log_exports?.href;
  return href ? absoluteUrl(href) : null;
}
