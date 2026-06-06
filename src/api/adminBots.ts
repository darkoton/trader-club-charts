import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';

export interface AdminBotPartnerConfigSummary {
  ref_uid: string | null;
  partner_link_id: string | null;
  partner_login_masked: string | null;
  affiliate_email: string | null;
  affiliate_name: string | null;
  affiliate_access_enabled: boolean;
  has_partner_password: boolean;
  has_partner_refresh_token: boolean;
  has_partner_token: boolean;
  has_affiliate_api_key: boolean;
  affiliate_links_count: number;
}

export interface AdminBotAffiliateConfigSummary {
  affiliate_email: string | null;
  affiliate_name: string | null;
  affiliate_access_enabled: boolean;
  has_affiliate_api_key: boolean;
  affiliate_links_count: number;
}

export interface AdminBot {
  bot_username: string;
  channel_name: string | null;
  ru_link: string | null;
  others_link: string | null;
  telegram_link: string | null;
  ref_code: string | null;
  technical_work_enabled: boolean;
  technical_banner_text: string | null;
  is_active: boolean;
  partner_config: AdminBotPartnerConfigSummary;
  affiliate_config?: AdminBotAffiliateConfigSummary | null;
}

interface AdminBotRaw {
  bot_username: string;
  channel_name: string | null;
  ru_link: string | null;
  others_link: string | null;
  telegram_link: string | null;
  ref_code: string | null;
  technical_work_enabled: boolean;
  technical_banner_text: string | null;
  is_active: boolean;
  partner_config?: Partial<AdminBotPartnerConfigSummary> | null;
  affiliate_config?: Partial<AdminBotAffiliateConfigSummary> | null;
}

export interface AdminBotPartnerConfigPayload {
  ref_uid?: string;
  partner_link_id?: string;
  partner_login?: string;
  partner_password?: string;
  partner_refresh_token?: string;
  partner_token?: string;
  affiliate_email?: string;
  affiliate_name?: string;
  affiliate_access_enabled?: boolean;
}

export interface AdminBotCreatePayload {
  bot_username: string;
  bot_token?: string;
  channel_name?: string;
  ru_link?: string;
  others_link?: string;
  telegram_link?: string;
  ref_code?: string;
  is_active?: boolean;
}

export interface AdminBotUpdatePayload {
  channel_name?: string;
  ru_link?: string;
  others_link?: string;
  telegram_link?: string;
  ref_code?: string;
  is_active?: boolean;
  technical_work_enabled?: boolean;
  technical_banner_text?: string | null;
}

export interface AutobotAdminStatus {
  account_id: string;
  pocket_id: string | number | null;
  expiration: number | null;
  status: string | null;
  is_demo: boolean;
  better_account_id: string | null;
  better_email: string | null;
  balance: number | null;
  balance_updated_at: string | null;
  balance_minutes_ago: number | null;
  balance_error: string | null;
  last_bet_at: string | null;
  last_bet_minutes_ago: number | null;
  last_bet_symbol: string | null;
  last_bet_amount: number | null;
  last_bet_expiration: number | null;
  last_bet_order_id: string | null;
  last_bet_result: 'win' | 'loss' | 'draw' | 'timeout' | null;
  last_bet_profit: number | null;
  last_bet_payout: number | null;
  blocked_pair: string | null;
  blocked_at: string | null;
  blocked_minutes_ago: number | null;
  blocked_until: string | null;
  minutes_until_auto_unblock: number | null;
  can_manual_unblock: boolean;
  martin_step: number | null;
  martin_active: boolean;
}

export interface AutobotAdminUnblockResponse {
  success: boolean;
  message?: string;
  bot?: AutobotAdminStatus;
}

export interface AutobotAdminActionResponse {
  success: boolean;
  message?: string;
  bot?: AutobotAdminStatus;
}

interface AutobotAdminStatusListResponse {
  success?: boolean;
  total?: number;
  items?: AutobotAdminStatus[];
  timestamp?: string;
}

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
    if (typeof maybeError === 'string' && maybeError.trim()) return maybeError;
    const maybeMessage = 'message' in payload ? payload.message : undefined;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
  }

  if (rawText.trim()) return rawText.trim();
  return statusText || 'Request failed';
}

async function adminBotsFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

async function autobotAdminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authService.getToken()?.trim();
  if (!token) {
    throw new Error('Отсутствует admin JWT');
  }

  const response = await fetch(buildAdminTmaUrl(path), {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      Authorization: `Bearer ${token}`,
      ...(init?.body && typeof init.body === 'string' && !(init?.headers as Record<string, string> | undefined)?.['Content-Type']
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
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

function normalizeAdminBot(raw: AdminBotRaw): AdminBot {
  const partnerConfig = raw.partner_config ?? {};
  const affiliateConfig = raw.affiliate_config ?? {};

  return {
    ...raw,
    partner_config: {
      ref_uid: partnerConfig.ref_uid ?? null,
      partner_link_id: partnerConfig.partner_link_id ?? null,
      partner_login_masked: partnerConfig.partner_login_masked ?? null,
      affiliate_email: affiliateConfig.affiliate_email ?? partnerConfig.affiliate_email ?? null,
      affiliate_name: affiliateConfig.affiliate_name ?? partnerConfig.affiliate_name ?? null,
      affiliate_access_enabled: affiliateConfig.affiliate_access_enabled ?? partnerConfig.affiliate_access_enabled ?? false,
      has_partner_password: partnerConfig.has_partner_password ?? false,
      has_partner_refresh_token: partnerConfig.has_partner_refresh_token ?? false,
      has_partner_token: partnerConfig.has_partner_token ?? false,
      has_affiliate_api_key: affiliateConfig.has_affiliate_api_key ?? partnerConfig.has_affiliate_api_key ?? false,
      affiliate_links_count: affiliateConfig.affiliate_links_count ?? partnerConfig.affiliate_links_count ?? 0,
    },
    affiliate_config: {
      affiliate_email: affiliateConfig.affiliate_email ?? partnerConfig.affiliate_email ?? null,
      affiliate_name: affiliateConfig.affiliate_name ?? partnerConfig.affiliate_name ?? null,
      affiliate_access_enabled: affiliateConfig.affiliate_access_enabled ?? partnerConfig.affiliate_access_enabled ?? false,
      has_affiliate_api_key: affiliateConfig.has_affiliate_api_key ?? partnerConfig.has_affiliate_api_key ?? false,
      affiliate_links_count: affiliateConfig.affiliate_links_count ?? partnerConfig.affiliate_links_count ?? 0,
    },
  };
}

export async function listAdminBots(): Promise<AdminBot[]> {
  const response = await adminBotsFetch<AdminBotRaw[]>('/api/admin/bots');
  return response.map(normalizeAdminBot);
}

export async function getAdminBot(botUsername: string): Promise<AdminBot> {
  const response = await adminBotsFetch<AdminBotRaw>(`/api/admin/bots/${encodeURIComponent(botUsername)}`);
  return normalizeAdminBot(response);
}

export async function createAdminBot(payload: AdminBotCreatePayload): Promise<AdminBot> {
  const response = await adminBotsFetch<AdminBotRaw>('/api/admin/bots', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeAdminBot(response);
}

export async function updateAdminBot(
  botUsername: string,
  payload: AdminBotUpdatePayload,
): Promise<AdminBot> {
  const response = await adminBotsFetch<AdminBotRaw>(`/api/admin/bots/${encodeURIComponent(botUsername)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeAdminBot(response);
}

export async function updateAdminBotPartnerConfig(
  botUsername: string,
  payload: AdminBotPartnerConfigPayload,
): Promise<AdminBot> {
  const response = await adminBotsFetch<AdminBotRaw>(`/api/admin/bots/${encodeURIComponent(botUsername)}/partner-config`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeAdminBot(response);
}

export async function clearAdminBotPartnerConfig(botUsername: string): Promise<AdminBot> {
  const response = await adminBotsFetch<AdminBotRaw>(`/api/admin/bots/${encodeURIComponent(botUsername)}/partner-config`, {
    method: 'DELETE',
  });
  return normalizeAdminBot(response);
}

export async function listAutobotAdminStatuses(): Promise<AutobotAdminStatus[]> {
  const response = await autobotAdminFetch<AutobotAdminStatus[] | AutobotAdminStatusListResponse>('/api/admin/bots/status');
  if (Array.isArray(response)) return response;
  return Array.isArray(response.items) ? response.items : [];
}

export async function getAutobotAdminStatus(accountId: string): Promise<AutobotAdminStatus> {
  return autobotAdminFetch<AutobotAdminStatus>(`/api/admin/bots/status/${encodeURIComponent(accountId)}`);
}

export async function unblockAutobotAdminBot(accountId: string): Promise<AutobotAdminActionResponse> {
  return autobotAdminFetch<AutobotAdminActionResponse>(`/api/admin/bots/status/${encodeURIComponent(accountId)}/unblock`, {
    method: 'POST',
  });
}

export async function resetAutobotAdminMartin(accountId: string): Promise<AutobotAdminActionResponse> {
  return autobotAdminFetch<AutobotAdminActionResponse>(`/api/admin/bots/status/${encodeURIComponent(accountId)}/reset-martin`, {
    method: 'POST',
  });
}
