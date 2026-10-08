// src/api/asset.ts
// 资产模块：/api/asset/v1（评估项目 / 价值场景 / 资产台账 / 计算 / 结果 / 审计轨迹 / 材质映射）
import { API_ORIGIN, apiDelete, apiGet, apiGetData, apiPatch, apiPost, apiPut, type ApiEnvelope } from './http';

const BASE = `${API_ORIGIN}/api/asset/v1`;

export type ProjectStatus = 'draft' | 'reviewed' | 'issued';
export type ValuationMethod = 'cost' | 'liquidation';

export interface ValuationProject {
  project_id: number;
  project_no: string;
  project_name: string;
  valuation_purpose: string | null;
  base_date: string;
  reference_city: string;
  assumptions: string | null;
  status: ProjectStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  issued_by: string | null;
  issued_at: string | null;
  issue_note: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ValuationScenario {
  scenario_id: number;
  project_id: number;
  scenario_name: string;
  method: ValuationMethod;
  params: Record<string, number | null>;
}

export interface AssetItem {
  asset_id: number;
  project_id: number;
  parent_id: number | null;
  asset_code: string | null;
  asset_name: string;
  category: string | null;
  material: string | null;
  spec: string | null;
  quantity: number | null;
  unit: string | null;
  weight_ton: number | null;
  acquired_cost: number | null;
  installed_year: number | null;
  service_years: number | null;
  economic_life: number | null;
  inspection_score: number | null;
  w_age: number | null;
  w_inspection: number | null;
  compliance_cost: number | null;
  status: string;
  remark: string | null;
  children?: AssetItem[];
}

export interface MetalPriceSnapshot {
  city?: string;
  material?: string;
  unit_price?: number | null;
  price_date?: string | null;
}

export interface ValuationResult {
  result_id: number;
  scenario_id: number;
  asset_id: number;
  asset_name: string;
  category: string | null;
  material: string | null;
  weight_ton: number | null;
  scenario_name: string;
  method: ValuationMethod;
  replacement_cost: number | null;
  age_newness: number | null;
  inspection_newness: number | null;
  newness_rate: number | null;
  value_in_use: number | null;
  scrap_unit_price: number | null;
  recovery_rate: number | null;
  scrap_recovery: number | null;
  reusable_value: number | null;
  dismantle_cost: number | null;
  liquidation_value: number | null;
  metal_price_snapshot: MetalPriceSnapshot | null;
}

export interface ValuationTrace {
  trace_id: number;
  scenario_id: number;
  asset_id: number;
  asset_name: string;
  scenario_name: string;
  step: string;
  formula: string;
  inputs: Record<string, unknown> | null;
  output: number | null;
  source: string | null;
}

export interface ResidualMaterial {
  map_id: number;
  material: string;
  price_material: string | null;
  recovery_rate: number;
  unit_price_override: number | null;
}

export interface ProjectDetail {
  project: ValuationProject;
  scenarios: ValuationScenario[];
  asset_count: number;
  result_count: number;
  computed: boolean;
}

export interface ImportOutcome {
  imported: number;
  failed: number;
  errors: { row: number; message: string }[];
  file: string;
}

export interface CalculationOutcome {
  project_id: number;
  scenarios: number;
  assets: number;
  results: number;
}

// ---------- 项目 ----------
export async function fetchProjects(params?: { status?: string; keyword?: string; page?: number; page_size?: number }) {
  const envelope = await apiGet<ValuationProject[]>(`${BASE}/valuation-projects`, params);
  return { total: Number(envelope.meta.total ?? 0), items: envelope.data };
}

export async function createProject(payload: Record<string, unknown>): Promise<ValuationProject> {
  return (await apiPost<ValuationProject>(`${BASE}/valuation-projects`, payload)).data;
}

export async function patchProject(projectId: number, payload: Record<string, unknown>): Promise<ValuationProject> {
  return (await apiPatch<ValuationProject>(`${BASE}/valuation-projects/${projectId}`, payload)).data;
}

export async function fetchProjectDetail(projectId: number): Promise<ProjectDetail> {
  return apiGetData<ProjectDetail>(`${BASE}/valuation-projects/${projectId}`);
}

export async function reviewProject(projectId: number, payload: { reviewed_by?: string; note?: string }) {
  return (await apiPost<ValuationProject>(`${BASE}/valuation-projects/${projectId}/reviews`, payload)).data;
}

export async function issueProject(projectId: number, payload: { issued_by?: string; note?: string }) {
  return (await apiPost<ValuationProject>(`${BASE}/valuation-projects/${projectId}/issuances`, payload)).data;
}

/** 删除项目（仅草稿状态；连带删除其资产、场景、结果与轨迹） */
export async function deleteProject(projectId: number): Promise<void> {
  await apiDelete(`${BASE}/valuation-projects/${projectId}`);
}

// ---------- 场景 ----------
export async function fetchScenarios(projectId: number): Promise<ValuationScenario[]> {
  return apiGetData<ValuationScenario[]>(`${BASE}/valuation-projects/${projectId}/scenarios`);
}

export async function createScenario(
  projectId: number,
  payload: { scenario_name: string; method: ValuationMethod; params?: Record<string, number | null> },
): Promise<ValuationScenario> {
  return (await apiPost<ValuationScenario>(`${BASE}/valuation-projects/${projectId}/scenarios`, payload)).data;
}

export async function deleteScenario(scenarioId: number): Promise<void> {
  await apiDelete(`${BASE}/scenarios/${scenarioId}`);
}

// ---------- 资产 ----------
export async function fetchAssets(projectId: number): Promise<AssetItem[]> {
  return apiGetData<AssetItem[]>(`${BASE}/valuation-projects/${projectId}/assets`);
}

export async function createAsset(projectId: number, payload: Record<string, unknown>): Promise<AssetItem> {
  return (await apiPost<AssetItem>(`${BASE}/valuation-projects/${projectId}/assets`, payload)).data;
}

export async function patchAsset(assetId: number, payload: Record<string, unknown>): Promise<AssetItem> {
  return (await apiPatch<AssetItem>(`${BASE}/assets/${assetId}`, payload)).data;
}

export async function deleteAsset(assetId: number): Promise<void> {
  await apiDelete(`${BASE}/assets/${assetId}`);
}

/** Excel 批量导入（multipart） */
export async function importAssets(projectId: number, file: File): Promise<ImportOutcome> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${BASE}/valuation-projects/${projectId}/asset-imports`, {
    method: 'POST',
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(error?.message ? `${error.message}${error.details?.length ? `（${error.details[0]?.message ?? ''}）` : ''}` : `HTTP ${response.status}`);
  }
  return payload.data as ImportOutcome;
}

export function assetImportTemplateUrl(): string {
  return `${BASE}/asset-import-templates`;
}

export function valuationExportUrl(projectId: number): string {
  return `${BASE}/valuation-exports?project_id=${projectId}`;
}

// ---------- 计算 / 结果 / 轨迹 ----------
export async function runCalculation(projectId: number): Promise<CalculationOutcome> {
  return (await apiPost<CalculationOutcome>(`${BASE}/valuation-projects/${projectId}/calculations`)).data;
}

export async function fetchResults(projectId: number, scenarioId?: number): Promise<ValuationResult[]> {
  return apiGetData<ValuationResult[]>(`${BASE}/valuation-projects/${projectId}/results`,
    scenarioId ? { scenario_id: scenarioId } : undefined);
}

export async function fetchTraces(
  projectId: number,
  params?: { scenario_id?: number; asset_id?: number },
): Promise<ValuationTrace[]> {
  return apiGetData<ValuationTrace[]>(`${BASE}/valuation-projects/${projectId}/traces`, params);
}

// ---------- 材质映射 ----------
export async function fetchResidualMaterials(): Promise<ResidualMaterial[]> {
  return apiGetData<ResidualMaterial[]>(`${BASE}/residual-materials`);
}

export async function putResidualMaterial(
  material: string,
  payload: { price_material: string | null; recovery_rate: number; unit_price_override: number | null },
): Promise<ResidualMaterial> {
  return (await apiPut<ResidualMaterial>(`${BASE}/residual-materials/${encodeURIComponent(material)}`, payload)).data;
}

export type { ApiEnvelope };
