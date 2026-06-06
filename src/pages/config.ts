/**
 * Shared configuration for all `/pages` marketing site.
 * Single source of truth for API base URLs, timeouts, and UI timings.
 */

/* ─── API ─── */

/** Base URL for the pages API (blog, auth, etc.). Trailing slash stripped. */
export const API_BASE = (
  (import.meta.env.VITE_PAGES_API_URL as string | undefined) ?? "https://api.po-terminal.com"
).replace(/\/+$/, "");

/** Google OAuth client id for public auth pages. Empty string disables Google auth UI. */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "97748907161-q2gfja8h7evbu9c0430bn8vgu4s4nc67.apps.googleusercontent.com";
/** localStorage key for the terminal JWT. */
export const TOKEN_KEY = "site-token";

/* ─── UI timings (ms) ─── */

/** Minimum time a skeleton / loading state stays visible to avoid flicker. */
export const MIN_SKELETON_MS = 1000;

/** Minimum time a form submit takes (spinner stays), avoids "instant" feel. */
export const MIN_SUBMIT_MS = 500;

/** Debounce delay for search inputs. */
export const SEARCH_DEBOUNCE_MS = 1500;

/* ─── Toast ─── */

/** Maximum simultaneously visible toasts (extras queue up). */
export const TOAST_LIMIT = 3;

/** Auto-close delay for success toasts (ms). */
export const TOAST_SUCCESS_MS = 3000;

/** Auto-close delay for error toasts (ms). */
export const TOAST_ERROR_MS = 4000;

/** Auto-close delay for info toasts (ms). */
export const TOAST_INFO_MS = 3000;

/* ─── Pagination ─── */

/** Default page size for blog list. */
export const BLOG_PER_PAGE = 15;

/* ─── UI design tokens (buttons / inputs) ───
 * Single source of truth for the pill-style controls used across
 * the marketing site. Change a value here → it applies everywhere.
 */

/** Unified height for all primary / secondary / dark buttons (px). */
export const BTN_HEIGHT_PX = 50;

/** Horizontal padding for the primary (accent) button (px). */
export const BTN_PX_PRIMARY = 32;

/** Horizontal padding for secondary / compact buttons (px). */
export const BTN_PX_COMPACT = 18;

/** Solid background color of the secondary button variant. */
export const BTN_SECONDARY_BG = "#222B37";
export const BTN_SECONDARY_BG_HOVER = "#2B3749";
/** Border used while the secondary button is pressed (active state). */
export const BTN_SECONDARY_BORDER_ACTIVE = "#80B2FF3D";

/** Solid background color of the dark button variant. */
export const BTN_DARK_BG = "#222222";
export const BTN_DARK_BG_HOVER = "#282828";

/** Unified input background & radius. */
export const INPUT_BG = "#171717";
export const INPUT_HEIGHT_PX = 50;
export const INPUT_RADIUS_PX = 40;

/**
 * Spread these props onto every `<input>` / `<textarea>` to disable browser
 * autocomplete / autofill / autocorrect and keyboard capitalisation.
 */
export const NO_AUTOCOMPLETE_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

/* ─── Animations ───
 * Master toggle for all decorative / scroll-reveal animations on
 * the marketing site. When `false`, the `.po-anim` class is NOT
 * added to the root `.po-pages` element — every animation rule in
 * `pages.css` is gated by `.po-anim` so it becomes a no-op.
 *
 * Core UI transitions (button hover, input focus, modal open) are
 * NOT gated by this flag — only decorative/motion effects.
 */
export const ENABLE_ANIMATIONS = true;

/* ─── Helpers ─── */

/**
 * Ensures an async operation takes at least `ms` milliseconds.
 * Useful for skeleton / submit button delays.
 *
 * ```ts
 * const data = await withMinDelay(fetchArticles(), MIN_SKELETON_MS);
 * ```
 */
export function withMinDelay<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.all([promise, new Promise((r) => setTimeout(r, ms))]).then(([v]) => v);
}
