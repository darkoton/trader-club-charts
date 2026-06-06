/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time } from 'lightweight-charts';

interface ZoneData {
  t1: Time;
  t2: Time;
  pMin: number;
  pMax: number;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  label?: string;
  labelColor?: string;
}

interface MarkerTextLine {
  text: string;
  color?: string;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

class MiniHudPaneView {
  _requestUpdate: (() => void) | null = null;
  _data: { stats?: MarkerTextLine | null; dogons?: MarkerTextLine | null } = {};
  _options: { anchor: string; fontSize: number } = { anchor: 'TR', fontSize: 12 };

  attached({ requestUpdate }: any) {
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._requestUpdate = null;
  }

  setData(data: { stats?: MarkerTextLine | null; dogons?: MarkerTextLine | null }) {
    this._data = data || {};
    this._requestUpdate?.();
  }

  setOptions(options: Partial<{ anchor: string; fontSize: number }>) {
    this._options = { ...this._options, ...(options || {}) };
    this._requestUpdate?.();
  }

  renderer() {
    return new MiniHudRenderer(() => this._data, () => this._options);
  }

  zOrder() {
    return 'top';
  }

  update() {}
}

class MiniHudPrimitive {
  _view = new MiniHudPaneView();

  attached(params: any) { this._view.attached(params); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setData(data: { stats?: MarkerTextLine | null; dogons?: MarkerTextLine | null }) { this._view.setData(data); }
  setOptions(options: Partial<{ anchor: string; fontSize: number }>) { this._view.setOptions(options); }
}

class MiniHudRenderer {
  _getData: () => { stats?: MarkerTextLine | null; dogons?: MarkerTextLine | null };
  _getOptions: () => { anchor: string; fontSize: number };

  constructor(getData: () => { stats?: MarkerTextLine | null; dogons?: MarkerTextLine | null }, getOptions: () => { anchor: string; fontSize: number }) {
    this._getData = getData;
    this._getOptions = getOptions;
  }

  draw(target: any) {
    const options = this._getOptions();
    const data = this._getData() || {};
    const lines = [data.stats, data.dogons].filter(Boolean) as MarkerTextLine[];
    if (!lines.length || typeof target.useBitmapCoordinateSpace !== 'function') return;

    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx = scope.context as CanvasRenderingContext2D;
      const hr = scope.horizontalPixelRatio || 1;
      const vr = scope.verticalPixelRatio || 1;
      const cssWidth = scope.cssWidth || (scope.bitmapSize?.width || 0) / hr;
      const cssHeight = scope.cssHeight || (scope.bitmapSize?.height || 0) / vr;

      const padX = 12;
      const padY = 8;
      const gap = 4;
      const maxWidth = 320;
      const radius = 10;
      const fontPx = options.fontSize || 12;
      const compactLayout = cssWidth <= 768;
      const topSafe = compactLayout ? 52 : 14;
      const leftSafe = compactLayout ? 14 : 64;
      const rightSafe = compactLayout ? 14 : 72;
      const bottomSafe = compactLayout ? 14 : 18;

      ctx.save();
      ctx.scale(hr, vr);
      ctx.font = `${fontPx}px system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif`;
      ctx.textBaseline = 'top';

      let width = 0;
      let height = padY * 2 - gap;
      for (const line of lines) {
        width = Math.min(Math.max(width, ctx.measureText(line.text).width), maxWidth);
        height += Math.ceil(fontPx * 1.2) + gap;
      }

      const anchor = (options.anchor || 'TR').toUpperCase();
  const x = anchor.includes('R') ? (cssWidth - (width + padX * 2) - rightSafe) : leftSafe;
  const y = anchor.includes('T') ? topSafe : (cssHeight - height - bottomSafe);

      roundRectPath(ctx, x, y, width + padX * 2, height, radius);
      ctx.fillStyle = 'rgba(17,24,39,0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();

      let currentY = y + padY;
      for (const line of lines) {
        ctx.fillStyle = line.color || '#94a3b8';
        ctx.fillText(line.text, x + padX, currentY, maxWidth);
        currentY += Math.ceil(fontPx * 1.2) + gap;
      }

      ctx.restore();
    });
  }

  hitTest() {
    return null;
  }
}

class ZonesPaneView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: (() => void) | null = null;
  _zones: ZoneData[] = [];
  _rects: Array<{ x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number; label?: string; labelColor?: string }> = [];

  attached({ series, chart, requestUpdate }: any) {
    this._series = series;
    this._chart = chart;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._series = null;
    this._chart = null;
    this._requestUpdate = null;
  }

  setZones(zones: ZoneData[]) {
    this._zones = zones || [];
    this._requestUpdate?.();
  }

  update() {
    const timeScale = this._chart?.timeScale?.();
    const data = this._series?.data?.() || [];
    if (!timeScale || !data.length) {
      this._rects = [];
      return;
    }

    const timeToIndex = new Map<Time, number>(
      data.map((bar: any, index: number): [Time, number] => [bar.time as Time, index]),
    );
    const x0 = timeScale.logicalToCoordinate(0);
    const x1 = timeScale.logicalToCoordinate(1);
    const step = Math.abs((x1 ?? 0) - (x0 ?? 0));
    const halfWidth = step / 2;
    const rects: ZonesPaneView['_rects'] = [];

    for (const zone of this._zones) {
      const leftIndex = timeToIndex.get(zone.t1);
      const rightIndex = timeToIndex.get(zone.t2);
      if (leftIndex == null || rightIndex == null) continue;

      const xLeft = timeScale.logicalToCoordinate(Math.min(leftIndex, rightIndex));
      const xRight = timeScale.logicalToCoordinate(Math.max(leftIndex, rightIndex));
      const yTop = this._series.priceToCoordinate(Math.max(zone.pMin, zone.pMax));
      const yBottom = this._series.priceToCoordinate(Math.min(zone.pMin, zone.pMax));
      if ([xLeft, xRight, yTop, yBottom].some((value) => value == null)) continue;

      rects.push({
        x: xLeft - halfWidth,
        y: yTop,
        w: xRight - xLeft + halfWidth * 2,
        h: yBottom - yTop,
        fill: zone.fill,
        stroke: zone.stroke,
        lineWidth: zone.lineWidth,
        label: zone.label,
        labelColor: zone.labelColor,
      });
    }

    this._rects = rects;
  }

  renderer() {
    return new ZonesRenderer(this._rects);
  }

  zOrder() {
    return 'top';
  }
}

class ZonesRenderer {
  _rects: ZonesPaneView['_rects'];

  constructor(rects: ZonesPaneView['_rects']) {
    this._rects = rects || [];
  }

  draw(target: any) {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context as CanvasRenderingContext2D;
      ctx.save();
      for (const rect of this._rects) {
        if (rect.fill) {
          ctx.fillStyle = rect.fill;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        if (rect.stroke && (rect.lineWidth ?? 0) > 0) {
          ctx.lineWidth = rect.lineWidth || 1;
          ctx.strokeStyle = rect.stroke;
          ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(1, rect.w) - 1, Math.max(1, rect.h) - 1);
        }
        if (rect.label) {
          ctx.fillStyle = rect.labelColor || '#111';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(rect.label, rect.x + 4, rect.y + 4);
        }
      }
      ctx.restore();
    });
  }
}

class ZonesPrimitive {
  _view = new ZonesPaneView();
  attached(params: any) { this._view.attached(params); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setZones(zones: ZoneData[]) { this._view.setZones(zones); }
}

function detectOG(candle: CandlestickData<Time>, prev: CandlestickData<Time>) {
  return { bull: candle.low > prev.high, bear: candle.high < prev.low };
}

function detectVI(index: number, candles: CandlestickData<Time>[]) {
  const candle = candles[index];
  const prev = candles[index - 1];
  if (!prev) return { bull: false, bear: false, bullTop: 0, bullBtm: 0, bearTop: 0, bearBtm: 0 };

  const bullTop = Math.min(candle.close, candle.open);
  const bullBtm = Math.max(prev.close, prev.open);
  const bearTop = Math.min(prev.close, prev.open);
  const bearBtm = Math.max(candle.close, candle.open);
  const bull = candle.open > prev.close && prev.high > candle.low && candle.close > prev.close && candle.open > prev.open && prev.high < bullTop;
  const bear = candle.open < prev.close && prev.low < candle.high && candle.close < prev.close && candle.open < prev.open && prev.low > bearBtm;

  return { bull, bear, bullTop, bullBtm, bearTop, bearBtm };
}

function detectFVG(index: number, candles: CandlestickData<Time>[]) {
  const current = candles[index];
  const middle = candles[index - 1];
  const first = candles[index - 2];
  if (!current || !middle || !first) return { bull: false, bear: false, bullTop: 0, bullBtm: 0, bearTop: 0, bearBtm: 0 };

  const bull = current.low > first.high && middle.close > first.high;
  const bear = current.high < first.low && middle.close < first.low;
  return { bull, bear, bullTop: current.low, bullBtm: first.high, bearTop: first.low, bearBtm: current.high };
}

function buildStats(events: Array<{ i: number; side: 'buy' | 'sell' }>, candles: CandlestickData<Time>[], params: typeof meta.defaultParams) {
  const maxDogons = Math.max(0, Math.min(7, Number(params.dogons) || 0));
  const expiryBars = Math.max(1, Number(params.expiryBars) || 1);
  const dogonBars = (Number(params.dogonBars) || 0) > 0 ? (Number(params.dogonBars) || 0) : expiryBars;
  const lookbackBars = Math.max(1, Number(params.statsLookbackBars) || 300);
  const fromBar = Math.max(0, candles.length - 1 - lookbackBars);
  const winsAt = new Array(maxDogons + 2).fill(0);
  let losses = 0;

  for (const event of events) {
    if (event.i < fromBar) continue;
    const sign = event.side === 'buy' ? 1 : -1;
    let attempt = 1;
    let entryIndex = event.i;
    let done = false;

    while (!done) {
      const duration = attempt === 1 ? expiryBars : dogonBars;
      const exitIndex = entryIndex + duration;
      if (exitIndex >= candles.length) break;

      const delta = (candles[exitIndex].close - candles[entryIndex].close) * sign;
      if (delta > 0) {
        winsAt[attempt] += 1;
        done = true;
      } else if (attempt <= maxDogons) {
        attempt += 1;
        entryIndex = exitIndex;
      } else {
        losses += 1;
        done = true;
      }
    }
  }

  const totalWins = winsAt.reduce((sum, count) => sum + count, 0);
  const total = totalWins + losses;
  const wrPct = total > 0 ? Math.round((totalWins / total) * 100) : null;
  const neutralColor = '#94a3b8';
  const buyColor = params.buyColor || '#16a34a';
  const sellColor = params.sellColor || '#ef4444';
  const statsColor = totalWins > losses ? buyColor : losses > totalWins ? sellColor : neutralColor;

  const stats: MarkerTextLine = {
    text: `📊: +${totalWins} -${losses}${wrPct != null ? ` | WR ${wrPct}%` : ''}`,
    color: statsColor,
  };
  const dogonParts: string[] = [];
  for (let attempt = 1; attempt <= maxDogons + 1; attempt += 1) {
    dogonParts.push(`${attempt}:+${winsAt[attempt] || 0}`);
  }
  const dogons: MarkerTextLine = {
    text: `🏆: ${dogonParts.join(', ')}, -:${losses}`,
    color: statsColor,
  };

  return { stats, dogons };
}

export const meta = {
  name: 'Imbalance Signals (BUY/SELL)',
  defaultParams: {
    showFVG: true,
    showOG: true,
    showVI: true,
    signalsEnabled: true,
    signalsFVG: true,
    signalsOG: true,
    signalsVI: true,
    cooldownBars: 0,
    buyColor: '#16a34a',
    sellColor: '#ef4444',
    buyTextColor: '#d1fae5',
    sellTextColor: '#fee2e2',
    useStats: true,
    expiryBars: 1,
    dogonBars: 0,
    dogons: 0,
    statsLookbackBars: 300,
    showHudCard: true,
    hudAnchor: 'TR',
  },
  paramMeta: {
    showFVG: { label: 'FVG: показывать', type: 'boolean' as const },
    showOG: { label: 'OG: показывать', type: 'boolean' as const },
    showVI: { label: 'VI: показывать', type: 'boolean' as const },
    signalsEnabled: { label: 'Сигналы: включить', type: 'boolean' as const },
    signalsFVG: { label: 'FVG: сигналы', type: 'boolean' as const },
    signalsOG: { label: 'OG: сигналы', type: 'boolean' as const },
    signalsVI: { label: 'VI: сигналы', type: 'boolean' as const },
    cooldownBars: { label: 'Глобальный кулдаун (баров)', type: 'number' as const, min: 0, max: 20, step: 1 },
    buyColor: { label: 'Цвет BUY', type: 'color' as const },
    sellColor: { label: 'Цвет SELL', type: 'color' as const },
    buyTextColor: { label: 'Цвет текста BUY', type: 'color' as const },
    sellTextColor: { label: 'Цвет текста SELL', type: 'color' as const },
    useStats: { label: 'Статистика: включить', type: 'boolean' as const },
    expiryBars: { label: 'Экспирация N (баров)', type: 'number' as const, min: 1, max: 50, step: 1 },
    dogonBars: { label: 'Догон, баров (0 = как N)', type: 'number' as const, min: 0, max: 50, step: 1 },
    dogons: { label: 'Кол-во догонов (0..7)', type: 'number' as const, min: 0, max: 7, step: 1 },
    statsLookbackBars: { label: 'Окно статистики (баров)', type: 'number' as const, min: 20, max: 5000, step: 10 },
    showHudCard: { label: 'HUD: показывать', type: 'boolean' as const },
    hudAnchor: { label: 'HUD: позиция', type: 'select' as const, options: ['TR', 'TL', 'BR', 'BL'] },
  },
};

const MAX_RENDERED_SIGNAL_HISTORY = 10;

interface ImbalanceSignalsContext {
  candleSeries: any;
  chart: any;
  params: typeof meta.defaultParams;
  createSeriesMarkers: any;
}

export function init(ctx: ImbalanceSignalsContext) {
  const { candleSeries, params, createSeriesMarkers } = ctx;
  const markersApi = createSeriesMarkers(candleSeries, []);
  const zonesPrimitive = new ZonesPrimitive();
  let hudPrimitive: MiniHudPrimitive | null = null;

  if (typeof candleSeries.attachPrimitive === 'function') {
    candleSeries.attachPrimitive(zonesPrimitive);
  }

  function ensureHud() {
    if (params.showHudCard !== true || typeof candleSeries.attachPrimitive !== 'function') {
      if (hudPrimitive && typeof candleSeries.detachPrimitive === 'function') {
        candleSeries.detachPrimitive(hudPrimitive);
      }
      hudPrimitive = null;
      return null;
    }

    if (!hudPrimitive) {
      hudPrimitive = new MiniHudPrimitive();
      candleSeries.attachPrimitive(hudPrimitive);
    }
    hudPrimitive.setOptions({ anchor: params.hudAnchor || 'TR', fontSize: 12 });
    return hudPrimitive;
  }

  function update(candles: CandlestickData<Time>[]) {
    const barsCount = candles?.length || 0;
    if (barsCount < 2) {
      markersApi.setMarkers([]);
      zonesPrimitive.setZones([]);
      hudPrimitive?.setData({});
      return [];
    }

    const zoneEntries: Array<{ index: number; zone: ZoneData }> = [];
    const signalEntries: Array<{ index: number; marker: any }> = [];
    const events: Array<{ i: number; side: 'buy' | 'sell' }> = [];
    const ogFlags = Array.from({ length: barsCount }, () => ({ bull: false, bear: false }));
    const cooldownBars = Math.max(0, Number(params.cooldownBars) || 0);
    let lastSignalIndex = -1;

    const pushSignal = (index: number, side: 'buy' | 'sell') => {
      if (params.signalsEnabled === false) return;
      if (cooldownBars > 0 && lastSignalIndex >= 0 && index - lastSignalIndex <= cooldownBars) return;

      events.push({ i: index, side });
      signalEntries.push({
        index,
        marker: {
        name: side,
        time: candles[index].time,
        position: side === 'buy' ? 'belowBar' : 'aboveBar',
        shape: side === 'buy' ? 'arrowUp' : 'arrowDown',
        color: side === 'buy' ? (params.buyColor || '#16a34a') : (params.sellColor || '#ef4444'),
        textColor: side === 'buy' ? (params.buyTextColor || '#d1fae5') : (params.sellTextColor || '#fee2e2'),
        text: side === 'buy' ? 'BUY' : 'SELL',
        price: side === 'buy' ? candles[index].low : candles[index].high,
        },
      });
      lastSignalIndex = index;
    };

    const pushZone = (index: number, left: number, right: number, top: number, bottom: number, kind: 'FVG' | 'OG' | 'VI', bullish: boolean) => {
      zoneEntries.push({
        index,
        zone: {
          t1: candles[left].time,
          t2: candles[right].time,
          pMin: Math.min(bottom, top),
          pMax: Math.max(bottom, top),
          ...(kind === 'VI'
            ? { stroke: bullish ? '#2157f3' : '#ff1100', lineWidth: 1 }
            : { fill: bullish ? (kind === 'FVG' ? 'rgba(33,87,243,0.32)' : 'rgba(33,87,243,0.50)') : (kind === 'FVG' ? 'rgba(255,17,0,0.32)' : 'rgba(255,17,0,0.50)') }),
          label: `${kind}${bullish ? '↑' : '↓'}`,
          labelColor: '#111',
        },
      });
    };

    for (let i = 1; i < barsCount; i += 1) {
      const candle = candles[i];
      const prev = candles[i - 1];

      if (params.showOG !== false) {
        const og = detectOG(candle, prev);
        if (og.bull) {
          pushZone(i, i - 1, i, Math.min(candle.close, candle.open), Math.max(prev.close, prev.open), 'OG', true);
          if (params.signalsOG !== false) pushSignal(i, 'buy');
          ogFlags[i].bull = true;
        }
        if (og.bear) {
          pushZone(i, i - 1, i, Math.min(prev.close, prev.open), Math.max(candle.close, candle.open), 'OG', false);
          if (params.signalsOG !== false) pushSignal(i, 'sell');
          ogFlags[i].bear = true;
        }
      }

      if (params.showVI !== false) {
        const vi = detectVI(i, candles);
        if (vi.bull) {
          pushZone(i, i - 1, i, vi.bullTop, vi.bullBtm, 'VI', true);
          if (params.signalsVI !== false) pushSignal(i, 'buy');
        }
        if (vi.bear) {
          pushZone(i, i - 1, i, vi.bearTop, vi.bearBtm, 'VI', false);
          if (params.signalsVI !== false) pushSignal(i, 'sell');
        }
      }

      if (params.showFVG !== false && i >= 2) {
        const fvg = detectFVG(i, candles);
        if (fvg.bull && !(ogFlags[i]?.bull || ogFlags[i - 1]?.bull)) {
          pushZone(i, i - 2, i, fvg.bullTop, fvg.bullBtm, 'FVG', true);
          if (params.signalsFVG !== false) pushSignal(i, 'buy');
        }
        if (fvg.bear && !(ogFlags[i]?.bear || ogFlags[i - 1]?.bear)) {
          pushZone(i, i - 2, i, fvg.bearTop, fvg.bearBtm, 'FVG', false);
          if (params.signalsFVG !== false) pushSignal(i, 'sell');
        }
      }
    }

    const recentSignalEntries = signalEntries.slice(-MAX_RENDERED_SIGNAL_HISTORY);
    const firstVisibleSignalIndex = recentSignalEntries[0]?.index ?? null;
    const visibleZones = firstVisibleSignalIndex == null
      ? zoneEntries.map((entry) => entry.zone)
      : zoneEntries
        .filter((entry) => entry.index >= firstVisibleSignalIndex)
        .map((entry) => entry.zone);
    const visibleMarkers = recentSignalEntries.map((entry) => entry.marker);

    const hud = ensureHud();
    if (hud) {
      hud.setData(params.useStats === false || params.signalsEnabled === false ? {} : buildStats(events, candles, params));
    }

    zonesPrimitive.setZones(visibleZones);
    markersApi.setMarkers(visibleMarkers);
    return visibleMarkers;
  }

  function destroy() {
    markersApi.setMarkers([]);
    zonesPrimitive.setZones([]);
    try {
      if (typeof candleSeries.detachPrimitive === 'function') {
        candleSeries.detachPrimitive(zonesPrimitive);
        if (hudPrimitive) candleSeries.detachPrimitive(hudPrimitive);
      }
    } catch {
      // ignore teardown detach failures
    }
    hudPrimitive = null;
  }

  return { update, destroy };
}