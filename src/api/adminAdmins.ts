/**
 * Admin Management API
 */

import { apiFetch, getApiBaseUrl } from '../services/apiFetch';

export interface AdminUser {
  id: string;
  user_id: number | null;
  terminal_user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  created_by: number;
}

export interface AdminSearchResult {
  tg: AdminSearchUserTg[];
  terminal: AdminSearchUserTerminal[];
}

export interface AdminSearchUserTg {
  type: 'tg';
  user_id: number;
  trader_id: number | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  bot_username: string | null;
  is_admin: boolean;
}

export interface AdminSearchUserTerminal {
  type: 'terminal';
  terminal_user_id: string;
  email: string;
  trader_id: number | null;
  is_confirmed: boolean;
  is_admin: boolean;
}

export type AdminSearchUser = AdminSearchUserTg | AdminSearchUserTerminal;

export interface AdminCreatePayload {
  user_id?: number;
  terminal_user_id?: string;
  permissions?: string[];
}

export interface AdminUpdatePayload {
  permissions?: string[];
  is_active?: boolean;
}

function getAdminBaseUrl(): string {
  return getApiBaseUrl().replace(/\/api\/?$/, '');
}

function adminAdminsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`${getAdminBaseUrl()}${path}`, init);
}

/** List all admins */
export async function listAdmins(): Promise<AdminUser[]> {
  return adminAdminsFetch<AdminUser[]>('/admin/admins');
}

/** Search users to grant admin rights */
export async function searchAdminUsers(
  q: string,
  type?: 'tg' | 'terminal',
  limit?: number,
): Promise<AdminSearchResult> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  return adminAdminsFetch<AdminSearchResult>(`/admin/admins/search?${params.toString()}`);
}

/** Create new admin */
export async function createAdmin(payload: AdminCreatePayload): Promise<AdminUser> {
  return adminAdminsFetch<AdminUser>('/admin/admins', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update admin permissions or active status */
export async function updateAdmin(id: string, payload: AdminUpdatePayload): Promise<AdminUser> {
  return adminAdminsFetch<AdminUser>(`/admin/admins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Delete admin (soft-delete: is_active = false) */
export async function deleteAdmin(id: string): Promise<{ ok: boolean }> {
  return adminAdminsFetch<{ ok: boolean }>(`/admin/admins/${id}`, {
    method: 'DELETE',
  });
}
