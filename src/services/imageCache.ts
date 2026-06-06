/**
 * In-memory image cache: fetches icon images once and stores them as blob URLs.
 * This prevents repeated HTTP requests every time the currency selector opens.
 *
 * Usage:
 *   preloadIcons(['/icons/crypto.png', '/icons/forex.png'])
 *   getCachedIconUrl('/icons/crypto.png')  // returns blob: URL or null
 */

import { getApiBaseUrl } from './apiFetch';

/** Build the full URL for an icon path (avoids circular dep with icons.tsx). */
function buildIconUrl(iconPath: string): string {
  return `${getApiBaseUrl().replace(/\/api\/?$/, '')}${iconPath}`;
}

/** iconPath ("/icons/xxx") → blob URL */
const cache = new Map<string, string>();

/** Paths currently being fetched (to avoid duplicate requests) */
const pending = new Set<string>();

/** Paths that failed to load */
const failed = new Set<string>();

/** Returns the cached blob URL for an icon path, or null if not yet cached. */
export function getCachedIconUrl(iconPath: string): string | null {
  return cache.get(iconPath) ?? null;
}

/** Preload a batch of icon paths (fire-and-forget). Max 8 concurrent fetches. */
export async function preloadIcons(iconPaths: string[]): Promise<void> {
  const toFetch = iconPaths.filter(
    (p) => p && p.startsWith('/icons/') && !cache.has(p) && !pending.has(p) && !failed.has(p),
  );
  if (toFetch.length === 0) return;

  const CONCURRENCY = 8;
  let i = 0;

  async function worker(): Promise<void> {
    while (i < toFetch.length) {
      const path = toFetch[i++];
      pending.add(path);
      try {
        const url = buildIconUrl(path);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        cache.set(path, blobUrl);
      } catch {
        failed.add(path);
      } finally {
        pending.delete(path);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, worker));
}

/** Extract all /icons/ paths from a list of currencies + categories. */
export function collectIconPaths(
  currencies: Array<{ icon?: string | null; category_icon?: string | null }>,
  categories: Array<{ icon?: string | null }> = [],
): string[] {
  const seen = new Set<string>();
  const collect = (v: string | null | undefined) => {
    if (v && v.startsWith('/icons/') && !seen.has(v)) seen.add(v);
  };
  currencies.forEach((c) => { collect(c.icon); collect(c.category_icon); });
  categories.forEach((c) => collect(c.icon));
  return [...seen];
}
