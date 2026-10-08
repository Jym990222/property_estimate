// src/api/futures.ts
// 期货行情模块：/api/futures/v1
import { API_ORIGIN, apiGetData } from './http';

const BASE = `${API_ORIGIN}/api/futures/v1`;

export interface FuturesLatestDTO {
  product_code: string;
  product_name: string;
  contract: string;
  trade_date: string;
  settlement: number;
}

/** 各期货品种最新一天的行情（等价于旧接口 /api/futures/latest）。 */
export async function fetchFuturesLatest(): Promise<FuturesLatestDTO[]> {
  return apiGetData<FuturesLatestDTO[]>(`${BASE}/latest-quotes`, { page_size: 200 });
}

export interface FuturesProductDTO {
  product_code: string;
  product_name: string;
}

/** 期货品种字典。 */
export async function fetchFuturesProducts(): Promise<FuturesProductDTO[]> {
  return apiGetData<FuturesProductDTO[]>(`${BASE}/products`, { page_size: 200 });
}
