/**
 * ═══════════════════════════════════════════════════════════════
 *  Admin API — Category & Currency icon management
 * ═══════════════════════════════════════════════════════════════
 *
 * Supports two icon types:
 *   1. Emoji — POST JSON { category/currency, icon }
 *   2. File  — POST multipart/form-data (PNG / SVG / WEBP, max 512 KB)
 *
 * | Method | Path                                  | Description                       |
 * |--------|---------------------------------------|-----------------------------------|
 * | GET    | `/admin/icons`                        | Get all icon overrides             |
 * | POST   | `/admin/icons/category`               | Set emoji icon for a category      |
 * | POST   | `/admin/icons/currency`               | Set emoji icon for a currency      |
 * | POST   | `/admin/icons/category/upload`         | Upload file icon for a category    |
 * | POST   | `/admin/icons/currency/upload`         | Upload file icon for a currency    |
 * | DELETE | `/admin/icons/category/:name`          | Remove category icon override      |
 * | DELETE | `/admin/icons/currency/:name`          | Remove currency icon override      |
 */

import { apiFetch, getApiBaseUrl } from '../services/apiFetch';
import { authService } from '../services/auth';

export interface IconOverrides {
  categories: Record<string, string>;   // category name → emoji or "/icons/..." URL
  currencies: Record<string, string>;   // currency name → emoji or "/icons/..." URL
}

export interface UploadResult {
  ok: boolean;
  icon_url: string;
}

/** True when val is a server-hosted icon path (starts with /icons/). */
export function isIconUrl(val: string): boolean {
  return val.startsWith('/icons/');
}

/** Build full URL for a file icon. */
export function getIconFullUrl(iconPath: string): string {
  // API base is e.g. "https://api.po-terminal.com/api" — strip trailing /api
  const base = getApiBaseUrl().replace(/\/api\/?$/, '');
  return `${base}${iconPath}`;
}

/** Accepted icon file extensions. */
export const ICON_ACCEPT = '.png,.svg,.webp';
export const ICON_MAX_SIZE = 512 * 1024; // 512 KB

/* ─── GET ─── */

/** Fetch all icon overrides. */
export async function getIconOverrides(): Promise<IconOverrides> {
  return apiFetch<IconOverrides>('/admin/icons');
}

/* ─── Emoji icons ─── */

/** Set emoji icon for a category. */
export async function setCategoryIcon(category: string, icon: string): Promise<void> {
  await apiFetch('/admin/icons/category', {
    method: 'POST',
    body: JSON.stringify({ category, icon }),
  });
}

/** Set emoji icon for a currency. */
export async function setCurrencyIcon(currency: string, icon: string): Promise<void> {
  await apiFetch('/admin/icons/currency', {
    method: 'POST',
    body: JSON.stringify({ currency, icon }),
  });
}

/* ─── File uploads ─── */

/** Upload file icon for a category. */
export async function uploadCategoryIcon(category: string, file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('category', category);
  fd.append('icon', file);

  const base = getApiBaseUrl();
  const token = authService.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${base}/admin/icons/category/upload`, {
    method: 'POST',
    headers,
    body: fd,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Upload file icon for a currency. */
export async function uploadCurrencyIcon(currency: string, file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('currency', currency);
  fd.append('icon', file);

  const base = getApiBaseUrl();
  const token = authService.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${base}/admin/icons/currency/upload`, {
    method: 'POST',
    headers,
    body: fd,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/* ─── DELETE ─── */

/** Remove category icon override (emoji + file). */
export async function removeCategoryIcon(category: string): Promise<void> {
  await apiFetch(`/admin/icons/category/${encodeURIComponent(category)}`, {
    method: 'DELETE',
  });
}

/** Remove currency icon override (emoji + file). */
export async function removeCurrencyIcon(currency: string): Promise<void> {
  await apiFetch(`/admin/icons/currency/${encodeURIComponent(currency)}`, {
    method: 'DELETE',
  });
}

/* ═══════════════════════════════════════════════════════════════
 *  Currency Mapping — api_name (PocketOption asset mapping)
 * ═══════════════════════════════════════════════════════════════ */

export interface CurrencyMappingItem {
  currency: string;
  api_name: string | null;
  category: string;
  is_active: boolean;
  profit: number;
}

export interface AutoMapResult {
  mapped: number;
  skipped: number;
  not_found: number;
  total: number;
}

export interface AdminTerminalLookupPayload {
  account_id?: string;
  po_email?: string;
  po_user_id?: number;
  refresh?: boolean;
}

export interface AdminTerminalLookupResult {
  account_id: string;
  terminal_user_id: string;
  po_user_id: number | null;
  email: string | null;
  nickname: string | null;
  is_active: boolean;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  last_auth_at: string | null;
  token_refreshed: boolean;
}

/** Get all currencies with their current api_name mapping. */
export async function getCurrencyMapping(): Promise<CurrencyMappingItem[]> {
  return apiFetch<CurrencyMappingItem[]>('/admin/currencies/mapping');
}

/** Bulk update mapping for multiple currencies. */
export async function updateBulkMapping(mapping: Record<string, string>): Promise<{ updated: number; total: number }> {
  return apiFetch('/admin/currencies/mapping', {
    method: 'PUT',
    body: JSON.stringify({ mapping }),
  });
}

/** Set or reset api_name for a single currency. */
export async function patchCurrencyMapping(currency: string, apiName: string | null): Promise<{ message: string; currency: string; api_name: string | null }> {
  return apiFetch(`/admin/currencies/${encodeURIComponent(currency)}/mapping`, {
    method: 'PATCH',
    body: JSON.stringify({ api_name: apiName }),
  });
}

/** Auto-map currencies from static mapping. force=true overwrites existing. */
export async function autoMapCurrencies(force = false): Promise<AutoMapResult> {
  const qs = force ? '?force=true' : '';
  return apiFetch(`/admin/currencies/auto-map${qs}`, {
    method: 'POST',
  });
}

export async function adminLookupTerminalAuth(
  payload: AdminTerminalLookupPayload,
): Promise<AdminTerminalLookupResult> {
  return apiFetch<AdminTerminalLookupResult>('/admin/terminal/lookup', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      refresh: payload.refresh ?? true,
    }),
  });
}

