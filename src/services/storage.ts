/**
 * ═══════════════════════════════════════════════════════════════
 *  StorageService — Persistent user settings (localStorage + API)
 * ═══════════════════════════════════════════════════════════════
 *
 * ## Overview
 * Two-layer persistence: localStorage for instant access,
 * API for cross-device sync.  Reads prefer local → API fallback.
 * Writes go to both destinations simultaneously.
 *
 * ## Stored data (`UserSettings`)
 *
 * | Field               | Type                   | Description                             |
 * |---------------------|------------------------|-----------------------------------------|
 * | `charts`            | `ChartConfig[]`        | All open charts with their configs.     |
 * | `layoutId`          | `string`               | Currently active grid layout id.        |
 * | `locale`            | `string`               | UI language (ru/uk/en).                 |
 * | `favorites`         | `string[]`             | Currency names marked as favorite.      |
 *
 * ## API Endpoints (proposed)
 *
 * | Method | Path                        | Description                      |
 * |--------|-----------------------------|----------------------------------|
 * | GET    | `/user/settings`            | Fetch full user settings object. |
 * | PUT    | `/user/settings`            | Replace full user settings.      |
 * | PATCH  | `/user/settings/favorites`  | Update only favorites array.     |
 * | PATCH  | `/user/settings/charts`     | Update only charts array.        |
 * | PATCH  | `/user/settings/layout`     | Update only layout id.           |
 * | PATCH  | `/user/settings/locale`     | Update only locale.              |
 *
 * All endpoints require `Authorization: Bearer <token>` header.
 *
 * ## Methods
 *
 * | Method                           | Description                              |
 * |----------------------------------|------------------------------------------|
 * | `load()`                         | Load settings: local first, then API.    |
 * | `save(settings)`                 | Full save to local + API.                |
 * | `patchCharts(charts)`            | Save only charts portion.                |
 * | `patchLayout(layoutId)`          | Save only layout.                        |
 * | `patchFavorites(favorites)`      | Save only favorites.                     |
 * | `patchLocale(locale)`            | Save only locale.                        |
 * | `getFavorites()`                 | Quick read of favorites from memory.     |
 * | `toggleFavorite(currency)`       | Add / remove currency from favorites.    |
 * | `isFavorite(currency)`           | Check if currency is in favorites.       |
 */

import { apiFetch } from './apiFetch';
import { authService } from './auth';

/* ─── Types ─── */

export interface StoredChartConfig {
  id: string;
  currency?: string;
  timeframe: string;
  activeIndicators: Record<string, boolean>;
  indicatorParams: Record<string, Record<string, unknown>>;
}

export interface UserSettings {
  charts: StoredChartConfig[];
  layoutId: string;
  locale: string;
  favorites: string[];
  accountStatus: 'standard' | 'master' | 'guru' | 'vip' | 'vipElite';
}

const LOCAL_KEY = 'tc_user_settings';

const DEFAULT_SETTINGS: UserSettings = {
  charts: [],
  layoutId: '4-2x2',
  locale: 'ru',
  favorites: [],
  accountStatus: 'standard',
};

class StorageService {
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
  /** Sequential queue for API writes to prevent race conditions */
  private apiQueue: Promise<void> = Promise.resolve();

  /* ═══════ Read ═══════ */

  /**
   * Hydrate settings from batch API response (skips the GET /user/settings call).
   * Falls back to localStorage if remote is null/empty.
   */
  loadFromBatch(remote: UserSettings | null): UserSettings {
    // 1. Local first
    const local = this.readLocal();
    if (local) {
      this.settings = local;
    }

    // 2. Use batch-provided remote settings if available
    if (remote && (remote.charts?.length || remote.favorites?.length || (remote as any).account_status)) {
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...remote,
        accountStatus: (remote as any).account_status || remote.accountStatus || DEFAULT_SETTINGS.accountStatus,
      };
      this.writeLocal(this.settings);
    }

    return { ...this.settings };
  }

  /**
   * Load settings: try localStorage first, then try API.
   * Returns merged result.
   */
  async load(): Promise<UserSettings> {
    // 1. Local
    const local = this.readLocal();
    if (local) {
      this.settings = local;
    }

    // 2. API (if authenticated, try to fetch server-side settings)
    if (authService.isAuthenticated()) {
      try {
        const remote = await apiFetch<any>('/user/settings');
        if (remote && (remote.charts?.length || remote.favorites?.length || remote.account_status)) {
          this.settings = {
            ...DEFAULT_SETTINGS,
            ...remote,
            // Map snake_case from API to camelCase
            accountStatus: remote.account_status || DEFAULT_SETTINGS.accountStatus,
          };
          this.writeLocal(this.settings);
        }
      } catch (err) {
        console.warn('StorageService: API settings load failed, using local', err);
      }
    }

    return { ...this.settings };
  }

  /** Current in-memory snapshot. */
  get current(): UserSettings {
    return { ...this.settings };
  }

  /* ═══════ Write (full) ═══════ */

  async save(settings: UserSettings): Promise<void> {
    this.settings = { ...settings };
    this.writeLocal(this.settings);
    this.enqueueApi(() => this.pushToApi(this.settings));
  }

  /* ═══════ Partial writes ═══════ */

  async patchCharts(charts: StoredChartConfig[]): Promise<void> {
    this.settings.charts = charts;
    this.writeLocal(this.settings);
    this.enqueueApi(() => this.apiPatch('/user/settings/charts', { charts }));
  }

  async patchLayout(layoutId: string): Promise<void> {
    this.settings.layoutId = layoutId;
    this.writeLocal(this.settings);
    // Use full PUT — the PATCH endpoint for layout may not be supported
    this.enqueueApi(() => this.pushToApi(this.settings));
  }

  async patchFavorites(favorites: string[]): Promise<void> {
    this.settings.favorites = favorites;
    this.writeLocal(this.settings);
    this.enqueueApi(() => this.apiPatch('/user/settings/favorites', { favorites }));
  }

  async patchLocale(locale: string): Promise<void> {
    this.settings.locale = locale;
    this.writeLocal(this.settings);
    this.enqueueApi(() => this.apiPatch('/user/settings/locale', { locale }));
  }

  async patchAccountStatus(accountStatus: 'standard' | 'master' | 'guru' | 'vip' | 'vipElite'): Promise<void> {
    this.settings.accountStatus = accountStatus;
    this.writeLocal(this.settings);
    this.enqueueApi(() => this.apiPatch('/user/settings/account_status', { account_status: accountStatus }));
  }

  /* ═══════ Favorites helpers ═══════ */

  getFavorites(): string[] {
    return [...this.settings.favorites];
  }

  isFavorite(currency: string): boolean {
    return this.settings.favorites.includes(currency);
  }

  async toggleFavorite(currency: string): Promise<string[]> {
    const idx = this.settings.favorites.indexOf(currency);
    if (idx >= 0) {
      this.settings.favorites.splice(idx, 1);
    } else {
      this.settings.favorites.push(currency);
    }
    const copy = [...this.settings.favorites];
    this.writeLocal(this.settings);
    this.enqueueApi(() => this.apiPatch('/user/settings/favorites', { favorites: copy }));
    return copy;
  }

  /* ═══════ Account status helpers ═══════ */

  getAccountStatus(): 'standard' | 'master' | 'guru' | 'vip' | 'vipElite' {
    const local = this.readLocal();
    if (local?.accountStatus) {
      this.settings.accountStatus = local.accountStatus;
    }
    return this.settings.accountStatus ?? 'standard';
  }

  /* ═══════ Internal ═══════ */

  /** Enqueue an API operation to run sequentially (prevents race conditions) */
  private enqueueApi(fn: () => Promise<void>): void {
    this.apiQueue = this.apiQueue.then(fn).catch((err) => {
      console.warn('StorageService: queued API operation failed', err);
    });
  }

  private readLocal(): UserSettings | null {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as UserSettings;
    } catch {
      return null;
    }
  }

  private writeLocal(s: UserSettings): void {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    } catch { /* quota / private */ }
  }

  private async pushToApi(s: UserSettings): Promise<void> {
    if (!authService.isAuthenticated()) return;
    try {
      // Convert camelCase to snake_case for API
      const apiPayload = {
        ...s,
        account_status: s.accountStatus,
      };
      await apiFetch('/user/settings', {
        method: 'PUT',
        body: JSON.stringify(apiPayload),
      });
    } catch (err) {
      console.warn('StorageService: API save failed', err);
    }
  }

  private async apiPatch(path: string, body: unknown): Promise<void> {
    if (!authService.isAuthenticated()) return;
    try {
      await apiFetch(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.warn('StorageService: API patch failed', err);
    }
  }
}

export const storageService = new StorageService();
