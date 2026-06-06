/**
 * ═══════════════════════════════════════════════════════════════
 *  Custom Indicators API Client
 * ═══════════════════════════════════════════════════════════════
 *
 * CRUD operations for admin-managed custom indicators.
 *
 * | Method | Path                              | Description              |
 * |--------|-----------------------------------|--------------------------|
 * | GET    | /admin/indicators                 | List all custom indicators|
 * | GET    | /admin/indicators/:id             | Get single indicator     |
 * | POST   | /admin/indicators                 | Create indicator         |
 * | PUT    | /admin/indicators/:id             | Update indicator         |
 * | DELETE | /admin/indicators/:id             | Delete indicator         |
 * | GET    | /indicators/custom                | Public: list enabled     |
 */

import { apiFetch } from '../services/apiFetch';
import type { IndicatorParamMeta } from '../types/chart';

/* ─── Types ─── */

export interface CustomIndicatorParamMeta extends IndicatorParamMeta {
  // Same structure as built-in indicators
}

export type IndicatorVisibility = 'public' | 'private';

export interface CustomIndicatorDTO {
  /** Unique ID (mongo _id or slug) */
  id: string;
  /** Display name, e.g. "SR Zones Pro" */
  name: string;
  /** Short tag for badge, e.g. "SR" (2-4 chars) */
  tag: string;
  /** Badge color hex, e.g. "#ff9800" */
  color: string;
  /** JavaScript source code containing compute() function */
  code: string;
  /** Parameter definitions for settings UI */
  paramMeta: Record<string, CustomIndicatorParamMeta>;
  /** Default parameter values */
  defaultParams: Record<string, unknown>;
  /** Whether indicator is enabled (visible to all users) */
  enabled: boolean;
  /** Visibility: 'public' = all users, 'private' = admins only */
  visibility: IndicatorVisibility;
  /** Current version number */
  version?: number;
  /** Creation timestamp (ISO string) */
  createdAt?: string;
  /** Last update timestamp (ISO string) */
  updatedAt?: string;
}

/** A snapshot of a previous indicator version */
export interface IndicatorVersionDTO {
  id: string;
  indicatorId: string;
  version: number;
  name: string;
  code: string;
  paramMeta: Record<string, CustomIndicatorParamMeta>;
  defaultParams: Record<string, unknown>;
  /** Who saved this version */
  author?: string;
  /** Commit message / change description */
  message?: string;
  createdAt: string;
}

export interface CustomIndicatorCreate {
  name: string;
  tag: string;
  color: string;
  code: string;
  paramMeta: Record<string, CustomIndicatorParamMeta>;
  defaultParams: Record<string, unknown>;
  enabled: boolean;
  visibility?: IndicatorVisibility;
  /** Optional commit message for version history */
  versionMessage?: string;
}

export type CustomIndicatorUpdate = Partial<CustomIndicatorCreate>;

/* ─── Admin API (requires admin auth) ─── */

/** List all custom indicators (admin only). */
export async function listCustomIndicators(): Promise<CustomIndicatorDTO[]> {
  return apiFetch<CustomIndicatorDTO[]>('/admin/indicators');
}

/** Get single custom indicator by ID (admin only). */
export async function getCustomIndicator(id: string): Promise<CustomIndicatorDTO> {
  return apiFetch<CustomIndicatorDTO>(`/admin/indicators/${encodeURIComponent(id)}`);
}

/** Create a new custom indicator (admin only). */
export async function createCustomIndicator(data: CustomIndicatorCreate): Promise<CustomIndicatorDTO> {
  return apiFetch<CustomIndicatorDTO>('/admin/indicators', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Update existing custom indicator (admin only). */
export async function updateCustomIndicator(id: string, data: CustomIndicatorUpdate): Promise<CustomIndicatorDTO> {
  return apiFetch<CustomIndicatorDTO>(`/admin/indicators/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Delete custom indicator (admin only). */
export async function deleteCustomIndicator(id: string): Promise<void> {
  await apiFetch(`/admin/indicators/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ─── Public API (for all users) ─── */

/** Get all enabled custom indicators (public). */
export async function getEnabledCustomIndicators(): Promise<CustomIndicatorDTO[]> {
  return apiFetch<CustomIndicatorDTO[]>('/indicators/custom');
}

/* ─── Version History API (admin only) ─── */

/** List version history for an indicator. */
export async function listIndicatorVersions(indicatorId: string): Promise<IndicatorVersionDTO[]> {
  return apiFetch<IndicatorVersionDTO[]>(`/admin/indicators/${encodeURIComponent(indicatorId)}/versions`);
}

/** Restore a specific version (creates a new version with the old code). */
export async function restoreIndicatorVersion(indicatorId: string, versionId: string): Promise<CustomIndicatorDTO> {
  return apiFetch<CustomIndicatorDTO>(
    `/admin/indicators/${encodeURIComponent(indicatorId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST' },
  );
}

/* ─── Reset User Params API (admin only) ─── */

/** Reset all users' custom params for this indicator back to defaults. */
export async function resetIndicatorUserParams(indicatorId: string): Promise<{ resetCount: number }> {
  return apiFetch<{ resetCount: number }>(
    `/admin/indicators/${encodeURIComponent(indicatorId)}/reset-params`,
    { method: 'POST' },
  );
}
