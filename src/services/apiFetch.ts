/**
 * ═══════════════════════════════════════════════════════════════
 *  apiFetch — Authenticated fetch wrapper
 * ═══════════════════════════════════════════════════════════════
 *
 * Wraps the native `fetch()` and automatically attaches
 * `Authorization: Bearer <token>` from `authService`.
 *
 * Features:
 *   - In-flight request deduplication (same GET URL → single fetch)
 *   - Short-TTL response cache for quote endpoints
 *
 * Usage:
 *   const data = await apiFetch<MyType>('/currencies');
 *   const body = await apiFetch('/settings', { method: 'POST', body: JSON.stringify(payload) });
 */

import { authService } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/* ─── In-flight dedup & TTL cache ─── */

const inflight = new Map<string, Promise<unknown>>();

interface CacheEntry { data: unknown; ts: number }
const cache = new Map<string, CacheEntry>();

/** Default cache TTL per endpoint pattern (ms). */
const CACHE_TTL: [RegExp, number][] = [
  [/\/quotes\/current\//, 3_000],   // current candles: 3 s
  [/\/quotes\/history\//, 10_000],  // historical candles: 10 s
  [/\/quotes\/latest\//, 2_000],    // latest price: 2 s
  [/\/currencies($|\?)/, 30_000],   // currency list: 30 s
  [/\/currencies\/categories/, 60_000],
];

function getCacheTtl(url: string): number {
  for (const [re, ttl] of CACHE_TTL) {
    if (re.test(url)) return ttl;
  }
  return 0; // no cache by default
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const isGet = method === 'GET' && !init?.body;

  // ── Cache hit ──
  if (isGet) {
    const ttl = getCacheTtl(url);
    if (ttl > 0) {
      const hit = cache.get(url);
      if (hit && Date.now() - hit.ts < ttl) {
        return hit.data as T;
      }
    }

    // ── Dedup in-flight (skip if caller has its own AbortSignal) ──
    if (!init?.signal) {
      const existing = inflight.get(url);
      if (existing) return existing as Promise<T>;
    }
  }

  const token = authService.getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-set Content-Type for JSON bodies
  if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const doFetch = async (): Promise<T> => {
    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
      throw new Error(`API ${response.status}: ${response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) return undefined as T;

    const data: T = await response.json();

    // ── Populate cache ──
    if (isGet) {
      const ttl = getCacheTtl(url);
      if (ttl > 0) cache.set(url, { data, ts: Date.now() });
    }

    return data;
  };

  if (!isGet) return doFetch();

  // Wrap in dedup map (skip if caller has AbortSignal — they manage their own lifecycle)
  if (init?.signal) return doFetch();
  const promise = doFetch().finally(() => { inflight.delete(url); });
  inflight.set(url, promise);
  return promise;
}

/** Invalidate cache entries matching a pattern. */
export function invalidateCache(pattern?: RegExp): void {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (pattern.test(key)) cache.delete(key);
  }
}
