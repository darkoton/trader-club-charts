/**
 * ═══════════════════════════════════════════════════════════════
 *  Batch API — Consolidated endpoints to reduce page-load requests
 * ═══════════════════════════════════════════════════════════════
 *
 * Three batch endpoints combine multiple individual API calls:
 *
 * | Endpoint              | Host        | Replaces                                      |
 * |-----------------------|-------------|-----------------------------------------------|
 * | POST /api/batch/init  | Main (9102) | getCurrencies + getCategories + GET /user/settings |
 * | POST /api/batch/charts| Main (9102) | N × getHistoricalData + N × getCurrentCandles |
 * | POST /api/batch/trading| Better(9110)| getAccounts + getBalance + getAccountHistory  |
 */

import { apiFetch } from '../services/apiFetch';
import type { Currency, CategoryInfo, Candle } from './currencies';
import { normalizeAccount, type BetterAccount, type AccountBalances, type BetRecord } from './better';
import type { UserSettings } from '../services/storage';
import { authService } from '../services/auth';

const BETTER_URL = import.meta.env.VITE_BETTER_URL || 'https://better.po-terminal.com';

/* ─── Response types ─── */

export interface BatchInitResponse {
  currencies: Currency[];
  categories: CategoryInfo[];
  settings: UserSettings | null;
}

export interface BatchChartData {
  history: Candle[];
  current: Record<string, Candle>;
}

export interface BatchChartsResponse {
  charts: Record<string, BatchChartData>;
}

export interface BatchTradingResponse {
  accounts: BetterAccount[];
  balances: Record<string, AccountBalances>;
  history: Record<string, { bets: BetRecord[]; total: number }>;
}

/* ─── API functions ─── */

/**
 * Batch init — fetches currencies, categories, and user settings in one request.
 * Replaces: getCurrencies() + getCategories() + storageService.load() (API part)
 */
export async function batchInit(): Promise<BatchInitResponse> {
  return apiFetch<BatchInitResponse>('/batch/init', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Batch charts — fetches history + current candle for multiple charts at once.
 * Replaces: N × getHistoricalData() + N × getCurrentCandles() in TVDatafeed.getBars()
 *
 * @param charts Array of { currency, timeframe, limit } objects
 */
export async function batchCharts(
  charts: Array<{ currency: string; timeframe: string; limit?: number }>,
): Promise<BatchChartsResponse> {
  return apiFetch<BatchChartsResponse>('/batch/charts', {
    method: 'POST',
    body: JSON.stringify({ charts }),
  });
}

/**
 * Batch trading — fetches accounts, balances, and bet history in one request.
 * Replaces: getAccounts() + getBalance() + getAccountHistory()
 *
 * @param accountId If set, fetches balance + history only for this account
 * @param isDemo Filter history by demo/real mode
 */
export async function batchTrading(
  accountId?: string,
  isDemo?: boolean,
): Promise<BatchTradingResponse> {
  const token = authService.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const body: Record<string, unknown> = {};
  if (accountId) body.account_id = accountId;
  if (isDemo !== undefined) body.is_demo = isDemo;

  const res = await fetch(`${BETTER_URL}/api/batch/trading`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let message = text;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
      else if (json.message) message = json.message;
    } catch { /* not JSON */ }
    throw new Error(message);
  }

  const data = await res.json() as BatchTradingResponse;
  return {
    ...data,
    accounts: Array.isArray(data.accounts) ? data.accounts.map(normalizeAccount) : [],
  };
}
