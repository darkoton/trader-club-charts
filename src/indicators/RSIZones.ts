/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

/* ─── RSI Zone Primitive ─── */

class RSIZonesView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: any = null;
  _options = {
    overboughtLevel: 70,
    oversoldLevel: 30,
    overboughtColor: "rgba(239, 68, 68, 0.15)",
    oversoldColor: "rgba(34, 197, 94, 0.15)",
    middleLineColor: "rgba(156, 163, 175, 0.5)",
    showMiddleLine: true,
  };
  _renderData: any = null;

  attached({ series, chart, requestUpdate }: any) {
    this._series = series; this._chart = chart; this._requestUpdate = requestUpdate;
  }
  detached() { this._series = this._chart = this._requestUpdate = null; }
  setOptions(options: any) { this._options = { ...this._options, ...options }; this._requestUpdate?.(); }

  update() {
    if (!this._chart || !this._series) { this._renderData = null; return; }
    const ts = this._chart.timeScale();
    const width = ts.width();
    const y100 = this._series.priceToCoordinate(100);
    const y70 = this._series.priceToCoordinate(this._options.overboughtLevel);
    const y50 = this._series.priceToCoordinate(50);
    const y30 = this._series.priceToCoordinate(this._options.oversoldLevel);
    const y0 = this._series.priceToCoordinate(0);
    if ([y100, y70, y50, y30, y0].some((v) => v === null)) { this._renderData = null; return; }
    this._renderData = { width, y100, y70, y50, y30, y0, ...this._options };
  }

  renderer() { return new RSIZonesRenderer(this._renderData); }
  zOrder() { return "bottom"; }
}

class RSIZonesRenderer {
  _data: any;
  constructor(data: any) { this._data = data; }
  draw(target: any) {
    if (!this._data) return;
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context as CanvasRenderingContext2D;
      const d = this._data;
      ctx.save();

      const overboughtGrad = ctx.createLinearGradient(0, d.y100, 0, d.y70);
      overboughtGrad.addColorStop(0, d.overboughtColor);
      overboughtGrad.addColorStop(1, "transparent");
      ctx.fillStyle = overboughtGrad;
      ctx.fillRect(0, d.y100, d.width, d.y70 - d.y100);

      const oversoldGrad = ctx.createLinearGradient(0, d.y30, 0, d.y0);
      oversoldGrad.addColorStop(0, "transparent");
      oversoldGrad.addColorStop(1, d.oversoldColor);
      ctx.fillStyle = oversoldGrad;
      ctx.fillRect(0, d.y30, d.width, d.y0 - d.y30);

      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;

      ctx.strokeStyle = d.overboughtColor.replace("0.15", "0.6");
      ctx.beginPath(); ctx.moveTo(0, d.y70); ctx.lineTo(d.width, d.y70); ctx.stroke();

      ctx.strokeStyle = d.oversoldColor.replace("0.15", "0.6");
      ctx.beginPath(); ctx.moveTo(0, d.y30); ctx.lineTo(d.width, d.y30); ctx.stroke();

      if (d.showMiddleLine) {
        ctx.strokeStyle = d.middleLineColor;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(0, d.y50); ctx.lineTo(d.width, d.y50); ctx.stroke();
      }

      ctx.restore();
    });
  }
}

class RSIZonesPrimitive {
  _view = new RSIZonesView();
  attached(params: any) { this._view.attached(params); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setOptions(options: any) { this._view.setOptions(options); }
}

/* ─── META ─── */

export const meta = {
  name: "RSI Zones",
  pane: "separate" as const,
  defaultParams: {
    period: 14,
    overboughtLevel: 70,
    oversoldLevel: 30,
    overboughtColor: "#ef4444",
    oversoldColor: "#22c55e",
    rsiColor: "#8b5cf6",
    rsiWidth: 2,
    dynamicColor: true,
    showMiddleLine: true,
  },
  paramMeta: {
    period:          { label: "Период RSI", type: "number" as const, min: 2, max: 50 },
    overboughtLevel: { label: "Уровень перекупленности", type: "number" as const, min: 50, max: 100 },
    oversoldLevel:   { label: "Уровень перепроданности", type: "number" as const, min: 0, max: 50 },
    overboughtColor: { label: "Цвет перекупленности", type: "color" as const },
    oversoldColor:   { label: "Цвет перепроданности", type: "color" as const },
    rsiColor:        { label: "Цвет RSI", type: "color" as const },
    rsiWidth:        { label: "Толщина линии", type: "number" as const, min: 1, max: 5 },
    dynamicColor:    { label: "Динамический цвет", type: "boolean" as const },
    showMiddleLine:  { label: "Линия 50", type: "boolean" as const },
  },
};

/* ─── INIT ─── */

interface RSIContext {
  chart: IChartApi;
  params: typeof meta.defaultParams;
  addSeries: any;
  LineSeries: any;
  paneIndex?: number;
}

export function init(ctx: RSIContext) {
  const { chart, addSeries, LineSeries, paneIndex, params } = ctx;

  const rsiLine = addSeries(LineSeries, {
    lineWidth: params.rsiWidth || 2,
    priceLineVisible: false,
    lastValueVisible: true,
    color: params.rsiColor || "#8b5cf6",
  }, paneIndex);

  rsiLine.applyOptions({
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    autoscaleInfoProvider: () => ({
      priceRange: { minValue: 0, maxValue: 100 },
      margins: { above: 0, below: 0 },
    }),
  });
  rsiLine.priceScale().applyOptions({
    autoScale: true,
    scaleMargins: { top: 0.05, bottom: 0.05 },
  });

  const zonesPrimitive = new RSIZonesPrimitive();
  rsiLine.attachPrimitive(zonesPrimitive);

  function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function calcRSI(closes: number[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < closes.length; i++) {
      if (i === 0) { result.push(undefined); continue; }
      const change = closes[i] - closes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      if (i < period) { avgGain += gain; avgLoss += loss; result.push(undefined); continue; }
      if (i === period) { avgGain = avgGain / period; avgLoss = avgLoss / period; }
      else { avgGain = (avgGain * (period - 1) + gain) / period; avgLoss = (avgLoss * (period - 1) + loss) / period; }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
    return result;
  }

  function update(candles: CandlestickData<Time>[]) {
    if (!candles || candles.length === 0) { rsiLine.setData([]); return []; }
    const closes = candles.map((c) => c.close);
    const times = candles.map((c) => c.time);
    const period = Math.max(2, +params.period || 14);
    const rsiValues = calcRSI(closes, period);
    const overbought = params.overboughtLevel || 70;
    const oversold = params.oversoldLevel || 30;
    const rsiData: any[] = [];

    for (let i = 0; i < rsiValues.length; i++) {
      if (rsiValues[i] === undefined) continue;
      let color = params.rsiColor || "#8b5cf6";
      if (params.dynamicColor !== false) {
        if (rsiValues[i]! >= overbought) color = params.overboughtColor || "#ef4444";
        else if (rsiValues[i]! <= oversold) color = params.oversoldColor || "#22c55e";
      }
      rsiData.push({ time: times[i], value: rsiValues[i], color });
    }

    rsiLine.setData(rsiData);
    zonesPrimitive.setOptions({
      overboughtLevel: overbought,
      oversoldLevel: oversold,
      overboughtColor: hexToRgba(params.overboughtColor || "#ef4444", 0.15),
      oversoldColor: hexToRgba(params.oversoldColor || "#22c55e", 0.15),
      showMiddleLine: params.showMiddleLine !== false,
    });
    return [];
  }

  function destroy() {
    try { rsiLine.detachPrimitive(zonesPrimitive); chart.removeSeries(rsiLine); } catch (_) { /* ignore */ }
  }

  return { update, destroy };
}
