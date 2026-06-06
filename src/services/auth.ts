/**
 * ═══════════════════════════════════════════════════════════════
 *  AuthService — Token-based authentication
 * ═══════════════════════════════════════════════════════════════
 *
 * ## Overview
 * Manages authentication via a `token` GET parameter.
 * On first load the token is extracted from the URL, stored in
 * localStorage, and the URL is cleaned (token removed).
 *
 * ## Methods
 *
 * | Method               | Description                                      |
 * |----------------------|--------------------------------------------------|
 * | `init()`             | Extract token from URL → store → clean URL.      |
 * | `getToken()`         | Return current token (localStorage or memory).    |
 * | `isAuthenticated()`  | `true` when a non-empty token exists.             |
 * | `isDevMode()`        | `true` when `VITE_IS_DEV_MODE` env var is truthy. |
 * | `logout()`           | Clear stored token.                               |
 *
 * ## Flow
 * 1. App calls `authService.init()` once at startup.
 * 2. If `?token=xxx` is in the URL → saved to localStorage, removed from URL.
 * 3. All API calls include `Authorization: Bearer <token>` header
 *    via `authService.getToken()`.
 * 4. If no token and not dev mode → show "auth required" stub.
 */

const STORAGE_KEY = 'tc_auth_token';
const FALLBACK_STORAGE_KEYS = ['site-token'];

class AuthService {
  private token: string | null = null;

  private persistToken(token: string): void {
    try { localStorage.setItem(STORAGE_KEY, token); } catch { /* private mode */ }
    for (const key of FALLBACK_STORAGE_KEYS) {
      try { localStorage.setItem(key, token); } catch { /* private mode */ }
    }
  }

  private readStoredToken(): string | null {
    try {
      const primary = localStorage.getItem(STORAGE_KEY);
      if (primary) return primary;

      for (const key of FALLBACK_STORAGE_KEYS) {
        const fallback = localStorage.getItem(key);
        if (fallback) {
          try { localStorage.setItem(STORAGE_KEY, fallback); } catch { /* private mode */ }
          return fallback;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Initialize: extract token from URL query, persist, clean URL.
   * Should be called once at app bootstrap before any API calls.
   */
  init(): void {
    // 1. Check URL for ?token=...
    const url = new URL(window.location.href);
    const urlToken = url.searchParams.get('token');

    if (urlToken) {
      this.token = urlToken;
      this.persistToken(urlToken);

      // Remove token from URL without reload
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
      return;
    }

    // 2. Fall back to localStorage
    this.token = this.readStoredToken();
  }

  /** Current auth token (may be null). */
  getToken(): string | null {
    if (!this.token) {
      this.token = this.readStoredToken();
    }
    return this.token;
  }

  /** Whether user has a valid token. */
  isAuthenticated(): boolean {
    if (!this.token) {
      this.token = this.readStoredToken();
    }
    return !!this.token;
  }

  /** Whether the app runs in development/demo mode (no auth required). */
  isDevMode(): boolean {
    const val = import.meta.env.VITE_IS_DEV_MODE;
    return val === 'true' || val === '1' || val === true;
  }

  /** Programmatically set a token (e.g. after Telegram auth). */
  setToken(token: string): void {
    this.token = token;
    this.persistToken(token);
  }

  /** Clear stored token. */
  logout(): void {
    this.token = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    for (const key of FALLBACK_STORAGE_KEYS) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }
}

export const authService = new AuthService();
