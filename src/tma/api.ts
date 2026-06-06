/**
 * TMA API layer — wraps apiFetch for all old_tma endpoints.
 * Uses the main project's VITE_API_URL base.
 */
import { apiFetch, getApiBaseUrl } from '../services/apiFetch';
import { getMyProfile } from '../api/user';
import { authService } from '../services/auth';
import type {
  TmaChat,
  TmaRobotId,
  TmaTrade,
  TmaVirtualTradingStatus,
  MessageTemplates,
  TmaChatMessagesResponse,
} from './types';

const TMA_GROUP_INVITE_LINK_KEY = 'tma_group_invite_link';

/* ─── Helpers ─── */

function normalizeBaseUrl(url?: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

function getTelegramInitData(): string {
  return (window as typeof window & {
    Telegram?: { WebApp?: { initData?: string } };
  }).Telegram?.WebApp?.initData || '';
}

function getCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickFirstId(values: Array<unknown>): string | null {
  const match = values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return match == null ? null : String(match).trim();
}

let cachedDiaryUserId: string | null = null;

export async function resolveTmaDiaryUserId(): Promise<string | null> {
  if (cachedDiaryUserId) return cachedDiaryUserId;

  const globalWindow = window as typeof window & {
    pocket_id?: string | number | null;
    userData?: Record<string, unknown> | null;
    authData?: Record<string, unknown> | null;
  };

  const jwtPayload = decodeJwtPayload(authService.getToken() || '');
  const resolvedFromLocalSources = pickFirstId([
    globalWindow.pocket_id,
    getCookie('pocket_id'),
    globalWindow.userData?.pocket_id,
    globalWindow.userData?.user_id,
    globalWindow.userData?.trader_id,
    globalWindow.userData?.id,
    globalWindow.authData?.pocket_id,
    globalWindow.authData?.user_id,
    globalWindow.authData?.trader_id,
    globalWindow.authData?.id,
    jwtPayload?.pocket_id,
    jwtPayload?.user_id,
    jwtPayload?.trader_id,
    jwtPayload?.id,
    jwtPayload?.sub,
  ]);

  if (resolvedFromLocalSources) {
    cachedDiaryUserId = resolvedFromLocalSources;
    globalWindow.pocket_id = resolvedFromLocalSources;
    return resolvedFromLocalSources;
  }

  try {
    const profile = await getMyProfile();
    const resolvedFromProfile = pickFirstId([
      profile.trader_id,
      profile.user_id,
    ]);

    if (resolvedFromProfile) {
      cachedDiaryUserId = resolvedFromProfile;
      globalWindow.pocket_id = resolvedFromProfile;
      return resolvedFromProfile;
    }
  } catch {
    // Leave unresolved and let caller decide whether to send the request without user_id.
  }

  return null;
}

/** Dedicated TMA API domain (separate from main app API if needed). */
export function getTmaApiDomain(): string {
  return normalizeBaseUrl(
    import.meta.env.VITE_TMA_API_URL ||
    import.meta.env.VITE_TMA_API_DOMAIN ||
    import.meta.env.VITE_API_DOMAIN ||
    getApiBaseUrl().replace('/api', ''),
  );
}

export function resolveTmaMediaUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(?:https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${getTmaApiDomain()}/${path.replace(/^\/+/, '')}`;
}

/** Dedicated TMA Robot API domain. */
export function getTmaRobotDomain(): string {
  return normalizeBaseUrl(
    import.meta.env.VITE_TMA_ROBOT_DOMAIN ||
    import.meta.env.VITE_API_ROBOT ||
    getTmaApiDomain(),
  );
}

function tmaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getTmaApiDomain();
  const url = `${base}${path}`;
  return apiFetch<T>(url, init);
}

function robotFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getTmaRobotDomain();
  const url = `${base}${path}`;
  return apiFetch<T>(url, init);
}

export function getStoredTmaGroupInviteLink(): string {
  try {
    return localStorage.getItem(TMA_GROUP_INVITE_LINK_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setStoredTmaGroupInviteLink(link?: string | null): void {
  const normalized = typeof link === 'string' ? link.trim() : '';

  try {
    if (normalized) localStorage.setItem(TMA_GROUP_INVITE_LINK_KEY, normalized);
    else localStorage.removeItem(TMA_GROUP_INVITE_LINK_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/* ─── Chats ─── */

/**
 * GET /v1/message_templates
 * Fetched once and cached by React Query. Never re-fetched.
 */
export async function fetchMessageTemplates(): Promise<MessageTemplates> {
  return tmaFetch<MessageTemplates>('/v1/message_templates');
}

/**
 * Render a structured message using server-provided templates.
 * Matches the JS snippet from the API docs.
 */
export function renderTmaMessage(
  typeRequest: string | undefined,
  data: Record<string, string> | undefined,
  templates: MessageTemplates,
  lang: string,
): string {
  if (!typeRequest || !templates?.templates) return '';
  const template = templates.templates[typeRequest]?.[lang] ?? templates.templates[typeRequest]?.['ru'];
  if (!template) return '';

  const d: Record<string, string> = { ...(data || {}) };

  // OTC
  if (['true', '1', 'yes'].includes(d.otc?.toLowerCase?.() || '')) {
    d.otc = ' (OTC) ';
  } else {
    d.otc = '';
  }

  // Direction
  const isReady = typeRequest.startsWith('ready_signal');
  const dirMap = templates.vars[lang]?.[isReady ? 'direction_ready' : 'direction'];
  if (d.direction && dirMap) {
    d.direction = dirMap[d.direction] ?? dirMap['other'] ?? d.direction;
  }

  // Result
  const resultMap = templates.vars[lang]?.result;
  if (d.result && resultMap) {
    d.result = resultMap[d.result] ?? resultMap['other'] ?? d.result;
  }

  return template.replace(/\$(\w+)/g, (_, key: string) => d[key] ?? '');
}

export async function fetchChats(): Promise<TmaChat[]> {
  const res = await tmaFetch<TmaChat[] | { chats?: TmaChat[]; group_invite_link?: string | null }>('/v1/get_chats', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ init_data: getTelegramInitData() }),
  });
  if (!Array.isArray(res) && 'group_invite_link' in res) {
    setStoredTmaGroupInviteLink(res.group_invite_link);
  }
  const chats = Array.isArray(res) ? res : (res.chats ?? []);
  // Filter out hidden chats
  return chats.filter((chat) => {
    const maybeVisible = (chat as TmaChat & { visible?: boolean }).visible;
    return maybeVisible !== false;
  });
}

/**
 * GET /v1/chats/{chatId}/messages
 * Supports before=/after= ISO date for cursor-based pagination.
 */
export async function fetchChatMessages(
  chatId: string | number,
  params?: { before?: string; after?: string; limit?: number },
): Promise<TmaChatMessagesResponse> {
  const qs = new URLSearchParams();
  qs.set('limit', String(params?.limit ?? 50));
  if (params?.before) qs.set('before', params.before);
  if (params?.after) qs.set('after', params.after);
  return tmaFetch<TmaChatMessagesResponse>(`/v1/chats/${encodeURIComponent(String(chatId))}/messages?${qs.toString()}`);
}

export async function toggleNotifications(chatIds: Array<string | number>): Promise<void> {
  await tmaFetch('/v1/toogle_notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ chat_id: chatIds }),
  });
}

export async function readAllMessages(): Promise<void> {
  await tmaFetch('/v1/read_all_messages', { method: 'POST' });
}

export async function readChatMessages(chatId: string | number): Promise<void> {
  await tmaFetch('/v1/read_chat_messages', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ chat_id: chatId }),
  });
}

/* ─── Robot ─── */

export async function fetchRobotIds(): Promise<TmaRobotId[]> {
  const res = await robotFetch<{ data: TmaRobotId[] }>('/get_ids');
  return res.data ?? [];
}

export async function fetchTradingHistory(
  accountId: string,
  limit = 50,
): Promise<TmaTrade[]> {
  const res = await tmaFetch<{ data: TmaTrade[] }>(
    `/api/trading-history?account_id=${accountId}&limit=${limit}`,
  );
  return res.data ?? [];
}

/* ─── Virtual Trading ─── */

export async function fetchVirtualTradingStatus(
  accountId: string,
): Promise<TmaVirtualTradingStatus> {
  return tmaFetch<TmaVirtualTradingStatus>(
    `/virtual-trading/status?account_id=${accountId}`,
  );
}

export async function fetchVirtualTradingCurrentTrades(
  accountId: string,
): Promise<{ success: boolean; data?: { trades?: TmaTrade[] } }> {
  return tmaFetch<{ success: boolean; data?: { trades?: TmaTrade[] } }>(
    `/virtual-trading/current-trades?account_id=${accountId}`,
  );
}

export async function startVirtualTrading(
  accountId: string,
  deposit: number,
  stake: number,
): Promise<unknown> {
  return tmaFetch('/virtual-trading/start', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      starting_balance: deposit,
      base_stake: stake,
    }),
  });
}

export async function stopVirtualTrading(
  accountId: string,
): Promise<unknown> {
  return tmaFetch('/virtual-trading/stop', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId }),
  });
}

/* ─── Calendar / Diary ─── */

export async function fetchDiaryInfo(
  dateRange: string,
  userId?: string,
): Promise<unknown> {
  const effectiveUserId = userId || await resolveTmaDiaryUserId();
  let path = `/diary/get-info?date_range=${encodeURIComponent(dateRange)}`;
  if (effectiveUserId) path += `&user_id=${encodeURIComponent(effectiveUserId)}`;
  return tmaFetch<unknown>(path);
}

export async function saveDiaryDay(
  id: number,
  profit: number,
  loss: number,
  comment: string,
  userId?: string,
): Promise<unknown> {
  const effectiveUserId = userId || await resolveTmaDiaryUserId();
  return tmaFetch('/diary/save-day', {
    method: 'POST',
    body: JSON.stringify({ id, profit_amount: profit, loss_amount: loss, comment, user_id: effectiveUserId }),
  });
}

export async function setDiaryPublic(isPublic: boolean): Promise<unknown> {
  return tmaFetch('/diary/set-public', {
    method: 'POST',
    body: JSON.stringify({ is_public: isPublic }),
  });
}
