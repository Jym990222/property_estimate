const BASE = `${import.meta.env.VITE_API_BASE_URL}/api`

export interface FuturesLatestDTO {
  product_code: string;
  product_name: string;
  contract: string;
  trade_date: string;
  settlement: number;
}

export interface FuturesDetailDTO {
  product_code: string;
  product_name: string;
  contract: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number | null;
  settlement: number;
  volume: number | null;
  open_interest: number | null;
}

export interface FuturesByDateResp {
  date: string | null;
  rows: FuturesDetailDTO[];
  available_dates: string[];
}

export async function fetchFuturesLatest(): Promise<FuturesLatestDTO[]> {
  const res = await fetch(`${BASE}/futures/latest`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchFuturesByDate(date?: string): Promise<FuturesByDateResp> {
  const url = date
    ? `${BASE}/futures/by-date?date=${encodeURIComponent(date)}`
    : `${BASE}/futures/by-date`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}