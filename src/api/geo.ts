// src/api/geo.ts
const BASE = '/api';

export interface CityDTO {
  city_id: number;
  city_name: string;
  province_name: string;
  lat: number;
  lng: number;
  is_municipality: number;
}

export interface ProvinceDTO {
  province_id: number;
  province_name: string;
}

export interface MaterialDTO {
  material_id: number;
  material_name: string;
}

export async function fetchProvinces(): Promise<ProvinceDTO[]> {
  const res = await fetch(`${BASE}/provinces`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCities(province?: string): Promise<CityDTO[]> {
  const url = province
    ? `${BASE}/cities?province=${encodeURIComponent(province)}`
    : `${BASE}/cities`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchMaterials(): Promise<MaterialDTO[]> {
  const res = await fetch(`${BASE}/materials`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}