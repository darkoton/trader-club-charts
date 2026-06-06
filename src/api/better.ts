/**
 * Better Service API — PocketOption Trading
 * 
 * REST client for managing PO accounts, placing bets,
 * getting balances and trade history.
 * 
 * Base URL: VITE_BETTER_URL (port 9110)
 * Auth: Bearer JWT (same as main TraderClub API)
 */

import { authService } from '../services/auth';

export const BETTER_URL = import.meta.env.VITE_BETTER_URL || 'https://better.po-terminal.com';
export const BETTER_AUTH_STATUS_EVENT = 'better-auth-status';
export const BETTER_AUTH_RECOVERED_EVENT = 'better-auth-recovered';

interface BetterFetchInit extends RequestInit {
  retry?: number;
  retryDelayMs?: number;
  allowStructuredAuthStatus?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/* ─── Types ─── */

export interface BetterAccount {
  id: string;
  user_id: number;
  email: string;
  po_user_id: number;
  is_active: boolean;
  has_tokens: boolean;
  real_login: string | null;
  restrictions: Record<string, unknown>;
  last_auth_at: string | null;
  ws_connected_at: string | null;
  created_at: string;
  updated_at: string;
  stats_today?: AccountTradingStats | null;
  stats_month?: AccountTradingStats | null;
  stats_all?: AccountTradingStats | null;
  stats_updated_at?: string | null;
  leaderboard_visible?: boolean;
}

export interface AccountTradingStats {
  trades: number;
  wins: number;
  losses: number;
  profitable_trades_pct: number;
  turnover: number;
  total_profit: number;
  max_trade: number;
  min_trade: number;
  max_profit: number;
  currency: string;
}

export interface AccountStatsResponse {
  account_id: string;
  stats_today?: AccountTradingStats | null;
  stats_month?: AccountTradingStats | null;
  stats_all?: AccountTradingStats | null;
  stats_updated_at?: string | null;
  leaderboard_visible?: boolean;
}

export interface AddAccountResult {
  account: BetterAccount;
  requires_2fa?: boolean;
  two_factor_state?: TwoFactorState;
  two_factor_enabled?: boolean;
  message?: string;
}

export type BetterAuthStatus = 'requires_2fa' | 'logout_required' | 'auth_blocked';
export type TwoFactorState = 'disabled' | 'enabled' | 'required';

export interface BetterAuthStatusDetails {
  reason?: string | null;
  show_popup?: boolean | null;
  primary_button?: string | null;
  [key: string]: unknown;
}

export interface BetterRetryableBetRequest extends PlaceBetParams {
  requested_at?: string;
}

export interface BetterAuthStatusPayload {
  auth_status?: BetterAuthStatus;
  error?: string;
  message?: string;
  error_code?: string;
  requires_2fa?: boolean;
  two_factor_state?: TwoFactorState | null;
  two_factor_enabled?: boolean | null;
  logout_required?: boolean;
  action?: string;
  challenge_id?: string | null;
  confirm_2fa_endpoint?: string | null;
  account_id?: string | null;
  terminal_user_id?: string | null;
  auth_event_id?: string | null;
  error_source?: string | null;
  error_stage?: string | null;
  endpoint?: string | null;
  upstream_status?: number | null;
  upstream_response?: unknown;
  failing_jwt?: string | null;
  failing_jwt_kind?: string | null;
  email?: string | null;
  po_user_id?: number | null;
  details?: BetterAuthStatusDetails | null;
  request?: BetterRetryableBetRequest;
  timestamp?: string;
}

export type BetterAuthUiState =
  | {
    kind: 'requires_2fa';
    message: string;
    challengeId: string;
    confirmEndpoint: string;
    primaryButton: string;
    showPopup: boolean;
    reason?: string;
  }
  | {
    kind: 'logout_required';
    message: string;
    primaryButton: string;
    showPopup: boolean;
    reason?: string;
  }
  | {
    kind: 'auth_blocked';
    message: string;
    primaryButton: string;
    showPopup: boolean;
    reason?: string;
  }
  | { kind: 'none' };

export class BetterApiError extends Error {
  status?: number;
  payload?: unknown;
  authStatus?: BetterAuthStatusPayload;

  constructor(message: string, options?: { status?: number; payload?: unknown; authStatus?: BetterAuthStatusPayload }) {
    super(message);
    this.name = 'BetterApiError';
    this.status = options?.status;
    this.payload = options?.payload;
    this.authStatus = options?.authStatus;
  }
}

function hasChallengeId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeTwoFactorState(
  state: unknown,
  enabled: unknown,
  requiresTwoFactor = false,
): TwoFactorState | undefined {
  const normalizedState = normalizeOptionalString(state)?.toLowerCase();
  if (requiresTwoFactor || normalizedState === 'required') return 'required';
  if (normalizedState === 'enabled') return 'enabled';
  if (normalizedState === 'disabled') return 'disabled';
  if (enabled === true) return 'enabled';
  if (enabled === false) return 'disabled';
  return undefined;
}

function normalizePrimaryButton(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized || undefined;
}

function normalizeAuthStatusDetails(value: unknown): BetterAuthStatusDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
    reason: normalizeOptionalString(candidate.reason) ?? null,
    show_popup: typeof candidate.show_popup === 'boolean' ? candidate.show_popup : null,
    primary_button: normalizePrimaryButton(candidate.primary_button) ?? null,
  };
}

function isStructuredAuthErrorCode(value: unknown): boolean {
  const errorCode = normalizeOptionalString(value)?.toLowerCase();
  return errorCode === 'requires_2fa'
    || errorCode === 'logout_required'
    || errorCode === 'auth_blocked';
}

function hasReloginInstruction(value: unknown): boolean {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (!normalized) return false;

  return normalized.includes('выполните вход заново')
    || normalized.includes('выполните вход снова')
    || normalized.includes('войдите заново')
    || normalized.includes('log in again')
    || normalized.includes('login again')
    || normalized.includes('sign in again')
    || normalized.includes('re-login')
    || normalized.includes('relogin');
}

export function isBetterAuthStatusPayload(value: unknown): value is BetterAuthStatusPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const hasLegacyReloginMessage = hasReloginInstruction(candidate.message) || hasReloginInstruction(candidate.error);
  return candidate.auth_status === 'requires_2fa'
    || candidate.auth_status === 'logout_required'
    || candidate.auth_status === 'auth_blocked'
    || candidate.requires_2fa === true
    || normalizeTwoFactorState(candidate.two_factor_state, candidate.two_factor_enabled) != null
    || candidate.logout_required === true
    || isStructuredAuthErrorCode(candidate.error_code)
    || hasChallengeId(candidate.challenge_id)
    || normalizeAuthStatusDetails(candidate.details)?.show_popup === true
    || hasLegacyReloginMessage;
}

export function normalizeBetterAuthStatusPayload(value: BetterAuthStatusPayload): BetterAuthStatusPayload {
  const normalizedErrorCode = normalizeOptionalString(value.error_code)?.toLowerCase();
  const normalizedAction = normalizeOptionalString(value.action)?.toLowerCase();
  const details = normalizeAuthStatusDetails(value.details);
  const hasLegacyReloginMessage = hasReloginInstruction(value.message) || hasReloginInstruction(value.error);
  const requiresTwoFactor = value.requires_2fa === true
    || value.auth_status === 'requires_2fa'
    || normalizedErrorCode === 'requires_2fa'
    || hasChallengeId(value.challenge_id);
  const twoFactorState = normalizeTwoFactorState(
    value.two_factor_state,
    value.two_factor_enabled,
    requiresTwoFactor,
  );
  const logoutRequired = value.logout_required === true
    || value.auth_status === 'logout_required'
    || normalizedErrorCode === 'logout_required'
    || hasLegacyReloginMessage;
  const authStatus: BetterAuthStatus = requiresTwoFactor
    ? 'requires_2fa'
    : logoutRequired
      ? 'logout_required'
      : 'auth_blocked';
  const fallbackMessage = authStatus === 'requires_2fa'
    ? 'Требуется подтверждение 2FA.'
    : authStatus === 'logout_required'
      ? 'Сессия недействительна. Выполните вход заново.'
      : 'Доступ временно ограничен.';
  return {
    ...value,
    auth_status: authStatus,
    error_code: normalizedErrorCode,
    requires_2fa: requiresTwoFactor,
    two_factor_state: twoFactorState ?? null,
    two_factor_enabled: twoFactorState ? twoFactorState !== 'disabled' : null,
    logout_required: logoutRequired || authStatus === 'logout_required',
    action: normalizedAction,
    challenge_id: hasChallengeId(value.challenge_id) ? value.challenge_id.trim() : null,
    confirm_2fa_endpoint: normalizeOptionalString(value.confirm_2fa_endpoint) ?? (requiresTwoFactor ? '/api/terminal/v2/confirm-2fa' : null),
    details,
    endpoint: normalizeOptionalString(value.endpoint) ?? null,
    po_user_id: typeof value.po_user_id === 'number' && Number.isFinite(value.po_user_id) ? value.po_user_id : null,
    failing_jwt: normalizeOptionalString(value.failing_jwt) ?? null,
    failing_jwt_kind: normalizeOptionalString(value.failing_jwt_kind) ?? null,
    message: normalizeOptionalString(value.message) ?? normalizeOptionalString(value.error) ?? fallbackMessage,
    error: normalizeOptionalString(value.error) ?? normalizeOptionalString(value.message) ?? fallbackMessage,
    request: value.request,
  };
}

export function mapBetterAuthUiState(payload: unknown): BetterAuthUiState {
  if (!isBetterAuthStatusPayload(payload)) return { kind: 'none' };

  const normalized = normalizeBetterAuthStatusPayload(payload);
  const showPopup = normalized.details?.show_popup ?? true;
  const reason = normalized.details?.reason ?? undefined;
  const primaryButton = normalized.details?.primary_button ?? normalized.action ?? undefined;

  if (normalized.requires_2fa) {
    return {
      kind: 'requires_2fa',
      message: normalized.message ?? 'Требуется подтверждение 2FA.',
      challengeId: normalized.challenge_id ?? '',
      confirmEndpoint: normalized.confirm_2fa_endpoint ?? '/api/terminal/v2/confirm-2fa',
      primaryButton: primaryButton ?? 'confirm',
      showPopup,
      reason,
    };
  }

  if (normalized.logout_required) {
    return {
      kind: 'logout_required',
      message: normalized.message ?? 'Сессия недействительна. Выполните вход заново.',
      primaryButton: primaryButton ?? 'logout',
      showPopup,
      reason,
    };
  }

  if (normalized.auth_status === 'auth_blocked') {
    return {
      kind: 'auth_blocked',
      message: normalized.message ?? 'Доступ временно ограничен.',
      primaryButton: primaryButton ?? 'ok',
      showPopup,
      reason,
    };
  }

  return { kind: 'none' };
}

function emitBetterAuthStatus(payload: BetterAuthStatusPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BETTER_AUTH_STATUS_EVENT, { detail: payload }));
}

export function emitBetterAuthRecovered(payload: BetterAuthStatusPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BETTER_AUTH_RECOVERED_EVENT, { detail: payload }));
}

export function isBetterApiError(error: unknown): error is BetterApiError {
  return error instanceof BetterApiError;
}

export function isBetterAuthStatusError(error: unknown): error is BetterApiError & { authStatus: BetterAuthStatusPayload } {
  return error instanceof BetterApiError && !!error.authStatus;
}

export interface Confirm2faResult {
  account_id: string;
  email: string;
  has_tokens: boolean;
  po_user_id: number;
  message: string;
}

export interface AccountInfo {
  user_level: number;
  payout_increase: number;
  payout_max: number;
  min_trade_amount: number;
  max_trade_amount: number;
}

export interface AccountBalances {
  account_id: string;
  email: string;
  balances: {
    demo: number;
    real: number;
  };
  currencies?: {
    demo: string;
    real: string;
  };
  account_info?: AccountInfo;
}

export interface BetRecord {
  id: string;
  account_id: string;
  user_id: number;
  asset: string;
  asset_po?: string;
  amount: number;
  direction: 'call' | 'put';
  duration: number;
  is_demo: boolean;
  trade_id: string;
  result: 'win' | 'loss' | 'draw' | 'error' | null;
  profit: number | null;
  balance_after: number | null;
  placed_at: string;
  resolved_at: string | null;
  source?: string;
  currency?: string;
  is_copy_trade?: boolean;
  payout?: number;
  open_price?: number | null;
  price_open?: number | null;
  close_price?: number | null;
  price_close?: number | null;
  open_timestamp?: number | null;
  close_timestamp?: number | null;
}

export interface PlaceBetParams {
  account_id: string;
  asset: string;
  amount: number;
  direction: 'call' | 'put';
  duration: number;
  is_demo: boolean;
}

export interface BetPlacedEvent {
  bet_id: string;
  trade_id: string;
  asset: string;
  amount: number;
  direction: 'call' | 'put';
  duration: number;
  is_demo: boolean;
  balance?: number;
  account_id?: string;
  currency?: string;
  is_copy_trade?: boolean;
  po_data?: {
    id: string;
    openTimestamp: number;
    closeTimestamp?: number;
    profit: number;
    payout: number;
    [key: string]: unknown;
  };
}

export interface BetResultEvent {
  bet_id: string;
  trade_id: string;
  asset: string;
  amount: number;
  direction: 'call' | 'put';
  is_demo: boolean;
  result: 'win' | 'loss' | 'draw' | 'error';
  profit: number;
  balance_after: number;
  resolved_at: string;
  account_id?: string;
}

export interface PoOrderOpenedEvent {
  account_id: string;
  is_demo: boolean;
  po_data: {
    id: string;          // trade_id
    asset: string;
    amount: number;
    command: number;     // 0 = call, 1 = put
    openPrice: number;
    openTimestamp: number;  // unix seconds
    closeTimestamp: number; // unix seconds
    currency?: string;
    profit?: number;
    payout?: number;
    [key: string]: unknown;
  };
  timestamp: string;
}

export interface PoOrderClosedEvent {
  account_id: string;
  is_demo: boolean;
  trade_id: string;
  result: 'win' | 'loss' | 'draw';
  profit: number;
  po_data: Record<string, unknown>;
  timestamp: string;
}

export interface BetErrorEvent {
  error: string;
  bet_id?: string;
  original_error?: string;
  request?: PlaceBetParams & { requested_at: string };
  auth_status?: BetterAuthStatus;
  requires_2fa?: boolean;
  two_factor_state?: TwoFactorState | null;
  two_factor_enabled?: boolean | null;
  error_code?: string;
  logout_required?: boolean;
  action?: string;
  challenge_id?: string | null;
  confirm_2fa_endpoint?: string | null;
  account_id?: string;
  terminal_user_id?: string | null;
  auth_event_id?: string | null;
  error_source?: string | null;
  error_stage?: string | null;
  endpoint?: string | null;
  upstream_status?: number | null;
  upstream_response?: unknown;
  email?: string | null;
  po_user_id?: number | null;
  details?: BetterAuthStatusDetails | null;
  timestamp?: string;
}

export interface PoConnectionEvent {
  account_id: string;
  error?: string;
  auth_status?: BetterAuthStatus;
  requires_2fa?: boolean;
  two_factor_state?: TwoFactorState | null;
  two_factor_enabled?: boolean | null;
  error_code?: string;
  logout_required?: boolean;
  action?: string;
  challenge_id?: string | null;
  confirm_2fa_endpoint?: string | null;
  terminal_user_id?: string | null;
  auth_event_id?: string | null;
  error_source?: string | null;
  error_stage?: string | null;
  endpoint?: string | null;
  upstream_status?: number | null;
  upstream_response?: unknown;
  email?: string | null;
  po_user_id?: number | null;
  details?: BetterAuthStatusDetails | null;
  timestamp?: string;
}

function extractBetterErrorMessage(statusText: string, payload: unknown, rawText: string): string {
  if (payload && typeof payload === 'object') {
    const maybeError = 'error' in payload ? payload.error : undefined;
    if (typeof maybeError === 'string' && maybeError.trim()) return maybeError;
    const maybeMessage = 'message' in payload ? payload.message : undefined;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
  }

  if (rawText.trim()) return rawText.trim();
  return statusText || 'Request failed';
}

async function parseBetterResponse(response: Response): Promise<{ rawText: string; payload: unknown }> {
  const rawText = await response.text().catch(() => '');
  if (!rawText.trim()) {
    return { rawText, payload: undefined };
  }

  try {
    return { rawText, payload: JSON.parse(rawText) };
  } catch {
    return { rawText, payload: rawText };
  }
}

/* ─── REST helpers ─── */

export async function betterFetch<T = unknown>(path: string, init?: BetterFetchInit): Promise<T> {
  const { retry, retryDelayMs = 450, allowStructuredAuthStatus = false, ...requestInit } = init ?? {};
  const token = authService.getToken();
  const headers: Record<string, string> = {
    ...(requestInit.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (requestInit.body && typeof requestInit.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${BETTER_URL}${path}`;
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const retryCount = Math.max(0, retry ?? ((method === 'GET' || method === 'HEAD') ? 1 : 0));
  let res: Response | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      res = await fetch(url, { ...requestInit, headers });
      break;
    } catch (error) {
      const details = {
        url,
        method,
        attempt: attempt + 1,
        retryCount: retryCount + 1,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        message: error instanceof Error ? error.message : String(error),
      };
      const isLastAttempt = attempt >= retryCount || requestInit.signal?.aborted;
      if (isLastAttempt) {
        console.error('[BetterAPI] Network error while requesting Better service', details);
        throw new Error('Network request failed');
      }
      console.warn('[BetterAPI] Transient network error, retrying Better request', details);
      await delay(retryDelayMs * (attempt + 1));
    }
  }

  if (!res) {
    throw new Error('Network request failed');
  }

  if (!res.ok) {
    const { rawText, payload } = await parseBetterResponse(res);
    const authStatus = isBetterAuthStatusPayload(payload)
      ? normalizeBetterAuthStatusPayload(payload)
      : undefined;
    const message = extractBetterErrorMessage(res.statusText, payload, rawText);
    if (authStatus) emitBetterAuthStatus(authStatus);
    throw new BetterApiError(message, {
      status: res.status,
      payload,
      authStatus,
    });
  }
  if (res.status === 204) return undefined as T;

  const { payload } = await parseBetterResponse(res);
  if (!allowStructuredAuthStatus && isBetterAuthStatusPayload(payload)) {
    const authStatus = normalizeBetterAuthStatusPayload(payload);
    emitBetterAuthStatus(authStatus);
    throw new BetterApiError(authStatus.message ?? authStatus.error ?? authStatus.auth_status ?? 'Better auth status', {
      status: res.status,
      payload,
      authStatus,
    });
  }

  return payload as T;
}

/* ─── Normalize account (support old field names from backend) ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeStats(raw: any): AccountTradingStats | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    trades: Number(raw.trades ?? 0),
    wins: Number(raw.wins ?? 0),
    losses: Number(raw.losses ?? 0),
    profitable_trades_pct: Number(raw.profitable_trades_pct ?? 0),
    turnover: Number(raw.turnover ?? 0),
    total_profit: Number(raw.total_profit ?? 0),
    max_trade: Number(raw.max_trade ?? 0),
    min_trade: Number(raw.min_trade ?? 0),
    max_profit: Number(raw.max_profit ?? 0),
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : 'USD',
  };
}

export function normalizeAccount(raw: BetterAccount | Record<string, unknown>): BetterAccount {
  const source = raw as Record<string, unknown> & Partial<BetterAccount>;
  return {
    ...source,
    id: typeof source.id === 'string' ? source.id : '',
    user_id: Number(source.user_id ?? 0),
    email: typeof source.email === 'string' ? source.email : '',
    is_active: Boolean(source.is_active ?? false),
    created_at: typeof source.created_at === 'string' ? source.created_at : '',
    updated_at: typeof source.updated_at === 'string' ? source.updated_at : '',
    po_user_id: Number(source.po_user_id ?? source.po_uid ?? 0),
    has_tokens: Boolean(source.has_tokens ?? source.has_ssid ?? false),
    real_login: typeof source.real_login === 'string' ? source.real_login : null,
    last_auth_at: typeof source.last_auth_at === 'string' ? source.last_auth_at : null,
    restrictions: source.restrictions && typeof source.restrictions === 'object' && !Array.isArray(source.restrictions)
      ? source.restrictions as Record<string, unknown>
      : {},
    ws_connected_at: typeof source.ws_connected_at === 'string' ? source.ws_connected_at : null,
    stats_today: normalizeStats(source.stats_today),
    stats_month: normalizeStats(source.stats_month),
    stats_all: normalizeStats(source.stats_all),
    stats_updated_at: typeof source.stats_updated_at === 'string' ? source.stats_updated_at : null,
    leaderboard_visible: typeof source.leaderboard_visible === 'boolean' ? source.leaderboard_visible : true,
  };
}

function isUsableBetterAccount(account: BetterAccount | null | undefined, balanceAccountIds?: Set<string>): account is BetterAccount {
  if (!account) return false;
  if (!account.is_active || !account.has_tokens) return false;
  if (balanceAccountIds && balanceAccountIds.size > 0 && !balanceAccountIds.has(account.id)) return false;
  return true;
}

function hasLiveBetterConnection(account: BetterAccount | null | undefined): account is BetterAccount {
  return !!account?.ws_connected_at;
}

export function pickPreferredBetterAccount(
  accounts: BetterAccount[],
  options?: {
    savedId?: string | null;
    balanceAccountIds?: Iterable<string>;
    excludeIds?: Iterable<string>;
  },
): BetterAccount | null {
  if (accounts.length === 0) return null;

  const balanceIds = options?.balanceAccountIds ? new Set(options.balanceAccountIds) : undefined;
  const excludedIds = options?.excludeIds ? new Set(options.excludeIds) : undefined;
  const allowedAccounts = excludedIds?.size
    ? accounts.filter((account) => !excludedIds.has(account.id))
    : accounts;
  if (allowedAccounts.length === 0) return null;

  const savedId = options?.savedId?.trim();
  const saved = savedId ? allowedAccounts.find((account) => account.id === savedId) : null;
  const connectedAccounts = allowedAccounts.filter((account) => isUsableBetterAccount(account, balanceIds) && hasLiveBetterConnection(account));
  if (isUsableBetterAccount(saved, balanceIds) && (connectedAccounts.length === 0 || hasLiveBetterConnection(saved))) return saved;

  if (connectedAccounts.length > 0) return connectedAccounts[0];

  const activeWithTokens = allowedAccounts.find((account) => isUsableBetterAccount(account, balanceIds));
  if (activeWithTokens) return activeWithTokens;

  const activeWithoutBalanceCheck = allowedAccounts.find((account) => account.is_active && account.has_tokens);
  if (activeWithoutBalanceCheck) return activeWithoutBalanceCheck;

  return allowedAccounts[0] ?? null;
}

export async function resolvePreferredBetterAccount(
  savedId?: string | null,
  options?: {
    excludeIds?: Iterable<string>;
  },
): Promise<BetterAccount | null> {
  const accounts = await getAccounts();
  if (accounts.length === 0) return null;

  const orderedCandidates = (() => {
    const preferred = pickPreferredBetterAccount(accounts, { savedId, excludeIds: options?.excludeIds });
    const excludedIds = options?.excludeIds ? new Set(options.excludeIds) : undefined;
    const eligibleAccounts = excludedIds?.size
      ? accounts.filter((account) => !excludedIds.has(account.id))
      : accounts;
    const connectedFallbackCandidates = eligibleAccounts.filter((account) => account.is_active && account.has_tokens && hasLiveBetterConnection(account));
    const fallbackCandidates = eligibleAccounts.filter((account) => account.is_active && account.has_tokens);
    const allCandidates = preferred ? [preferred, ...connectedFallbackCandidates, ...fallbackCandidates] : [...connectedFallbackCandidates, ...fallbackCandidates];
    const unique = new Map<string, BetterAccount>();
    allCandidates.forEach((account) => unique.set(account.id, account));
    if (unique.size === 0) {
      eligibleAccounts.forEach((account) => unique.set(account.id, account));
    }
    return Array.from(unique.values());
  })();

  for (const candidate of orderedCandidates) {
    try {
      await getBalance(candidate.id);
      return candidate;
    } catch {
      // Ignore unusable accounts and keep trying the next one.
    }
  }

  return pickPreferredBetterAccount(accounts, { savedId, excludeIds: options?.excludeIds });
}

/* ─── API functions ─── */

/** Get all PocketOption accounts */
export async function getAccounts(): Promise<BetterAccount[]> {
  const data = await betterFetch<{ accounts: BetterAccount[] }>('/api/accounts');
  return data.accounts.map(normalizeAccount);
}

export async function getAccountStats(accountId: string): Promise<AccountStatsResponse> {
  const data = await betterFetch<AccountStatsResponse>(`/api/accounts/${encodeURIComponent(accountId)}/stats`);
  return {
    ...data,
    stats_today: normalizeStats(data.stats_today),
    stats_month: normalizeStats(data.stats_month),
    stats_all: normalizeStats(data.stats_all),
    stats_updated_at: data.stats_updated_at ?? null,
    leaderboard_visible: data.leaderboard_visible ?? true,
  };
}

/** Add a PO account (email + password). May return requires_2fa if 2FA is needed. */
export async function addAccount(email: string, password: string): Promise<AddAccountResult> {
  const data = await betterFetch<AddAccountResult>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const twoFactorState = normalizeTwoFactorState(
    data.two_factor_state,
    data.two_factor_enabled,
    data.requires_2fa === true,
  );
  return {
    ...data,
    account: normalizeAccount(data.account),
    two_factor_state: twoFactorState,
    two_factor_enabled: twoFactorState ? twoFactorState !== 'disabled' : data.two_factor_enabled,
  };
}

/** Delete a PO account */
export async function deleteAccount(id: string): Promise<void> {
  await betterFetch(`/api/accounts/${id}`, { method: 'DELETE' });
}

/** Confirm 2FA code for account (after addAccount returned requires_2fa) */
export async function confirm2fa(id: string, code: string): Promise<Confirm2faResult> {
  return betterFetch(`/api/accounts/${id}/confirm-2fa`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** Refresh tokens for an account */
export async function refreshAccount(id: string): Promise<{ account_id: string; email: string; has_tokens: boolean; message: string }> {
  return betterFetch(`/api/accounts/${id}/refresh`, { method: 'PATCH' });
}

/** Change password for a PO account and re-authorize */
export async function changeAccountPassword(id: string, newPassword: string): Promise<void> {
  await betterFetch(`/api/accounts/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password: newPassword }),
  });
}

/** Get deposit deeplink */
export async function getDepositLink(id: string, opts?: { code?: string; amount?: number }): Promise<{ link: string }> {
  const params = new URLSearchParams();
  if (opts?.code) params.set('code', opts.code);
  if (opts?.amount != null) params.set('amount', String(opts.amount));
  const qs = params.toString();
  return betterFetch(`/api/accounts/${id}/deposit-link${qs ? '?' + qs : ''}`);
}

/** Get withdrawal deeplink */
export async function getWithdrawalLink(id: string): Promise<{ link: string }> {
  return betterFetch(`/api/accounts/${id}/withdrawal-link`);
}

/** Get balances for an account */
export async function getBalance(accountId: string): Promise<AccountBalances> {
  return betterFetch(`/api/accounts/${accountId}/balance`);
}

/** Get bet history for an account */
export async function getAccountHistory(accountId: string, limit = 50, offset = 0, isDemo?: boolean): Promise<{ bets: BetRecord[]; total: number }> {
  let url = `/api/accounts/${accountId}/history?limit=${limit}&offset=${offset}`;
  if (isDemo !== undefined) url += `&is_demo=${isDemo}`;
  return betterFetch(url);
}

/** Get all bet history for user */
export async function getAllHistory(limit = 50, offset = 0): Promise<{ bets: BetRecord[]; total: number }> {
  return betterFetch(`/api/history?limit=${limit}&offset=${offset}`);
}

/* ─── PO Assets ─── */

export interface PoAsset {
  id?: number;
  symbol: string;
  label?: string;
  type?: string;
  payout: number;
  max_payout?: number;
  is_otc: boolean;
  min_timeframe?: number;
  max_timeframe?: number;
}

interface PoAssetsResponse {
  assets: PoAsset[];
  total: number;
  account_email?: string;
}

/** Get available PocketOption assets for an account */
export async function getPoAssets(accountId: string): Promise<PoAsset[]> {
  const res = await betterFetch<PoAssetsResponse | PoAsset[]>(`/api/accounts/${accountId}/po-assets`);
  // API may return { assets: [...] } wrapper or raw array
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object' && 'assets' in res && Array.isArray(res.assets)) return res.assets;
  return [];
}

/** Get payout map (symbol → payout%) for an account */
export async function getPoPayout(accountId: string): Promise<Record<string, number>> {
  return betterFetch(`/api/accounts/${accountId}/po-payout`);
}

/* ─── Candle Stats (admin monitoring) ─── */

export interface CandleStatPoint {
  minute: string;
  ticks: number;
  closed_candles: number;
}

/** Get candle stats for the last N hours (1–168). */
export async function getCandleStats(hours = 1): Promise<CandleStatPoint[]> {
  const h = Math.max(1, Math.min(168, hours));
  const res = await betterFetch<{ data: CandleStatPoint[] } | CandleStatPoint[]>(`/api/candle-stats?hours=${h}`);
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object' && 'data' in res && Array.isArray(res.data)) return res.data;
  return [];
}

/* ─── Whitelist ─── */

export interface WhitelistEntry {
  id: string;
  po_user_id: number | null;
  email: string | null;
  comment: string | null;
  added_by: number | null;
  created_at: string;
}

/** Get all whitelist entries. */
export async function getWhitelist(): Promise<WhitelistEntry[]> {
  const res = await betterFetch<{ whitelist: WhitelistEntry[] }>('/api/whitelist');
  return res.whitelist;
}

/** Add a whitelist entry. At least one of po_user_id or email is required. */
export async function addWhitelistEntry(params: { po_user_id?: number; email?: string; comment?: string }): Promise<WhitelistEntry> {
  return betterFetch<WhitelistEntry>('/api/whitelist', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Delete a whitelist entry by id. */
export async function deleteWhitelistEntry(id: string): Promise<void> {
  await betterFetch(`/api/whitelist/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
