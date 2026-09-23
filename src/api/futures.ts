const BASE = `${import.meta.env.VITE_API_BASE_URL}/api`

export interface FuturesLatestDTO {
  product_code: string;
  product_name: string;
  contract: string;
  trade_date: string;
  settlement: number;
}

export async function fetchFuturesLatest(): Promise<FuturesLatestDTO[]> {
  const res = await fetch(`${BASE}/futures/latest`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
