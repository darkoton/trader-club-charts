import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';

export interface BetterAuthEventItem {
  id: string;
  event_type: string;
  email?: string | null;
  account_id?: string | null;
  terminal_user_id?: string | null;
  po_user_id?: number | null;
  source?: string | null;
  stage?: string | null;
  endpoint?: string | null;
  status?: number | null;
  action?: string | null;
  message?: string | null;
  response_payload?: unknown;
  extra?: Record<string, unknown> | null;
  created_at: string;
  copy_text?: string;
}

export interface BetterJwtDecodeResponse {
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  subject_kind: string;
  verified: boolean;
  parse_error: string | null;
  verify_error: string | null;
  is_expired: boolean | null;
  expires_at_unix: number | null;
  expires_at: string | null;
}

export interface BetterAuthEventsResponse {
  items: BetterAuthEventItem[];
  total: number;
  limit: number;
  skip: number;
  filters: {
    event_type: string | null;
    action: string | null;
    source: string | null;
    stage: string | null;
    email: string | null;
    account_id: string | null;
    terminal_user_id: string | null;
    search: string | null;
  };
}

export interface BetterAuthEventsQuery {
  event_type?: string;
  action?: string;
  source?: string;
  stage?: string;
  email?: string;
  account_id?: string;
  terminal_user_id?: string;
  search?: string;
  limit?: number;
  skip?: number;
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

async function adminBetterAuthFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(buildAdminTmaUrl(path), {
    ...init,
    headers: buildRequestHeaders(init),
  });

  if (!response.ok) {
    const rawText = await response.text();
    let payload: unknown;
    try {
      payload = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      payload = undefined;
    }
    throw new Error(extractErrorMessage(response.statusText, payload, rawText));
  }

  return response;
}

function buildQuery(params?: BetterAuthEventsQuery): string {
  const qs = new URLSearchParams();
  if (!params) return '';

  if (params.event_type) qs.set('event_type', params.event_type);
  if (params.action) qs.set('action', params.action);
  if (params.source) qs.set('source', params.source);
  if (params.stage) qs.set('stage', params.stage);
  if (params.email) qs.set('email', params.email);
  if (params.account_id) qs.set('account_id', params.account_id);
  if (params.terminal_user_id) qs.set('terminal_user_id', params.terminal_user_id);
  if (params.search) qs.set('search', params.search);
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.skip === 'number') qs.set('skip', String(params.skip));

  const serialized = qs.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getAdminBetterAuthEvents(params?: BetterAuthEventsQuery): Promise<BetterAuthEventsResponse> {
  const query = buildQuery(params);
  const response = await adminBetterAuthFetch(`/api/admin/better/auth-events${query}`);
  return response.json();
}

export async function getAdminBetterAuthEventsText(params?: BetterAuthEventsQuery): Promise<string> {
  const query = new URLSearchParams(buildQuery(params).replace(/^\?/, ''));
  query.set('format', 'text');
  const response = await adminBetterAuthFetch(`/api/admin/better/auth-events?${query.toString()}`);
  return response.text();
}

export async function getAdminBetterAuthEvent(eventId: string): Promise<BetterAuthEventItem> {
  const response = await adminBetterAuthFetch(`/api/admin/better/auth-events/${encodeURIComponent(eventId)}`);
  return response.json();
}

export async function decodeAdminBetterJwt(token: string): Promise<BetterJwtDecodeResponse> {
  const response = await adminBetterAuthFetch('/api/admin/better/auth-events/decode-jwt', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return response.json();
}