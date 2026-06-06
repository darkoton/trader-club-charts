import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';

export type ServiceLogLevel = 'WARNING' | 'ERROR' | 'CRITICAL';
export type ServiceLogKind = 'sync' | 'token';

export interface ServiceLogItem {
  id: string;
  service: string;
  level: ServiceLogLevel;
  message: string;
  kinds: string[];
  created_at: string;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  occurrences_count?: number;
  file?: string | null;
  module?: string | null;
  function?: string | null;
  line?: number | null;
  hostname?: string | null;
  process_id?: number | null;
  thread_id?: number | null;
  exception?: {
    type?: string | null;
    value?: string | null;
  };
  extra?: Record<string, unknown>;
  copy_text: string;
}

export interface ServiceLogsResponse {
  items: ServiceLogItem[];
  total: number;
  limit: number;
  skip: number;
  filters: {
    service: string | null;
    level: ServiceLogLevel | null;
    kinds: string[];
    search: string | null;
  };
}

export interface ServiceLogsQuery {
  service?: string;
  level?: ServiceLogLevel;
  kind?: ServiceLogKind;
  search?: string;
  q?: string;
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

async function adminServiceLogsFetch(path: string, init?: RequestInit): Promise<Response> {
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

function buildQuery(params?: ServiceLogsQuery): string {
  const qs = new URLSearchParams();
  if (!params) return '';

  if (params.service) qs.set('service', params.service);
  if (params.level) qs.set('level', params.level);
  if (params.kind) qs.set('kind', params.kind);
  if (params.search) qs.set('search', params.search);
  if (params.q) qs.set('q', params.q);
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.skip === 'number') qs.set('skip', String(params.skip));

  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function getAdminServiceLogs(params?: ServiceLogsQuery): Promise<ServiceLogsResponse> {
  const query = buildQuery(params);
  const response = await adminServiceLogsFetch(`/api/admin/service-logs${query}`);
  return response.json();
}

export async function getAdminServiceLogsText(params?: ServiceLogsQuery): Promise<string> {
  const query = new URLSearchParams(buildQuery(params).replace(/^\?/, ''));
  query.set('format', 'text');
  const response = await adminServiceLogsFetch(`/api/admin/service-logs?${query.toString()}`);
  return response.text();
}
