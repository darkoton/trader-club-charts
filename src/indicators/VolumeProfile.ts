/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time } from 'lightweight-charts';

type CandleWithVolume = CandlestickData<Time> & { volume?: number };

interface VolumeProfileBin {
  bot: number;
  top: number;
  buyVol: number;
  sellVol: number;
  total: number;
}

export const meta = {
  name: 'Volume Profile',
  defaultParams: {
    position: 'Справа',
    displayMode: 'Раздельный',
    lookback: 1000,
    rows: 200,
    widthPerc: 25,
    alpha: 0.65,
    lineAlpha: 0.8,
    buyColor: '#16a34a',
    sellColor: '#ef4444',
    showPoc: false,
    pocColor: '#f59e0b',
    showPocLine: true,
  },
  paramMeta: {
    position: { label: 'Расположение', type: 'select' as const, options: ['Слева', 'Справа'] },
    displayMode: { label: 'Режим отображения', type: 'select' as const, options: ['Раздельный', 'Доминирующий'] },
    lookback: { label: 'Бары для анализа', type: 'number' as const, min: 10, max: 5000 },
    rows: { label: 'Количество строк (детализация)', type: 'number' as const, min: 10, max: 1000 },
    widthPerc: { label: 'Ширина профиля (%)', type: 'number' as const, min: 5, max: 80 },
    alpha: { label: 'Прозрачность профиля', type: 'number' as const, min: 0.1, max: 1, step: 0.05 },
    lineAlpha: { label: 'Прозрачность линий POC', type: 'number' as const, min: 0.1, max: 1, step: 0.05 },
    buyColor: { label: 'Цвет Покупок', type: 'color' as const },
    sellColor: { label: 'Цвет Продаж', type: 'color' as const },
    showPoc: { label: 'Выделять макс. объем (POC)', type: 'boolean' as const },
    pocColor: { label: 'Цвет POC', type: 'color' as const },
    showPocLine: { label: 'Линия POC на весь экран', type: 'boolean' as const },
  },
};

interface VolumeProfileContext {
  candleSeries: any;
  params: typeof meta.defaultParams;
  primitivesApi?: { attachPrimitive?: (series: any, primitive: any) => void };
}

class VolumeProfilePrimitive {
  _view: VolumeProfileView;

  constructor(options: Partial<typeof meta.defaultParams> = {}) {
    this._view = new VolumeProfileView(options);
  }

  attached(params: any) { this._view.attached(params); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setOptions(options: Partial<typeof meta.defaultParams>) { this._view.setOptions(options); }
  setData(bins: VolumeProfileBin[], maxVol: number) { this._view.setData(bins, maxVol); }
}

class VolumeProfileView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: (() => void) | null = null;
  _bins: VolumeProfileBin[] = [];
  _maxVol = 0;
  _options: Partial<typeof meta.defaultParams>;

  constructor(options: Partial<typeof meta.defaultParams>) {
    this._options = { ...options };
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

  zOrder() {
    return 'top';
  }

  setOptions(options: Partial<typeof meta.defaultParams>) {
    Object.assign(this._options, options || {});
    this._requestUpdate?.();
  }

  setData(bins: VolumeProfileBin[], maxVol: number) {
    this._bins = bins || [];
    this._maxVol = maxVol;
    this._requestUpdate?.();
  }

  renderer() {
    return {
      drawBackground: (target: any) => this.draw(target),
      draw: (target: any) => this.draw(target),
    };
  }

  draw(target: any) {
    const series = this._series;
    const chart = this._chart;
    if (!series || !chart || !this._bins.length || this._maxVol <= 0) return;

    const timeScale = chart.timeScale?.();
    if (!timeScale) return;

    const options = this._options;
    const draw = (ctx: CanvasRenderingContext2D, pixelRatioX = 1, pixelRatioY = 1, logicalWidth?: number) => {
      ctx.save();
      ctx.scale(pixelRatioX, pixelRatioY);

      const width = logicalWidth || timeScale.width?.() || 0;
      const maxWidthPixels = width * ((Number(options.widthPerc) || 25) / 100);
      const isLeft = options.position === 'Слева';
      let pocTop: number | null = null;
      let pocBottom: number | null = null;
      let pocMid: number | null = null;
      let pocWidth: number | null = null;

      for (const bin of this._bins) {
        if (bin.total <= 0) continue;

        const yTop = series.priceToCoordinate(bin.top);
        const yBottom = series.priceToCoordinate(bin.bot);
        if (yTop == null || yBottom == null) continue;

        const top = Math.min(yTop, yBottom);
        const bottom = Math.max(yTop, yBottom);
        const height = Math.max(1, bottom - top);
        const totalWidth = (bin.total / this._maxVol) * maxWidthPixels;
        ctx.globalAlpha = Number(options.alpha) || 0.65;

        if (options.displayMode === 'Доминирующий') {
          ctx.fillStyle = bin.buyVol >= bin.sellVol ? (options.buyColor || '#16a34a') : (options.sellColor || '#ef4444');
          const x = isLeft ? 0 : width - totalWidth;
          ctx.fillRect(x, top, totalWidth, height);
        } else {
          const sellWidth = bin.total > 0 ? (bin.sellVol / bin.total) * totalWidth : 0;
          const buyWidth = totalWidth - sellWidth;

          if (isLeft) {
            ctx.fillStyle = options.buyColor || '#16a34a';
            ctx.fillRect(0, top, buyWidth, height);
            ctx.fillStyle = options.sellColor || '#ef4444';
            ctx.fillRect(buyWidth, top, sellWidth, height);
          } else {
            ctx.fillStyle = options.sellColor || '#ef4444';
            ctx.fillRect(width - sellWidth, top, sellWidth, height);
            ctx.fillStyle = options.buyColor || '#16a34a';
            ctx.fillRect(width - totalWidth, top, buyWidth, height);
          }
        }

        if (bin.total === this._maxVol) {
          pocTop = top;
          pocBottom = bottom;
          pocMid = (top + bottom) / 2;
          pocWidth = totalWidth;
        }
      }

      if (options.showPoc && pocTop != null && pocBottom != null && pocWidth != null) {
        ctx.globalAlpha = Number(options.lineAlpha) || 0.8;
        ctx.strokeStyle = options.pocColor || '#f59e0b';
        ctx.lineWidth = 1;
        const x = isLeft ? 0 : width - pocWidth;
        ctx.strokeRect(x, pocTop, pocWidth, Math.max(1, pocBottom - pocTop));
      }

      if (options.showPocLine !== false && pocMid != null) {
        ctx.globalAlpha = Number(options.lineAlpha) || 0.8;
        ctx.strokeStyle = options.pocColor || '#f59e0b';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, pocMid);
        ctx.lineTo(width, pocMid);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    };

    if (typeof target.useBitmapCoordinateSpace === 'function') {
      target.useBitmapCoordinateSpace((scope: any) => {
        draw(scope.context, scope.horizontalPixelRatio, scope.verticalPixelRatio, scope.logicalWidth);
      });
    } else {
      draw(target.context, target.pixelRatio || 1, target.pixelRatio || 1);
    }
  }
}

function buildProfile(candles: CandleWithVolume[], params: typeof meta.defaultParams): { bins: VolumeProfileBin[]; maxVol: number } {
  const totalBars = candles.length;
  const lookback = Math.min(totalBars, Math.max(2, Number(params.lookback) || 1000));
  if (lookback < 2) return { bins: [], maxVol: 0 };

  const subset = candles.slice(-lookback);
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const candle of subset) {
    if (candle.low < minPrice) minPrice = candle.low;
    if (candle.high > maxPrice) maxPrice = candle.high;
  }

  if (!Number.isFinite(minPrice) || maxPrice === minPrice) return { bins: [], maxVol: 0 };

  const rows = Math.max(10, Math.min(1000, Number(params.rows) || 200));
  const step = (maxPrice - minPrice) / rows;
  const bins: VolumeProfileBin[] = Array.from({ length: rows }, (_, index) => ({
    bot: minPrice + index * step,
    top: minPrice + (index + 1) * step,
    buyVol: 0,
    sellVol: 0,
    total: 0,
  }));

  for (const candle of subset) {
    const numericVolume = Number(candle.volume);
    const volume = Number.isFinite(numericVolume) && numericVolume > 0 ? numericVolume : 1;
    const isUp = candle.close >= candle.open;
    const barTop = candle.high;
    const barBottom = candle.low;
    const range = barTop - barBottom;

    if (range === 0) {
      const rawIndex = Math.floor((candle.close - minPrice) / step);
      const binIndex = Math.max(0, Math.min(rows - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
      const bin = bins[binIndex];
      if (isUp) bin.buyVol += volume;
      else bin.sellVol += volume;
      bin.total += volume;
      continue;
    }

    for (const bin of bins) {
      const overlapTop = Math.min(barTop, bin.top);
      const overlapBottom = Math.max(barBottom, bin.bot);
      if (overlapTop <= overlapBottom) continue;
      const overlapRatio = (overlapTop - overlapBottom) / range;
      const binVolume = volume * overlapRatio;
      if (isUp) bin.buyVol += binVolume;
      else bin.sellVol += binVolume;
      bin.total += binVolume;
    }
  }

  let maxVol = 0;
  for (const bin of bins) {
    if (bin.total > maxVol) maxVol = bin.total;
  }

  return { bins, maxVol };
}

export function init(ctx: VolumeProfileContext) {
  const { candleSeries, params } = ctx;
  let primitive: VolumeProfilePrimitive | null = new VolumeProfilePrimitive(params);

  if (typeof candleSeries.attachPrimitive === 'function') {
    candleSeries.attachPrimitive(primitive);
  } else if (ctx.primitivesApi?.attachPrimitive) {
    ctx.primitivesApi.attachPrimitive(candleSeries, primitive);
  }

  function update(candles: CandleWithVolume[]) {
    if (!candles?.length || !primitive) {
      primitive?.setData([], 0);
      return [];
    }

    const { bins, maxVol } = buildProfile(candles, params);
    primitive.setOptions(params);
    primitive.setData(bins, maxVol);
    return [];
  }

  function destroy() {
    try {
      primitive?.setData([], 0);
      if (primitive && typeof candleSeries.detachPrimitive === 'function') candleSeries.detachPrimitive(primitive);
      else if (primitive && typeof candleSeries.removePrimitive === 'function') candleSeries.removePrimitive(primitive);
    } catch {
      // ignore teardown failures
    }
    primitive = null;
  }

  return { update, destroy };
}