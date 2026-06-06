/**
 * ═══════════════════════════════════════════════════════════════
 *  TVChart — TradingView Charting Library chart component
 * ═══════════════════════════════════════════════════════════════
 *
 * Replaces the lightweight-charts based Chart.tsx with a full
 * TradingView Charting Library widget + custom overlay indicators.
 */

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type {
  ChartingLibraryWidgetOptions,
  IChartingLibraryWidget,
  ResolutionString,
  EntityId,
  LanguageCode,
  ThemeName,
} from 'charting_library';
import { TVDatafeed, timeframeToResolution, resolutionToTimeframe, getTimeframeSeconds, detectBrowserTimezone } from '../datafeed/TVDatafeed';
import { INDICATOR_REGISTRY, applyLockedIndicatorParams } from '../types/chart';
import { OVERLAY_COMPUTE } from '../indicators/tv/overlayEngine';
import type { OHLCVBar, DashboardConfig, AlertItem } from '../indicators/tv/overlayEngine';
import { CUSTOM_ASYNC_COMPUTE, isCustomIndicator } from '../services/customIndicatorRegistry';
import { createRSIZonesStudy } from '../indicators/tv/rsiStudy';
import { createVolumesStudy } from '../indicators/tv/volumesStudy';
import { socketService } from '../api/socket';
import { betterSocket } from '../api/betterSocket';
import { COPY_TRADING_ICON_SVG_MARKUP } from '../utils/icons';
import { useI18n } from '../i18n';

let tradingViewScriptPromise: Promise<void> | null = null;

function ensureTradingViewScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.TradingView) {
    return Promise.resolve();
  }

  if (tradingViewScriptPromise) {
    return tradingViewScriptPromise;
  }

  tradingViewScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-tradingview-library="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load TradingView charting library')),
        { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = '/charting_library/charting_library.standalone.js';
    script.async = true;
    script.dataset.tradingviewLibrary = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load TradingView charting library'));
    document.head.appendChild(script);
  }).finally(() => {
    tradingViewScriptPromise = null;
  });

  return tradingViewScriptPromise;
}

/* ─── Bet countdown formatter ─── */
function formatBetCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `0:${String(s).padStart(2, '0')}`;
}

/* ─── LTTB (Largest Triangle Three Buckets) downsampling ─── */

/**
 * Visually-optimal downsampling of a point series.
 * Keeps first & last points; picks the most visually significant
 * point from each intermediate bucket (maximises triangle area).
 */
function lttbDownsample(
  pts: { time: number; price: number; price2?: number }[],
  target: number,
): { time: number; price: number; price2?: number }[] {
  if (pts.length <= target) return pts;

  const out: typeof pts = [pts[0]]; // always keep first
  const bucketSize = (pts.length - 2) / (target - 2);

  let prevIdx = 0;

  for (let i = 0; i < target - 2; i++) {
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd   = Math.min(Math.floor((i + 1) * bucketSize) + 1, pts.length - 1);
    const nextStart   = Math.min(Math.floor((i + 1) * bucketSize) + 1, pts.length - 1);
    const nextEnd     = Math.min(Math.floor((i + 2) * bucketSize) + 1, pts.length - 1);

    // Average of next bucket (for triangle calc)
    let avgT = 0, avgP = 0, cnt = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgT += pts[j].time;
      avgP += pts[j].price;
      cnt++;
    }
    if (cnt > 0) { avgT /= cnt; avgP /= cnt; }
    // Find point in current bucket with max triangle area
    let maxArea = -1;
    let bestIdx = bucketStart;
    const pA = pts[prevIdx];

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (pA.time - avgT) * (pts[j].price - pA.price) -
        (pA.time - pts[j].time) * (avgP - pA.price),
      );
      if (area > maxArea) {
        maxArea = area;
        bestIdx = j;
      }
    }

    out.push(pts[bestIdx]);
    prevIdx = bestIdx;
  }

  out.push(pts[pts.length - 1]); // always keep last
  return out;
}

function isFiniteShapePoint(point: { time: number; price: number; price2?: number } | null | undefined): point is { time: number; price: number; price2?: number } {
  return Boolean(
    point
    && Number.isFinite(point.time)
    && Number.isFinite(point.price)
    && (point.price2 == null || Number.isFinite(point.price2)),
  );
}

function sanitizeMultipointShapePoints(
  shapeType: string,
  points: Array<{ time: number; price: number; price2?: number }>,
): Array<{ time: number; price: number }> | null {
  const normalized = points
    .filter(isFiniteShapePoint)
    .map((point) => ({ time: point.time, price: point.price }));

  if (normalized.length < 2) return null;

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const sameTime = first.time === last.time;
  const samePrice = first.price === last.price;

  if (['rectangle', 'circle', 'ellipse'].includes(shapeType) && (sameTime || samePrice)) {
    return null;
  }

  if (sameTime && samePrice) {
    return null;
  }

  return normalized;
}

/* ─── Globals ─── */

// TradingView widget constructor is loaded via standalone script
declare global {
  interface Window {
    TradingView: {
      widget: new (options: ChartingLibraryWidgetOptions) => IChartingLibraryWidget;
    };
  }
}

type DashboardOffset = {
  x: number;
  y: number;
};

/* ─── Public interface ─── */

export interface TVStudyInfo {
  id: string;
  name: string;
  description: string;
}

export interface ChartHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  scrollToEnd: () => void;
  /** Get list of all available TV built-in studies */
  getStudiesList: () => TVStudyInfo[];
  /** Get list of currently active (added) studies */
  getActiveStudies: () => { id: any; name: string }[];
  /** Add a study by name (e.g. 'Bollinger Bands') */
  addStudy: (name: string) => void;
  /** Remove a study by entity id */
  removeStudy: (entityId: any) => void;
  /** Get current market price (last bar close) */
  getCurrentPrice: () => number | null;
}

import type { ActiveBet } from './TradingPanel';

interface TVChartProps {
  currency?: string;
  timeframe: string;
  activeIndicators: Record<string, boolean>;
  indicatorParams: Record<string, Record<string, unknown>>;
  autoScroll?: number;
  locale?: string;
  fastMode?: boolean;
  /** Active bets to visualize on chart */
  activeBets?: ActiveBet[];
  /** Currency code for bet amount labels (e.g. 'USD', 'KZT') */
  balanceCurrency?: string;
  /** Open copy trading panel */
  onOpenCopyTrading?: () => void;
  /** Open account stats */
  onOpenAccountStats?: () => void;
  /** Open trading top 100 */
  onOpenTradingTop?: () => void;
  /** Open web app frame */
  onOpenWebApp?: () => void;
  /** Snapshot mode disables realtime socket updates and recovery logic */
  mode?: 'live' | 'snapshot';
  /** Fixed unix timestamp for snapshot mode */
  snapshotTime?: number;
  /** Max number of bars to load in snapshot mode */
  historyBars?: number;
  /** Hide TradingView left toolbar */
  hideLeftToolbar?: boolean;
  /** Hide price scale panel on the chart */
  hidePriceScale?: boolean;
  /** Currency navigation shortcuts that should work while chart iframe is focused */
  shortcutPrevKey?: string;
  shortcutNextKey?: string;
  onPrevCurrencyShortcut?: () => void;
  onNextCurrencyShortcut?: () => void;
  /** Snapshot metadata updates for preview cards */
  onSnapshotMetaChange?: (meta: { lastBarTime?: number; lastTickTime?: number }) => void;
}

function currencySymbol(code: string | undefined): string {
  if (!code) return '$';
  const map: Record<string, string> = {
    USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', CHF:'Fr', CAD:'CA$',
    AUD:'A$', NZD:'NZ$', HKD:'HK$', SGD:'S$', TWD:'NT$', KRW:'₩',
    INR:'₹', THB:'฿', MYR:'RM', IDR:'Rp', PHP:'₱', VND:'₫', PKR:'Rs',
    BDT:'৳', LKR:'Rs', NPR:'Rs', RUB:'₽', UAH:'₴', PLN:'zł', CZK:'Kč',
    HUF:'Ft', RON:'lei', BGN:'лв', HRK:'kn', SEK:'kr', NOK:'kr', DKK:'kr',
    TRY:'₺', BRL:'R$', MXN:'MX$', ARS:'$', CLP:'CL$', COP:'$', PEN:'S/',
    ZAR:'R', NGN:'₦', KES:'KSh', EGP:'E£', MAD:'MAD ', SAR:'﷼',
    AED:'د.إ', QAR:'﷼', KWD:'KD', BHD:'BD', OMR:'﷼', ILS:'₪',
    KZT:'₸', UZS:'som ', GEL:'₾', AMD:'֏', AZN:'₼', BTC:'₿', ETH:'Ξ', USDT:'₮',
  };
  return map[code.toUpperCase()] ?? (code + ' ');
}

function formatRequestedPair(symbol?: string): string {
  if (!symbol) return '';

  if (symbol.includes('/')) {
    return symbol.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  const normalized = symbol.replace(/_otc$/i, '').replace(/_/g, '').trim().toUpperCase();
  const suffix = /_otc$/i.test(symbol) ? ' OTC' : '';

  if (/^[A-Z0-9]{6,8}$/.test(normalized)) {
    return `${normalized.slice(0, 3)}/${normalized.slice(3)}${suffix}`;
  }

  return symbol
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function formatRequestedTimeframe(tf?: string): string {
  if (!tf) return '';
  return tf.toUpperCase();
}

function toTradingViewShortcut(
  key?: string,
): string | number | (string | number)[] | null {
  if (!key) return null;

  const normalized = key.trim();
  if (!normalized) return null;

  const upper = normalized.toUpperCase();
  const keyCodes: Record<string, number> = {
    ARROWLEFT: 37,
    ARROWUP: 38,
    ARROWRIGHT: 39,
    ARROWDOWN: 40,
    SPACE: 32,
    ENTER: 13,
    ESCAPE: 27,
    TAB: 9,
    BACKSPACE: 8,
    DELETE: 46,
    HOME: 36,
    END: 35,
    PAGEUP: 33,
    PAGEDOWN: 34,
    INSERT: 45,
  };

  if (upper in keyCodes) {
    return keyCodes[upper];
  }

  const functionMatch = upper.match(/^F(\d{1,2})$/);
  if (functionMatch) {
    const fnNumber = Number(functionMatch[1]);
    if (fnNumber >= 1 && fnNumber <= 12) {
      return 111 + fnNumber;
    }
  }

  if (normalized.length === 1) {
    return normalized.toLowerCase();
  }

  return normalized.toLowerCase();
}

function normalizeChartSymbol(value?: string): string {
  return (value || '').trim().toUpperCase();
}

function normalizeChartTimeframe(value?: string): string {
  return (value || '').trim().toUpperCase();
}

/* ─── Shared datafeed instance (per currency) ─── */
const datafeedInstances = new Map<string, TVDatafeed>();

function getDatafeed(
  key: string,
  options?: ConstructorParameters<typeof TVDatafeed>[0],
): TVDatafeed {
  let df = datafeedInstances.get(key);
  if (!df) {
    df = new TVDatafeed(options);
    datafeedInstances.set(key, df);
  }
  return df;
}

/* ═══════════════════════════════════════════════════════════════ */

export const TVChart = forwardRef<ChartHandle, TVChartProps>(function TVChart({
  currency,
  timeframe,
  activeIndicators,
  indicatorParams,
  autoScroll: _autoScroll = 50,
  locale = 'ru',
  fastMode = false,
  activeBets = [],
  balanceCurrency,
  onOpenCopyTrading,
  onOpenAccountStats,
  onOpenTradingTop,
  onOpenWebApp,
  mode = 'live',
  snapshotTime,
  historyBars,
  hideLeftToolbar = false,
  hidePriceScale = false,
  shortcutPrevKey,
  shortcutNextKey,
  onPrevCurrencyShortcut,
  onNextCurrencyShortcut,
  onSnapshotMetaChange,
}, ref) {
  const { t } = useI18n();
  const isSnapshot = mode === 'snapshot';
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<IChartingLibraryWidget | null>(null);
  const datafeedRef = useRef<TVDatafeed | null>(null);
  const shapeIdsRef = useRef<EntityId[]>([]);
  const rsiStudyIdRef = useRef<EntityId | null>(null);
  const volumesStudyIdRef = useRef<EntityId | null>(null);
  const overlayMutex = useRef({ drawing: false, gen: 0 });
  const overlayDrawSignatureRef = useRef('');
  const balanceCurrencyRef = useRef(balanceCurrency);
  useEffect(() => { balanceCurrencyRef.current = balanceCurrency; }, [balanceCurrency]);
  const onOpenCopyTradingRef = useRef(onOpenCopyTrading);
  useEffect(() => { onOpenCopyTradingRef.current = onOpenCopyTrading; }, [onOpenCopyTrading]);
  const onOpenAccountStatsRef = useRef(onOpenAccountStats);
  useEffect(() => { onOpenAccountStatsRef.current = onOpenAccountStats; }, [onOpenAccountStats]);
  const onOpenTradingTopRef = useRef(onOpenTradingTop);
  useEffect(() => { onOpenTradingTopRef.current = onOpenTradingTop; }, [onOpenTradingTop]);
  const onOpenWebAppRef = useRef(onOpenWebApp);
  useEffect(() => { onOpenWebAppRef.current = onOpenWebApp; }, [onOpenWebApp]);
  const onPrevCurrencyShortcutRef = useRef(onPrevCurrencyShortcut);
  useEffect(() => { onPrevCurrencyShortcutRef.current = onPrevCurrencyShortcut; }, [onPrevCurrencyShortcut]);
  const onNextCurrencyShortcutRef = useRef(onNextCurrencyShortcut);
  useEffect(() => { onNextCurrencyShortcutRef.current = onNextCurrencyShortcut; }, [onNextCurrencyShortcut]);
  const onSnapshotMetaChangeRef = useRef(onSnapshotMetaChange);
  useEffect(() => { onSnapshotMetaChangeRef.current = onSnapshotMetaChange; }, [onSnapshotMetaChange]);
  const currencyRef = useRef(currency);
  const timeframeRef = useRef(timeframe);
  const activeIndicatorsRef = useRef(activeIndicators);
  const indicatorParamsRef = useRef(indicatorParams);
  const readyRef = useRef(false);

  /* ─── Dashboard & Alerts state ─── */
  const [dashboards, setDashboards] = useState<Record<string, DashboardConfig>>({});
  const [dashboardOffsets, setDashboardOffsets] = useState<Record<string, DashboardOffset>>({});
  const [draggingDashboardKey, setDraggingDashboardKey] = useState<string | null>(null);
  const [alertToasts, setAlertToasts] = useState<Array<{ id: number; message: string; color?: string }>>([]);
  const [noSignalPair, setNoSignalPair] = useState<string | null>(null);
  const dashboardDragRef = useRef<{
    key: string;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const shownAlertsRef = useRef<Set<string>>(new Set());
  const alertIdRef = useRef(0);
  const initialOverlayDelay = fastMode ? 120 : 500;
  const visibleRangeDelay = fastMode ? 180 : 800;
  const dataLoadedRedrawDelay = fastMode ? 60 : 200;
  const barsLoadedRedrawDelay = fastMode ? 120 : 600;
  const symbolChangeRedrawDelay = fastMode ? 180 : 800;

  currencyRef.current = currency;
  timeframeRef.current = timeframe;
  activeIndicatorsRef.current = activeIndicators;
  indicatorParamsRef.current = indicatorParams;

  useEffect(() => {
    setDashboardOffsets((prev) => {
      const nextEntries = Object.entries(prev).filter(([key]) => Object.prototype.hasOwnProperty.call(dashboards, key));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });
  }, [dashboards]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dashboardDragRef.current;
      if (!drag) return;

      const nextX = Math.round(drag.startOffsetX + (event.clientX - drag.startClientX));
      const nextY = Math.round(drag.startOffsetY + (event.clientY - drag.startClientY));
      setDashboardOffsets((prev) => {
        const current = prev[drag.key] || { x: 0, y: 0 };
        if (current.x === nextX && current.y === nextY) return prev;
        return {
          ...prev,
          [drag.key]: { x: nextX, y: nextY },
        };
      });
    };

    const stopDragging = () => {
      dashboardDragRef.current = null;
      setDraggingDashboardKey(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  const handleDashboardPointerDown = useCallback((key: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const offset = dashboardOffsets[key] || { x: 0, y: 0 };
    dashboardDragRef.current = {
      key,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
    setDraggingDashboardKey(key);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // noop
    }
  }, [dashboardOffsets]);

  /* ─── Expose zoom/scroll methods ─── */
  useImperativeHandle(ref, () => ({
    zoomIn() {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return;
      try {
        const chart = w.activeChart();
        const range = chart.getVisibleRange();
        if (!range) return;
        const mid = (range.from + range.to) / 2;
        const quarter = (range.to - range.from) / 4;
        chart.setVisibleRange({ from: mid - quarter, to: mid + quarter });
      } catch { /* ignore */ }
    },
    zoomOut() {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return;
      try {
        const chart = w.activeChart();
        const range = chart.getVisibleRange();
        if (!range) return;
        const mid = (range.from + range.to) / 2;
        const half = (range.to - range.from);
        chart.setVisibleRange({ from: mid - half, to: mid + half });
      } catch { /* ignore */ }
    },
    resetZoom() {
      if (!widgetRef.current || !readyRef.current) return;
      try { widgetRef.current.activeChart().resetData(); } catch { /* ignore */ }
    },
    scrollToEnd() {
      if (!widgetRef.current || !readyRef.current) return;
      try {
        const chart = widgetRef.current.activeChart();
        const range = chart.getVisibleRange();
        if (range) {
          const vis = range.to - range.from;
          const now = Math.floor(Date.now() / 1000);
          chart.setVisibleRange({ from: now - vis, to: now + vis * 0.05 });
        }
      } catch { /* ignore */ }
    },
    getStudiesList() {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return [];
      try {
        // TV API returns string[] (study descriptions)
        const list: string[] = (w as any).getStudiesList?.() || [];
        return list.map((desc: string) => ({
          id: desc,
          name: desc,
          description: desc,
        })) as TVStudyInfo[];
      } catch { return []; }
    },
    getActiveStudies() {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return [];
      try {
        return w.activeChart().getAllStudies().map((s: any) => ({ id: s.id, name: s.name }));
      } catch { return []; }
    },
    addStudy(name: string) {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return;
      try {
        w.activeChart().createStudy(name, false, false);
      } catch { /* ignore */ }
    },
    removeStudy(entityId: any) {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return;
      try {
        w.activeChart().removeEntity(entityId);
      } catch (e) {
        // Entity may have been removed already (e.g. by user or chart reset)
        console.debug('[TVChart] removeStudy: entity not found, ignoring', entityId, e);
      }
    },
    getCurrentPrice() {
      const df = datafeedRef.current;
      const cur = currencyRef.current;
      const tf = timeframeRef.current;
      if (!df || !cur) return null;
      try {
        const apiTf = resolutionToTimeframe(timeframeToResolution(tf));
        const cached = df.getCachedBars(cur, apiTf);
        if (cached.length > 0) return cached[cached.length - 1].close;
      } catch { /* ignore */ }
      return null;
    },
  }), []);

  /* ─── Draw / clear custom overlay shapes ─── */
  const clearOverlayShapes = useCallback(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) return;
    try {
      const chart = w.activeChart();
      for (const id of shapeIdsRef.current) {
        try { chart.removeEntity(id); } catch { /* shape may already be removed */ }
      }
      shapeIdsRef.current = [];
    } catch { /* ignore */ }
  }, []);

  const drawOverlayShapes = useCallback(async () => {
    const w = widgetRef.current;
    const df = datafeedRef.current;
    const cur = currencyRef.current;
    const tf = timeframeRef.current;
    if (!w || !df || !cur || !readyRef.current) return;

    // Cancel any in-flight draw and acquire mutex
    const gen = ++overlayMutex.current.gen;
    if (overlayMutex.current.drawing) {
      // Previous draw is still running; it will check gen and bail out
      return;
    }
    overlayMutex.current.drawing = true;

    try {
      // Normalize timeframe to API format for cache lookup
      const apiTf = resolutionToTimeframe(timeframeToResolution(tf));
      const cachedBars = df.getCachedBars(cur, apiTf);
      if (cachedBars.length === 0) {
        overlayDrawSignatureRef.current = '';
        clearOverlayShapes();
        console.debug('[Overlay] No cached bars for', cur, apiTf);
        return;
      }

      const activeOverlayKeys = Object.keys(activeIndicatorsRef.current)
        .filter((key) => activeIndicatorsRef.current[key] && Object.prototype.hasOwnProperty.call(OVERLAY_COMPUTE, key))
        .sort();
      const paramsSignature = activeOverlayKeys
        .map((key) => [key, applyLockedIndicatorParams(key, {
          ...INDICATOR_REGISTRY[key]?.meta.defaultParams,
          ...(indicatorParamsRef.current[key] || {}),
        })])
        .map(([key, params]) => `${key}:${JSON.stringify(params)}`)
        .join('|');
      const firstBar = cachedBars[0];
      const lastBar = cachedBars[cachedBars.length - 1];
      // NOTE: `lastBar.close` is deliberately NOT part of the signature.
      // Overlay indicators (SuperTrend etc.) are close-confirmed, so there is no
      // need to destroy & recreate every TV shape on each intra-bar price tick —
      // that was the main source of chart lag. Overlays now redraw only when a
      // new bar appears (length / lastBar.time change), params change, or the
      // symbol/timeframe changes.
      const drawSignature = [
        cur,
        apiTf,
        cachedBars.length,
        firstBar?.time ?? '',
        lastBar?.time ?? '',
        paramsSignature,
      ].join('::');

      if (overlayDrawSignatureRef.current === drawSignature) {
        return;
      }

      // Clear previous shapes only when the overlay snapshot actually changed
      clearOverlayShapes();

      // Convert cached bars to OHLCVBar format
      const bars: OHLCVBar[] = cachedBars.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));

      const chart = w.activeChart();
      const newShapeIds: EntityId[] = [];
      const collectedDashboards: Record<string, DashboardConfig> = {};
      const collectedAlerts: AlertItem[] = [];

      for (const [key, computeFn] of Object.entries(OVERLAY_COMPUTE)) {
        if (!activeIndicatorsRef.current[key]) continue;
        if (gen !== overlayMutex.current.gen) break; // cancelled

        const params = applyLockedIndicatorParams(key, {
          ...INDICATOR_REGISTRY[key]?.meta.defaultParams,
          ...(indicatorParamsRef.current[key] || {}),
        });
        const computeParams = params;

        try {
          // Custom indicators use async WebWorker compute
          const isCustom = isCustomIndicator(key);
          if (isCustom) console.log(`[Overlay] ${key}: running custom compute (${bars.length} bars)`);
          const result = isCustom && CUSTOM_ASYNC_COMPUTE[key]
            ? await CUSTOM_ASYNC_COMPUTE[key](bars, computeParams)
            : computeFn(bars, computeParams);
          // Cap shapes per indicator to prevent chart freezing
          const MAX_SHAPES = 500;
          const shapesToDraw = result.shapes.length > MAX_SHAPES
            ? result.shapes.slice(-MAX_SHAPES)
            : result.shapes;
          console.log(`[Overlay] ${key}: ${bars.length} bars → ${result.shapes.length} shapes (drawing ${shapesToDraw.length})`);

          // Collect dashboard & alerts from custom indicators
          if (result.dashboard && Array.isArray(result.dashboard.rows) && result.dashboard.rows.length > 0) {
            collectedDashboards[key] = result.dashboard;
          }
          if (Array.isArray(result.alerts)) {
            for (const a of result.alerts) {
              if (a && a.fired) collectedAlerts.push(a);
            }
          }

          // Create shapes sequentially (TV API doesn't handle parallel well)
          for (const shape of shapesToDraw) {
            if (gen !== overlayMutex.current.gen) break; // cancelled

            // ── Virtual shape: series_line → LTTB-downsampled trend_line segments ──
            if (shape.type === 'series_line') {
              const MAX_LINE_SEGMENTS = 56;
              const pts = shape.points;
              const sampled = pts.length <= MAX_LINE_SEGMENTS + 1
                ? pts
                : lttbDownsample(pts, MAX_LINE_SEGMENTS + 1);
              for (let k = 0; k < sampled.length - 1; k++) {
                if (gen !== overlayMutex.current.gen) break;
                const p0 = sampled[k];
                const p1 = sampled[k + 1];
                const segmentPoints = sanitizeMultipointShapePoints('trend_line', [p0, p1]);
                if (!segmentPoints) continue;
                try {
                  const eid = await chart.createMultipointShape(
                    segmentPoints,
                    {
                      shape: 'trend_line' as any,
                      lock: true,
                      disableSelection: true,
                      disableSave: true,
                      disableUndo: true,
                      overrides: {
                        showLabel: false,
                        showAngle: false,
                        showPrice: false,
                        showBarsRange: false,
                        showDateTimeRange: false,
                        showDistance: false,
                        showPercentPriceRange: false,
                        extendLeft: false,
                        extendRight: false,
                        ...shape.overrides,
                      } as any,
                      zOrder: (shape.zOrder || 'bottom') as any,
                      showInObjectsTree: false,
                    },
                  );
                  if (eid) newShapeIds.push(eid);
                } catch { /* segment skip */ }
              }
              continue;
            }

            // ── Virtual shape: area_fill → seamless rectangles (transparent borders) ──
            if (shape.type === 'area_fill') {
              const MAX_RECTS = 60;
              const pts = shape.points;
              const step = Math.max(1, Math.ceil((pts.length - 1) / MAX_RECTS));
              for (let k = 0; k < pts.length - 1; k += step) {
                if (gen !== overlayMutex.current.gen) break;
                const kEnd = Math.min(k + step, pts.length - 1);
                const p0 = pts[k] as any;
                const pE = pts[kEnd] as any;
                // Average the boundary prices across the segment for smoother fill
                const priceTop = (p0.price + pE.price) / 2;
                const priceBot = ((p0.price2 ?? p0.price) + (pE.price2 ?? pE.price)) / 2;
                const rectPoints = sanitizeMultipointShapePoints('rectangle', [
                  { time: p0.time, price: priceTop },
                  { time: pE.time, price: priceBot },
                ]);
                if (!rectPoints) continue;
                try {
                  const eid = await chart.createMultipointShape(
                    rectPoints,
                    {
                      shape: 'rectangle' as any,
                      lock: true,
                      disableSelection: true,
                      disableSave: true,
                      disableUndo: true,
                      overrides: {
                        fillBackground: true,
                        borderColor: 'rgba(0,0,0,0)',
                        borderWidth: 0,
                        ...shape.overrides,
                      } as any,
                      zOrder: (shape.zOrder || 'bottom') as any,
                      showInObjectsTree: false,
                      filled: true,
                    },
                  );
                  if (eid) newShapeIds.push(eid);
                } catch { /* rect skip */ }
              }
              continue;
            }

            // ── Regular shapes ──
            try {
              let entityId: EntityId | null = null;
              if (shape.singlePoint) {
                entityId = await chart.createShape(
                  { time: shape.points[0].time, price: shape.points[0].price },
                  {
                    shape: shape.type as any,
                    lock: true,
                    disableSelection: true,
                    disableSave: true,
                    disableUndo: true,
                    overrides: shape.overrides as any,
                    zOrder: (shape.zOrder || 'top') as any,
                    showInObjectsTree: false,
                    text: shape.text || '',
                  },
                );
              } else {
                const multipoint = sanitizeMultipointShapePoints(shape.type, shape.points);
                if (!multipoint) continue;
                entityId = await chart.createMultipointShape(
                  multipoint,
                  {
                    shape: shape.type as any,
                    lock: true,
                    disableSelection: true,
                    disableSave: true,
                    disableUndo: true,
                    overrides: shape.overrides as any,
                    zOrder: (shape.zOrder || 'bottom') as any,
                    showInObjectsTree: false,
                    filled: ['rectangle', 'circle', 'ellipse', 'triangle', 'parallel_channel'].includes(shape.type) || !!shape.overrides?.fillBackground,
                    text: shape.text || '',
                  },
                );
              }
              if (entityId) newShapeIds.push(entityId);
            } catch (shapeErr) {
              console.warn(`[Overlay] Shape creation failed (${shape.type}):`, shapeErr);
            }
          }
        } catch (err) {
          console.warn(`[Overlay] ${key} compute failed:`, err);
        }
      }

      if (gen === overlayMutex.current.gen) {
        shapeIdsRef.current = newShapeIds;
        overlayDrawSignatureRef.current = drawSignature;

        // Update dashboards
        setDashboards(collectedDashboards);

        // Fire alert toasts (deduplicate by message within 30s window)
        for (const alert of collectedAlerts) {
          const msgKey = alert.message;
          if (!shownAlertsRef.current.has(msgKey)) {
            shownAlertsRef.current.add(msgKey);
            const toastId = ++alertIdRef.current;
            setAlertToasts(prev => [...prev, { id: toastId, message: alert.message, color: alert.color }]);
            setTimeout(() => {
              setAlertToasts(prev => prev.filter(t => t.id !== toastId));
              shownAlertsRef.current.delete(msgKey);
            }, 5000);
          }
        }
      } else {
        // We were cancelled — clean up shapes we just created
        for (const id of newShapeIds) {
          try { w.activeChart().removeEntity(id); } catch { /* ignore */ }
        }
      }
    } finally {
      overlayMutex.current.drawing = false;
      // If a new draw was requested while we were busy, run it now
      if (gen !== overlayMutex.current.gen) {
        drawOverlayShapes();
      }
    }
  }, [clearOverlayShapes]);

  /* ─── RSI Study management ─── */
  const updateRSIStudy = useCallback(async () => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) return;

    const chart = w.activeChart();
    const rsiActive = activeIndicatorsRef.current['rsiZones'];

    if (rsiActive && !rsiStudyIdRef.current) {
      try {
        const params = {
          ...INDICATOR_REGISTRY['rsiZones']?.meta.defaultParams,
          ...(indicatorParamsRef.current['rsiZones'] || {}),
        };
        const id = await chart.createStudy(
          'RSI Zones',
          false,
          false,
          {
            period: (params.period ?? 14) as number,
            overboughtLevel: (params.overboughtLevel ?? 70) as number,
            oversoldLevel: (params.oversoldLevel ?? 30) as number,
            dynamicColor: (params.dynamicColor !== false) as boolean,
          } as any,
        );
        rsiStudyIdRef.current = id;
      } catch (err) {
        console.warn('Failed to create RSI study:', err);
      }
    } else if (!rsiActive && rsiStudyIdRef.current) {
      try {
        chart.removeEntity(rsiStudyIdRef.current);
      } catch { /* ignore */ }
      rsiStudyIdRef.current = null;
    } else if (rsiActive && rsiStudyIdRef.current) {
      // Update params
      try {
        const params = {
          ...INDICATOR_REGISTRY['rsiZones']?.meta.defaultParams,
          ...(indicatorParamsRef.current['rsiZones'] || {}),
        };
        const studyApi = chart.getStudyById(rsiStudyIdRef.current);
        if (studyApi) {
          studyApi.setInputValues([
            { id: 'period', value: params.period ?? 14 },
            { id: 'overboughtLevel', value: params.overboughtLevel ?? 70 },
            { id: 'oversoldLevel', value: params.oversoldLevel ?? 30 },
            { id: 'dynamicColor', value: params.dynamicColor !== false },
          ] as any);
        }
      } catch { /* ignore */ }
    }
  }, []);

  const applyVolumesStudyOverrides = useCallback((studyApi: any, params: Record<string, unknown>) => {
    try {
      studyApi?.applyOverrides?.({
        'vol_ma.color': (params.maColor ?? '#f59e0b') as string,
        'vol_ma.linewidth': Math.max(1, Math.min(5, Number(params.maWidth) || 2)),
        'volumePalette.colors.0.color': (params.downColor ?? '#ef4444') as string,
        'volumePalette.colors.1.color': (params.upColor ?? '#22c55e') as string,
      } as any);
    } catch {
      // Ignore unsupported custom-study overrides in older TV builds.
    }
  }, []);

  const updateVolumesStudy = useCallback(async () => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) return;

    const chart = w.activeChart();
    const volumesActive = activeIndicatorsRef.current.volumes;

    if (volumesActive && !volumesStudyIdRef.current) {
      try {
        const params = {
          ...INDICATOR_REGISTRY.volumes?.meta.defaultParams,
          ...(indicatorParamsRef.current.volumes || {}),
        };
        const id = await chart.createStudy(
          'Volumes',
          false,
          false,
          {
            showMA: (params.showMA !== false) as boolean,
            maPeriod: (params.maPeriod ?? 20) as number,
          } as any,
        );
        volumesStudyIdRef.current = id;
        if (id != null) {
          applyVolumesStudyOverrides(chart.getStudyById(id), params);
        }
      } catch (err) {
        console.warn('Failed to create Volumes study:', err);
      }
    } else if (!volumesActive && volumesStudyIdRef.current) {
      try {
        const studyId = volumesStudyIdRef.current;
        if (studyId != null) {
          chart.removeEntity(studyId);
        }
      } catch { /* ignore */ }
      volumesStudyIdRef.current = null;
    } else if (volumesActive && volumesStudyIdRef.current) {
      try {
        const params = {
          ...INDICATOR_REGISTRY.volumes?.meta.defaultParams,
          ...(indicatorParamsRef.current.volumes || {}),
        };
        const studyApi = chart.getStudyById(volumesStudyIdRef.current);
        if (studyApi) {
          studyApi.setInputValues([
            { id: 'showMA', value: params.showMA !== false },
            { id: 'maPeriod', value: params.maPeriod ?? 20 },
          ] as any);
          applyVolumesStudyOverrides(studyApi, params);
        }
      } catch { /* ignore */ }
    }
  }, [applyVolumesStudyOverrides]);

  /* ─── Create / destroy TV widget ─── */
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let unsubscribeBarsLoaded = () => {};
    let unsubscribeOverlayRedraw = () => {};
    /** Track the datafeed cache key so cleanup can remove the instance */
    let datafeedKey: string | null = null;
    /** Collect all setTimeout IDs so they can be cleared on unmount */
    const pendingTimers: ReturnType<typeof setTimeout>[] = [];
    function safeTimeout(fn: () => void, ms: number) {
      const id = setTimeout(fn, ms);
      pendingTimers.push(id);
      return id;
    }

    // Wait for TradingView to be available (Telegram WebView may load scripts slower)
    function tryInit() {
      if (cancelled) return;
      if (!window.TradingView) {
        void ensureTradingViewScript()
          .then(() => {
            safeTimeout(tryInit, 0);
          })
          .catch((error) => {
            console.warn('[TVChart] TradingView library unavailable:', error);
            safeTimeout(tryInit, 250);
          });
        return;
      }
      createWidget();
    }

    function createWidget() {
      if (cancelled || !containerRef.current) return;

    const containerId = `tv_chart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    containerRef.current.id = containerId;

    const datafeed = getDatafeed(containerId, {
      realtime: !isSnapshot,
      snapshotTimeSec: isSnapshot ? snapshotTime : null,
      historyBars: isSnapshot ? historyBars : undefined,
    });
    datafeedRef.current = datafeed;
    // Track the key so cleanup can remove the instance from the cache
    datafeedKey = containerId;

    const symbol = currency || 'BTCUSD';
    const resolution = timeframeToResolution(timeframe) as ResolutionString;

    // Ensure socket subscription for currency
    if (currency && !isSnapshot) {
      socketService.subscribeToCurrency(currency);
    }

    const tvLocale = (locale === 'uk' ? 'ru' : locale === 'en' ? 'en' : 'ru') as LanguageCode;

    const widgetOptions: ChartingLibraryWidgetOptions = {
      container: containerId,
      datafeed,
      symbol,
      interval: resolution,
      locale: tvLocale,
      library_path: '/charting_library/',
      custom_css_url: 'custom.css',
      autosize: true,
      theme: 'dark' as ThemeName,
      timezone: detectBrowserTimezone() as any,

      // Styling overrides
      overrides: {
        'mainSeriesProperties.showCountdown': true,
        'paneProperties.backgroundType': 'solid',
        'paneProperties.background': '#0e0f14',
        'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.03)',
        'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.03)',
        'paneProperties.separatorColor': '#1a1c24',
        'scalesProperties.textColor': '#848e9c',
        'scalesProperties.lineColor': 'rgba(255,255,255,0.06)',
        ...(hidePriceScale
          ? {
              'scalesProperties.showSeriesLastValue': false,
              'scalesProperties.showStudyLastValue': false,
              'scalesProperties.showSymbolLabels': false,
              'scalesProperties.showStudyPlotLabels': false,
              'scalesProperties.showBidAskLabels': false,
              'scalesProperties.showPriceScaleCrosshairLabel': false,
            }
          : {}),
        // Smaller price scale font on mobile to avoid oversized axis
        ...(window.innerWidth <= 600 ? { 'scalesProperties.fontSize': 9 } : {}),
        'mainSeriesProperties.candleStyle.upColor': '#2ebd85',
        'mainSeriesProperties.candleStyle.downColor': '#f6465d',
        'mainSeriesProperties.candleStyle.borderUpColor': '#2ebd85',
        'mainSeriesProperties.candleStyle.borderDownColor': '#f6465d',
        'mainSeriesProperties.candleStyle.wickUpColor': '#2ebd85',
        'mainSeriesProperties.candleStyle.wickDownColor': '#f6465d',
        'paneProperties.crossHairProperties.color': '#9598A1',
      } as any,

      loading_screen: { backgroundColor: '#0e0f14', foregroundColor: '#2ebd85' },

      // Features
      disabled_features: [
        'header_widget',              // Hide entire TV top toolbar (we use our own overlay)
        'header_symbol_search',
        'header_compare',
        'symbol_search_hot_key',
        'header_quick_search',
        'display_market_status',
        'popup_hints',
        'header_resolutions',
        'show_interval_dialog_on_key_press',
        'header_fullscreen_button',
        'header_saveload',
        'header_screenshot',
        'header_undo_redo',
        'header_chart_type',
        'header_settings',
        'timeframes_toolbar',         // Hide bottom date-range tabs (1D/1W/1M)
        'create_volume_indicator_by_default',
        ...(hidePriceScale ? (['hide_price_scale_global_last_bar_value'] as const) : []),
        ...(hideLeftToolbar ? (['left_toolbar'] as const) : []),
      ],
      enabled_features: [
        'countdown',
        'side_toolbar_in_fullscreen_mode',
        'secondary_series_extend_time_scale',
        'iframe_loading_same_origin',    // Use sameorigin.html instead of blob URL (Telegram WebView compat)
      ],

      // Custom indicators (RSI Zones)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      custom_indicators_getter: (PineJS: any) => {
        return Promise.resolve([createRSIZonesStudy(PineJS), createVolumesStudy(PineJS)]);
      },

      favorites: {
        intervals: ['5S', '30S', '1', '2', '3', '5', '60', '1D'] as ResolutionString[],
        chartTypes: ['Candles'],
      },
    };

    let widget: IChartingLibraryWidget;
    try {
      widget = new window.TradingView.widget(widgetOptions);
    } catch (err) {
      console.error('Failed to create TradingView widget:', err);
      return;
    }
    widgetRef.current = widget;

    unsubscribeBarsLoaded = datafeed.onBarsLoaded((loadedCurrency, loadedTimeframe, bars) => {
      if (normalizeChartSymbol(loadedCurrency) !== normalizeChartSymbol(currencyRef.current)) return;
      if (normalizeChartTimeframe(loadedTimeframe) !== normalizeChartTimeframe(timeframeRef.current)) return;
      setNoSignalPair(bars.length === 0 ? loadedCurrency : null);

      onSnapshotMetaChangeRef.current?.({
        lastBarTime: bars.length > 0
          ? Math.floor(Number(bars[bars.length - 1].time) / 1000)
          : undefined,
        lastTickTime: isSnapshot ? snapshotTime : undefined,
      });

      if (isSnapshot && _autoScroll > 0 && bars.length > 0) {
        safeTimeout(() => {
          try {
            const chart = widgetRef.current?.activeChart();
            if (!chart) return;

            const lastBar = bars[bars.length - 1] as { time?: number | string };
            const lastBarTime = typeof lastBar.time === 'number'
              ? lastBar.time
              : Number(lastBar.time || 0);
            if (!Number.isFinite(lastBarTime) || lastBarTime <= 0) return;

            const tfMs = getTimeframeSeconds(timeframeRef.current) * 1000;
            const snapshotRightPaddingBars = hidePriceScale ? 0 : 2;
            chart
              .setVisibleRange({
                from: lastBarTime - tfMs * _autoScroll,
                to: lastBarTime + tfMs * snapshotRightPaddingBars,
              }, {
                applyDefaultRightMargin: false,
                rejectByTimeout: 1200,
              })
              .catch(() => {});

            try {
              const timeScale = chart.getTimeScale();
              timeScale.setRightOffset(snapshotRightPaddingBars);
            } catch {
              /* ignore */
            }
          } catch {
            /* ignore */
          }
        }, 50);
      }
    });

    // Patch iframe sandbox/permissions for Telegram WebView compatibility
    try {
      const container = containerRef.current;
      if (container) {
        const observer = new MutationObserver(() => {
          const iframe = container.querySelector('iframe');
          if (iframe) {
            iframe.setAttribute('allow', 'cross-origin-isolated');
            iframe.removeAttribute('sandbox');
            observer.disconnect();
          }
        });
        observer.observe(container, { childList: true, subtree: true });
        // Also check immediately
        const iframe = container.querySelector('iframe');
        if (iframe) {
          iframe.setAttribute('allow', 'cross-origin-isolated');
          iframe.removeAttribute('sandbox');
          observer.disconnect();
        }
      }
    } catch { /* ignore */ }

    widget.onChartReady(() => {
      readyRef.current = true;

      const prevShortcut = toTradingViewShortcut(shortcutPrevKey);
      const nextShortcut = toTradingViewShortcut(shortcutNextKey);

      if (prevShortcut != null) {
        widget.onShortcut(prevShortcut, () => {
          onPrevCurrencyShortcutRef.current?.();
        });
      }

      if (nextShortcut != null && String(nextShortcut) !== String(prevShortcut)) {
        widget.onShortcut(nextShortcut, () => {
          onNextCurrencyShortcutRef.current?.();
        });
      }

      // Force-hide price axis nodes when hidePriceScale is enabled.
      const killPriceAxisElements = (doc: Document) => {
        const killEl = (el: Element) => {
          const s = (el as HTMLElement).style;
          s.setProperty('width', '0', 'important');
          s.setProperty('min-width', '0', 'important');
          s.setProperty('max-width', '0', 'important');
          s.setProperty('overflow', 'hidden', 'important');
          s.setProperty('display', 'none', 'important');
          s.setProperty('visibility', 'hidden', 'important');
          s.setProperty('opacity', '0', 'important');
          s.setProperty('pointer-events', 'none', 'important');
        };
        doc.querySelectorAll<HTMLElement>(
          '.price-axis, [class*="price-axis"], [class*="priceAxis"]'
        ).forEach(killEl);
      };

      const injectHidePriceScaleCss = () => {
        if (!hidePriceScale) return;
        try {
          const iframe = containerRef.current?.querySelector('iframe');
          const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
          if (!iframeDoc) return;

          // Inline style approach — highest specificity
          killPriceAxisElements(iframeDoc);

          // CSS stylesheet as additional layer
          const styleId = 'tv-hide-price-scale-style';
          if (!iframeDoc.getElementById(styleId)) {
            const style = iframeDoc.createElement('style');
            style.id = styleId;
            style.textContent = `
              .price-axis,
              [class*="price-axis"],
              [class*="priceAxis"] {
                display: none !important;
                visibility: hidden !important;
                width: 0 !important;
                min-width: 0 !important;
                max-width: 0 !important;
                overflow: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
            `;
            iframeDoc.head?.appendChild(style);
          }

          // MutationObserver — keeps killing price axis even if TV re-renders it
          const observerId = '__tvPriceAxisObserver';
          if (!(iframeDoc as any)[observerId]) {
            const observer = new MutationObserver(() => killPriceAxisElements(iframeDoc));
            observer.observe(iframeDoc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
            (iframeDoc as any)[observerId] = observer;
          }
        } catch {
          /* ignore */
        }
      };

      const applyHiddenPriceScale = () => {
        if (!hidePriceScale) return;
        try {
          const chart = widget.activeChart();
          const timeScale = chart.getTimeScale();

          try {
            timeScale.setRightOffset(-1);
            timeScale.defaultRightOffset().setValue(0);
            timeScale.defaultRightOffsetPercentage().setValue(0);
            timeScale.usePercentageRightOffset().setValue(false);
          } catch {
            /* ignore */
          }

          widget.applyOverrides({
            'scalesProperties.showSeriesLastValue': false,
            'scalesProperties.showStudyLastValue': false,
            'scalesProperties.showSymbolLabels': false,
            'scalesProperties.showStudyPlotLabels': false,
            'scalesProperties.showBidAskLabels': false,
            'scalesProperties.showPriceScaleCrosshairLabel': false,
            'scalesProperties.showPrePostMarketPriceLabel': false,
          } as any);

          const series = chart.getSeries() as {
            detachNoScale?: () => void;
            changePriceScale?: (scale: 'no-scale' | string) => void;
          };

          if (series.detachNoScale) {
            series.detachNoScale();
          } else if (series.changePriceScale) {
            series.changePriceScale('no-scale');
          }

          // Fallback for builds where series no-scale is ignored.
          const hideScale = (scale: unknown) => {
            const candidate = scale as { setVisible?: (visible: boolean) => void } | null;
            if (candidate?.setVisible) {
              candidate.setVisible(false);
            }
          };
          for (const pane of chart.getPanes()) {
            for (const scale of pane.getLeftPriceScales()) hideScale(scale);
            for (const scale of pane.getRightPriceScales()) hideScale(scale);
            hideScale(pane.getMainSourcePriceScale());
          }
        } catch {
          /* ignore */
        }

        injectHidePriceScaleCss();
      };

      if (hidePriceScale) {
        safeTimeout(applyHiddenPriceScale, 0);
        safeTimeout(applyHiddenPriceScale, 250);
        safeTimeout(applyHiddenPriceScale, 800);
      }

      // ─── Force smaller price scale on mobile ───
      if (window.innerWidth <= 600) {
        try {
          widget.applyOverrides({ 'scalesProperties.fontSize': 9 } as any);
        } catch { /* ignore */ }
      }

      // Force resize — Telegram WebView may have zero-size container at init
      try {
        window.dispatchEvent(new Event('resize'));
      } catch { /* ignore */ }
      safeTimeout(() => {
        try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
      }, 300);
      safeTimeout(() => {
        try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
      }, 1000);

      // Draw initial overlay indicators
      safeTimeout(() => {
        const cur = currencyRef.current;
        const df = datafeedRef.current;
        if (cur && df) {
          const apiTf = resolutionToTimeframe(timeframeToResolution(timeframeRef.current));
          if (df.getCachedBars(cur, apiTf).length === 0) return;
        }
        drawOverlayShapes();
        updateRSIStudy();
        updateVolumesStudy();
      }, initialOverlayDelay);

      // ─── Set initial visible range based on autoScroll (bar count) ───
      if (_autoScroll > 0) {
        safeTimeout(() => {
          try {
            const tfMs = getTimeframeSeconds(timeframeRef.current) * 1000;
            const rangeAnchorRaw = isSnapshot && snapshotTime
              ? snapshotTime
              : Date.now();
            const rangeAnchor = rangeAnchorRaw < 1e10
              ? rangeAnchorRaw * 1000
              : rangeAnchorRaw;
            const rightPaddingBars = hidePriceScale ? 0 : 2;
            widget.activeChart()
              .setVisibleRange(
                { from: rangeAnchor - tfMs * _autoScroll, to: rangeAnchor + tfMs * rightPaddingBars },
                { applyDefaultRightMargin: false, rejectByTimeout: 1200 },
              )
              .catch(() => {});
          } catch { /* ignore */ }
        }, visibleRangeDelay);
      }

      // ─── Inject Copy Trading button into drawing toolbar ───
      if (onOpenCopyTradingRef.current || onOpenAccountStatsRef.current || onOpenTradingTopRef.current || onOpenWebAppRef.current) {
        safeTimeout(() => {
          try {
            const iframe = containerRef.current?.querySelector('iframe');
            const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
            if (!iframeDoc) return;

            function tryInject() {
              const toolbar = iframeDoc!.querySelector('[class*="drawingToolbar-"]');
              const inner = toolbar?.querySelector('[class*="inner-"]');
              if (!toolbar || !inner) return false;

              // Don't inject twice
              if (toolbar.querySelector('[data-ct-injected]')) return true;

              // Find the class suffixes from existing elements
              const groupEl = inner.querySelector('[class*="group-"]');
              if (!groupEl) return false;
              const groupClass = Array.from(groupEl.classList).find(c => c.startsWith('group-')) || '';

              // Find an existing button to clone class names
              const existingBtn = toolbar.querySelector('button[class*="button-"][class*="isInteractive-"]');
              if (!existingBtn) return false;
              const btnClasses = Array.from(existingBtn.classList);
              const iconClass = existingBtn.querySelector('[class*="icon-"]')?.className || '';

              // Create the group
              const group = iframeDoc!.createElement('div');
              group.className = groupClass;
              group.setAttribute('data-ct-injected', 'true');

              // Create the button with same classes as native toolbar buttons
              const btn = iframeDoc!.createElement('button');
              btn.className = btnClasses.join(' ');
              btn.setAttribute('type', 'button');
              btn.setAttribute('tabindex', '-1');
              btn.setAttribute('data-tooltip', 'Copy Trading');
              btn.setAttribute('data-tooltip-delay', '1500');
              btn.setAttribute('aria-label', 'Copy Trading');

              const span = iframeDoc!.createElement('span');
              span.setAttribute('role', 'img');
              span.className = iconClass;
              span.setAttribute('aria-hidden', 'true');
              span.innerHTML = COPY_TRADING_ICON_SVG_MARKUP;
              const copyTradingSvg = span.querySelector('svg');
              if (copyTradingSvg) {
                copyTradingSvg.style.width = '20px';
                copyTradingSvg.style.height = '20px';
                copyTradingSvg.style.display = 'block';
              }

              btn.appendChild(span);
              group.appendChild(btn);

              // Insert at the top of the toolbar
              const firstGroup = inner.querySelector('[class*="group-"]');
              if (firstGroup) {
                inner.insertBefore(group, firstGroup);
              } else {
                inner.prepend(group);
              }

              // Wire click
              btn.addEventListener('click', () => {
                onOpenCopyTradingRef.current?.();
              });

              // ─── Account stats button ───
              if (onOpenAccountStatsRef.current) {
                const statsGroup = iframeDoc!.createElement('div');
                statsGroup.className = groupClass;
                statsGroup.setAttribute('data-account-stats-injected', 'true');

                const statsBtn = iframeDoc!.createElement('button');
                statsBtn.className = btnClasses.join(' ');
                statsBtn.setAttribute('type', 'button');
                statsBtn.setAttribute('tabindex', '-1');
                statsBtn.setAttribute('data-tooltip', 'Account stats');
                statsBtn.setAttribute('data-tooltip-delay', '1500');
                statsBtn.setAttribute('aria-label', 'Account stats');

                const statsSpan = iframeDoc!.createElement('span');
                statsSpan.setAttribute('role', 'img');
                statsSpan.className = iconClass;
                statsSpan.setAttribute('aria-hidden', 'true');
                statsSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 23h18"/><path d="M9 20V12"/><path d="M14 20V7"/><path d="M19 20v-5"/></g></svg>';

                statsBtn.appendChild(statsSpan);
                statsGroup.appendChild(statsBtn);

                if (group.nextSibling) {
                  inner.insertBefore(statsGroup, group.nextSibling);
                } else {
                  inner.appendChild(statsGroup);
                }

                statsBtn.addEventListener('click', () => {
                  onOpenAccountStatsRef.current?.();
                });
              }

              if (onOpenTradingTopRef.current) {
                const topGroup = iframeDoc!.createElement('div');
                topGroup.className = groupClass;
                topGroup.setAttribute('data-trading-top-injected', 'true');

                const topBtn = iframeDoc!.createElement('button');
                topBtn.className = btnClasses.join(' ');
                topBtn.setAttribute('type', 'button');
                topBtn.setAttribute('tabindex', '-1');
                topBtn.setAttribute('data-tooltip', 'Top 100');
                topBtn.setAttribute('data-tooltip-delay', '1500');
                topBtn.setAttribute('aria-label', 'Top 100');

                const topSpan = iframeDoc!.createElement('span');
                topSpan.setAttribute('role', 'img');
                topSpan.className = iconClass;
                topSpan.setAttribute('aria-hidden', 'true');
                topSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 24h10"/><path d="M14 20v4"/><path d="M8 5h12v6a6 6 0 0 1-12 0V5Z"/><path d="M8 6H5a2.5 2.5 0 0 0 3 4"/><path d="M20 6h3a2.5 2.5 0 0 1-3 4"/></g></svg>';

                topBtn.appendChild(topSpan);
                topGroup.appendChild(topBtn);

                const accountStatsGroup = toolbar.querySelector('[data-account-stats-injected]');
                const insertAfter = accountStatsGroup ?? group;
                if (insertAfter.nextSibling) {
                  inner.insertBefore(topGroup, insertAfter.nextSibling);
                } else {
                  inner.appendChild(topGroup);
                }

                topBtn.addEventListener('click', () => {
                  onOpenTradingTopRef.current?.();
                });
              }

              // ─── WebApp button (next to Copy Trading) ───
              if (onOpenWebAppRef.current) {
                const waGroup = iframeDoc!.createElement('div');
                waGroup.className = groupClass;
                waGroup.setAttribute('data-webapp-injected', 'true');

                const waBtn = iframeDoc!.createElement('button');
                waBtn.className = btnClasses.join(' ');
                waBtn.setAttribute('type', 'button');
                waBtn.setAttribute('tabindex', '-1');
                waBtn.setAttribute('data-tooltip', 'Web App');
                waBtn.setAttribute('data-tooltip-delay', '1500');
                waBtn.setAttribute('aria-label', 'Web App');

                const waSpan = iframeDoc!.createElement('span');
                waSpan.setAttribute('role', 'img');
                waSpan.className = iconClass;
                waSpan.setAttribute('aria-hidden', 'true');
                waSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><g fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="22" height="16" rx="2"/><path d="M9 24h10M14 20v4"/></g></svg>';

                waBtn.appendChild(waSpan);
                waGroup.appendChild(waBtn);

                const tradingTopGroup = toolbar.querySelector('[data-trading-top-injected]');
                const accountStatsGroup = toolbar.querySelector('[data-account-stats-injected]');
                const insertAfter = tradingTopGroup ?? accountStatsGroup ?? group;
                if (insertAfter.nextSibling) {
                  inner.insertBefore(waGroup, insertAfter.nextSibling);
                } else {
                  inner.appendChild(waGroup);
                }

                waBtn.addEventListener('click', () => {
                  onOpenWebAppRef.current?.();
                });
              }

              return true;
            }

            if (!tryInject()) {
              // Toolbar may not be rendered yet — observe
              const obs = new MutationObserver(() => {
                if (tryInject()) obs.disconnect();
              });
              obs.observe(iframeDoc.body, { childList: true, subtree: true });
              // Safety: stop observing after 10s
              safeTimeout(() => obs.disconnect(), 10000);
            }
          } catch { /* ignore — iframe may be cross-origin in some configs */ }
        }, 300);
      }

      // Listen for data loaded events to redraw overlays
      try {
        widget.activeChart().onDataLoaded().subscribe(null, () => {
          safeTimeout(() => drawOverlayShapes(), dataLoadedRedrawDelay);
        });
      } catch { /* older API may not support this */ }

      try {
        const rangeEvents = (widget.activeChart() as any).onVisibleRangeChanged?.();
        rangeEvents?.subscribe?.(null, () => {
          if (overlayRedrawTimer) clearTimeout(overlayRedrawTimer);
          overlayRedrawTimer = safeTimeout(() => {
            drawOverlayShapes();
          }, 40);
        });
      } catch { /* older API may not support this */ }

      // ─── Toggle TV studies (click again = remove) ───
      const knownStudies = new Map<string, any>(); // name → entityId
      try {
        widget.subscribe('study_event', (entityId: any, eventType: any) => {
          if (eventType === 'remove') {
            // Clean up tracking
            for (const [name, id] of knownStudies) {
              if (id === entityId) { knownStudies.delete(name); break; }
            }
            return;
          }
          if (eventType !== 'create') return;

          // Use a small delay so getAllStudies() includes the new entity
          safeTimeout(() => {
            try {
              const chart = widget.activeChart();
              const all = chart.getAllStudies();
              const newStudy = all.find((s: any) => s.id === entityId);
              if (!newStudy) return;

              const existingId = knownStudies.get(newStudy.name);
              if (existingId) {
                // Study with this name already exists → toggle OFF (remove both)
                try { chart.removeEntity(existingId); } catch { /* ignore */ }
                try { chart.removeEntity(entityId); } catch { /* ignore */ }
                knownStudies.delete(newStudy.name);
              } else {
                // First instance → track it
                knownStudies.set(newStudy.name, entityId);
              }
            } catch { /* ignore */ }
          }, 50);
        });
      } catch { /* ignore */ }

      // ─── Sync symbol changes from TV back to custom overlay ───
      try {
        widget.activeChart().onSymbolChanged().subscribe(null, () => {
          safeTimeout(() => {
            drawOverlayShapes();
            updateRSIStudy();
            updateVolumesStudy();
          }, dataLoadedRedrawDelay);
        });
      } catch { /* ignore */ }

      // ─── Ensure countdown is visible on price scale ───
      try {
        widget.applyOverrides({ 'mainSeriesProperties.showCountdown': true } as any);
      } catch { /* ignore */ }
    });

    // Listen for bar updates from datafeed to trigger overlay redraws
    let overlayRedrawTimer: ReturnType<typeof setTimeout> | null = null;
    unsubscribeOverlayRedraw = datafeed.onBarsLoaded((_cur, _tf, _bars) => {
      // Debounce overlay redraws — don't redraw on every tick
      if (overlayRedrawTimer) clearTimeout(overlayRedrawTimer);
      overlayRedrawTimer = safeTimeout(() => {
        drawOverlayShapes();
      }, barsLoadedRedrawDelay);
    });

    } // end createWidget

    tryInit();

    return () => {
      cancelled = true;
      readyRef.current = false;
      overlayDrawSignatureRef.current = '';
      // Clear all pending timers to prevent post-unmount execution
      for (const t of pendingTimers) clearTimeout(t);
      pendingTimers.length = 0;
      // Clear bet visualization state
      betLinesRef.current.clear();
      vertPendingRef.current.clear();
      resultAppliedRef.current.clear();
      betEntryPriceRef.current.clear();
      if (betTimerRef.current) { clearInterval(betTimerRef.current); betTimerRef.current = null; }
      if (widgetRef.current) {
        clearOverlayShapes();
        rsiStudyIdRef.current = null;
        volumesStudyIdRef.current = null;
        if (datafeedRef.current) datafeedRef.current.unsubscribeAll();
        try { widgetRef.current.remove(); } catch { /* ignore */ }
        widgetRef.current = null;
        // Destroy datafeed and remove from instance cache to prevent leaks
        if (datafeedRef.current) {
          datafeedRef.current.destroy();
          if (datafeedKey) datafeedInstances.delete(datafeedKey);
        }
        datafeedRef.current = null;
      }
      unsubscribeBarsLoaded();
      unsubscribeOverlayRedraw();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideLeftToolbar, hidePriceScale, historyBars, isSnapshot, locale, shortcutNextKey, shortcutPrevKey, snapshotTime]);

  /* ─── Handle currency changes ─── */
  useEffect(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current || !currency) return;
    setNoSignalPair(null);

    // Clear bet visualization shapes — symbol change invalidates all shape IDs
    for (const [, entityIds] of betLinesRef.current) {
      try { removeShapes(w.activeChart(), entityIds); } catch { /* ignore */ }
    }
    betLinesRef.current.clear();
    vertPendingRef.current.clear();
    resultAppliedRef.current.clear();
    betEntryPriceRef.current.clear();

    // Subscribe to socket for new currency
    if (!isSnapshot) {
      socketService.subscribeToCurrency(currency);
    }

    const resolution = timeframeToResolution(timeframeRef.current) as ResolutionString;

    try {
      w.setSymbol(currency, resolution, () => {
        if (hidePriceScale) {
          try {
            w.applyOverrides({
              'scalesProperties.showSeriesLastValue': false,
              'scalesProperties.showStudyLastValue': false,
              'scalesProperties.showSymbolLabels': false,
              'scalesProperties.showStudyPlotLabels': false,
              'scalesProperties.showBidAskLabels': false,
              'scalesProperties.showPriceScaleCrosshairLabel': false,
              'scalesProperties.showPrePostMarketPriceLabel': false,
            } as any);

            const series = w.activeChart().getSeries() as {
              detachNoScale?: () => void;
              changePriceScale?: (scale: 'no-scale' | string) => void;
            };
            if (series.detachNoScale) series.detachNoScale();
            else if (series.changePriceScale) series.changePriceScale('no-scale');

            const timeScale = w.activeChart().getTimeScale();
            try {
              timeScale.setRightOffset(-1);
              timeScale.defaultRightOffset().setValue(0);
              timeScale.defaultRightOffsetPercentage().setValue(0);
              timeScale.usePercentageRightOffset().setValue(false);
            } catch { /* ignore */ }

            const iframe = containerRef.current?.querySelector('iframe');
            const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
            if (iframeDoc && !iframeDoc.getElementById('tv-hide-price-scale-style')) {
              const style = iframeDoc.createElement('style');
              style.id = 'tv-hide-price-scale-style';
              style.textContent = `
                .price-axis,
                .price-axis-currency-label-wrapper,
                [class*="price-axis"],
                [class*="priceAxis"] {
                  display: none !important;
                  visibility: hidden !important;
                  width: 0 !important;
                  min-width: 0 !important;
                  max-width: 0 !important;
                  opacity: 0 !important;
                  pointer-events: none !important;
                }
              `;
              iframeDoc.head?.appendChild(style);
            }
          } catch { /* ignore */ }
        }
        // After symbol change, redraw overlays when data loads
        setTimeout(() => {
          drawOverlayShapes();
          updateRSIStudy();
          updateVolumesStudy();
        }, symbolChangeRedrawDelay);
      });
    } catch (err) {
      console.warn('Failed to change symbol:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, hidePriceScale, isSnapshot]);

  /* ─── Handle timeframe changes ─── */
  useEffect(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) return;
    setNoSignalPair(null);

    const resolution = timeframeToResolution(timeframe) as ResolutionString;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      w.activeChart().setResolution(resolution, () => {
        setTimeout(() => drawOverlayShapes(), symbolChangeRedrawDelay);
      });
    } catch (err) {
      console.warn('Failed to change resolution:', err);
      // Auto-retry after 5s if setResolution failed
      retryTimer = setTimeout(() => {
        try {
          w.activeChart().setResolution(resolution, () => {
            setTimeout(() => drawOverlayShapes(), symbolChangeRedrawDelay);
          });
        } catch { /* give up */ }
      }, 5000);
    }

    return () => { if (retryTimer) clearTimeout(retryTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  /* ─── Handle indicator changes ─── */
  useEffect(() => {
    if (!readyRef.current) return;

    // Redraw all overlay indicators
    drawOverlayShapes();
    updateRSIStudy();
    updateVolumesStudy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators, indicatorParams]);

  /* ─── Shared reset cooldown between health check and visibility handler ─── */
  const lastChartResetRef = useRef(0);

  /* ─── Chart health check: detect frozen chart and force resetData ─── */
  useEffect(() => {
    if (isSnapshot) return;

    let prevBarTime = 0;
    let prevRangeTo = 0;
    let staleChecks = 0;

    const interval = setInterval(() => {
      const w = widgetRef.current;
      const df = datafeedRef.current;
      const cur = currencyRef.current;
      const tf = timeframeRef.current;
      if (!w || !df || !cur || !readyRef.current) return;
      if (!socketService.isConnected()) return;
      // Don't reset too frequently — minimum 60s between resets (shared with visibility handler)
      if (Date.now() - lastChartResetRef.current < 60_000) return;

      const apiTf = resolutionToTimeframe(timeframeToResolution(tf));
      const barInfo = df.getLastBarInfo(cur, apiTf);
      if (!barInfo) return;

      const barAdvanced = prevBarTime !== 0 && barInfo.time > prevBarTime;
      prevBarTime = barInfo.time;

      // On higher timeframes the current candle can update for a long time
      // while the visible range stays unchanged. Treat a static range as
      // suspicious only after the cache actually advances to a newer bar.
      if (!barAdvanced) { staleChecks = 0; return; }

      // A newer bar exists — now check if the chart's visible range advanced too.
      try {
        const range = w.activeChart().getVisibleRange();
        if (!range) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const tfSec = getTimeframeSeconds(apiTf);
        // Only check charts that were recently showing live data
        // (range.to is within 10 candle periods of "now")
        const wasShowingLive = (nowSec - range.to) < tfSec * 10;

        if (wasShowingLive && range.to === prevRangeTo) {
          // Visible range hasn't moved but price changed — chart may be frozen
          staleChecks++;
          if (staleChecks >= 2) {
            console.warn(
              `[TVChart] ${cur}:${tf} — price changing but chart range stuck for ${staleChecks * 15}s, forcing resetData()`,
            );
            try { w.activeChart().resetData(); } catch { /* ignore */ }
            staleChecks = 0;
            lastChartResetRef.current = Date.now();
          }
        } else {
          staleChecks = 0;
        }
        prevRangeTo = range.to;
      } catch { /* ignore */ }
    }, 15_000);

    return () => clearInterval(interval);
  }, [isSnapshot]);

  /* ─── Diagnostic ticker: log last bar info every 10s ─── */
  useEffect(() => {
    if (isSnapshot) return;

    let noBarsCount = 0;

    const interval = setInterval(() => {
      const df = datafeedRef.current;
      const cur = currencyRef.current;
      const tf = timeframeRef.current;
      if (!df || !cur) return;

      const apiTf = resolutionToTimeframe(timeframeToResolution(tf));
      const info = df.getLastBarInfo(cur, apiTf);
      const subs = df.getSubscriptionInfo();
      const mySub = subs.find(s => s.currency === cur && s.timeframe === apiTf);

      if (info) {
        noBarsCount = 0;
        const barDate = new Date(info.time);
        const age = Math.round((Date.now() - info.time) / 1000);
        const tickAge = mySub ? Math.round((Date.now() - mySub.lastTick) / 1000) : '?';
        console.log(
          `[📊 Diag] ${cur}:${apiTf} | lastBar: ${barDate.toLocaleTimeString()} (${age}s ago) | close: ${info.close} | bars: ${info.count} | lastTick: ${tickAge}s ago | resets: ${mySub?.resetCount ?? '?'} | socket: ${socketService.isConnected() ? '✅' : '❌'} | widget: ${readyRef.current ? '✅' : '❌'}`,
        );
      } else {
        noBarsCount++;
        console.log(
          `[📊 Diag] ${cur}:${apiTf} | NO BARS IN CACHE (${noBarsCount}) | socket: ${socketService.isConnected() ? '✅' : '❌'} | widget: ${readyRef.current ? '✅' : '❌'}`,
        );
        // Fallback recovery: if no bars for 30s and tab is visible, force resetData
        if (noBarsCount >= 3 && !document.hidden && socketService.isConnected() && readyRef.current) {
          const w = widgetRef.current;
          if (w) {
            console.warn(`[TVChart] ${cur}:${apiTf} — no bars in cache for ${noBarsCount * 10}s, forcing resetData()`);
            // Reset watchdog counts so it can work again after recovery
            df.resetWatchdogCounts(cur, apiTf);
            lastChartResetRef.current = Date.now();
            try { w.activeChart().resetData(); } catch { /* ignore */ }
            noBarsCount = 0;
          }
        }
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [isSnapshot]);

  /* ─── Visibility-based chart recovery: redraw when tab becomes visible after >60s ─── */
  useEffect(() => {
    if (isSnapshot) return;

    // If tab is already hidden at mount time, treat mount-time as hiddenAt
    // so when the tab becomes visible the handler correctly computes awayMs.
    let hiddenAt = document.hidden ? Date.now() : 0;

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }

      // Tab is now visible
      if (hiddenAt === 0) return; // was never hidden
      const awayMs = Date.now() - hiddenAt;
      hiddenAt = 0;

      // Less than 10s away — no action needed
      if (awayMs < 10_000) return;

      const w = widgetRef.current;
      const cur = currencyRef.current;
      const tf = timeframeRef.current;
      if (!w || !cur || !readyRef.current) return;

      const apiTf = resolutionToTimeframe(timeframeToResolution(tf));
      const awaySec = Math.round(awayMs / 1000);

      // Always re-subscribe to ensure socket is sending data
      socketService.subscribeToCurrency(cur);

      if (awayMs >= 60_000) {
        // Skip if health check already reset recently
        if (Date.now() - lastChartResetRef.current < 30_000) {
          console.log(`[TVChart] Tab visible after ${awaySec}s — skipping reset (health check reset ${Math.round((Date.now() - lastChartResetRef.current) / 1000)}s ago)`);
          return;
        }
        // Away for >1 minute — force chart reset with delay
        // (wait for App.tsx to re-establish socket connection first)
        console.log(`[TVChart] Tab visible after ${awaySec}s — scheduling chart reset for ${cur}:${apiTf}`);
        const delay = socketService.isConnected() ? 500 : 3000;
        setTimeout(() => {
          // Double-check guard in case health check fired during the delay
          if (Date.now() - lastChartResetRef.current < 30_000) {
            console.log(`[TVChart] Skipping delayed reset — health check already handled it`);
            return;
          }
          console.log(`[TVChart] Executing delayed chart reset for ${cur}:${apiTf}`);
          socketService.subscribeToCurrency(cur);
          // Reset watchdog counts so it can work again after this recovery
          const df = datafeedRef.current;
          if (df) df.resetWatchdogCounts(cur, apiTf);
          // Do NOT clearCache — it causes race condition where price_update seeds
          // a single-bar cache before getBars() can populate full history.
          // resetData() triggers unsubscribeBars→getBars→subscribeBars cycle,
          // and getBars() will fetch fresh data into the cache.
          lastChartResetRef.current = Date.now();
          try { w.activeChart().resetData(); } catch (e) { console.warn('[TVChart] resetData failed:', e); }
          // Redraw overlays after data loads
          setTimeout(() => drawOverlayShapes(), 2000);
        }, delay);
      } else {
        // 10s–60s away — already re-subscribed above, that's enough
        console.log(`[TVChart] Tab visible after ${awaySec}s — re-subscribed ${cur}`);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawOverlayShapes, isSnapshot]);

  /* ─── Bet visualization (PocketOption-style shapes on chart) ─── */
  // Stable key for each bet — placedAt never changes during temp→server id transfer
  const vizKey = useCallback((bet: ActiveBet) => String(bet.placedAt), []);
  // Each bet stores an array of EntityIds: [horizontalLine, verticalLine?]
  const betLinesRef = useRef<Map<string, EntityId[]>>(new Map());
  // Track bets that still need a vertical line created (deferred until expiry bar exists)
  const vertPendingRef = useRef<Set<string>>(new Set());
  // Track bets whose result was already applied
  const resultAppliedRef = useRef<Set<string>>(new Set());
  // Fallback entry prices for bets placed before chart was ready
  const betEntryPriceRef = useRef<Map<string, number>>(new Map());
  const betTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeBetsRef = useRef(activeBets);
  activeBetsRef.current = activeBets;

  // Chip overlay state (updated every second by timer)
  interface BetChipInfo {
    key: string;
    direction: 'call' | 'put';
    amount: number;
    countdown: string;
    isWinning: boolean;
  }
  const [, setBetChips] = useState<BetChipInfo[]>([]);

  // Helper: get entry price for a bet (from bet itself or fallback cache)
  const getEntryPrice = useCallback((bet: ActiveBet): number | undefined => {
    if (typeof bet.entryPrice === 'number' && Number.isFinite(bet.entryPrice)) return bet.entryPrice;
    // Try global po_order_opened cache by trade_id
    if (bet.trade_id) {
      const poPrice = betterSocket.getCachedEntryPrice(bet.trade_id);
      if (poPrice != null) return poPrice;
    }
    const key = String(bet.placedAt);
    const cached = betEntryPriceRef.current.get(key);
    if (cached != null) return cached;

    // Try datafeed barCache
    const df = datafeedRef.current;
    const cur = currencyRef.current;
    const tf = timeframeRef.current;
    if (df && cur) {
      try {
        const apiTf = resolutionToTimeframe(timeframeToResolution(tf));
        const bars = df.getCachedBars(cur, apiTf);
        if (bars.length > 0) {
          const price = bars[bars.length - 1].close;
          betEntryPriceRef.current.set(key, price);
          return price;
        }
      } catch { /* ignore */ }
    }
    return undefined;
  }, []);

  const removeShapes = (chart: any, ids: EntityId[]) => {
    for (const eid of ids) {
      try { chart.removeEntity(eid); } catch { /* ignore */ }
    }
  };

  // Helper: apply result styling to shapes
  const applyResult = useCallback((chart: any, entityIds: EntityId[], bet: ActiveBet) => {
    if (!bet.result) return;
    const isWin = bet.result === 'win';
    const resultColor = isWin ? '#2ebd85' : '#f6465d';

    // Update horiz line color
    if (entityIds[0]) {
      try {
        const api = chart.getShapeById(entityIds[0]);
        if (api) {
          api.setProperties({ linecolor: resultColor });
        }
      } catch { /* ignore */ }
    }
    // Update vert line color
    if (entityIds[1]) {
      try {
        const api = chart.getShapeById(entityIds[1]);
        if (api) {
          api.setProperties({ linecolor: resultColor });
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Main effect: create / remove / update bet shapes
  useEffect(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) {
      if (activeBets.length > 0) console.debug('[BetViz] Widget not ready, skipping', activeBets.length, 'bets. widget=', !!w, 'ready=', readyRef.current);
      return;
    }
    console.debug('[BetViz] Processing', activeBets.length, 'activeBets for currency=', currency, activeBets.map(b => ({ key: vizKey(b), asset: b.asset, dir: b.direction, entry: b.entryPrice })));

    const chart = w.activeChart();
    const currentKeys = new Set(activeBets.map(vizKey));

    // ── Remove shapes for bets no longer in activeBets ──
    for (const [key, entityIds] of betLinesRef.current) {
      if (!currentKeys.has(key)) {
        removeShapes(chart, entityIds);
        betLinesRef.current.delete(key);
        vertPendingRef.current.delete(key);
        resultAppliedRef.current.delete(key);
        betEntryPriceRef.current.delete(key);
      }
    }

    // ── Helper: get last bar time from cached bars (known valid time for shapes) ──
    const getLastBarTime = (): number | null => {
      const df = datafeedRef.current;
      const cur = currencyRef.current;
      const tfNow = timeframeRef.current;
      if (!df || !cur) return null;
      try {
        const apiTf = resolutionToTimeframe(timeframeToResolution(tfNow));
        const cached = df.getCachedBars(cur, apiTf);
        if (cached.length > 0) return cached[cached.length - 1].time;
      } catch { /* ignore */ }
      return null;
    };

    // ── Create shapes for new bets ──
    for (const bet of activeBets) {
      const key = vizKey(bet);
      if (betLinesRef.current.has(key)) continue;

      const entryPrice = getEntryPrice(bet);
      if (entryPrice == null) {
        console.debug('[BetViz] No entry price for bet:', key, bet.asset, bet.entryPrice);
        continue;
      }

      // Use last bar time as anchor — shape points must align with existing bar times
      const anchorTime = getLastBarTime();
      if (anchorTime == null) {
        console.debug('[BetViz] No anchor time for bet:', key, bet.asset);
        continue;
      }

      console.debug('[BetViz] Creating shapes for bet:', key, bet.asset, bet.direction, 'entry:', entryPrice, 'anchor:', anchorTime, 'expiry:', bet.expiresAt);

      // Reserve slot immediately to prevent duplicate creation
      betLinesRef.current.set(key, []);

      // Expiry vertical line — created immediately at future expiry time
      const expiryTimeSec = Math.floor(bet.expiresAt / 1000);
      chart.createShape(
        { time: expiryTimeSec },
        {
          shape: 'vertical_line',
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          overrides: {
            linecolor: '#888',
            linestyle: 2,
            linewidth: 1,
          } as any,
          zOrder: 'top',
          showInObjectsTree: false,
        },
      ).then((vertId) => {
        if (vertId) {
          const ids = betLinesRef.current.get(key);
          if (ids) {
            ids[1] = vertId;
          } else {
            try { chart.removeEntity(vertId); } catch { /* ignore */ }
          }
        }
      }).catch(() => { /* ignore */ });

      // horizontal_line: renders full-width at the entry price level
      const initRemaining = Math.max(0, Math.ceil((bet.expiresAt - betterSocket.getServerNowMs()) / 1000));
      const initCountdown = formatBetCountdown(initRemaining);
      chart.createShape(
        { time: anchorTime, price: entryPrice },
        {
          shape: 'horizontal_line',
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          overrides: {
            linecolor: '#888',
            linestyle: 2,
            linewidth: 3,
            showLabel: true,
            showPrice: true,
            textcolor: '#888',
            fontsize: 16,
            text: `⏱ ${initCountdown}  ${currencySymbol(balanceCurrencyRef.current)}${bet.amount}`,
          } as any,
          zOrder: 'top',
          showInObjectsTree: false,
        },
      ).then((horizId) => {
        if (!horizId) {
          if (betLinesRef.current.has(key) && betLinesRef.current.get(key)!.length === 0) {
            betLinesRef.current.delete(key);
            vertPendingRef.current.delete(key);
          }
          return;
        }
        const ids = betLinesRef.current.get(key);
        if (ids) {
          ids[0] = horizId;
          const currentBet = activeBetsRef.current.find(b => vizKey(b) === key);
          if (currentBet?.result && !resultAppliedRef.current.has(key)) {
            resultAppliedRef.current.add(key);
            applyResult(chart, ids, currentBet);
            // Schedule shape removal from chart after 2s (result is briefly shown)
            const capturedKey = key;
            setTimeout(() => {
              const captured = betLinesRef.current.get(capturedKey);
              if (!captured || captured.length === 0) return;
              const ww = widgetRef.current;
              if (ww && readyRef.current) {
                try { removeShapes(ww.activeChart(), captured); } catch { /* ignore */ }
              }
              betLinesRef.current.set(capturedKey, []);
            }, 2000);
          }
        } else {
          try { chart.removeEntity(horizId); } catch { /* ignore */ }
        }
      }).catch(() => {
        if (betLinesRef.current.has(key) && betLinesRef.current.get(key)!.length === 0) {
          betLinesRef.current.delete(key);
          vertPendingRef.current.delete(key);
        }
      });
    }

    // ── Update existing shapes on result ──
    for (const bet of activeBets) {
      if (!bet.result) continue;
      const key = vizKey(bet);
      if (resultAppliedRef.current.has(key)) continue; // Already applied

      const entityIds = betLinesRef.current.get(key);
      if (!entityIds) {
        console.debug('[BetViz] Result: no entry for key:', key, '— skipping');
        continue;
      }
      if (entityIds.length === 0 || !entityIds[0]) {
        console.debug('[BetViz] Result: shape still pending for key:', key, '— will apply in .then()');
        continue;
      }

      resultAppliedRef.current.add(key);
      applyResult(chart, entityIds, bet);
      // Schedule shape removal from chart after 2s (result colour is briefly shown,
      // then shapes disappear — independent of the activeBets state-chain)
      const capturedKey = key;
      setTimeout(() => {
        const captured = betLinesRef.current.get(capturedKey);
        if (!captured || captured.length === 0) return;
        const ww = widgetRef.current;
        if (ww && readyRef.current) {
          try { removeShapes(ww.activeChart(), captured); } catch { /* ignore */ }
        }
        betLinesRef.current.set(capturedKey, []);
      }, 2000);
    }
  }, [activeBets, vizKey, applyResult, getEntryPrice]);

  // Countdown timer — update label text every second + create deferred shapes
  useEffect(() => {
    if (betTimerRef.current) clearInterval(betTimerRef.current);
    if (activeBets.length === 0) return;

    betTimerRef.current = setInterval(() => {
      const w = widgetRef.current;
      if (!w || !readyRef.current) return;
      const chart = w.activeChart();
      const bets = activeBetsRef.current;
      const betsKeySet = new Set(bets.map(vizKey));

      // ── Safety net: remove shapes whose bet is no longer in activeBets ──
      for (const [key, entityIds] of betLinesRef.current) {
        if (!betsKeySet.has(key)) {
          removeShapes(chart, entityIds);
          betLinesRef.current.delete(key);
          vertPendingRef.current.delete(key);
          resultAppliedRef.current.delete(key);
          betEntryPriceRef.current.delete(key);
        }
      }

      // ── Safety net: remove shapes for bets that expired long ago (>45s) ──
      const now = betterSocket.getServerNowMs();
      for (const [key, entityIds] of betLinesRef.current) {
        const bet = bets.find(b => vizKey(b) === key);
        if (!bet) continue;
        const expiryMs = bet.expiresAt;
        // If bet has result and it's been >5s, force remove visualization
        if (bet.result && now - expiryMs > 5000) {
          removeShapes(chart, entityIds);
          betLinesRef.current.delete(key);
          vertPendingRef.current.delete(key);
          resultAppliedRef.current.delete(key);
          betEntryPriceRef.current.delete(key);
          continue;
        }
        // If no result and overdue >15s, force remove (server never responded)
        if (!bet.result && now - expiryMs > 15_000) {
          removeShapes(chart, entityIds);
          betLinesRef.current.delete(key);
          vertPendingRef.current.delete(key);
          resultAppliedRef.current.delete(key);
          betEntryPriceRef.current.delete(key);
          continue;
        }
      }

      // ── Get current price for win/loss coloring ──
      const df = datafeedRef.current;
      const cur = currencyRef.current;
      const tfNow = timeframeRef.current;
      let currentPrice: number | null = null;
      if (df && cur) {
        try {
          const apiTf = resolutionToTimeframe(timeframeToResolution(tfNow));
          const cached = df.getCachedBars(cur, apiTf);
          if (cached.length > 0) currentPrice = cached[cached.length - 1].close;
        } catch { /* ignore */ }
      }

      const nextChips: { key: string; direction: 'call' | 'put'; amount: number; countdown: string; isWinning: boolean }[] = [];

      // Helper: get last bar time for shape anchoring
      const getTimerLastBarTime = (): number | null => {
        if (!df || !cur) return null;
        try {
          const apiTf = resolutionToTimeframe(timeframeToResolution(tfNow));
          const cached = df.getCachedBars(cur, apiTf);
          if (cached.length > 0) return cached[cached.length - 1].time;
        } catch { /* ignore */ }
        return null;
      };

      for (const bet of bets) {
        const key = vizKey(bet);

        // ── Retry: create HORIZ shape for bets that were missing entryPrice / barTime ──
        if (!betLinesRef.current.has(key)) {
          const entryPrice = getEntryPrice(bet);
          if (entryPrice == null) continue;

          const anchorTime = getTimerLastBarTime();
          if (anchorTime == null) continue;

          betLinesRef.current.set(key, []);

          // Expiry vertical line — created immediately at future expiry time
          const retryExpiryTimeSec = Math.floor(bet.expiresAt / 1000);
          chart.createShape(
            { time: retryExpiryTimeSec },
            {
              shape: 'vertical_line',
              lock: true,
              disableSelection: true,
              disableSave: true,
              disableUndo: true,
              overrides: {
                linecolor: '#888',
                linestyle: 2,
                linewidth: 1,
              } as any,
              zOrder: 'top',
              showInObjectsTree: false,
            },
          ).then((vertId) => {
            if (vertId) {
              const ids = betLinesRef.current.get(key);
              if (ids) {
                ids[1] = vertId;
              } else {
                try { chart.removeEntity(vertId); } catch { /* ignore */ }
              }
            }
          }).catch(() => { /* ignore */ });

          const retryRemaining = Math.max(0, Math.ceil((bet.expiresAt - betterSocket.getServerNowMs()) / 1000));
          const retryCountdown = formatBetCountdown(retryRemaining);
          chart.createShape(
            { time: anchorTime, price: entryPrice },
            {
              shape: 'horizontal_line',
              lock: true,
              disableSelection: true,
              disableSave: true,
              disableUndo: true,
              overrides: {
                linecolor: '#888',
                linestyle: 2,
                linewidth: 2,
                showLabel: true,
                showPrice: true,
                textcolor: '#888',
                fontsize: 10,
                text: `⏱ ${retryCountdown}  ${currencySymbol(balanceCurrencyRef.current)}${bet.amount}`,
              } as any,
              zOrder: 'top',
              showInObjectsTree: false,
            },
          ).then((horizId) => {
            if (horizId) {
              const ids = betLinesRef.current.get(key);
              if (ids) {
                ids[0] = horizId;
              } else {
                try { chart.removeEntity(horizId); } catch { /* ignore */ }
              }
            } else {
              betLinesRef.current.delete(key);
              vertPendingRef.current.delete(key);
            }
          }).catch(() => {
            betLinesRef.current.delete(key);
            vertPendingRef.current.delete(key);
          });
          continue;
        }

        if (bet.result) continue;

        const entityIds = betLinesRef.current.get(key);
        if (!entityIds || !entityIds[0]) continue;

        const isCall = bet.direction === 'call';
        const entryPrice = getEntryPrice(bet);
        const remaining = Math.max(0, Math.ceil((bet.expiresAt - betterSocket.getServerNowMs()) / 1000));

        // Determine win/loss color from current price vs entry
        const isWinning = currentPrice != null && entryPrice != null
          ? (isCall ? currentPrice >= entryPrice : currentPrice <= entryPrice)
          : true;
        const dynColor = isWinning ? '#2ebd85' : '#f6465d';

        // Update horizontal_line color + countdown text dynamically
        const countdownText = remaining > 0 ? `⏱ ${formatBetCountdown(remaining)}  ${currencySymbol(balanceCurrencyRef.current)}${bet.amount}` : `⏱ 0:00  ${currencySymbol(balanceCurrencyRef.current)}${bet.amount}`;
        try {
          const horizApi = chart.getShapeById(entityIds[0]);
          if (horizApi) {
            horizApi.setProperties({ linecolor: dynColor, textcolor: dynColor, text: countdownText });
          }
        } catch { /* ignore */ }

        // Build chip data for React overlay
        if (entryPrice != null) {
          nextChips.push({ key, direction: bet.direction, amount: bet.amount, countdown: formatBetCountdown(remaining), isWinning });
        }

        // Update vertical_line color dynamically
        if (entityIds[1]) {
          try {
            const vertApi = chart.getShapeById(entityIds[1]);
            if (vertApi) {
              vertApi.setProperties({ linecolor: dynColor });
            }
          } catch { /* ignore */ }
        }
      }

      setBetChips(nextChips);
    }, 1000);

    return () => {
      if (betTimerRef.current) clearInterval(betTimerRef.current);
      setBetChips([]);
    };
  }, [activeBets, vizKey, getEntryPrice]);

  // Clean up all bet shapes on unmount
  useEffect(() => {
    return () => {
      const w = widgetRef.current;
      if (w && readyRef.current) {
        const chart = w.activeChart();
        for (const [, entityIds] of betLinesRef.current) {
          removeShapes(chart, entityIds);
        }
      }
      betLinesRef.current.clear();
      vertPendingRef.current.clear();
      resultAppliedRef.current.clear();
      betEntryPriceRef.current.clear();
      if (betTimerRef.current) clearInterval(betTimerRef.current);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}
      />

      {/* Bet chip overlays */}
      {/* {betChips.length > 0 && (
        <div className="bet-chips">
          {betChips.map(chip => (
            <div key={chip.key} className={`bet-chip ${chip.isWinning ? 'bet-chip--winning' : 'bet-chip--losing'}`}>
              <span>{chip.direction === 'call' ? '▲' : '▼'}</span>
              <span>${chip.amount}</span>
              <span>{chip.countdown}</span>
            </div>
          ))}
        </div>
      )} */}

      {/* Bet result flash overlays */}
      {activeBets.filter(b => b.result && b.entryPrice).map(bet => (
        <div
          key={bet.bet_id}
          className={`bet-viz__flash bet-viz__flash--${bet.result}`}
        >
          <span className="bet-viz__flash-icon">{bet.result === 'win' ? '✓' : '✗'}</span>
          <span className="bet-viz__flash-amount">
            {bet.result === 'win' ? `+${currencySymbol(balanceCurrency)}${(bet.profit ?? 0).toFixed(2)}` : `-${currencySymbol(balanceCurrency)}${bet.amount.toFixed(2)}`}
          </span>
        </div>
      ))}

      {noSignalPair && (
        <div className="tv-no-signal" aria-live="polite">
          <div className="tv-no-signal__pair">{formatRequestedPair(noSignalPair)}</div>
          <div className="tv-no-signal__meta">{t.timeframe}: {formatRequestedTimeframe(timeframeRef.current)}</div>
          <div className="tv-no-signal__message">{t.tvNoSignalForPair}</div>
        </div>
      )}

      {/* Dashboard overlays */}
      {Object.entries(dashboards).map(([key, db]) => {
        const offset = dashboardOffsets[key];
        const dragHandle = (event: ReactPointerEvent<HTMLDivElement>) => handleDashboardPointerDown(key, event);

        return (
        <div
          key={key}
          className={`indicator-dashboard indicator-dashboard--${db.position || 'top-right'}${draggingDashboardKey === key ? ' indicator-dashboard--dragging' : ''}`}
          style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
          onPointerDown={!db.title ? dragHandle : undefined}
        >
          {db.title && (
            <div className="indicator-dashboard__title" onPointerDown={dragHandle}>
              {db.title}
            </div>
          )}
          {db.rows.map((row, i) => (
            <div key={i} className="indicator-dashboard__row">
              <span className="indicator-dashboard__label">{row.label}</span>
              <span className="indicator-dashboard__value" style={row.color ? { color: row.color } : undefined}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        );
      })}

      {/* Alert toasts */}
      {alertToasts.length > 0 && (
        <div className="indicator-alerts">
          {alertToasts.map(toast => (
            <div
              key={toast.id}
              className="indicator-alert"
              style={toast.color ? { borderLeftColor: toast.color } : undefined}
            >
              <span className="indicator-alert__icon">⚡</span>
              <span className="indicator-alert__msg">{toast.message}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
});
