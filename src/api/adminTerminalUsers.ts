import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';

export class AdminTerminalUsersApiError extends Error {
  status: number;
  responseData: unknown;

  constructor(message: string, status: number, responseData: unknown) {
    super(message);
    this.name = 'AdminTerminalUsersApiError';
    this.status = status;
    this.responseData = responseData;
  }
}

export interface AdminTerminalUserPasswordAudit {
  view_count: number;
  last_viewed_at: string | null;
  last_viewed_by: string | null;
  last_admin_user_id: number | null;
  last_admin_terminal_user_id: string | null;
}

export interface AdminTerminalUserRecentPasswordView {
  id: string;
  viewed_at: string | null;
  admin_label: string | null;
  admin_user_id: number | null;
  admin_terminal_user_id: string | null;
  admin_username: string | null;
  admin_first_name: string | null;
  admin_last_name: string | null;
  ip: string | null;
}

export interface AdminTerminalUserDetails {
  identity: {
    account_id: string;
    user_id: number | null;
    terminal_user_id: string | null;
    email: string;
    po_user_id: number | null;
    nickname: string | null;
    real_login: string | null;
    avatar_url: string | null;
  };
  auth: {
    access_token_present: boolean;
    refresh_token_present: boolean;
    access_token_issued_at: string | null;
    access_token_expires_at: string | null;
    refresh_token_issued_at: string | null;
    refresh_token_expires_at: string | null;
    last_auth_at: string | null;
    has_encrypted_password: boolean;
    auth_error_reason: string | null;
  };
  balances: {
    demo_balance: number | null;
    demo_currency: string | null;
    demo_balance_updated_at: string | null;
    real_balance: number | null;
    real_currency: string | null;
    real_balance_updated_at: string | null;
  };
  partner: {
    partner_bot_id: string | null;
    partner_bot_username: string | null;
    partner_ref_code: string | null;
    partner_link_id: string | null;
  };
  limits: {
    user_level: number | null;
    min_trade_amount: number | null;
    max_trade_amount: number | null;
    payout_increase: number | null;
    payout_max: number | null;
    leaderboard_visible: boolean;
  };
  restrictions: {
    is_islamic_account: boolean | null;
    can_trade: boolean | null;
    assets_disabled: {
      otc?: boolean;
      market?: boolean;
      list?: string[];
    } | null;
    raw: Record<string, unknown> | null;
  };
  connectivity: {
    is_active: boolean;
    ws_connected_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  payout_cache: {
    asset_count: number;
    updated_at: string | null;
    preview: Record<string, number>;
    full_map?: Record<string, number>;
  };
}

export interface AdminTerminalUserItem {
  id: string;
  email: string;
  terminal_user_id: string | null;
  po_user_id: number | null;
  nickname: string | null;
  real_login: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_auth_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  ws_connected_at: string | null;
  auth_error_reason: string | null;
  access_token_present: boolean;
  refresh_token_present: boolean;
  access_token_issued_at: string | null;
  access_token_expires_at: string | null;
  refresh_token_issued_at: string | null;
  refresh_token_expires_at: string | null;
  has_encrypted_password: boolean;
  demo_balance: number | null;
  demo_currency: string | null;
  demo_balance_updated_at: string | null;
  real_balance: number | null;
  real_currency: string | null;
  real_balance_updated_at: string | null;
  partner_bot_username: string | null;
  partner_ref_code: string | null;
  partner_link_id: string | null;
  user_level: number | null;
  min_trade_amount: number | null;
  max_trade_amount: number | null;
  payout_increase: number | null;
  payout_max: number | null;
  can_trade: boolean | null;
  is_islamic_account: boolean | null;
  payout_asset_count: number;
  payout_updated_at: string | null;
  password_audit: AdminTerminalUserPasswordAudit;
  details: AdminTerminalUserDetails;
  search_blob: string;
  recent_password_views?: AdminTerminalUserRecentPasswordView[];
}

export interface AdminTerminalUsersResponse {
  items: AdminTerminalUserItem[];
  total: number;
}

export interface AdminTerminalUserActionResponse {
  message: string;
  item: AdminTerminalUserItem;
  pocket_response?: unknown;
}

export interface AdminTerminalUserRevealPasswordResponse {
  password: string;
  password_audit: AdminTerminalUserPasswordAudit;
  recent_password_views: AdminTerminalUserRecentPasswordView[];
}

export interface AdminTerminalUsersRepairResponse {
  message: string;
  summary: {
    processed: number;
    repaired: number;
    requires_2fa: number;
    failed: number;
  };
}

function getAdminTerminalUsersUrl(path: string): string {
  return `${getTmaApiDomain()}${path}`;
}

async function adminTerminalUsersFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authService.getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(getAdminTerminalUsersUrl(path), {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : null;
    const message = String(payload?.message || payload?.error || `API ${response.status}: ${response.statusText}`);
    throw new AdminTerminalUsersApiError(message, response.status, data);
  }

  return data as T;
}

export function getAdminTerminalUsers(): Promise<AdminTerminalUsersResponse> {
  return adminTerminalUsersFetch<AdminTerminalUsersResponse>('/api/admin/terminal-users');
}

export function getAdminTerminalUser(id: string): Promise<AdminTerminalUserItem> {
  return adminTerminalUsersFetch<AdminTerminalUserItem>(`/api/admin/terminal-users/${encodeURIComponent(id)}`);
}

export function refreshAdminTerminalUserToken(id: string): Promise<AdminTerminalUserActionResponse> {
  return adminTerminalUsersFetch<AdminTerminalUserActionResponse>(`/api/admin/terminal-users/${encodeURIComponent(id)}/refresh-token`, {
    method: 'POST',
  });
}

export function reloginAdminTerminalUser(id: string): Promise<AdminTerminalUserActionResponse> {
  return adminTerminalUsersFetch<AdminTerminalUserActionResponse>(`/api/admin/terminal-users/${encodeURIComponent(id)}/relogin`, {
    method: 'POST',
  });
}

export function revealAdminTerminalUserPassword(id: string): Promise<AdminTerminalUserRevealPasswordResponse> {
  return adminTerminalUsersFetch<AdminTerminalUserRevealPasswordResponse>(`/api/admin/terminal-users/${encodeURIComponent(id)}/reveal-password`, {
    method: 'POST',
  });
}

export function repairAdminTerminalUsersMissingRefresh(): Promise<AdminTerminalUsersRepairResponse> {
  return adminTerminalUsersFetch<AdminTerminalUsersRepairResponse>('/api/admin/terminal-users/repair-missing-refresh', {
    method: 'POST',
  });
}