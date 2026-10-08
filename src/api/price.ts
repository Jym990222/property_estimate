// src/api/price.ts
// 价格行情模块：/api/price/v1
// 说明：后端按规范返回名词复数资源（provinces/materials/latest-prices/price-points/province-averages），
//       本文件负责把响应适配为界面既有的数据结构，页面无需感知字段命名差异。
import { API_ORIGIN, apiGetData } from './http';

const BASE = `${API_ORIGIN}/api/price/v1`;
const PAGE_SIZE_ALL = 2000;

export interface MaterialDTO {
  material_id: number;
  material_name: string;
}

export interface ProvinceDTO {
  province_id: number;
  province_name: string;
}

export interface LatestPriceDTO {
  price_date: string;
  low_price: number | null;
  high_price: number | null;
}

export interface CityMaterialLatestDTO {
  material_name: string;
  price_date: string;
  low_price: number | null;
  high_price: number | null;
  price: number | null;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface PriceSeries {
  material: string;
  points: PricePoint[];
}

export interface PriceRangeResp {
  city: string;
  date_from: string | null;
  date_to: string | null;
  available_dates: string[];
  series: PriceSeries[];
}

export interface ProvinceAvgResp {
  province: string;
  series: PriceSeries[];
}

// ---------- 后端资源结构 ----------
interface LatestPriceResource {
  city_name: string;
  material_id: number;
  material_name: string;
  price_date: string;
  low_price: number | null;
  high_price: number | null;
  price: number | null;
}

interface SeriesResource {
  material_name: string;
  points: { price_date: string; price: number }[];
}

interface PricePointsData {
  city_name: string;
  date_from: string | null;
  date_to: string | null;
  available_dates: string[];
  series: SeriesResource[];
}

interface ProvinceAveragesData {
  province_name: string;
  series: SeriesResource[];
}

// ---------- 省份与材料 ----------
export async function fetchProvinces(): Promise<ProvinceDTO[]> {
  return apiGetData<ProvinceDTO[]>(`${BASE}/provinces`, { page_size: PAGE_SIZE_ALL });
}

export async function fetchMaterialsByCity(city: string): Promise<MaterialDTO[]> {
  return apiGetData<MaterialDTO[]>(`${BASE}/materials`, { cities: [city], page_size: PAGE_SIZE_ALL });
}

export async function fetchMaterialsByProvince(province: string): Promise<MaterialDTO[]> {
  return apiGetData<MaterialDTO[]>(`${BASE}/materials`, { province_name: province, page_size: PAGE_SIZE_ALL });
}

/** 两个城市都有价格数据的材料（分号分隔的多城市表示“同时存在”，即交集）。 */
export async function fetchCommonMaterials(city1: string, city2: string): Promise<MaterialDTO[]> {
  return apiGetData<MaterialDTO[]>(`${BASE}/materials`, { cities: [city1, city2], page_size: PAGE_SIZE_ALL });
}

// ---------- 最新价 ----------
export async function fetchLatestPrice(city: string, material: string): Promise<LatestPriceDTO | null> {
  const rows = await apiGetData<LatestPriceResource[]>(`${BASE}/latest-prices`, { city, materials: [material] });
  const row = rows[0];
  if (!row) return null;
  return { price_date: row.price_date, low_price: row.low_price, high_price: row.high_price };
}

export async function fetchPricesByCity(city: string): Promise<CityMaterialLatestDTO[]> {
  return apiGetData<CityMaterialLatestDTO[]>(`${BASE}/latest-prices`, { city, page_size: PAGE_SIZE_ALL });
}

// ---------- 价格序列 ----------
export async function fetchPriceRange(city: string, materials: string[]): Promise<PriceRangeResp> {
  const data = await apiGetData<PricePointsData>(`${BASE}/price-points`, {
    city,
    materials,
    page_size: 200,
  });
  return {
    city: data.city_name,
    date_from: data.date_from,
    date_to: data.date_to,
    available_dates: data.available_dates,
    series: data.series.map((item) => ({
      material: item.material_name,
      points: item.points.map((point) => ({ date: point.price_date, price: point.price })),
    })),
  };
}

export async function fetchProvinceAvg(
  province: string,
  materials?: string[],
  dateFrom?: string,
  dateTo?: string,
): Promise<ProvinceAvgResp> {
  const data = await apiGetData<ProvinceAveragesData>(`${BASE}/province-averages`, {
    province_name: province,
    materials: materials && materials.length > 0 ? materials : undefined,
    date_from: dateFrom,
    date_to: dateTo,
  });
  return {
    province: data.province_name,
    series: data.series.map((item) => ({
      material: item.material_name,
      points: item.points.map((point) => ({ date: point.price_date, price: point.price })),
    })),
  };
}
