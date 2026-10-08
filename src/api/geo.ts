// src/api/geo.ts
// 地理模块：/api/geo/v1
import { API_ORIGIN, apiGet, apiGetData, type ApiEnvelope } from './http';

const BASE = `${API_ORIGIN}/api/geo/v1`;

export interface CityDTO {
  city_id: number;
  city_name: string;
  province_name: string;
  lat: number;
  lng: number;
  is_municipality: number;
}

/** 城市列表（含经纬度），可用省份过滤；字典类资源一次取足（page_size 上限 2000）。 */
export async function fetchCities(province?: string): Promise<CityDTO[]> {
  return apiGetData<CityDTO[]>(`${BASE}/cities`, { province_name: province, page_size: 2000 });
}

/** 需要分页与 _links 翻页信息时使用。 */
export function fetchCitiesPage(province?: string, page = 1, pageSize = 500): Promise<ApiEnvelope<CityDTO[]>> {
  return apiGet<CityDTO[]>(`${BASE}/cities`, { province_name: province, page, page_size: pageSize });
}
