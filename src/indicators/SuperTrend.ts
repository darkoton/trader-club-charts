/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

export const meta = {
  name: 'SuperTrend',
  defaultParams: {
    atrPeriod: 10,
    multiplier: 3,
    renderHistoryBars: 220,
    uiLang: 'EN',
    showUp: true,
    upColor: '#84cc16',
    upWidth: 2,
    showDown: true,
    downColor: '#ef4444',
    downWidth: 2,
    showLabels: true,
    buyText: 'BUY',
    sellText: 'SELL',
    labelTextColor: '#ffffff',
    labelOffsetX: 0,
    labelOffsetY: 8,
    labelRadius: 6,
    labelPadX: 8,
    labelPadY: 4,
    labelsOnClose: false,
  },
  paramMeta: {
    atrPeriod:      { label: 'ATR Период', type: 'number' as const, min: 2, max: 500 },
    multiplier:     { label: 'Множитель ATR', type: 'number' as const, min: 0, max: 20, step: 0.1 },
    renderHistoryBars: { label: 'История отрисовки (баров)', type: 'number' as const, min: 100, max: 220, step: 20 },
    uiLang:         { label: 'Язык текста (RU/EN)', type: 'select' as const, options: ['RU', 'EN'] },
    showUp:         { label: 'Линия ↑ (включить)', type: 'boolean' as const },
    upColor:        { label: 'Цвет линии ↑', type: 'color' as const },
    upWidth:        { label: 'Толщина линии ↑', type: 'number' as const, min: 1, max: 6 },
    showDown:       { label: 'Линия ↓ (включить)', type: 'boolean' as const },
    downColor:      { label: 'Цвет линии ↓', type: 'color' as const },
    downWidth:      { label: 'Толщина линии ↓', type: 'number' as const, min: 1, max: 6 },
    showLabels:     { label: 'Показывать подписи', type: 'boolean' as const },
    buyText:        { label: 'Текст BUY', type: 'text' as const, maxLength: 24 },
    sellText:       { label: 'Текст SELL', type: 'text' as const, maxLength: 24 },
    labelTextColor: { label: 'Цвет текста подписи', type: 'color' as const },
    labelOffsetX:   { label: 'Смещение X подписи', type: 'number' as const, min: -60, max: 60 },
    labelOffsetY:   { label: 'Смещение Y подписи', type: 'number' as const, min: 0, max: 40 },
    labelRadius:    { label: 'Скругление углов', type: 'number' as const, min: 0, max: 14 },
    labelPadX:      { label: 'Внутренний отступ X', type: 'number' as const, min: 0, max: 24 },
    labelPadY:      { label: 'Внутренний отступ Y', type: 'number' as const, min: 0, max: 16 },
    labelsOnClose:  { label: 'Подписи только на закрытии свечи', type: 'boolean' as const },
  },
};

interface SuperTrendContext {
  chart: IChartApi;
  LineSeries: any;
  candleSeries: any;
  params: typeof meta.defaultParams;
  createSeriesMarkers: any;
  addSeries: (def: unknown, opts: unknown, pane?: number) => any;
}

const SUPER_TREND_SIGNAL_HISTORY_LIMIT = 8;
const SUPER_TREND_MAX_RENDER_HISTORY_BARS = 220;
const SUPER_TREND_WARMUP_MULTIPLIER = 20;
const SUPER_TREND_MIN_WARMUP_BARS = 100;

function rma(src: number[], len: number): number[] {
  const n = src.length;
  const period = Math.max(2, len | 0);
  const out = new Array(n).fill(NaN);
  let sum = 0;
  let count = 0;
  let i = 0;

  for (; i < n && count < period; i += 1) {
    const value = src[i];
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  if (count < period) return out;

  out[i - 1] = sum / period;
  for (; i < n; i += 1) {
    const value = Number.isFinite(src[i]) ? src[i] : out[i - 1];
    out[i] = (out[i - 1] * (period - 1) + value) / period;
  }

  return out;
}

function atr(high: number[], low: number[], close: number[], len: number): number[] {
  const tr = new Array(close.length).fill(NaN);
  for (let i = 1; i < close.length; i += 1) {
    const a = high[i] - low[i];
    const b = Math.abs(high[i] - close[i - 1]);
    const c = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(a, b, c);
  }
  return rma(tr, len);
}

function calcSuperTrend(high: number[], low: number[], close: number[], len: number, mult: number) {
  const n = close.length;
  const hl2 = close.map((_, i) => (high[i] + low[i]) / 2);
  const atrValues = atr(high, low, close, len);
  const basicUpper = hl2.map((value, i) => (Number.isFinite(atrValues[i]) ? value + mult * atrValues[i] : NaN));
  const basicLower = hl2.map((value, i) => (Number.isFinite(atrValues[i]) ? value - mult * atrValues[i] : NaN));
  const finalUpper = new Array(n).fill(NaN);
  const finalLower = new Array(n).fill(NaN);

  let startIndex = 0;
  while (startIndex < n && !(Number.isFinite(basicUpper[startIndex]) && Number.isFinite(basicLower[startIndex]))) {
    startIndex += 1;
  }

  if (startIndex >= n) {
    return {
      upLine: new Array(n).fill(NaN),
      downLine: new Array(n).fill(NaN),
      atrValues,
    };
  }

  finalUpper[startIndex] = basicUpper[startIndex];
  finalLower[startIndex] = basicLower[startIndex];

  for (let i = startIndex + 1; i < n; i += 1) {
    const prevUpper = finalUpper[i - 1];
    const prevLower = finalLower[i - 1];
    finalUpper[i] = basicUpper[i] < prevUpper || close[i - 1] > prevUpper ? basicUpper[i] : prevUpper;
    finalLower[i] = basicLower[i] > prevLower || close[i - 1] < prevLower ? basicLower[i] : prevLower;
  }

  const upLine = new Array(n).fill(NaN);
  const downLine = new Array(n).fill(NaN);
  let bull = close[startIndex] >= finalLower[startIndex];

  for (let i = startIndex + 1; i < n; i += 1) {
    if (bull && close[i] < finalLower[i - 1]) bull = false;
    else if (!bull && close[i] > finalUpper[i - 1]) bull = true;

    if (bull) upLine[i] = finalLower[i];
    else downLine[i] = finalUpper[i];
  }

  return { upLine, downLine, atrValues };
}

function resolveSignalText(rawValue: string | undefined, uiLang: string, english: string, russian: string): string {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return uiLang === 'RU' ? russian : english;
  if (uiLang === 'RU' && trimmed === english) return russian;
  return trimmed;
}

class LabelsPrimitive {
  _view: LabelsView;
  constructor(options: Record<string, unknown> = {}) { this._view = new LabelsView(options); }
  attached(params: any) { this._view.attached(params); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setLabels(items: any[]) { this._view.setLabels(items); }
  setOptions(options: Record<string, unknown>) { this._view.setOptions(options); }
}

class LabelsView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: any = null;
  _items: any[] = [];
  _options = { padX: 8, padY: 4, radius: 6, offX: 0, offY: 8 };

  constructor(options: Record<string, unknown>) {
    Object.assign(this._options, options);
  }

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

  update() {}

  setOptions(options: Record<string, unknown>) {
    Object.assign(this._options, options);
    this._requestUpdate?.();
  }

  setLabels(items: any[]) {
    this._items = items || [];
    this._requestUpdate?.();
  }

  zOrder() { return 'top'; }

  renderer() {
    const drawImpl = (target: any) => {
      const series = this._series;
      const chart = this._chart;
      if (!series || !chart) return;

      const timeScale = chart.timeScale();
      if (!timeScale) return;

      const options = this._options;
      const draw = (ctx: CanvasRenderingContext2D, ratioX = 1, ratioY = 1) => {
        ctx.save();
        ctx.scale(ratioX, ratioY);
        ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        for (const item of this._items) {
          if (!Number.isFinite(item.price)) continue;
          const x = timeScale.timeToCoordinate(item.time);
          const y = series.priceToCoordinate(item.price);
          if (x == null || y == null) continue;

          const direction = item.side === 'up' ? 1 : -1;
          const centerX = Math.round(x + options.offX);
          const centerY = Math.round(y + direction * (options.offY + 10));
          const textWidth = Math.ceil(ctx.measureText(item.text).width);
          const width = textWidth + options.padX * 2;
          const height = 18 + (options.padY - 4) * 2;
          const radius = Math.max(0, Math.min(options.radius, Math.min(width, height) / 2));

          ctx.fillStyle = item.bg;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(centerX - width / 2, centerY - height / 2, width, height, radius);
          else ctx.rect(centerX - width / 2, centerY - height / 2, width, height);
          ctx.fill();

          ctx.fillStyle = item.textColor || '#fff';
          ctx.fillText(item.text, centerX, centerY);
        }

        ctx.restore();
      };

      if (typeof target.useBitmapCoordinateSpace === 'function') {
        target.useBitmapCoordinateSpace((scope: any) => draw(scope.context, scope.horizontalPixelRatio, scope.verticalPixelRatio));
      } else {
        draw(target.context, target.pixelRatio || 1, target.pixelRatio || 1);
      }
    };

    return { drawBackground: drawImpl, draw: drawImpl };
  }
}

export function init(ctx: SuperTrendContext) {
  const { chart, LineSeries, candleSeries, params, createSeriesMarkers, addSeries } = ctx;
  const markersApi = createSeriesMarkers(candleSeries, []);
  const segments: { up: any[]; down: any[] } = { up: [], down: [] };

  function ensureSeries(bucket: any[], index: number, color: string, width: number) {
    let series = bucket[index];
    if (!series) {
      series = addSeries(LineSeries, {
        color,
        lineWidth: Math.max(1, width | 0 || 2),
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      bucket[index] = series;
    } else {
      series.applyOptions?.({ color, lineWidth: Math.max(1, width | 0 || 2) });
    }
    return series;
  }

  function buildSegments(times: Time[], values: number[], startIndex: number) {
    const out: Array<Array<{ time: Time; value: number }>> = [];
    let current: Array<{ time: Time; value: number }> | null = null;
    let carryPoint: { time: Time; value: number } | null = null;

    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) {
        current = null;
        carryPoint = null;
        continue;
      }
      const point = { time: times[i], value };
      if (i < startIndex) {
        carryPoint = point;
        continue;
      }
      if (!current) {
        current = [];
        out.push(current);
        if (carryPoint) current.push(carryPoint);
      }
      current.push(point);
    }

    return out.filter((segment) => segment.length > 1);
  }

  function sync(key: 'up' | 'down', color: string, width: number, built: Array<Array<{ time: Time; value: number }>>) {
    const bucket = segments[key];
    for (let i = 0; i < built.length; i += 1) {
      ensureSeries(bucket, i, color, width).setData(built[i]);
    }
    for (let i = built.length; i < bucket.length; i += 1) {
      try { chart.removeSeries(bucket[i]); } catch { /* ignore */ }
    }
    bucket.length = built.length;
  }

  function clearAll() {
    for (const key of ['up', 'down'] as const) {
      for (const series of segments[key]) {
        try { chart.removeSeries(series); } catch { /* ignore */ }
      }
      segments[key] = [];
    }
  }

  let labelsPrimitive: LabelsPrimitive | null = new LabelsPrimitive({
    padX: params.labelPadX,
    padY: params.labelPadY,
    radius: params.labelRadius,
    offX: params.labelOffsetX,
    offY: params.labelOffsetY,
  });

  try {
    if (typeof candleSeries.attachPrimitive === 'function') candleSeries.attachPrimitive(labelsPrimitive);
  } catch {
    labelsPrimitive = null;
  }

  function update(candles: CandlestickData<Time>[]) {
    const count = candles?.length || 0;
    if (count < 3) {
      clearAll();
      labelsPrimitive?.setLabels([]);
      markersApi.setMarkers([]);
      return [];
    }

    const lang = params.uiLang === 'RU' ? 'RU' : 'EN';
    const atrPeriod = Math.max(2, params.atrPeriod | 0 || 10);
    const multiplier = Number(params.multiplier ?? 3);
    const renderHistoryBars = Math.min(
      SUPER_TREND_MAX_RENDER_HISTORY_BARS,
      Math.max(100, Number(params.renderHistoryBars) || 220),
    );
    const warmupBars = Math.max(SUPER_TREND_MIN_WARMUP_BARS, atrPeriod * SUPER_TREND_WARMUP_MULTIPLIER);
    const calculationBars = Math.min(count, renderHistoryBars + warmupBars);
    const calculationStartIndex = Math.max(0, count - calculationBars);
    const sourceCandles = calculationStartIndex > 0 ? candles.slice(calculationStartIndex) : candles;
    const times = sourceCandles.map((c) => c.time);
    const highs = sourceCandles.map((c) => c.high);
    const lows = sourceCandles.map((c) => c.low);
    const closes = sourceCandles.map((c) => c.close);
    const { upLine, downLine, atrValues } = calcSuperTrend(highs, lows, closes, atrPeriod, multiplier);
    const lastIndex = sourceCandles.length - 1;
    const renderStartIndex = Math.max(0, lastIndex - Math.min(renderHistoryBars, sourceCandles.length) + 1);

    if (params.showUp) sync('up', params.upColor, params.upWidth, buildSegments(times, upLine, renderStartIndex));
    else { for (const series of segments.up) try { chart.removeSeries(series); } catch { /* ignore */ } segments.up = []; }

    if (params.showDown) sync('down', params.downColor, params.downWidth, buildSegments(times, downLine, renderStartIndex));
    else { for (const series of segments.down) try { chart.removeSeries(series); } catch { /* ignore */ } segments.down = []; }

    const buyText = resolveSignalText(params.buyText, lang, 'BUY', 'Купить');
    const sellText = resolveSignalText(params.sellText, lang, 'SELL', 'Продать');
    const signalEntries: Array<{ marker: any; badgeItem?: any }> = [];
    const limitIndex = params.labelsOnClose ? Math.max(1, lastIndex - 1) : lastIndex;
    const signalStartIndex = Math.max(1, renderStartIndex);

    for (let i = signalStartIndex; i <= lastIndex; i += 1) {
      const prevBull = Number.isFinite(upLine[i - 1]);
      const currBull = Number.isFinite(upLine[i]);
      const isNewBuy = !prevBull && currBull;
      const isNewSell = prevBull && !currBull;

      if (isNewBuy) {
        signalEntries.push({
          marker: {
            name: 'buy',
            time: times[i],
            position: 'belowBar',
            shape: 'arrowUp',
            color: 'transparent',
            text: buyText,
            textColor: 'transparent',
            price: lows[i],
          },
          badgeItem: params.showLabels && i <= limitIndex
            ? {
                time: times[i],
                price: upLine[i],
                text: buyText,
                bg: params.upColor,
                textColor: params.labelTextColor,
                side: 'up',
              }
            : undefined,
        });
      } else if (isNewSell) {
        signalEntries.push({
          marker: {
            name: 'sell',
            time: times[i],
            position: 'aboveBar',
            shape: 'arrowDown',
            color: 'transparent',
            text: sellText,
            textColor: 'transparent',
            price: highs[i],
          },
          badgeItem: params.showLabels && i <= limitIndex
            ? {
                time: times[i],
                price: downLine[i],
                text: sellText,
                bg: params.downColor,
                textColor: params.labelTextColor,
                side: 'down',
              }
            : undefined,
        });
      }
    }

    const recentSignalEntries = signalEntries.slice(-SUPER_TREND_SIGNAL_HISTORY_LIMIT);
    const markers = recentSignalEntries.map((entry) => entry.marker);
    const badgeItems = recentSignalEntries.flatMap((entry) => (entry.badgeItem ? [entry.badgeItem] : []));

    void atrValues;
    labelsPrimitive?.setOptions({
      padX: params.labelPadX,
      padY: params.labelPadY,
      radius: params.labelRadius,
      offX: params.labelOffsetX,
      offY: params.labelOffsetY,
    });
    labelsPrimitive?.setLabels(badgeItems);
    markersApi.setMarkers(markers);
    return markers;
  }

  function destroy() {
    clearAll();
    markersApi.setMarkers([]);
    try {
      labelsPrimitive?.setLabels([]);
      if (labelsPrimitive && typeof candleSeries.detachPrimitive === 'function') candleSeries.detachPrimitive(labelsPrimitive);
    } catch { /* ignore */ }
  }

  return { update, destroy };
}