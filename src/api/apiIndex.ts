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

export interface HrefResolution {
  /** 最终应使用的绝对/相对地址 */
  href: string;
  /** 是否依据接口目录做过纠正（漏 /api、缩写等） */
  corrected: boolean;
  /** 是否在目录中命中（非本 API 的链接视为命中，不干预） */
  resolved: boolean;
  /** 未命中时，目录里最接近的几个接口（供用户选择） */
  suggestions: string[];
}

const MODULE_NAMES = ['system', 'geo', 'price', 'futures', 'ai', 'log'];

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean).flatMap((seg) => seg.split(/[-_]/)).filter(Boolean);
}

/** 单段替换代价：完全相同 0；一方是另一方前缀（缩写/多后缀）0.2；否则 1 */
function segCost(a: string, b: string): number {
  if (a === b) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) return 0.2;
  return 1;
}

/** 段序列的编辑距离（替换用 segCost，增删 0.5） */
function seriesCost(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1) dp[i][0] = i * 0.5;
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j * 0.5;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + segCost(a[i - 1], b[j - 1]),
        dp[i - 1][j] + 0.5,
        dp[i][j - 1] + 0.5,
      );
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string[], b: string[]): number {
  const maxLen = Math.max(a.length, b.length) || 1;
  return Math.max(0, 1 - seriesCost(a, b) / maxLen);
}

function splitHref(href: string): { path: string; suffix: string } {
  // 必须用 URL 解析剥掉域名，否则 path 会带着 origin，后续 prefix 判断全部失效
  try {
    const url = new URL(href, 'https://placeholder.invalid');
    return { path: url.pathname, suffix: `${url.search}${url.hash}` };
  } catch {
    const match = /^([^?#]*)(.*)$/.exec(href) ?? [];
    return { path: match[1] ?? href, suffix: match[2] ?? '' };
  }
}

/**
 * 依据接口目录解析一个链接：
 * 1) 原样命中 → 直接用；
 * 2) 漏了 /api 前缀 → 补上后命中 → 纠正；
 * 3) 缩写/写错模块（prov-averages、price1）→ 在目录中找最接近的一条 → 纠正；
 * 4) 都匹配不上 → 返回目录里最接近的候选，交给界面阻止跳转并让用户选择。
 */
export function resolveApiHref(href: string): HrefResolution {
  const { path, suffix } = splitHref(href);
  const unchanged: HrefResolution = { href, corrected: false, resolved: true, suggestions: [] };
  if (knownPatterns.length === 0) return unchanged; // 目录未就绪，不干预
  if (!MODULE_NAMES.some((name) => path === `/api/${name}` || path.startsWith(`/api/${name}/`)) &&
      !MODULE_NAMES.some((name) => path === `/${name}` || path.startsWith(`/${name}/`))) {
    return unchanged; // 不是本 API 的链接（外链等）不干预
  }

  const candidates: string[] = [];
  if (path.startsWith('/api/')) {
    candidates.push(path);
  } else {
    candidates.push(`/api${path.startsWith('/') ? '' : '/'}${path}`);
  }

  for (const candidate of candidates) {
    if (knownPatterns.some((pattern) => pattern.test(candidate))) {
      // 原样命中：保留调用方给的 href（含域名）；补 /api 后命中：用 API 域名拼出完整地址
      return candidate === path
        ? { href, corrected: false, resolved: true, suggestions: [] }
        : { href: `${API_ORIGIN}${candidate}${suffix}`, corrected: true, resolved: true, suggestions: [] };
    }
  }

  // 模糊匹配：取与候选路径最接近的目录 href
  const target = splitPath(candidates[0]);
  const scored = knownHrefs
    .map((known) => ({ known, score: similarity(target, splitPath(known.split('?')[0])) }))
    .sort((x, y) => y.score - x.score);
  const best = scored[0];
  const second = scored[1];
  const suggestions = scored.slice(0, 3).map((item) => item.known);

  // 自动纠正要求：明显最佳、且不是带 {占位符} 的模板 href（模板不能直接当链接用）
  if (best && !best.known.includes('{') && best.score >= 0.85 && (!second || best.score - second.score >= 0.08)) {
    return { href: `${API_ORIGIN}${best.known}${suffix}`, corrected: true, resolved: true, suggestions: [] };
  }
  return { href, corrected: false, resolved: false, suggestions };
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
