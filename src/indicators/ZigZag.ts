/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time } from 'lightweight-charts';

interface ZigZagPivot {
  time: Time;
  price: number;
  type: 'high' | 'low';
}

interface ZigZagOptions {
  lineColor: string;
  lineWidth: number;
  showPivots: boolean;
  pivotHighColor: string;
  pivotLowColor: string;
  pivotRadius: number;
  showLabels: boolean;
  labelSize: number;
}

class ZigZagPrimitive {
  _view = new ZigZagView();

  attached(params: any) { this._view.attached(params); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setData(pivots: ZigZagPivot[], options: Partial<ZigZagOptions> = {}) { this._view.setData(pivots, options); }
}

class ZigZagView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: (() => void) | null = null;
  _pivots: ZigZagPivot[] = [];
  _options: ZigZagOptions = {
    lineColor: '#2962FF',
    lineWidth: 2,
    showPivots: true,
    pivotHighColor: '#ef4444',
    pivotLowColor: '#22c55e',
    pivotRadius: 4,
    showLabels: false,
    labelSize: 10,
  };
  _renderData: {
    lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    pivots: Array<{ x: number; y: number; type: 'high' | 'low'; color: string; price: number }>;
    lineColor?: string;
    lineWidth?: number;
    pivotRadius?: number;
    showLabels?: boolean;
    labelSize?: number;
  } = { lines: [], pivots: [] };

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

  setData(pivots: ZigZagPivot[], options: Partial<ZigZagOptions> = {}) {
    this._pivots = pivots || [];
    this._options = { ...this._options, ...options };
    this._requestUpdate?.();
  }

  update() {
    if (!this._chart || !this._series || this._pivots.length < 2) {
      this._renderData = { lines: [], pivots: [] };
      return;
    }

    const timeScale = this._chart.timeScale?.();
    const seriesData = this._series.data?.() || [];
    if (!timeScale || !seriesData.length) {
      this._renderData = { lines: [], pivots: [] };
      return;
    }

    const timeToIndex = new Map(seriesData.map((bar: any, index: number) => [bar.time, index]));
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const pivotPoints: Array<{ x: number; y: number; type: 'high' | 'low'; color: string; price: number }> = [];
    const coords: Array<{ x: number; y: number; type: 'high' | 'low'; price: number }> = [];

    for (const pivot of this._pivots) {
      const logical = timeToIndex.get(pivot.time);
      if (logical == null) continue;

      const x = timeScale.logicalToCoordinate(logical);
      const y = this._series.priceToCoordinate(pivot.price);
      if (x == null || y == null) continue;

      coords.push({ x, y, type: pivot.type, price: pivot.price });
    }

    for (let i = 1; i < coords.length; i += 1) {
      lines.push({
        x1: coords[i - 1].x,
        y1: coords[i - 1].y,
        x2: coords[i].x,
        y2: coords[i].y,
      });
    }

    if (this._options.showPivots) {
      for (const point of coords) {
        pivotPoints.push({
          x: point.x,
          y: point.y,
          type: point.type,
          color: point.type === 'high' ? this._options.pivotHighColor : this._options.pivotLowColor,
          price: point.price,
        });
      }
    }

    this._renderData = {
      lines,
      pivots: pivotPoints,
      lineColor: this._options.lineColor,
      lineWidth: this._options.lineWidth,
      pivotRadius: this._options.pivotRadius,
      showLabels: this._options.showLabels,
      labelSize: this._options.labelSize,
    };
  }

  renderer() {
    return new ZigZagRenderer(this._renderData);
  }

  zOrder() {
    return 'top';
  }
}

class ZigZagRenderer {
  _data: ZigZagView['_renderData'];

  constructor(data: ZigZagView['_renderData']) {
    this._data = data;
  }

  _hexToRgba(hex: string, alpha: number) {
    const normalized = hex.replace('#', '');
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  draw(target: any) {
    const data = this._data;
    if (!data.lines.length) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context as CanvasRenderingContext2D;
      ctx.save();

      ctx.strokeStyle = data.lineColor || '#2962FF';
      ctx.lineWidth = data.lineWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let i = 0; i < data.lines.length; i += 1) {
        const line = data.lines[i];
        if (i === 0) ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
      }
      ctx.stroke();

      const pivotRadius = data.pivotRadius || 4;
      for (const pivot of data.pivots || []) {
        const color = pivot.color || '#2962FF';

        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, pivotRadius + 2, 0, Math.PI * 2);
        ctx.fillStyle = this._hexToRgba(color, 0.3);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, pivotRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (data.showLabels && data.pivots) {
        const fontSize = data.labelSize || 10;
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const pivot of data.pivots) {
          const priceText = pivot.price.toFixed(pivot.price < 1 ? 5 : 4);
          const offsetY = pivot.type === 'high' ? -(pivotRadius + 10) : (pivotRadius + fontSize + 2);
          ctx.fillStyle = pivot.color;
          ctx.fillText(priceText, pivot.x, pivot.y + offsetY);
        }
      }

      ctx.restore();
    });
  }
}

function calcZigZagPivots(candles: CandlestickData<Time>[], deviation: number): ZigZagPivot[] {
  if (!candles || candles.length < 10) return [];

  const barsCount = candles.length;
  let atrSum = 0;
  const atrBars = Math.min(49, barsCount - 1);
  for (let i = 1; i <= atrBars; i += 1) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    atrSum += tr;
  }

  const avgAtr = atrBars > 0 ? atrSum / atrBars : 0;
  const threshold = avgAtr * (deviation / 2);
  if (!(threshold > 0)) return [];

  let maxIdx = 0;
  let minIdx = 0;
  let maxPrice = candles[0].high;
  let minPrice = candles[0].low;

  for (let i = 1; i < Math.min(10, barsCount); i += 1) {
    if (candles[i].high > maxPrice) {
      maxPrice = candles[i].high;
      maxIdx = i;
    }
    if (candles[i].low < minPrice) {
      minPrice = candles[i].low;
      minIdx = i;
    }
  }

  let lastPivot = minIdx < maxIdx
    ? { idx: minIdx, price: minPrice, type: 'low' as const }
    : { idx: maxIdx, price: maxPrice, type: 'high' as const };

  const pivots: ZigZagPivot[] = [{
    time: candles[lastPivot.idx].time,
    price: lastPivot.price,
    type: lastPivot.type,
  }];

  for (let i = lastPivot.idx + 1; i < barsCount; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (lastPivot.type === 'high') {
      if (high > lastPivot.price) {
        pivots[pivots.length - 1] = { time: candles[i].time, price: high, type: 'high' };
        lastPivot = { idx: i, price: high, type: 'high' };
      } else if (lastPivot.price - low >= threshold) {
        pivots.push({ time: candles[i].time, price: low, type: 'low' });
        lastPivot = { idx: i, price: low, type: 'low' };
      }
    } else if (low < lastPivot.price) {
      pivots[pivots.length - 1] = { time: candles[i].time, price: low, type: 'low' };
      lastPivot = { idx: i, price: low, type: 'low' };
    } else if (high - lastPivot.price >= threshold) {
      pivots.push({ time: candles[i].time, price: high, type: 'high' });
      lastPivot = { idx: i, price: high, type: 'high' };
    }
  }

  return pivots;
}

export const meta = {
  name: 'ZigZag',
  pane: 'main',
  defaultParams: {
    deviation: 5,
    lineColor: '#2962FF',
    lineWidth: 2,
    showPivots: true,
    pivotHighColor: '#ef4444',
    pivotLowColor: '#22c55e',
    pivotRadius: 4,
    showLabels: false,
    labelSize: 10,
  },
  paramMeta: {
    deviation: { label: 'Чувствительность (ATR×)', type: 'number' as const, min: 0.5, max: 10, step: 0.1 },
    lineColor: { label: 'Цвет линии', type: 'color' as const },
    lineWidth: { label: 'Толщина линии', type: 'number' as const, min: 1, max: 5 },
    showPivots: { label: 'Показать точки', type: 'boolean' as const },
    pivotHighColor: { label: 'Цвет максимумов', type: 'color' as const },
    pivotLowColor: { label: 'Цвет минимумов', type: 'color' as const },
    pivotRadius: { label: 'Размер точек', type: 'number' as const, min: 2, max: 10 },
    showLabels: { label: 'Показать метки', type: 'boolean' as const },
    labelSize: { label: 'Размер меток', type: 'number' as const, min: 8, max: 16 },
  },
};

interface ZigZagContext {
  candleSeries: any;
  params: typeof meta.defaultParams;
}

export function init(ctx: ZigZagContext) {
  const { candleSeries, params } = ctx;
  const primitive = new ZigZagPrimitive();

  if (typeof candleSeries.attachPrimitive === 'function') {
    candleSeries.attachPrimitive(primitive);
  }

  function update(candles: CandlestickData<Time>[]) {
    if (!candles?.length) {
      primitive.setData([]);
      return [];
    }

    const pivots = calcZigZagPivots(candles, Math.max(0.5, Number(params.deviation) || 5));
    primitive.setData(pivots, {
      lineColor: params.lineColor || '#2962FF',
      lineWidth: Math.max(1, Number(params.lineWidth) || 2),
      showPivots: params.showPivots !== false,
      pivotHighColor: params.pivotHighColor || '#ef4444',
      pivotLowColor: params.pivotLowColor || '#22c55e',
      pivotRadius: Math.max(2, Number(params.pivotRadius) || 4),
      showLabels: params.showLabels === true,
      labelSize: Math.max(8, Number(params.labelSize) || 10),
    });
    return [];
  }

  function destroy() {
    try {
      if (typeof candleSeries.detachPrimitive === 'function') candleSeries.detachPrimitive(primitive);
    } catch {
      // ignore detach failures during chart teardown
    }
  }

  return { update, destroy };
}