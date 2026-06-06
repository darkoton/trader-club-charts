/* ─── Indicator Meta Types ─── */
/* NOTE: lightweight-charts types removed — TradingView Charting Library used instead */

export interface IndicatorParamMeta {
  label: string;
  type: 'number' | 'boolean' | 'color' | 'select' | 'text';
  readonly?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  maxLength?: number;
}

export interface IndicatorMeta {
  name: string;
  pane?: string;
  defaultParams: Record<string, unknown>;
  paramMeta: Record<string, IndicatorParamMeta>;
}

export interface IndicatorInstance {
  update: (candles: any[]) => unknown;
  destroy: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IndicatorInitContext {
  chart: any;
  candleSeries: any;
  params: Record<string, any>;
  LineSeries: any;
  HistogramSeries?: any;
  createSeriesMarkers: any;
  addSeries: (def: any, opts: any, pane?: number) => any;
  paneIndex?: number;
  isDark?: boolean;
}

export type IndicatorInitFn = (ctx: any) => IndicatorInstance;

/* ─── Indicator Registry ─── */

import { meta as rangeDetectorMeta } from '../indicators/RangeDetector';
import { meta as orderBlocksMeta } from '../indicators/OrderBlocks';
import { meta as adaptiveTrendMeta } from '../indicators/AdaptiveTrendFinder';
import { meta as imbalanceSignalsMeta, init as initImbalanceSignals } from '../indicators/ImbalanceSignals';
import { meta as imbalanceSuiteMeta } from '../indicators/ImbalanceSuite';
import { meta as rsiZonesMeta } from '../indicators/RSIZones';
import { meta as streakHunterMeta, init as initStreakHunter } from '../indicators/StreakHunter';
import { meta as zigzagMeta, init as initZigZag } from '../indicators/ZigZag';
import { meta as zigzagChannelsMeta } from '../indicators/ZigZagChannels';
import { meta as regressionChannelMeta } from '../indicators/RegressionChannel';
import { meta as srZonesMeta } from '../indicators/SRZones';
import { meta as sarWaveSignalsMeta } from '../indicators/SARWaveSignals';
import { meta as superTrendMeta, init as initSuperTrend } from '../indicators/SuperTrend';
import { meta as volumesMeta, init as initVolumes } from '../indicators/Volumes';

export interface IndicatorRegistryEntry {
  meta: IndicatorMeta;
  init?: IndicatorInitFn;
  tag: string;
  color: string;
  /** If true, this indicator is a TradingView custom study (not an overlay shape) */
  isTVStudy?: boolean;
}

export const INDICATOR_REGISTRY: Record<string, IndicatorRegistryEntry> = {
  rangeDetector:     { meta: rangeDetectorMeta     as unknown as IndicatorMeta, tag: 'RD',  color: '#2ebd85' },
  orderBlocks:       { meta: orderBlocksMeta       as unknown as IndicatorMeta, tag: 'OB',  color: '#60a5fa' },
  adaptiveTrend:     { meta: adaptiveTrendMeta     as unknown as IndicatorMeta, tag: 'ATF', color: '#f59e0b' },
  imbalanceSignals:  { meta: imbalanceSignalsMeta  as unknown as IndicatorMeta, init: initImbalanceSignals, tag: 'IMS', color: '#22c55e' },
  imbalanceSuite:    { meta: imbalanceSuiteMeta    as unknown as IndicatorMeta, tag: 'FVG', color: '#a78bfa' },
  streakHunter:      { meta: streakHunterMeta      as unknown as IndicatorMeta, init: initStreakHunter, tag: 'SH',  color: '#ef4444' },
  superTrend:        { meta: superTrendMeta        as unknown as IndicatorMeta, init: initSuperTrend, tag: 'ST',  color: '#84cc16' },
  rsiZones:          { meta: rsiZonesMeta          as unknown as IndicatorMeta, tag: 'RSI', color: '#8b5cf6', isTVStudy: true },
  volumes:           { meta: volumesMeta           as unknown as IndicatorMeta, init: initVolumes, tag: 'VOL', color: '#22c55e', isTVStudy: true },
  zigzag:            { meta: zigzagMeta           as unknown as IndicatorMeta, init: initZigZag, tag: 'ZG',  color: '#2962ff' },
  zigzagChannels:    { meta: zigzagChannelsMeta    as unknown as IndicatorMeta, tag: 'ZZ',  color: '#fbbf24' },
  regressionChannel: { meta: regressionChannelMeta as unknown as IndicatorMeta, tag: 'RC',  color: '#06b6d4' },
  srZones:           { meta: srZonesMeta            as unknown as IndicatorMeta, tag: 'SR',  color: '#ff9800' },
  sarWaveSignals:    { meta: sarWaveSignalsMeta     as unknown as IndicatorMeta, tag: 'SWS', color: '#14b8a6' },
};

export type IndicatorType = keyof typeof INDICATOR_REGISTRY;

/* ─── Chart config ─── */

export interface CurrencyInfo {
  currency: string;
  profit: number;
  category: string;
  is_active: boolean;
  /** PocketOption API asset name, e.g. "EURUSD_otc". null = not mapped. */
  api_name?: string | null;
}

export interface ChartConfig {
  id: string;
  currency?: string;
  currencyInfo?: CurrencyInfo;
  timeframe: string;
  activeIndicators: Record<string, boolean>;
  indicatorParams: Record<string, Record<string, any>>;
}

/* ─── Grid layout presets ─── */

/**
 * Each layout defines a CSS grid via `areas` (grid-template-areas rows).
 * Named areas are: a, b, c, d, e ...  Each unique letter = one chart slot.
 * `icon` is a visual representation for the layout picker.
 * `maxCharts` = number of unique areas.
 */
export interface GridLayout {
  id: string;
  maxCharts: number;
  /** CSS grid-template-areas rows, e.g. ["a a", "b c"] */
  areas: string[];
  /** Visual icon grid — each cell: 0 = empty, positive number = slot id (same number = merged cell) */
  icon: number[][];
}

export const GRID_LAYOUTS: GridLayout[] = [
  /* ── 1 chart ── */
  { id: '1',       maxCharts: 1, areas: ['a'],                             icon: [[1]] },

  /* ── 2 charts ── */
  { id: '2h',      maxCharts: 2, areas: ['a b'],                           icon: [[1,2]] },
  { id: '2v',      maxCharts: 2, areas: ['a', 'b'],                        icon: [[1],[2]] },

  /* ── 3 charts ── */
  { id: '3-1t2b',  maxCharts: 3, areas: ['a a', 'b c'],                    icon: [[1,1],[2,3]] },
  { id: '3-2t1b',  maxCharts: 3, areas: ['a b', 'c c'],                    icon: [[1,2],[3,3]] },
  { id: '3-2l1r',  maxCharts: 3, areas: ['a b', 'c b'],                    icon: [[1,2],[3,2]] },
  { id: '3-1l2r',  maxCharts: 3, areas: ['a b', 'a c'],                    icon: [[1,2],[1,3]] },
  { id: '3h',      maxCharts: 3, areas: ['a b c'],                         icon: [[1,2,3]] },

  /* ── 4 charts ── */
  { id: '4-2x2',   maxCharts: 4, areas: ['a b', 'c d'],                    icon: [[1,2],[3,4]] },
  { id: '4-1t3b',  maxCharts: 4, areas: ['a a a', 'b c d'],                icon: [[1,1,1],[2,3,4]] },
  { id: '4-3t1b',  maxCharts: 4, areas: ['a b c', 'd d d'],                icon: [[1,2,3],[4,4,4]] },
  { id: '4-1l3r',  maxCharts: 4, areas: ['a b', 'a c', 'a d'],             icon: [[1,2],[1,3],[1,4]] },
  { id: '4-3l1r',  maxCharts: 4, areas: ['a b', 'c b', 'd b'],             icon: [[1,2],[3,2],[4,2]] },
];

/** Letter names for grid areas: a, b, c, d, ... */
const AREA_LETTERS = 'abcdefghijklmnopqrst';

/** Get CSS gridTemplateAreas string from layout */
export function getGridTemplateAreas(layout: GridLayout): string {
  return layout.areas.map((row) => `"${row}"`).join(' ');
}

/** Get grid-area name for chart at index */
export function getChartGridArea(index: number): string {
  return AREA_LETTERS[index] || 'a';
}

/** Get number of columns from areas */
export function getGridCols(layout: GridLayout): number {
  return layout.areas[0]?.split(' ').length ?? 1;
}

/** Get number of rows from areas */
export function getGridRows(layout: GridLayout): number {
  return layout.areas.length;
}

export const TIMEFRAMES = [
  { value: 'S5', label: '5s' },
  { value: 'S30', label: '30s' },
  { value: 'M1', label: '1m' },
  { value: 'M2', label: '2m' },
  { value: 'M3', label: '3m' },
  { value: 'M5', label: '5m' },
  { value: 'M15', label: '15m' },
  { value: 'M30', label: '30m' },
  { value: 'H1', label: '1h' },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number]['value'];

/* ─── Helpers ─── */

export const SAR_WAVE_SIGNALS_LOCKED_PARAMS = {
  start: 0.01,
  increment: 0.01,
  max: 0.1,
} as const;

export function applyLockedIndicatorParams(indicatorKey: string, params: Record<string, any>): Record<string, any> {
  if (indicatorKey !== 'sarWaveSignals') return params;
  return {
    ...params,
    ...SAR_WAVE_SIGNALS_LOCKED_PARAMS,
  };
}

export function normalizeIndicatorParamsMap(
  indicatorParams: Record<string, Record<string, any>>,
): Record<string, Record<string, any>> {
  const normalized: Record<string, Record<string, any>> = {};
  for (const [key, value] of Object.entries(indicatorParams || {})) {
    normalized[key] = applyLockedIndicatorParams(key, { ...(value || {}) });
  }
  return normalized;
}

export function createDefaultIndicatorParams(): Record<string, Record<string, any>> {
  const params: Record<string, Record<string, any>> = {};
  for (const [key, entry] of Object.entries(INDICATOR_REGISTRY)) {
    params[key] = applyLockedIndicatorParams(key, { ...entry.meta.defaultParams });
  }
  return params;
}

export function createDefaultActiveIndicators(): Record<string, boolean> {
  const active: Record<string, boolean> = {};
  for (const key of Object.keys(INDICATOR_REGISTRY)) {
    active[key] = false;
  }
  return active;
}
