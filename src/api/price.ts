// src/api/price.ts

const BASE = `${import.meta.env.VITE_API_BASE_URL}/api`;

export interface MaterialDTO {
  material_id: number;
  material_name: string;
}

export interface LatestPriceDTO {
  price_date: string;
  low_price: number | null;
  high_price: number | null;
}

export async function fetchCommonMaterials(
  city1: string,
  city2: string,
): Promise<MaterialDTO[]> {
  const url = `${BASE}/common-materials?city1=${encodeURIComponent(city1)}&city2=${encodeURIComponent(city2)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchLatestPrice(
  city: string,
  material: string,
): Promise<LatestPriceDTO | null> {
  const url = `${BASE}/prices/latest?city=${encodeURIComponent(city)}&material=${encodeURIComponent(material)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

export async function fetchUsedMaterials(): Promise<MaterialDTO[]> {
  const res = await fetch(`${BASE}/materials/used`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchPriceRange(
  city: string,
  materials: string[],
): Promise<PriceRangeResp> {
  const url = `${BASE}/prices/range?city=${encodeURIComponent(city)}&materials=${encodeURIComponent(materials.join(','))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function fetchMaterialsByCity(city: string): Promise<MaterialDTO[]> {
  const res = await fetch(`${BASE}/materials/by-city?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface ProvinceAvgResp {
  province: string;
  series: PriceSeries[];
}

export async function fetchProvinceAvg(
  province: string,
  materials: string[],
  dateFrom?: string,
  dateTo?: string,
): Promise<ProvinceAvgResp> {
  const params = new URLSearchParams({
    province,
    materials: materials.join(','),
  });
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  const res = await fetch(`${BASE}/prices/province-avg?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface CityMaterialLatestDTO {
  material_name: string;
  price_date: string;
  low_price: number | null;
  high_price: number | null;
  price: number | null;
}

export async function fetchPricesByCity(
  city: string,
): Promise<CityMaterialLatestDTO[]> {
  const res = await fetch(`${BASE}/prices/by-city?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}