import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';

export interface AdminChatTitles {
  ru?: string;
  en?: string;
  uk?: string;
  [key: string]: string | undefined;
}

export interface AdminChat {
  chat_id: string | number;
  category: string | null;
  title: string | null;
  titles: AdminChatTitles;
  type: string | null;
  signal_mode?: 'standard' | 'analytics' | null;
  selected_pairs?: string[] | string | null;
  analytics_timeframes?: Record<string, number[]> | null;
  visible: boolean;
  img_path: string | null;
  expiration: number | null;
  has_missing_category: boolean;
  has_missing_titles: boolean;
}

export interface AdminChatsListParams {
  onlyMissing?: boolean;
  signalMode?: 'standard' | 'analytics';
}

export interface AdminChatUpdatePayload {
  title?: string | null;
  titles?: Partial<Record<'ru' | 'en' | 'uk', string>>;
  category?: string | null;
  type?: string | null;
  signal_mode?: 'standard' | 'analytics' | null;
  selected_pairs?: string[];
  analytics_timeframes?: Record<string, number[]>;
  visible?: boolean | null;
  img_path?: string | null;
  expiration?: number | null;
}

export interface AdminChatAnalyticsPairsConfig {
  chat_id: string | number;
  signal_mode?: 'standard' | 'analytics' | null;
  selected_pairs?: string[] | string | null;
  analytics_timeframes?: Record<string, number[]> | null;
}

export interface AdminChatAnalyticsPairsUpsertPayload {
  pairs?: Record<string, number[]>;
  selected_pairs?: string[] | string | null;
  analytics_timeframes?: Record<string, number[]> | null;
}

export interface AdminChatAnalyticsPairsDeletePayload {
  pairs?: string[] | string | null;
  selected_pairs?: string[] | string | null;
}

export interface AdminChatsSyncDefaultsPayload {
  chat_ids?: string[] | null;
  force_titles?: boolean;
  force_category?: boolean;
  force_title_field?: boolean;
  force_expiration?: boolean;
}

export interface AdminChatsSyncDefaultsResult {
  updated: number;
  skipped: number;
  details: AdminChat[];
}

export const ADMIN_CHAT_ICON_ACCEPT = '.png,.svg,.webp';
export const ADMIN_CHAT_ICON_MAX_SIZE = 512 * 1024;
export const ADMIN_CHAT_ICON_ALLOWED_TYPES = ['image/png', 'image/svg+xml', 'image/webp'];

function buildAdminTmaUrl(path: string): string {
  return `${getTmaApiDomain()}${path}`;
}

function buildRequestHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };
  const token = authService.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function extractErrorMessage(statusText: string, payload: unknown, rawText: string): string {
  if (payload && typeof payload === 'object') {
    const maybeError = 'error' in payload ? payload.error : undefined;
    if (typeof maybeError === 'string' && maybeError.trim()) {
      if ('details' in payload && Array.isArray(payload.details) && payload.details.length > 0) {
        const detailText = payload.details
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const message = 'msg' in item && typeof item.msg === 'string' ? item.msg : null;
            const loc = 'loc' in item && Array.isArray(item.loc) ? item.loc.join('.') : null;
            return loc ? `${loc}: ${message || ''}`.trim() : message;
          })
          .filter(Boolean)
          .join('; ');
        return detailText ? `${maybeError}: ${detailText}` : maybeError;
      }
      return maybeError;
    }
  }

  if (rawText.trim()) return rawText.trim();
  return statusText || 'Request failed';
}

async function adminTmaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildAdminTmaUrl(path), {
    ...init,
    headers: buildRequestHeaders(init),
  });

  const rawText = response.status === 204 ? '' : await response.text();
  const contentType = response.headers.get('content-type') || '';
  const parsed = rawText && contentType.includes('application/json')
    ? JSON.parse(rawText) as unknown
    : undefined;

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.statusText, parsed, rawText));
  }

  if (!rawText) return undefined as T;
  if (parsed !== undefined) return parsed as T;
  return rawText as T;
}

export async function listAdminChats(params?: AdminChatsListParams): Promise<AdminChat[]> {
  const searchParams = new URLSearchParams();
  if (params?.onlyMissing) searchParams.set('only_missing', 'true');
  if (params?.signalMode) searchParams.set('signal_mode', params.signalMode);
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return adminTmaFetch<AdminChat[]>(`/api/admin/chats${qs}`);
}

export async function getAdminChat(chatId: string | number): Promise<AdminChat> {
  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}`);
}

export async function getAdminChatAnalyticsPairs(
  chatId: string | number,
): Promise<AdminChatAnalyticsPairsConfig> {
  return adminTmaFetch<AdminChatAnalyticsPairsConfig>(
    `/api/admin/chats/${encodeURIComponent(String(chatId))}/analytics-pairs`,
  );
}

export async function updateAdminChat(
  chatId: string | number,
  payload: AdminChatUpdatePayload,
): Promise<AdminChat> {
  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function replaceAdminChatAnalyticsPairs(
  chatId: string | number,
  payload: AdminChatAnalyticsPairsUpsertPayload | Record<string, number[]>,
): Promise<AdminChat> {
  const body = 'pairs' in payload || 'selected_pairs' in payload || 'analytics_timeframes' in payload
    ? payload
    : { pairs: payload };

  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}/analytics-pairs`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function addAdminChatAnalyticsPairs(
  chatId: string | number,
  payload: AdminChatAnalyticsPairsUpsertPayload | Record<string, number[]>,
): Promise<AdminChat> {
  const body = 'pairs' in payload || 'selected_pairs' in payload || 'analytics_timeframes' in payload
    ? payload
    : { pairs: payload };

  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}/analytics-pairs`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteAdminChatAnalyticsPairs(
  chatId: string | number,
  payload: AdminChatAnalyticsPairsDeletePayload | string[] | string,
): Promise<AdminChat> {
  const body = Array.isArray(payload) || typeof payload === 'string'
    ? { pairs: payload }
    : payload;

  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}/analytics-pairs`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

export async function syncAdminChatsDefaults(
  payload?: AdminChatsSyncDefaultsPayload,
): Promise<AdminChatsSyncDefaultsResult> {
  const hasBody = Boolean(
    payload && (
      (Array.isArray(payload.chat_ids) && payload.chat_ids.length > 0)
      || payload.force_titles
      || payload.force_category
      || payload.force_title_field
      || payload.force_expiration
    ),
  );

  return adminTmaFetch<AdminChatsSyncDefaultsResult>('/api/admin/chats/sync-defaults', {
    method: 'POST',
    ...(hasBody ? { body: JSON.stringify(payload) } : {}),
  });
}

export async function uploadAdminChatIcon(chatId: string | number, file: File): Promise<AdminChat> {
  const formData = new FormData();
  formData.append('icon', file);

  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}/icon/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function deleteAdminChatIcon(chatId: string | number): Promise<AdminChat> {
  return adminTmaFetch<AdminChat>(`/api/admin/chats/${encodeURIComponent(String(chatId))}/icon`, {
    method: 'DELETE',
  });
}