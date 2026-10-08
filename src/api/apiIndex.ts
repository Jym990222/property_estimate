// src/api/apiIndex.ts
// 超媒体入口：拉取后端 GET /api 的模块索引，格式化成可放进 AI 系统提示的接口目录。
// 这样"评估小助手"回答"怎么查某省均价"时能给出真实可调用的地址，而不是编造接口。
import { API_ORIGIN, apiGet } from './http';

export interface ApiIndexEndpoint {
  href: string;
  methods: string[];
  title: string;
  endpoint?: string;
}

export interface ApiIndexModule {
  module: string;
  version: string;
  base: string;
  endpoints: ApiIndexEndpoint[];
}

export interface ApiIndexData {
  api: string;
  version: string;
  encoding?: string;
  conventions?: Record<string, string>;
  module_count: number;
  modules: Record<string, ApiIndexModule>;
}

const MODULE_LABEL: Record<string, string> = {
  system: '系统',
  geo: '地理/城市',
  price: '价格行情',
  futures: '期货行情',
  ai: 'AI 对话',
  log: '日志维护',
};

let cache: Promise<string> | null = null;
/** 目录中所有 href 编译成的匹配模式：{占位符} → 匹配一段路径 */
let knownPatterns: RegExp[] = [];
let knownHrefs: string[] = [];
let lastData: ApiIndexData | null = null;

/** 取接口目录（进程内缓存；失败时返回空串，不影响正常对话） */
export function getApiCatalog(): Promise<string> {
  if (!cache) cache = load();
  return cache;
}

/** 强制下次重新拉取（后端新增接口后可手动刷新） */
export function resetApiCatalogCache(): void {
  cache = null;
  knownPatterns = [];
  knownHrefs = [];
}

async function load(): Promise<string> {
  try {
    const envelope = await apiGet<ApiIndexData>(`${API_ORIGIN}/api`);
    refreshPatterns(envelope.data);
    return formatCatalog(envelope.data);
  } catch {
    return '';
  }
}

function refreshPatterns(data?: ApiIndexData | null): void {
  const current = data ?? lastData;
  if (!current || !current.modules) return;
  const hrefs: string[] = [];
  Object.values(current.modules).forEach((module) => {
    module.endpoints.forEach((endpoint) => hrefs.push(endpoint.href));
  });
  knownHrefs = hrefs;
  knownPatterns = hrefs.map((href) => {
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+');
    return new RegExp(`^${escaped}$`);
  });
}

/**
 * 判断一个链接是否存在于接口目录中（用于提示"模型可能写错了地址"）。
 * 返回 null 表示目录还没准备好、无法判断。
 */
export function isKnownApiHref(href: string): boolean | null {
  if (knownPatterns.length === 0) return null;
  let path = href;
  try {
    path = new URL(href, 'https://placeholder.invalid').pathname;
  } catch {
    path = href.split('?')[0];
  }
  if (!path.startsWith('/api')) return true; // 非本 API 的链接不做判断
  return knownPatterns.some((pattern) => pattern.test(path));
}

/** 目录里的原始 href 列表（调试/自检用） */
export function getKnownHrefs(): string[] {
  return [...knownHrefs];
}

export function formatCatalog(data: ApiIndexData | undefined | null): string {
  if (!data || !data.modules) return '';
  lastData = data;
  const lines: string[] = [];
  lines.push(`接口根地址：${API_ORIGIN}（下表中的路径都是相对该地址的相对路径，直接拼接即可调用）`);

  const conventions = data.conventions ?? {};
  if (Object.keys(conventions).length > 0) {
    lines.push('通用约定：');
    Object.entries(conventions).forEach(([key, value]) => lines.push(`- ${key}：${value}`));
  }

  Object.values(data.modules).forEach((module) => {
    lines.push(`\n### ${MODULE_LABEL[module.module] ?? module.module} 模块（${module.base}）`);
    module.endpoints.forEach((endpoint) => {
      lines.push(`- ${endpoint.methods.join('/')} ${endpoint.href}：${endpoint.title}`);
    });
  });
  return lines.join('\n');
}
