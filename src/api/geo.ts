// src/api/geo.ts
const BASE = `${import.meta.env.VITE_API_BASE_URL}/api`

export interface CityDTO {
  city_id: number;
  city_name: string;
  province_name: string;
  lat: number;
  lng: number;
  is_municipality: number;
}

export async function fetchCities(province?: string): Promise<CityDTO[]> {
  const url = province
    ? `${BASE}/cities?province=${encodeURIComponent(province)}`
    : `${BASE}/cities`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
