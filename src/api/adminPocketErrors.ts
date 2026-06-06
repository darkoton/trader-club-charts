import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';

export type PocketErrorTranslationStatus = 'new' | 'partial' | 'translated' | 'ignored';

export interface PocketErrorTranslations {
  ru?: string | null;
  en?: string | null;
  uk?: string | null;
}

export interface PocketErrorCatalogItem {
  id: string;
  signature: string;
  source?: string | null;
  stage?: string | null;
  endpoint?: string | null;
  endpoint_path?: string | null;
  status?: number | null;
  canonical_message: string;
  normalized_message?: string | null;
  response_payload_sample?: unknown;
  occurrences_count: number;
  translation_ru?: string | null;
  translation_en?: string | null;
  translation_uk?: string | null;
  translations?: PocketErrorTranslations;
  translation_status: PocketErrorTranslationStatus;
  admin_note?: string | null;
  created_at: string;
  updated_at?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

export interface PocketErrorCatalogResponse {
  items: PocketErrorCatalogItem[];
  total: number;
  limit: number;
  skip: number;
  filters: {
    source: string | null;
    stage: string | null;
    status: number | null;
    translation_status: PocketErrorTranslationStatus | null;
    search: string | null;
  };
}

export interface PocketErrorCatalogQuery {
  source?: string;
  stage?: string;
  status?: number | string;
  translation_status?: PocketErrorTranslationStatus;
  search?: string;
  limit?: number;
  skip?: number;
}

export interface PocketErrorOccurrenceItem {
  id: string;
  source?: string | null;
  stage?: string | null;
  endpoint?: string | null;
  status?: number | null;
  error_message?: string | null;
  request_payload?: unknown;
  response_payload?: unknown;
  email?: string | null;
  terminal_user_id?: string | null;
  account_id?: string | null;
  po_user_id?: number | null;
  error_catalog_id?: string | null;
  error_signature?: string | null;
  extra?: Record<string, unknown> | null;
  created_at: string;
}

export interface PocketErrorOccurrencesResponse {
  items: PocketErrorOccurrenceItem[];
  total: number;
  limit: number;
  skip: number;
}

export interface PocketErrorOccurrencesQuery {
  limit?: number;
  skip?: number;
}

export interface PocketErrorCatalogPatch {
  translation_ru?: string | null;
  translation_en?: string | null;
  translation_uk?: string | null;
  translation_status?: PocketErrorTranslationStatus;
  admin_note?: string | null;
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

async function adminPocketErrorsFetch(path: string, init?: RequestInit): Promise<Response> {
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

function buildQuery(params?: PocketErrorCatalogQuery | PocketErrorOccurrencesQuery): string {
  const qs = new URLSearchParams();
  if (!params) return '';

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    qs.set(key, String(value));
  }

  const serialized = qs.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getAdminPocketErrors(params?: PocketErrorCatalogQuery): Promise<PocketErrorCatalogResponse> {
  const query = buildQuery(params);
  const response = await adminPocketErrorsFetch(`/api/admin/better/pocket-errors${query}`);
  return response.json();
}

export async function getAdminPocketError(errorId: string): Promise<PocketErrorCatalogItem> {
  const response = await adminPocketErrorsFetch(`/api/admin/better/pocket-errors/${encodeURIComponent(errorId)}`);
  return response.json();
}

export async function getAdminPocketErrorOccurrences(errorId: string, params?: PocketErrorOccurrencesQuery): Promise<PocketErrorOccurrencesResponse> {
  const query = buildQuery(params);
  const response = await adminPocketErrorsFetch(`/api/admin/better/pocket-errors/${encodeURIComponent(errorId)}/occurrences${query}`);
  return response.json();
}

export async function patchAdminPocketError(errorId: string, payload: PocketErrorCatalogPatch): Promise<PocketErrorCatalogItem> {
  const response = await adminPocketErrorsFetch(`/api/admin/better/pocket-errors/${encodeURIComponent(errorId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.json();
}
