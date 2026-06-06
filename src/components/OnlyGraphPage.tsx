/**
 * OnlyGraphPage — fullscreen chart-only mode
 *
 * Route: /only-graph?pair_code=EUR/USD&timeframe=M1&static=1&signal_time=1713520800&bars=100
 *
 * - No authorization required
 * - Only selected indicators enabled by default
 * - No UI chrome — just the chart
 */

import { useEffect, useState } from 'react';
import { TVChart } from './TVChart';
import { socketService } from '../api/socket';
import { useI18n } from '../i18n';
import { prefetchCharts } from '../datafeed/TVDatafeed';
import { ONLY_GRAPH_ACTIVE, ONLY_GRAPH_DEFAULT_PARAMS } from './onlyGraphConfig';

function normalizeOnlyGraphPair(value: string): string {
  return value
    .trim()
    .replace(/_otc$/i, ' OTC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOnlyGraphTimeframe(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return 'M1';
  if (/^[SMHD]\d+$/.test(normalized)) return normalized;
  if (normalized === '1D') return 'D1';
  if (/^\d+$/.test(normalized)) {
    return normalized === '60' ? 'H1' : `M${normalized}`;
  }
  const compact = normalized.match(/^(\d+)([SMHD])$/);
  if (!compact) return 'M1';
  const [, amount, unit] = compact;
  if (unit === 'D') return 'D1';
  if (unit === 'H') return `H${amount}`;
  if (unit === 'S') return `S${amount}`;
  return `M${amount}`;
}

function parseOnlyGraphSnapshotEnabled(value: string | null): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function parseOnlyGraphSignalTime(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return Math.floor(parsed / 1000);
}

function parseOnlyGraphBars(value: string | null): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(20, Math.min(300, Math.floor(numeric)));
}

export function OnlyGraphPage() {
  const params = new URLSearchParams(window.location.search);
  const pairCode = normalizeOnlyGraphPair(params.get('pair_code') || '');
  const timeframe = normalizeOnlyGraphTimeframe(params.get('timeframe') || 'M1');
  const signalTime = parseOnlyGraphSignalTime(params.get('signal_time'));
  const isSnapshot = parseOnlyGraphSnapshotEnabled(params.get('static')) || signalTime !== undefined;
  const historyBars = parseOnlyGraphBars(params.get('bars'));
  const { locale } = useI18n();
  const [chartReadyToMount, setChartReadyToMount] = useState(false);

  /* Connect socket for live price updates only in live mode */
  useEffect(() => {
    let cancelled = false;
    setChartReadyToMount(false);

    if (!isSnapshot) {
      socketService
        .connect()
        .catch((err) => console.warn('[OnlyGraph] Socket unavailable:', err.message));
    }

    if (pairCode && !isSnapshot) {
      socketService.subscribeToCurrency(pairCode);
    }

    const prefetchPromise = pairCode && !isSnapshot
      ? prefetchCharts([{ currency: pairCode, timeframe, limit: 240 }])
          .catch((err) => console.warn('[OnlyGraph] Prefetch failed:', err.message))
      : Promise.resolve();

    Promise.race([
      prefetchPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 450)),
    ]).finally(() => {
      if (!cancelled) setChartReadyToMount(true);
    });

    return () => {
      cancelled = true;
      if (pairCode && !isSnapshot) socketService.unsubscribeFromCurrency(pairCode);
    };
  }, [isSnapshot, pairCode, timeframe]);

  /* Remove boot preloader if present */
  useEffect(() => {
    const el = document.getElementById('boot-preloader');
    if (el) {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 350);
    }
  }, []);

  return (
    <div className="only-graph">
      <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
        {chartReadyToMount && (
          <TVChart
            currency={pairCode || undefined}
            timeframe={timeframe}
            activeIndicators={ONLY_GRAPH_ACTIVE}
            indicatorParams={ONLY_GRAPH_DEFAULT_PARAMS}
            autoScroll={historyBars}
            locale={locale}
            fastMode={true}
            mode={isSnapshot ? 'snapshot' : 'live'}
            snapshotTime={signalTime}
            historyBars={historyBars}
            hideLeftToolbar={true}
          />
        )}
      </div>
    </div>
  );
}
