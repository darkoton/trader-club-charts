/**
 * ═══════════════════════════════════════════════════════════════
 *  Currencies & Quotes API
 * ═══════════════════════════════════════════════════════════════
 *
 * All endpoints use authenticated fetch (`apiFetch`) which
 * attaches `Authorization: Bearer <token>` automatically.
 *
 * ## Currency Endpoints
 * | Method | Path                           | Description                   |
 * |--------|--------------------------------|-------------------------------|
 * | GET    | `/currencies`                  | List all currencies.          |
 * | GET    | `/currencies?category&is_active`| Filtered list.               |
 * | GET    | `/currencies/categories`       | Distinct category names.      |
 * | GET    | `/currencies/:name`            | Single currency info.         |
 *
 * ## Quote Endpoints
 * | Method | Path                           | Description                   |
 * |--------|--------------------------------|-------------------------------|
 * | GET    | `/quotes/initialize/:name`     | Historical candles all TFs.   |
 * | GET    | `/quotes/history/:name?tf&lim` | Historical candles one TF.    |
 * | GET    | `/quotes/current/:name`        | Current open candle per TF.   |
 * | GET    | `/quotes/latest/:name`         | Latest price tick.            |
 * | GET    | `/quotes/timeframes`           | Available TF definitions.     |
 */

import { apiFetch } from '../services/apiFetch';

export interface Currency {
  currency: string;
  profit: number;
  category: string;
  is_active: boolean;
  /** PocketOption API asset name, e.g. "EURUSD_otc". null = not mapped. */
  api_name?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Currency-specific icon (emoji or "/icons/..." URL), or null. */
  icon?: string | null;
  /** Category-level icon (fallback), or null. */
  category_icon?: string | null;
}

export interface CategoryInfo {
  name: string;
  icon: string | null;
}

export interface Candle {
  currency: string;
  timeframe: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  is_closed: boolean;
}

export interface ChartInitData {
  currency: string;
  currency_info: Currency;
  timeframes: { [key: string]: Candle[] };
}

/** Fetch list of all available currencies (optionally filtered). */
export async function getCurrencies(
  category?: string,
  isActive?: boolean,
): Promise<Currency[]> {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (isActive !== undefined) params.append('is_active', isActive.toString());
  const qs = params.toString();
  return apiFetch<Currency[]>(qs ? `/currencies?${qs}` : '/currencies');
}

/** Fetch categories (array of objects with name & icon). */
export async function getCategories(): Promise<CategoryInfo[]> {
  return apiFetch<CategoryInfo[]>('/currencies/categories');
}

/** Fetch a single currency by name. */
export async function getCurrency(name: string): Promise<Currency> {
  return apiFetch<Currency>(`/currencies/${encodeURIComponent(name)}`);
}

/** Initialize chart: historical candles for every timeframe. */
export async function initializeChartData(name: string): Promise<ChartInitData> {
  return apiFetch<ChartInitData>(`/quotes/initialize/${encodeURIComponent(name)}`);
}

/** Fetch historical candles for one timeframe. */
export async function getHistoricalData(
  name: string,
  timeframe: string,
  limit = 100,
  options?: { before?: number; signal?: AbortSignal },
): Promise<Candle[]> {
  const params = new URLSearchParams({ timeframe, limit: limit.toString() });
  if (options?.before) params.append('before', options.before.toString());
  const qs = params.toString();
  return apiFetch<Candle[]>(
    `/quotes/history/${encodeURIComponent(name)}?${qs}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

/** Fetch current (open) candle for each timeframe. */
export async function getCurrentCandles(name: string): Promise<Record<string, Candle>> {
  return apiFetch<Record<string, Candle>>(`/quotes/current/${encodeURIComponent(name)}`);
}

/** Fetch latest price tick. */
export async function getLatestPrice(name: string): Promise<{ currency: string; price: number; timestamp: string }> {
  return apiFetch<{ currency: string; price: number; timestamp: string }>(`/quotes/latest/${encodeURIComponent(name)}`);
}

/** Available timeframes from server. */
export async function getAvailableTimeframes(): Promise<Array<{ value: string; label: string; seconds: number }>> {
  return apiFetch<Array<{ value: string; label: string; seconds: number }>>('/quotes/timeframes');
}
