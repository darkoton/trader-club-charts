/**
 * ═══════════════════════════════════════════════════════════════
 *  Copy Trading API — Providers, Subscriptions, Admin management
 * ═══════════════════════════════════════════════════════════════
 */

import { betterFetch, BETTER_URL, type AccountTradingStats } from './better';
import { authService } from '../services/auth';

/* ─── Types ─── */

export interface CopyTraderAccountInfo {
  po_user_id: number;
  currency: string;
  min_trade_amount: number;
  max_trade_amount: number;
  user_level: number;
  payout_max: number;
  payout_increase: number;
}

export interface CopyTraderStats {
  trades: number;
  wins: number;
  losses: number;
  profitable_trades_pct: number;
  turnover: number;
  total_profit: number;
  max_trade: number;
  min_trade: number;
  max_profit: number;
  currency?: string;
}

export type TradingTopPeriod = 'today' | 'month' | 'all';
export type TradingTopSortBy = 'total_profit' | 'profitable_trades_pct' | 'turnover' | 'wins';

export interface TradingTopLeader {
  rank: number;
  account_id: string;
  user_id: number | null;
  po_user_id: number | null;
  name: string;
  avatar_url: string | null;
  real_balance_usd: number;
  stats: CopyTraderStats;
}

export interface TradingTopResponse {
  period: TradingTopPeriod;
  sort_by: TradingTopSortBy;
  limit: number;
  updated_at: string | null;
  leaders: TradingTopLeader[];
  total: number;
  hidden_count?: number;
  negative_profit_count?: number;
  visible_count?: number;
}

export interface TradingTopVisibilityResult {
  ok: boolean;
  visible: boolean;
  updated: number;
}

export interface TradingTopFakeEntry {
  id: string;
  name: string;
  avatar_url: string | null;
  po_user_id: number;
  real_balance_usd: number;
  stats_today: AccountTradingStats;
  stats_month: AccountTradingStats;
  stats_all: AccountTradingStats;
  is_visible: boolean;
}

export interface TradingTopFakeStatsInput {
  trades?: number;
  wins?: number;
  losses?: number;
  turnover?: number;
  total_profit?: number;
  max_trade?: number;
  min_trade?: number;
  max_profit?: number;
}

export interface TradingTopFakePayload {
  name: string;
  avatar_url?: string | null;
  po_user_id?: number;
  real_balance_usd?: number;
  is_visible?: boolean;
  stats_today?: TradingTopFakeStatsInput;
  stats_month?: TradingTopFakeStatsInput;
  stats_all?: TradingTopFakeStatsInput;
}

export interface AdminTradingTopAccount {
  id: string;
  user_id: number;
  email: string;
  po_user_id: number;
  nickname: string | null;
  real_login: string | null;
  avatar_url: string | null;
  leaderboard_visible: boolean;
  leaderboard_name_override: string | null;
  leaderboard_avatar_url_override: string | null;
  real_balance: number;
  real_currency: string;
  is_active: boolean;
}

export interface AdminTradingTopAccountPatch {
  leaderboard_visible?: boolean;
  leaderboard_name_override?: string | null;
  leaderboard_avatar_url_override?: string | null;
}

export interface AdminTradingTopCorrections {
  leaderboard_visible: boolean;
  leaderboard_name_override: string | null;
  leaderboard_avatar_url_override: string | null;
  today?: StatsCorrection;
  month?: StatsCorrection;
  all?: StatsCorrection;
}

export interface CopyTrader {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  account_id: string;
  account_email?: string | null;
  is_active: boolean;
  created_at: string;
  subscriber_count: number;
  account_info?: CopyTraderAccountInfo | null;
  stats_today?: CopyTraderStats | null;
  stats_month?: CopyTraderStats | null;
  stats_all?: CopyTraderStats | null;
}

export interface CopySubscription {
  id: string;
  user_id: number;
  subscriber_account_id: string;
  provider_id: string;
  proportion: number;
  stop_balance: number;
  min_copy_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CopyTraderSubscriberAccount {
  id: string;
  email: string;
  user_id: number;
  is_active: boolean;
}

export interface TraderSubscription extends CopySubscription {
  subscriber_account?: CopyTraderSubscriberAccount | null;
}

export interface CopySubscriptionsMutationResult {
  ok: boolean;
  deactivated: number;
  provider_ids?: string[];
  subscriber_account_ids?: string[];
}

export interface CopyTraderWithSub extends CopyTrader {
  my_subscription: CopySubscription | null;
}

export interface CopySubscriptionWithTrader extends CopySubscription {
  trader: CopyTrader;
}

/* ─── Admin APIs ─── */

export interface AdminAccount {
  id: string;
  user_id: number;
  email: string;
  po_user_id: number;
  is_active: boolean;
  has_tokens: boolean;
}

export async function adminGetAccounts(search?: string, limit = 50, offset = 0): Promise<{ accounts: AdminAccount[]; total: number }> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (limit !== 50) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  return betterFetch(`/api/admin/accounts${qs ? '?' + qs : ''}`);
}

export async function adminGetTraders(): Promise<{ traders: CopyTrader[]; total: number }> {
  return betterFetch('/api/admin/copy-traders');
}

export async function adminCreateTrader(data: {
  name: string;
  account_id?: string;
  account_email?: string;
  description?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
}): Promise<{ trader: CopyTrader }> {
  return betterFetch('/api/admin/copy-traders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminUpdateTrader(id: string, data: {
  name?: string;
  account_id?: string;
  account_email?: string;
  description?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
}): Promise<{ trader: CopyTrader }> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function adminDeleteTrader(id: string): Promise<{ ok: boolean }> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function adminSetTraderActiveState(id: string, isActive: boolean): Promise<{ trader: CopyTrader; deactivated_subscriptions: number }> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(id)}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
}

/** Correction values: positive = add, negative = subtract. Only non-zero fields are applied. */
export interface StatsCorrection {
  // Additive ($inc) fields — delta ±
  trades?: number;
  wins?: number;
  losses?: number;
  turnover?: number;
  total_profit?: number;
  // Override ($set) fields — direct value
  max_trade?: number;
  min_trade?: number;
  max_profit?: number;
}

/**
 * Apply additive correction to a trader's stats.
 * @param traderId - copy trader ID
 * @param period - which stats period to correct: today | month | all
 * @param correction - delta values (+/-) for each field
 */
export async function adminCorrectStats(
  traderId: string,
  period: 'today' | 'month' | 'all',
  correction: StatsCorrection,
): Promise<{ ok: boolean; stats: CopyTraderStats }> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(traderId)}/stats/${period}`, {
    method: 'PATCH',
    body: JSON.stringify(correction),
  });
}

/** Stored correction values for a single period */
export interface StoredCorrection {
  date?: string;       // for 'today' scope
  year_month?: string; // for 'month' scope
  // Additive
  trades?: number;
  wins?: number;
  losses?: number;
  turnover?: number;
  total_profit?: number;
  // Override
  max_trade?: number;
  min_trade?: number;
  max_profit?: number;
}

/** Full corrections document for a trader */
export interface CorrectionsDoc {
  today?: StoredCorrection | null;
  month?: StoredCorrection | null;
  all?: StoredCorrection | null;
}

/**
 * Get current corrections for a trader.
 */
export async function adminGetCorrections(
  traderId: string,
): Promise<CorrectionsDoc> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(traderId)}/corrections`);
}

/**
 * Reset (delete) corrections for a specific period.
 */
export async function adminResetCorrections(
  traderId: string,
  period: 'today' | 'month' | 'all',
): Promise<{ ok: boolean }> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(traderId)}/corrections/${period}`, {
    method: 'DELETE',
  });
}

export async function adminUploadAvatar(id: string, file: File): Promise<{ avatar_url: string }> {
  const fd = new FormData();
  fd.append('avatar', file);

  const token = authService.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BETTER_URL}/api/admin/copy-traders/${encodeURIComponent(id)}/avatar`, {
    method: 'POST',
    headers,
    body: fd,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

/* ─── Client APIs ─── */

export async function getTraders(): Promise<{ traders: CopyTraderWithSub[]; total: number }> {
  return betterFetch('/api/copy-traders');
}

export async function getTrader(id: string): Promise<{ trader: CopyTraderWithSub }> {
  return betterFetch(`/api/copy-traders/${encodeURIComponent(id)}`);
}

export async function subscribe(providerId: string, data: {
  subscriber_account_id: string;
  proportion?: number;
  stop_balance?: number;
  min_copy_amount?: number;
}): Promise<{ subscription: CopySubscription }> {
  return betterFetch(`/api/copy-traders/${encodeURIComponent(providerId)}/subscribe`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSubscription(providerId: string, data: {
  proportion?: number;
  stop_balance?: number;
  min_copy_amount?: number;
  subscriber_account_id?: string;
}): Promise<{ subscription: CopySubscription }> {
  return betterFetch(`/api/copy-traders/${encodeURIComponent(providerId)}/subscription`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function unsubscribe(providerId: string): Promise<{ ok: boolean }> {
  return betterFetch(`/api/copy-traders/${encodeURIComponent(providerId)}/subscription`, {
    method: 'DELETE',
  });
}

export async function unsubscribeFromTrader(providerId: string, subscriberAccountId?: string): Promise<CopySubscriptionsMutationResult> {
  const params = new URLSearchParams();
  if (subscriberAccountId) params.set('subscriber_account_id', subscriberAccountId);
  const qs = params.toString();
  return betterFetch(`/api/copy-traders/${encodeURIComponent(providerId)}/subscription${qs ? `?${qs}` : ''}`, {
    method: 'DELETE',
  });
}

export async function unsubscribeAll(params?: {
  providerId?: string;
  subscriberAccountId?: string;
}): Promise<CopySubscriptionsMutationResult> {
  const query = new URLSearchParams();
  if (params?.providerId) query.set('provider_id', params.providerId);
  if (params?.subscriberAccountId) query.set('subscriber_account_id', params.subscriberAccountId);
  const qs = query.toString();
  return betterFetch(`/api/copy-traders/subscriptions${qs ? `?${qs}` : ''}`, {
    method: 'DELETE',
  });
}

export async function adminGetTraderSubscriptions(traderId: string): Promise<{ subscriptions: TraderSubscription[]; total: number }> {
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(traderId)}/subscriptions`);
}

export async function adminDeactivateTraderSubscriptions(
  traderId: string,
  params?: {
    subscriptionId?: string;
    subscriberAccountId?: string;
    userId?: number;
  },
): Promise<CopySubscriptionsMutationResult> {
  const query = new URLSearchParams();
  if (params?.subscriptionId) query.set('subscription_id', params.subscriptionId);
  if (params?.subscriberAccountId) query.set('subscriber_account_id', params.subscriberAccountId);
  if (params?.userId != null) query.set('user_id', String(params.userId));
  const qs = query.toString();
  return betterFetch(`/api/admin/copy-traders/${encodeURIComponent(traderId)}/subscriptions${qs ? `?${qs}` : ''}`, {
    method: 'DELETE',
  });
}

export async function getMySubscriptions(): Promise<{ subscriptions: CopySubscriptionWithTrader[]; total: number }> {
  return betterFetch('/api/copy-traders/subscriptions');
}

export async function getTradingTop100(params?: {
  period?: TradingTopPeriod;
  sortBy?: TradingTopSortBy;
  limit?: number;
}): Promise<TradingTopResponse> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.sortBy) query.set('sort_by', params.sortBy);
  if (params?.limit != null) query.set('limit', String(Math.min(100, Math.max(1, params.limit))));
  const qs = query.toString();
  return betterFetch(`/api/trading/top-100${qs ? `?${qs}` : ''}`);
}

export async function setTradingTopVisibility(data: {
  visible: boolean;
  account_id?: string;
}): Promise<TradingTopVisibilityResult> {
  return betterFetch('/api/trading/top-100/visibility', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function adminGetTradingTopFakes(): Promise<{ fakes: TradingTopFakeEntry[]; total: number }> {
  const data = await betterFetch<{ fakes: TradingTopFakeEntry[]; total: number }>('/api/admin/trading-top/fakes');
  return {
    ...data,
    fakes: data.fakes.map((fake) => ({
      ...fake,
      stats_today: normalizeTradingStats(fake.stats_today),
      stats_month: normalizeTradingStats(fake.stats_month),
      stats_all: normalizeTradingStats(fake.stats_all),
    })),
  };
}

export async function adminCreateTradingTopFake(data: TradingTopFakePayload): Promise<{ id: string; ok: boolean }> {
  return betterFetch('/api/admin/trading-top/fakes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminUpdateTradingTopFake(id: string, data: Partial<TradingTopFakePayload>): Promise<{ ok: boolean }> {
  return betterFetch(`/api/admin/trading-top/fakes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function adminDeleteTradingTopFake(id: string): Promise<{ ok: boolean }> {
  return betterFetch(`/api/admin/trading-top/fakes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function adminGetTradingTopAccounts(search?: string): Promise<{ accounts: AdminTradingTopAccount[]; total: number }> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  const qs = params.toString();
  return betterFetch(`/api/admin/trading-top/accounts${qs ? `?${qs}` : ''}`);
}

export async function adminUpdateTradingTopAccount(id: string, data: AdminTradingTopAccountPatch): Promise<{ account: AdminTradingTopAccountPatch & { id: string } }> {
  return betterFetch(`/api/admin/trading-top/accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function adminGetTradingTopCorrections(accountId: string): Promise<AdminTradingTopCorrections> {
  return betterFetch(`/api/admin/trading-top/accounts/${encodeURIComponent(accountId)}/corrections`);
}

export async function adminPatchTradingTopStats(
  accountId: string,
  period: 'today' | 'month' | 'all',
  correction: StatsCorrection,
): Promise<{ ok: boolean; stats: AccountTradingStats }> {
  const data = await betterFetch<{ ok: boolean; stats: AccountTradingStats }>(`/api/admin/trading-top/accounts/${encodeURIComponent(accountId)}/stats/${period}`, {
    method: 'PATCH',
    body: JSON.stringify(correction),
  });
  return { ...data, stats: normalizeTradingStats(data.stats) };
}

export async function adminResetTradingTopCorrections(
  accountId: string,
  period: 'today' | 'month' | 'all',
): Promise<{ ok: boolean }> {
  return betterFetch(`/api/admin/trading-top/accounts/${encodeURIComponent(accountId)}/corrections/${period}`, {
    method: 'DELETE',
  });
}

function normalizeTradingStats(raw: unknown): AccountTradingStats {
  const stats = raw as Partial<AccountTradingStats> | null | undefined;
  return {
    trades: Number(stats?.trades ?? 0),
    wins: Number(stats?.wins ?? 0),
    losses: Number(stats?.losses ?? 0),
    profitable_trades_pct: Number(stats?.profitable_trades_pct ?? 0),
    turnover: Number(stats?.turnover ?? 0),
    total_profit: Number(stats?.total_profit ?? 0),
    max_trade: Number(stats?.max_trade ?? 0),
    min_trade: Number(stats?.min_trade ?? 0),
    max_profit: Number(stats?.max_profit ?? 0),
    currency: typeof stats?.currency === 'string' && stats.currency ? stats.currency : 'USD',
  };
}

/** Build full avatar URL. */
export function getAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http')) return avatarPath;
  return `${BETTER_URL}${avatarPath}`;
}
