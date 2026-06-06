/**
 * ═══════════════════════════════════════════════════════════════
 *  TradingView Charting Library — Datafeed Adapter
 * ═══════════════════════════════════════════════════════════════
 *
 * Bridges the existing API (currencies.ts, socket.ts) to the
 * TradingView Charting Library IBasicDataFeed interface.
 */

import type {
  IBasicDataFeed,
  DatafeedConfiguration,
  LibrarySymbolInfo,
  ResolutionString,
  Bar,
  PeriodParams,
  OnReadyCallback,
  ResolveCallback,
  HistoryCallback,
  SubscribeBarsCallback,
  SearchSymbolsCallback,
  DatafeedErrorCallback,
  SearchSymbolResultItem,
  Timezone,
  SymbolResolveExtension,
  ServerTimeCallback,
} from 'charting_library';
import { getHistoricalData, getCurrencies, getCurrentCandles } from '../api/currencies';
import type { Currency, Candle } from '../api/currencies';
import { batchCharts, type BatchChartData } from '../api/batch';
import { socketService, type PriceUpdate, type CandleClosed } from '../api/socket';
import { betterSocket } from '../api/betterSocket';

/* ─── Resolution ↔ Timeframe mapping ─── */

const RESOLUTION_TO_TF: Record<string, string> = {
  '5S': 'S5',
  '30S': 'S30',
  '1': 'M1',
  '2': 'M2',
  '3': 'M3',
  '5': 'M5',
  '15': 'M15',
  '30': 'M30',
  '60': 'H1',
};

const TF_TO_RESOLUTION: Record<string, string> = Object.fromEntries(
  Object.entries(RESOLUTION_TO_TF).map(([k, v]) => [v, k]),
);

export function resolutionToTimeframe(resolution: string): string {
  return RESOLUTION_TO_TF[resolution] || 'M1';
}

export function timeframeToResolution(tf: string): string {
  return TF_TO_RESOLUTION[tf] || '1';
}

/** Seconds per timeframe (for candle-time math) */
export function getTimeframeSeconds(tf: string): number {
  const map: Record<string, number> = {
    S5: 5, S30: 30,
    M1: 60, M2: 120, M3: 180, M5: 300,
    M15: 900, M30: 1800,
    H1: 3600,
  };
  return map[tf] || 60;
}

/** Align a timestamp (ms) to the candle-period grid */
function alignBarTime(timeMs: number, tfSecs: number): number {
  const step = tfSecs * 1000;
  return Math.floor(timeMs / step) * step;
}

/** Detect decimal precision from candle data */
function detectPrecision(candles: Candle[]): number {
  let maxDecimals = 2;
  const sample = candles.slice(-100);
  for (const c of sample) {
    for (const val of [c.open, c.high, c.low, c.close]) {
      const str = val.toString();
      const dot = str.indexOf('.');
      if (dot >= 0) {
        const d = str.length - dot - 1;
        if (d > maxDecimals) maxDecimals = d;
      }
    }
  }
  return Math.min(maxDecimals, 8);
}

function countDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = value.toString();
  const dotIndex = text.indexOf('.');
  return dotIndex >= 0 ? Math.max(0, text.length - dotIndex - 1) : 0;
}

function buildSyntheticVolume(open: number, high: number, low: number, close: number): number {
  const decimals = Math.min(6, Math.max(
    countDecimals(open),
    countDecimals(high),
    countDecimals(low),
    countDecimals(close),
  ));
  const scale = Math.pow(10, decimals);
  const range = Math.abs(high - low);
  const body = Math.abs(close - open);
  const proxy = Math.round((range + body) * scale);
  return Math.max(1, proxy);
}

function normalizeBarVolume(rawVolume: unknown, open: number, high: number, low: number, close: number): number {
  const numeric = Number(rawVolume);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return buildSyntheticVolume(open, high, low, close);
}

function normalizeVolumeIncrement(rawVolume: unknown): number {
  const numeric = Number(rawVolume);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return 1;
}

/* ─── Timezone auto-detection ─── */

const TV_TIMEZONES: string[] = [
  'Etc/UTC',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Tunis',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Caracas', 'America/Chicago',
  'America/El_Salvador', 'America/Juneau', 'America/Lima', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo', 'America/Toronto', 'America/Vancouver',
  'Asia/Almaty', 'Asia/Ashkhabad', 'Asia/Bahrain', 'Asia/Bangkok', 'Asia/Chongqing', 'Asia/Colombo', 'Asia/Dhaka',
  'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kabul', 'Asia/Karachi',
  'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Kuwait', 'Asia/Manila', 'Asia/Muscat', 'Asia/Nicosia',
  'Asia/Qatar', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Tehran',
  'Asia/Tokyo', 'Asia/Yangon',
  'Atlantic/Azores', 'Atlantic/Reykjavik',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin', 'Europe/Bratislava', 'Europe/Brussels',
  'Europe/Bucharest', 'Europe/Budapest', 'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Helsinki', 'Europe/Istanbul',
  'Europe/Lisbon', 'Europe/London', 'Europe/Luxembourg', 'Europe/Madrid', 'Europe/Malta', 'Europe/Moscow',
  'Europe/Oslo', 'Europe/Paris', 'Europe/Prague', 'Europe/Riga', 'Europe/Rome', 'Europe/Stockholm',
  'Europe/Tallinn', 'Europe/Vienna', 'Europe/Vilnius', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fakaofo', 'Pacific/Honolulu', 'Pacific/Norfolk',
  'US/Mountain',
];

/** Map aliases (e.g. Europe/Kiev → Europe/Kyiv) to TV-supported zones */
const TZ_ALIASES: Record<string, string> = {
  'Europe/Kyiv': 'Europe/Athens',     // UTC+2 / UTC+3
  'Europe/Kiev': 'Europe/Athens',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Pacific': 'America/Los_Angeles',
  'US/Mountain': 'US/Mountain',
};

function getUtcOffsetMinutes(tz: string): number {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(now);
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);

    const utcParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Etc/UTC',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(now);
    const uh = Number(utcParts.find(p => p.type === 'hour')?.value ?? 0);
    const um = Number(utcParts.find(p => p.type === 'minute')?.value ?? 0);

    let diff = (h * 60 + m) - (uh * 60 + um);
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    return diff;
  } catch {
    return 0;
  }
}

/** Detect the browser timezone and map to the closest TradingView-supported timezone */
export function detectBrowserTimezone(): string {
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Direct match
    if (TV_TIMEZONES.includes(browserTz)) return browserTz;

    // Check aliases
    if (TZ_ALIASES[browserTz]) return TZ_ALIASES[browserTz];

    // Fallback: find closest by offset
    const browserOffset = getUtcOffsetMinutes(browserTz);
    let bestTz = 'Etc/UTC';
    let bestDiff = Infinity;
    for (const tz of TV_TIMEZONES) {
      const diff = Math.abs(getUtcOffsetMinutes(tz) - browserOffset);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestTz = tz;
      }
      if (diff === 0) break;
    }
    return bestTz;
  } catch {
    return 'Etc/UTC';
  }
}

/* ─── Subscription management ─── */

interface Subscription {
  symbolInfo: LibrarySymbolInfo;
  resolution: string;
  onTick: SubscribeBarsCallback;
  listenerGuid: string;
  currency: string;
  timeframe: string;
  lastBarTime: number;
  lastTickReceived: number;
  resetCount: number;
  unsubCandle: () => void;
  unsubPrice: () => void;
  onResetCacheNeeded: () => void;
}

interface TVDatafeedOptions {
  realtime?: boolean;
  snapshotTimeSec?: number | null;
  historyBars?: number;
}

/* ─── Bar cache ─── */
export type CachedBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

type BarsLoadedCallback = (currency: string, timeframe: string, bars: CachedBar[]) => void;

/**
 * Module-level prefetched batch data shared across all TVDatafeed instances.
 * Key: "CURRENCY:TF", consumed once per getBars call.
 */
const globalPrefetchedData = new Map<string, BatchChartData>();
const sharedHistoryRequests = new Map<string, Promise<Candle[]>>();
const snapshotHistoryCache = new Map<string, Candle[]>();
const sharedCurrentCandleRequests = new Map<string, Promise<Record<string, Candle> | null>>();

function buildHistoryRequestKey(currency: string, timeframe: string, limit: number, before?: number): string {
  return `${currency}:${timeframe}:${limit}:${before ?? 'latest'}`;
}

function loadHistoryOnce(
  currency: string,
  timeframe: string,
  limit: number,
  before: number | undefined,
  persistResult: boolean,
): Promise<Candle[]> {
  const key = buildHistoryRequestKey(currency, timeframe, limit, before);

  if (persistResult) {
    const cached = snapshotHistoryCache.get(key);
    if (cached) return Promise.resolve(cached);
  }

  const inFlight = sharedHistoryRequests.get(key);
  if (inFlight) return inFlight;

  const request = getHistoricalData(currency, timeframe, limit, before ? { before } : undefined)
    .then((candles) => {
      if (persistResult) {
        snapshotHistoryCache.set(key, candles);
      }
      return candles;
    })
    .finally(() => {
      sharedHistoryRequests.delete(key);
    });

  sharedHistoryRequests.set(key, request);
  return request;
}

function loadCurrentCandlesOnce(currency: string): Promise<Record<string, Candle> | null> {
  const cached = sharedCurrentCandleRequests.get(currency);
  if (cached) return cached;

  const request = getCurrentCandles(currency)
    .catch(() => null)
    .finally(() => {
      sharedCurrentCandleRequests.delete(currency);
    });

  sharedCurrentCandleRequests.set(currency, request);
  return request;
}

/**
 * Prefetch chart data for multiple charts in a single batch request.
 * Call during bootstrap so that individual getBars() calls serve from cache.
 */
export async function prefetchCharts(
  charts: Array<{ currency: string; timeframe: string; limit?: number }>,
): Promise<void> {
  if (charts.length === 0) return;
  try {
    const resp = await batchCharts(charts);
    if (resp.charts) {
      for (const [key, data] of Object.entries(resp.charts)) {
        globalPrefetchedData.set(key, data);
      }
    }
  } catch (err) {
    console.warn('[TVDatafeed] Batch charts prefetch failed, will fall back to individual requests', err);
  }
}

/* ═══════════════════════════════════════════════════════════════ */

export class TVDatafeed implements IBasicDataFeed {
  private subscriptions = new Map<string, Subscription>();
  private currencyCache: Currency[] = [];
  private barCache = new Map<string, CachedBar[]>(); // key = "SYMBOL:TF"
  private barsLoadedListeners = new Set<BarsLoadedCallback>();
  private precisionCache = new Map<string, number>();
  private unsubConnectionChange: (() => void) | null = null;
  private wasDisconnected = false;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private readonly realtime: boolean;
  private readonly snapshotTimeSec: number | null;
  private readonly historyBars: number | null;
  private static readonly STALE_THRESHOLD_MS = 10_000; // 10 seconds

  constructor(options?: TVDatafeedOptions) {
    this.realtime = options?.realtime !== false;
    this.snapshotTimeSec = Number.isFinite(options?.snapshotTimeSec)
      ? Math.max(1, Math.floor(options?.snapshotTimeSec as number))
      : null;
    this.historyBars = Number.isFinite(options?.historyBars)
      ? Math.max(1, Math.floor(options?.historyBars as number))
      : null;

    if (!this.realtime) return;

    // Listen for socket reconnection to force chart data refresh
    this.unsubConnectionChange = socketService.onConnectionChange((connected) => {
      if (!connected) {
        this.wasDisconnected = true;
        return;
      }
      if (this.wasDisconnected) {
        this.wasDisconnected = false;
        console.log('[TVDatafeed] Socket reconnected — re-subscribing currencies for active subscriptions');
        // Re-subscribe all active currencies to ensure server sends data
        for (const sub of this.subscriptions.values()) {
          socketService.subscribeToCurrency(sub.currency);
        }
        // NOTE: Do NOT clear barCache or call onResetCacheNeeded here.
        // TVChart's visibility handler will call resetData() which triggers
        // the full unsubscribeBars→subscribeBars→getBars cycle.
        // Clearing cache here causes a race condition where getBars data
        // gets wiped before the chart can render it.
      }
    });
  }

  /** Cleanup connection listener */
  destroy(): void {
    this.unsubConnectionChange?.();
    this.unsubConnectionChange = null;
    this.stopWatchdog();
  }

  /** Start the stale-data watchdog (runs every 5s) */
  private startWatchdog(): void {
    if (!this.realtime) return;
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      if (!socketService.isConnected()) return; // don't reset while offline
      if (document.hidden) return; // don't burn retries while tab is hidden
      const now = Date.now();
      for (const sub of this.subscriptions.values()) {
        const elapsed = now - sub.lastTickReceived;
        if (elapsed > TVDatafeed.STALE_THRESHOLD_MS) {
          // Max 3 auto-resets per subscription to avoid infinite loop
          if (sub.resetCount >= 3) continue;
          sub.resetCount++;
          console.warn(
            `[TVDatafeed] Stale subscription: ${sub.currency}:${sub.timeframe} — no ticks for ${Math.round(elapsed / 1000)}s, resetting (attempt ${sub.resetCount})`,
          );
          // Re-subscribe on socket level to ensure server sends us data
          socketService.subscribeToCurrency(sub.currency);
          // Clear stale bar data and tell TV library to re-fetch
          const cacheKey = `${sub.currency}:${sub.timeframe}`;
          this.barCache.delete(cacheKey);
          sub.lastTickReceived = now; // prevent immediate re-trigger
          try { sub.onResetCacheNeeded(); } catch { /* ignore */ }
        }
      }
    }, 5_000);
  }

  /** Stop the watchdog */
  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /** Subscribe to bar-loaded events (for custom overlay indicators) */
  onBarsLoaded(cb: BarsLoadedCallback): () => void {
    this.barsLoadedListeners.add(cb);
    return () => this.barsLoadedListeners.delete(cb);
  }

  /** Get cached bars for a symbol+timeframe */
  getCachedBars(currency: string, timeframe: string): CachedBar[] {
    return this.barCache.get(`${currency}:${timeframe}`) || [];
  }

  /** Get the last close price from bar cache (for health checks) */
  getLastClose(currency: string, timeframe: string): number | null {
    const bars = this.barCache.get(`${currency}:${timeframe}`);
    return bars && bars.length > 0 ? bars[bars.length - 1].close : null;
  }

  /** Get last bar info for diagnostics */
  getLastBarInfo(currency: string, timeframe: string): { time: number; close: number; count: number } | null {
    const bars = this.barCache.get(`${currency}:${timeframe}`);
    if (!bars || bars.length === 0) return null;
    const last = bars[bars.length - 1];
    return { time: last.time, close: last.close, count: bars.length };
  }

  /** Get subscription diagnostics */
  getSubscriptionInfo(): Array<{ currency: string; timeframe: string; lastTick: number; resetCount: number }> {
    const result: Array<{ currency: string; timeframe: string; lastTick: number; resetCount: number }> = [];
    for (const sub of this.subscriptions.values()) {
      result.push({
        currency: sub.currency,
        timeframe: sub.timeframe,
        lastTick: sub.lastTickReceived,
        resetCount: sub.resetCount,
      });
    }
    return result;
  }

  /** Force-reset a specific subscription (re-subscribe + clear cache + resetCacheNeeded) */
  forceReset(currency: string, timeframe: string): boolean {
    for (const sub of this.subscriptions.values()) {
      if (sub.currency === currency && sub.timeframe === timeframe) {
        socketService.subscribeToCurrency(currency);
        const cacheKey = `${currency}:${timeframe}`;
        this.barCache.delete(cacheKey);
        sub.lastTickReceived = Date.now();
        sub.resetCount = 0;
        try { sub.onResetCacheNeeded(); } catch { /* ignore */ }
        return true;
      }
    }
    return false;
  }

  /** Reset watchdog retry counts for a specific subscription (allows watchdog to work again) */
  resetWatchdogCounts(currency: string, timeframe: string): void {
    for (const sub of this.subscriptions.values()) {
      if (sub.currency === currency && sub.timeframe === timeframe) {
        sub.resetCount = 0;
        sub.lastTickReceived = Date.now();
      }
    }
  }

  /** Get cached precision for a symbol */
  getPrecision(currency: string): number {
    return this.precisionCache.get(currency) ?? 2;
  }

  /* ─── IBasicDataFeed ─── */

  onReady(callback: OnReadyCallback): void {
    setTimeout(() => {
      const config: DatafeedConfiguration = {
        supported_resolutions: [
          '5S', '30S', '1', '2', '3', '5', '15', '30', '60', '1D',
        ] as ResolutionString[],
        exchanges: [],
        symbols_types: [{ name: 'crypto', value: 'crypto' }],
        supports_marks: false,
        supports_time: true,
        supports_timescale_marks: false,
      };
      callback(config);
    }, 0);
  }

  async searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResult: SearchSymbolsCallback,
  ): Promise<void> {
    try {
      if (this.currencyCache.length === 0) {
        this.currencyCache = await getCurrencies();
      }
      const q = userInput.toLowerCase();
      const results: SearchSymbolResultItem[] = this.currencyCache
        .filter((c) => c.currency.toLowerCase().includes(q))
        .slice(0, 30)
        .map((c) => ({
          symbol: c.currency,
          full_name: c.currency,
          description: `${c.category} — ${c.currency}`,
          exchange: 'PO',
          ticker: c.currency,
          type: 'crypto',
        }));
      onResult(results);
    } catch {
      onResult([]);
    }
  }

  resolveSymbol(
    symbolName: string,
    onResolve: ResolveCallback,
    _onResolveError: DatafeedErrorCallback,
    _extension?: SymbolResolveExtension,
  ): void {
    const cached = this.precisionCache.get(symbolName);
    // TradingView requires resolveSymbol callbacks to run asynchronously.
    // Precision will still be refined after the first getBars response.
    setTimeout(() => {
      this._resolveWithPrecision(symbolName, cached ?? 5, onResolve);
    }, 0);
  }

  private _resolveWithPrecision(symbolName: string, precision: number, onResolve: ResolveCallback): void {
    // On mobile, cap precision to reduce price axis width
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 600;
    const effectivePrecision = isMobile ? Math.min(precision, 4) : precision;
    const pricescale = Math.pow(10, effectivePrecision);
    const symbolInfo: LibrarySymbolInfo = {
      name: symbolName,
      ticker: symbolName,
      description: symbolName,
      type: 'crypto',
      session: '24x7',
      exchange: 'PO',
      listed_exchange: 'PO',
      timezone: detectBrowserTimezone() as Timezone,
      format: 'price',
      pricescale,
      minmov: 1,
      has_intraday: true,
      has_seconds: true,
      has_daily: true,
      seconds_multipliers: ['5', '30'],
      intraday_multipliers: ['1', '2', '3', '5', '15', '30', '60'],
      supported_resolutions: [
        '5S', '30S', '1', '2', '3', '5', '15', '30', '60', '1D',
      ] as ResolutionString[],
      visible_plots_set: 'ohlcv',
      volume_precision: 2,
      data_status: this.realtime ? 'streaming' : 'endofday',
    };
    onResolve(symbolInfo);
  }

  /** Server time for countdown calibration */
  getServerTime(callback: ServerTimeCallback): void {
    if (socketService.hasServerTimeOffset()) {
      callback(Math.floor(socketService.getServerNowMs() / 1000));
      return;
    }

    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      unsubscribe();
      const fallbackMs = socketService.hasServerTimeOffset()
        ? socketService.getServerNowMs()
        : betterSocket.getServerNowMs();
      callback(Math.floor(fallbackMs / 1000));
    };

    const unsubscribe = socketService.onServerTimeOffsetChange(() => {
      finish();
    });
    const timeoutId = window.setTimeout(() => {
      finish();
    }, 1500);
  }

  async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    _onError: DatafeedErrorCallback,
  ): Promise<void> {
    const currency = symbolInfo.ticker || symbolInfo.name;
    const tf = resolutionToTimeframe(resolution as string);
    const { to, countBack, firstDataRequest } = periodParams;
    const requestedLimit = firstDataRequest ? Math.min(countBack || 300, 300) : (countBack || 500);
    const limit = this.historyBars ? Math.min(requestedLimit, this.historyBars) : requestedLimit;
    const tfSecs = getTimeframeSeconds(tf);
    const cacheKey = `${currency}:${tf}`;
    console.log(`[TVDatafeed] getBars called: ${currency}:${tf} first=${firstDataRequest} countBack=${countBack} to=${to}`);

    try {
      // TV may pass `to` in seconds or milliseconds depending on the version.
      // Normalise: if > 1e10, it's ms — convert to seconds for the API.
      const normalizedTo = to > 1e10 ? Math.floor(to / 1000) : to;
      const snapshotBarOpenMs = this.snapshotTimeSec != null
        ? alignBarTime(this.snapshotTimeSec * 1000, tfSecs)
        : null;
      const snapshotBarEndSec = snapshotBarOpenMs != null
        ? Math.floor(snapshotBarOpenMs / 1000) + tfSecs
        : null;
      const beforeTs = this.snapshotTimeSec
        ? Math.min(normalizedTo || snapshotBarEndSec || this.snapshotTimeSec, snapshotBarEndSec || this.snapshotTimeSec)
        : normalizedTo;

      // Timeout to prevent TV library hanging indefinitely on slow API
      const timeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Request timeout')), ms))]);

      // Check prefetched batch data first (first request only)
      const prefetchKey = `${currency}:${tf}`;
      const prefetched = firstDataRequest ? globalPrefetchedData.get(prefetchKey) : null;

      let raw: Candle[];
      let currentCandles: Record<string, Candle> | null = null;

      if (prefetched) {
        // Use batch-prefetched data
        raw = prefetched.history || [];
        currentCandles = prefetched.current || null;
        globalPrefetchedData.delete(prefetchKey); // consume once
      } else {
        // Fallback: individual requests
        const historyPromise = timeout(
          loadHistoryOnce(currency, tf, limit, beforeTs, !this.realtime),
          15_000,
        );
        const currentPromise = firstDataRequest
          ? timeout(loadCurrentCandlesOnce(currency), 10_000).catch(() => null)
          : null;

        raw = await historyPromise;
        currentCandles = currentPromise ? await currentPromise : null;
      }

      if (raw.length === 0) {
        const cachedBars = this.barCache.get(cacheKey) || [];
        if (!firstDataRequest && cachedBars.length > 0) {
          this.barsLoadedListeners.forEach((cb) => cb(currency, tf, cachedBars));
        } else {
          this.barCache.delete(cacheKey);
          this.barsLoadedListeners.forEach((cb) => cb(currency, tf, []));
        }
        onResult([], { noData: true });
        return;
      }

      // Detect precision on first request
      if (firstDataRequest) {
        const prec = detectPrecision(raw);
        this.precisionCache.set(currency, prec);
      }

      const bars: Bar[] = raw
        .map((c) => ({
          time: alignBarTime(new Date(c.open_time).getTime(), tfSecs) as number,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: normalizeBarVolume(c.volume, c.open, c.high, c.low, c.close),
        }))
        .filter((bar) => snapshotBarOpenMs == null || bar.time <= snapshotBarOpenMs);

      // Merge the current (forming) candle
      if (currentCandles) {
        const currentCandle = currentCandles[tf];
        if (currentCandle) {
          const currentBar: Bar = {
            time: alignBarTime(new Date(currentCandle.open_time).getTime(), tfSecs),
            open: currentCandle.open,
            high: currentCandle.high,
            low: currentCandle.low,
            close: currentCandle.close,
            volume: normalizeBarVolume(
              currentCandle.volume,
              currentCandle.open,
              currentCandle.high,
              currentCandle.low,
              currentCandle.close,
            ),
          };
          const existIdx = bars.findIndex(b => b.time === currentBar.time);
          if (existIdx >= 0) {
            bars[existIdx] = currentBar;
          } else if (snapshotBarOpenMs == null || currentBar.time <= snapshotBarOpenMs) {
            bars.push(currentBar);
          }
        }
      }

      // Sort ascending
      bars.sort((a, b) => a.time - b.time);

      // No client-side from/to filtering — the API already constrains data
      // via `before` (upper bound) and `limit` (count). Filtering here was
      // fragile because TV may pass from/to in seconds OR milliseconds
      // depending on the library version, causing all bars to be dropped.

      // Update bar cache
      const existing = this.barCache.get(cacheKey) || [];
      const merged = this.mergeBars(existing, bars);
      this.barCache.set(cacheKey, merged);
      console.log(`[TVDatafeed] getBars result: ${currency}:${tf} → ${bars.length} bars (cache now ${merged.length})`);

      // Notify listeners
      this.barsLoadedListeners.forEach((cb) => cb(currency, tf, merged));

      onResult(bars, { noData: bars.length === 0 });
    } catch (err) {
      console.error(`[TVDatafeed] getBars ERROR: ${currency}:${tf}`, err);
      _onError(String(err));
    }
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    onResetCacheNeeded: () => void,
  ): void {
    if (!this.realtime) {
      console.log(`[TVDatafeed] subscribeBars skipped in snapshot mode: ${(symbolInfo.ticker || symbolInfo.name)}:${resolutionToTimeframe(resolution as string)} guid=${listenerGuid}`);
      return;
    }

    const currency = symbolInfo.ticker || symbolInfo.name;
    const tf = resolutionToTimeframe(resolution as string);
    console.log(`[TVDatafeed] subscribeBars: ${currency}:${tf} guid=${listenerGuid}`);
    const tfSecs = getTimeframeSeconds(tf);
    const cacheKey = `${currency}:${tf}`;
    const cached = this.barCache.get(cacheKey) || [];
    let lastBarTime = cached.length > 0 ? cached[cached.length - 1].time : 0;
    const subRef = { lastTickReceived: Date.now(), resetCount: 0, droppedTicks: 0 };

    // Subscribe to candle_closed events
    const unsubCandle = socketService.onCandleClosed(currency, (data: CandleClosed) => {
      if (data.timeframe !== tf) return;
      subRef.lastTickReceived = Date.now();
      subRef.resetCount = 0; // successful tick → allow future resets

      const bar: Bar = {
        time: alignBarTime(new Date(data.open_time).getTime(), tfSecs),
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: normalizeBarVolume(data.volume, data.open, data.high, data.low, data.close),
      };

      // Update cache
      const bars = this.barCache.get(cacheKey) || [];
      const lastIdx = bars.length - 1;
      if (lastIdx >= 0 && bars[lastIdx].time === bar.time) {
        bars[lastIdx] = bar;
      } else {
        bars.push(bar);
      }
      this.barCache.set(cacheKey, bars);

      lastBarTime = bar.time;
      onTick(bar);

      // Notify overlay indicators
      this.barsLoadedListeners.forEach((cb) => cb(currency, tf, bars));
    });

    // Subscribe to price_update events (real-time tick updates)
    const unsubPrice = socketService.onPriceUpdate(currency, (data: PriceUpdate) => {
      subRef.lastTickReceived = Date.now();
      subRef.resetCount = 0; // successful tick → allow future resets
      const tickTime = Math.floor(new Date(data.timestamp).getTime());
      const candleTimeMs = Math.floor(tickTime / (tfSecs * 1000)) * (tfSecs * 1000);

      const bars = this.barCache.get(cacheKey) || [];
      if (bars.length === 0) {
        // Cache empty (e.g. after reconnect) — seed with a new bar so ticks aren't dropped
        const seedBar: Bar = {
          time: candleTimeMs,
          open: data.price,
          high: data.price,
          low: data.price,
          close: data.price,
          volume: normalizeVolumeIncrement(data.volume),
        };
        this.barCache.set(cacheKey, [seedBar]);
        lastBarTime = seedBar.time;
        onTick(seedBar);
        return;
      }

      const last = bars[bars.length - 1];

      if (last.time === candleTimeMs) {
        // Update current candle
        subRef.droppedTicks = 0;
        const updated: Bar = {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, data.price),
          low: Math.min(last.low, data.price),
          close: data.price,
          volume: (last.volume ?? 0) + normalizeVolumeIncrement(data.volume),
        };
        bars[bars.length - 1] = updated;
        onTick(updated);
      } else if (candleTimeMs > last.time) {
        // New candle
        subRef.droppedTicks = 0;
        const newBar: Bar = {
          time: candleTimeMs,
          open: data.price,
          high: data.price,
          low: data.price,
          close: data.price,
          volume: normalizeVolumeIncrement(data.volume),
        };
        bars.push(newBar);
        this.barCache.set(cacheKey, bars);
        lastBarTime = newBar.time;
        onTick(newBar);
      } else {
        // candleTimeMs < last.time — tick time is behind the cache.
        // This happens when candle_closed pushed a newer bar but price_update
        // still refers to the previous candle period. The price IS current,
        // so update the latest bar's close to keep the chart alive.
        subRef.droppedTicks = (subRef.droppedTicks || 0) + 1;
        if (subRef.droppedTicks <= 3) {
          // For the first few mismatched ticks, just update close on latest bar
          const patched: Bar = {
            time: last.time,
            open: last.open,
            high: Math.max(last.high, data.price),
            low: Math.min(last.low, data.price),
            close: data.price,
            volume: last.volume ?? 0,
          };
          bars[bars.length - 1] = patched;
          onTick(patched);
        } else if (subRef.droppedTicks >= 10) {
          // Persistent time mismatch → cache is likely corrupted; reset
          console.warn(
            `[TVDatafeed] ${currency}:${tf} — ${subRef.droppedTicks} ticks behind cache, resetting`,
          );
          subRef.droppedTicks = 0;
          this.barCache.delete(cacheKey);
          try { onResetCacheNeeded(); } catch { /* ignore */ }
        }
      }
    });

    this.subscriptions.set(listenerGuid, {
      symbolInfo,
      resolution: resolution as string,
      onTick,
      listenerGuid,
      currency,
      timeframe: tf,
      lastBarTime,
      lastTickReceived: subRef.lastTickReceived,
      resetCount: subRef.resetCount,
      unsubCandle,
      unsubPrice,
      onResetCacheNeeded,
    });

    // Keep the sub object's lastTickReceived in sync with the Subscription record
    // (the closure updates subRef; the watchdog reads the Map entry)
    const subEntry = this.subscriptions.get(listenerGuid)!;
    const origUnsubCandle = unsubCandle;
    const origUnsubPrice = unsubPrice;

    // Proxy: sync subRef → subscription map entry each tick via the existing callbacks
    // (simplest: use a small interval to copy subRef into the map entry)
    const syncTimer = setInterval(() => {
      if (!this.subscriptions.has(listenerGuid)) { clearInterval(syncTimer); return; }
      subEntry.lastTickReceived = subRef.lastTickReceived;
      subEntry.resetCount = subRef.resetCount;
    }, 2_000);

    // Patch unsubscribe to also clear sync timer
    const origUnsub = this.subscriptions.get(listenerGuid)!;
    origUnsub.unsubCandle = () => { clearInterval(syncTimer); origUnsubCandle(); };
    origUnsub.unsubPrice = origUnsubPrice;

    // Start watchdog if not already running
    this.startWatchdog();
  }

  unsubscribeBars(listenerGuid: string): void {
    const sub = this.subscriptions.get(listenerGuid);
    if (sub) {
      console.log(`[TVDatafeed] unsubscribeBars: ${sub.currency}:${sub.timeframe} guid=${listenerGuid}`);
      sub.unsubCandle();
      sub.unsubPrice();
      this.subscriptions.delete(listenerGuid);
    }
  }

  /* ─── Helpers ─── */

  private mergeBars(existing: CachedBar[], newBars: Bar[]): CachedBar[] {
    const map = new Map<number, CachedBar>();
    for (const b of existing) map.set(b.time, b);
    for (const b of newBars) map.set(b.time, b);
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }

  /** Unsubscribe all active bar subscriptions (for cleanup) */
  unsubscribeAll(): void {
    for (const [guid] of this.subscriptions) {
      this.unsubscribeBars(guid);
    }
  }

  /** Clear cache for a specific symbol */
  clearCache(currency?: string): void {
    if (currency) {
      for (const key of this.barCache.keys()) {
        if (key.startsWith(`${currency}:`)) {
          this.barCache.delete(key);
        }
      }
    } else {
      this.barCache.clear();
    }
  }
}
