import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import type { IChartApi, CandlestickSeriesPartialOptions, CandlestickData, Time } from 'lightweight-charts';
import { generateDemoData } from '../utils/demoData';
import { getHistoricalData } from '../api/currencies';
import { socketService, type CandleClosed, type PriceUpdate } from '../api/socket';
import { INDICATOR_REGISTRY, applyLockedIndicatorParams } from '../types/chart';
import type { IndicatorInstance } from '../types/chart';
import { CandleCountdown, getTimeframeSeconds } from '../plugins/CandleCountdown';

/* ─── Constants ─── */
/** How many candles to fetch for first visible load */
const INITIAL_LOAD = 100;
/** How many candles to fetch per pagination chunk */
const PAGE_SIZE = 200;
/** Trigger pagination when user scrolls within N bars of left edge */
const LOAD_MORE_THRESHOLD = 10;
/** Total candles cap for 2-day background preload */
const BG_PRELOAD_LIMIT = 3000;

export interface ChartHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  scrollToEnd: () => void;
}

interface ChartProps {
  currency?: string;
  timeframe: string;
  activeIndicators: Record<string, boolean>;
  indicatorParams: Record<string, Record<string, unknown>>;
  /** 0 = off, positive = how many candles to keep visible from right edge */
  autoScroll?: number;
}

/** Map API candles to lightweight-charts format */
function mapCandles(raw: Array<{
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}>): CandlestickData<Time>[] {
  return raw.map((c) => ({
    time: (Math.floor(new Date(c.open_time).getTime() / 1000)) as Time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

/** Detect the max number of decimal places from candle data for proper price formatting */
function detectPrecision(candles: CandlestickData<Time>[]): { precision: number; minMove: number } {
  let maxDecimals = 2;
  const sample = candles.slice(-100);
  for (const c of sample) {
    for (const val of [c.open, c.high, c.low, c.close]) {
      const str = val.toString();
      const dotIdx = str.indexOf('.');
      if (dotIdx >= 0) {
        const decimals = str.length - dotIdx - 1;
        if (decimals > maxDecimals) maxDecimals = decimals;
      }
    }
  }
  maxDecimals = Math.min(maxDecimals, 8);
  return { precision: maxDecimals, minMove: 1 / Math.pow(10, maxDecimals) };
}

/** Merge older candles in front, deduplicating by time */
function prependCandles(
  existing: CandlestickData<Time>[],
  older: CandlestickData<Time>[],
): CandlestickData<Time>[] {
  if (older.length === 0) return existing;
  const existingTimes = new Set(existing.map((c) => c.time));
  const unique = older.filter((c) => !existingTimes.has(c.time));
  if (unique.length === 0) return existing;
  return [...unique, ...existing].sort((a, b) => (a.time as number) - (b.time as number));
}

export const Chart = forwardRef<ChartHandle, ChartProps>(function Chart({
  currency,
  timeframe,
  activeIndicators,
  indicatorParams,
  autoScroll = 50,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const indicatorsRef = useRef<Record<string, IndicatorInstance>>({});
  const candlesRef = useRef<CandlestickData<Time>[]>([]);
  const countdownRef = useRef<CandleCountdown | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  /** Abort controller for cancelling stale fetch requests */
  const abortRef = useRef<AbortController | null>(null);
  /** Flag: is older history currently being fetched */
  const loadingMoreRef = useRef(false);
  /** Flag: server has no more older data */
  const allLoadedRef = useRef(false);
  /** Mutable ref mirrors for use inside callbacks */
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;

  /** Scroll chart so that the last N candles are visible */
  const applyAutoScroll = useCallback(() => {
    const v = autoScrollRef.current;
    if (!v) return; // 0 or falsy = disabled
    const ts = chartRef.current?.timeScale();
    const arr = candlesRef.current;
    if (!ts || arr.length === 0) return;
    const total = arr.length;
    ts.setVisibleLogicalRange({ from: total - v - 0.5, to: total + 1.5 });
  }, []);
  const currencyRef = useRef(currency);
  currencyRef.current = currency;
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  /* ─── Expose methods ─── */
  useImperativeHandle(ref, () => ({
    zoomIn() {
      const ts = chartRef.current?.timeScale();
      if (!ts) return;
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const mid = (range.from + range.to) / 2;
      const half = (range.to - range.from) / 4;
      ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
    },
    zoomOut() {
      const ts = chartRef.current?.timeScale();
      if (!ts) return;
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const mid = (range.from + range.to) / 2;
      const half = (range.to - range.from);
      ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
    },
    resetZoom() {
      chartRef.current?.timeScale().fitContent();
    },
    scrollToEnd() {
      chartRef.current?.timeScale().scrollToRealTime();
    },
  }), []);

  /* ─── Load more (pagination) when scrolling left ─── */
  const loadMore = useCallback(async () => {
    const cur = currencyRef.current;
    const tf = timeframeRef.current;
    if (!cur || loadingMoreRef.current || allLoadedRef.current) return;
    const arr = candlesRef.current;
    if (arr.length === 0) return;

    loadingMoreRef.current = true;
    const oldestTime = arr[0].time as number;

    try {
      const raw = await getHistoricalData(cur, tf, PAGE_SIZE, { before: oldestTime });
      const older = mapCandles(raw);
      if (older.length === 0) {
        allLoadedRef.current = true;
      } else {
        // Save visible range so setData doesn't reset scroll position
        const ts = chartRef.current?.timeScale();
        const savedRange = ts?.getVisibleLogicalRange();
        const addedCount = older.filter((c) => !new Set(arr.map((a) => a.time)).has(c.time)).length;

        const merged = prependCandles(arr, older);
        candlesRef.current = merged;
        seriesRef.current?.setData(merged);

        // Restore visible range, shifted by the number of prepended candles
        if (savedRange && ts && addedCount > 0) {
          ts.setVisibleLogicalRange({
            from: savedRange.from + addedCount,
            to: savedRange.to + addedCount,
          });
        }

        // Re-run indicators with full dataset
        for (const inst of Object.values(indicatorsRef.current)) {
          try { inst.update([...merged]); } catch { /* ignore */ }
        }
      }
    } catch {
      // Network error — let user retry by scrolling again
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  /* ─── Background preload last 2 days ─── */
  const bgPreload = useCallback(async (cur: string, tf: string, signal: AbortSignal) => {
    await new Promise((r) => setTimeout(r, 1500));
    if (signal.aborted) return;

    const arr = candlesRef.current;
    if (arr.length === 0 || allLoadedRef.current) return;
    const oldestTime = arr[0].time as number;

    const tfSecs = getTimeframeSeconds(tf);
    const twoDaysCandles = Math.min(Math.ceil((2 * 86400) / tfSecs), BG_PRELOAD_LIMIT);
    const needMore = twoDaysCandles - arr.length;
    if (needMore <= 0) return;

    try {
      const raw = await getHistoricalData(cur, tf, needMore, { before: oldestTime, signal });
      if (signal.aborted) return;
      const older = mapCandles(raw);
      if (older.length === 0) {
        allLoadedRef.current = true;
        return;
      }
      const merged = prependCandles(candlesRef.current, older);

      // Save visible range so setData doesn't reset scroll position
      const ts = chartRef.current?.timeScale();
      const savedRange = ts?.getVisibleLogicalRange();
      const addedCount = merged.length - candlesRef.current.length;

      candlesRef.current = merged;
      seriesRef.current?.setData(merged);

      // Restore visible range shifted by the prepended count
      if (savedRange && ts && addedCount > 0) {
        ts.setVisibleLogicalRange({
          from: savedRange.from + addedCount,
          to: savedRange.to + addedCount,
        });
      }

      for (const inst of Object.values(indicatorsRef.current)) {
        try { inst.update([...merged]); } catch { /* ignore */ }
      }
      if (older.length < needMore) allLoadedRef.current = true;
    } catch {
      // Silently fail — not critical
    }
  }, []);

  /* ─── Create chart once ─── */
  useEffect(() => {
    if (!containerRef.current) return;

    const isMobileChart = window.matchMedia('(max-width: 600px)').matches;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#848e9c',
        fontSize: isMobileChart ? 9 : 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: 'rgba(255,255,255,0.06)',
        rightOffset: isMobileChart ? 2 : 5,
        barSpacing: isMobileChart ? 3 : 3,
        minBarSpacing: 1,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        minimumWidth: isMobileChart ? 40 : 60,
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.1)', labelBackgroundColor: '#2ebd85' },
        horzLine: { color: 'rgba(255,255,255,0.1)', labelBackgroundColor: '#2ebd85' },
      },
    });

    const opts: CandlestickSeriesPartialOptions = {
      upColor: '#2ebd85',
      downColor: '#f6465d',
      borderVisible: false,
      wickUpColor: '#2ebd85',
      wickDownColor: '#f6465d',
    };

    const series = chart.addSeries(CandlestickSeries, opts);
    chartRef.current = chart;
    seriesRef.current = series;

    // ── OHLC legend overlay ──
    const legend = document.createElement('div');
    legend.style.cssText = `
      position: absolute; left: 8px; bottom: 32px; z-index: 3;
      font-size: 10px; font-family: monospace;
      color: #848e9c; pointer-events: none;
      line-height: 1.5; white-space: nowrap;
    `;
    containerRef.current!.style.position = 'relative';
    containerRef.current!.appendChild(legend);
    legendRef.current = legend;

    const updateLegend = (candle: CandlestickData<Time> | null) => {
      if (!candle || !legend) { legend.innerHTML = ''; return; }
      const clr = candle.close >= candle.open ? '#2ebd85' : '#f6465d';
      legend.innerHTML =
        `<span style="color:${clr}">O</span> <span style="color:#ccc">${candle.open}</span> ` +
        `<span style="color:${clr}">H</span> <span style="color:#ccc">${candle.high}</span> ` +
        `<span style="color:${clr}">L</span> <span style="color:#ccc">${candle.low}</span> ` +
        `<span style="color:${clr}">C</span> <span style="color:#ccc">${candle.close}</span>`;
    };

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        const arr = candlesRef.current;
        updateLegend(arr.length > 0 ? arr[arr.length - 1] : null);
        return;
      }
      const data = param.seriesData.get(series) as CandlestickData<Time> | undefined;
      updateLegend(data ?? null);
    });

    // ── Infinite scroll: load more when near left edge ──
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      if (range.from <= LOAD_MORE_THRESHOLD) {
        loadMore();
      }
    });

    // Attach candle countdown primitive to main pane
    const countdown = new CandleCountdown(timeframe);
    countdown.setSeries(series as Parameters<typeof countdown.setSeries>[0]);
    countdown.setChart(chart as Parameters<typeof countdown.setChart>[0]);
    try {
      const mainPane = chart.panes()[0];
      if (mainPane) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainPane.attachPrimitive(countdown as any);
      }
    } catch { /* older API fallback — ignore */ }
    countdownRef.current = countdown;

    return () => {
      if (countdownRef.current) {
        countdownRef.current.destroy();
        countdownRef.current = null;
      }
      for (const inst of Object.values(indicatorsRef.current)) {
        try { inst.destroy(); } catch { /* ignore */ }
      }
      indicatorsRef.current = {};
      if (legendRef.current) {
        legendRef.current.remove();
        legendRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Load data when currency or timeframe changes ─── */
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    // Cancel previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Reset pagination state
    loadingMoreRef.current = false;
    allLoadedRef.current = false;

    // Destroy old indicators
    for (const inst of Object.values(indicatorsRef.current)) {
      try { inst.destroy(); } catch { /* ignore */ }
    }
    indicatorsRef.current = {};

    // Clear chart immediately when switching — prevents stale view
    series.setData([]);
    candlesRef.current = [];

    let cancelled = false;

    (async () => {
      let data: CandlestickData<Time>[];

      if (currency) {
        try {
          const raw = await getHistoricalData(currency, timeframe, INITIAL_LOAD, { signal: ac.signal });
          if (cancelled) return;
          data = mapCandles(raw);
        } catch (err) {
          if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
          data = generateDemoData();
        }
      } else {
        data = generateDemoData();
      }

      if (cancelled) return;

      series.setData(data);
      candlesRef.current = data;

      const { precision, minMove } = detectPrecision(data);
      series.applyOptions({ priceFormat: { type: 'price', precision, minMove } });

      if (data.length > 0 && countdownRef.current) {
        const last = data[data.length - 1];
        countdownRef.current.setPrice(last.close, last.time);
      }
      if (countdownRef.current) {
        countdownRef.current.setTimeframe(timeframe);
      }

      // Scroll to latest candle
      if (autoScrollRef.current) {
        // small delay to let chart layout settle
        setTimeout(() => applyAutoScroll(), 50);
      } else {
        chart.timeScale().scrollToRealTime();
      }

      // Init all active indicators
      let nextPaneIdx = 1;
      const newIndicators: Record<string, IndicatorInstance> = {};

      for (const [key, entry] of Object.entries(INDICATOR_REGISTRY)) {
        if (!activeIndicators[key]) continue;

        let paneIndex: number | undefined;
        if (entry.meta.pane === 'separate') {
          paneIndex = nextPaneIdx++;
        }

        const ctx = {
          chart,
          candleSeries: series,
          params: applyLockedIndicatorParams(key, {
            ...entry.meta.defaultParams,
            ...(indicatorParams[key] || {}),
          }),
          LineSeries,
          HistogramSeries,
          createSeriesMarkers,
          addSeries: (def: unknown, opts: unknown, pane?: number) =>
            chart.addSeries(def as Parameters<typeof chart.addSeries>[0], opts as Parameters<typeof chart.addSeries>[1], pane),
          paneIndex,
          isDark: true,
        };

        try {
          const inst = entry.init!(ctx);
          inst.update(data);
          newIndicators[key] = inst;
        } catch (err) {
          console.warn(`Failed to init indicator ${key}:`, err);
        }
      }

      indicatorsRef.current = newIndicators;

      // Background preload last 2 days after initial render
      if (currency) {
        bgPreload(currency, timeframe, ac.signal);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [currency, timeframe, activeIndicators, indicatorParams, bgPreload]);

  /* ─── Real-time: subscribe to candle_closed & price_update ─── */
  useEffect(() => {
    if (!currency) return;

    const unsubCandle = socketService.onCandleClosed(currency, (data: CandleClosed) => {
      const series = seriesRef.current;
      if (!series) return;

      // Case-insensitive timeframe comparison (server may send "m1" vs "M1")
      if (data.timeframe.toUpperCase() !== timeframe.toUpperCase()) return;

      // Validate OHLC — reject NaN / Infinity / non-positive values
      const o = Number(data.open);
      const h = Number(data.high);
      const l = Number(data.low);
      const c = Number(data.close);
      if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return;
      if (o <= 0 || c <= 0) return;

      // Validate candle time
      const candleMs = new Date(data.open_time).getTime();
      if (!isFinite(candleMs) || candleMs <= 0) return;

      // Normalize OHLC: ensure high/low are consistent with actual open/close
      // (prevents server-side errors from creating spike candles)
      const normHigh = Math.max(h, o, c);
      const normLow  = Math.min(l, o, c);

      const candle: CandlestickData<Time> = {
        time: (Math.floor(candleMs / 1000)) as Time,
        open: o,
        high: normHigh,
        low: normLow,
        close: c,
      };

      series.update(candle);
      countdownRef.current?.setPrice(candle.close, candle.time);

      const arr = candlesRef.current;
      const lastIdx = arr.length - 1;
      if (lastIdx >= 0 && arr[lastIdx].time === candle.time) {
        arr[lastIdx] = candle;
      } else {
        arr.push(candle);
      }

      if (autoScrollRef.current) {
        applyAutoScroll();
      }

      for (const inst of Object.values(indicatorsRef.current)) {
        try { inst.update([...arr]); } catch { /* ignore */ }
      }
    });

    const unsubPrice = socketService.onPriceUpdate(currency, (data: PriceUpdate) => {
      const series = seriesRef.current;
      if (!series) return;

      // Validate incoming price — reject NaN / Infinity / zero / negative
      const price = Number(data.price);
      if (!isFinite(price) || price <= 0) return;

      // Validate timestamp
      const tickMs = new Date(data.timestamp).getTime();
      if (!isFinite(tickMs) || tickMs <= 0) return;

      // Reject ticks more than 5 min in the future (server clock drift protection)
      if (tickMs > Date.now() + 5 * 60 * 1000) return;

      const arr = candlesRef.current;
      const tickTime = Math.floor(tickMs / 1000);
      const tfSecs = getTimeframeSeconds(timeframe);
      const candleTime = (Math.floor(tickTime / tfSecs) * tfSecs) as Time;

      // If history hasn't loaded yet — seed the first candle from live tick
      // so the chart doesn't stay frozen on an empty dataset
      if (arr.length === 0) {
        const seed: CandlestickData<Time> = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
        };
        series.update(seed);
        arr.push(seed);
        countdownRef.current?.setPrice(price, seed.time);
        countdownRef.current?.syncServerTime(data.timestamp);
        return;
      }

      const last = arr[arr.length - 1];

      if (last.time === candleTime) {
        const updated = { ...last };
        updated.close = price;
        if (price > updated.high) updated.high = price;
        if (price < updated.low) updated.low = price;
        series.update(updated);
        arr[arr.length - 1] = updated;
        countdownRef.current?.setPrice(price, updated.time);
      } else if ((candleTime as number) > (last.time as number)) {
        const newCandle: CandlestickData<Time> = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
        };
        series.update(newCandle);
        arr.push(newCandle);
        countdownRef.current?.setPrice(price, newCandle.time);

        if (autoScrollRef.current) {
          applyAutoScroll();
        }
      }

      countdownRef.current?.syncServerTime(data.timestamp);
    });

    return () => {
      unsubCandle();
      unsubPrice();
    };
  }, [currency, timeframe]);

  /* ─── Page Visibility: refresh data when tab becomes visible after long inactivity ─── */
  useEffect(() => {
    if (!currency) return;

    let lastVisibleTime = Date.now();
    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        lastVisibleTime = Date.now();
        return;
      }

      // Tab is now visible
      const inactiveDuration = Date.now() - lastVisibleTime;
      if (inactiveDuration > REFRESH_THRESHOLD) {
        console.log(`📊 Chart for ${currency} refreshing after ${Math.round(inactiveDuration / 1000)}s inactivity`);

        const series = seriesRef.current;
        if (series && currency) {
          try {
            // Reload recent candles to ensure we have fresh data
            const fresh = await getHistoricalData(currency, timeframe, 100);
            if (fresh.length > 0) {
              const mapped = mapCandles(fresh);
              const arr = candlesRef.current;

              // Merge fresh data with existing (prefer fresh for duplicates)
              const timeMap = new Map(arr.map(c => [c.time, c]));
              mapped.forEach(c => timeMap.set(c.time, c));
              const merged = Array.from(timeMap.values()).sort((a, b) => (a.time as number) - (b.time as number));

              series.setData(merged);
              candlesRef.current = merged;

              // Update indicators
              for (const inst of Object.values(indicatorsRef.current)) {
                try { inst.update(merged); } catch { /* ignore */ }
              }

              if (autoScrollRef.current) {
                applyAutoScroll();
              }
            }
          } catch (err) {
            console.warn(`Failed to refresh chart data for ${currency}:`, err);
          }
        }
      }

      lastVisibleTime = Date.now();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currency, timeframe, applyAutoScroll]);

  /* ─── React to autoScroll prop changes immediately ─── */
  useEffect(() => {
    if (autoScroll) {
      applyAutoScroll();
    }
  }, [autoScroll, applyAutoScroll]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}
    />
  );
});
