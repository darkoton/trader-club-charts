/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

/* ─── Zone Primitive (renders rectangles on chart) ─── */

interface ZoneData {
  t1: any; t2: any; pMin: number; pMax: number;
  fill?: string; stroke?: string; lineWidth?: number;
  label?: string; labelColor?: string;
}

interface Rect {
  x: number; y: number; w: number; h: number;
  fill?: string; stroke?: string; lineWidth?: number;
  label?: string; labelColor?: string;
}

class ZonesPaneView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: any = null;
  _zones: ZoneData[] = [];
  _rects: Rect[] = [];

  attached({ series, chart, requestUpdate }: any) {
    this._series = series; this._chart = chart; this._requestUpdate = requestUpdate;
  }
  detached() { this._series = this._chart = this._requestUpdate = null; }
  setZones(zones: ZoneData[]) { this._zones = zones || []; this._requestUpdate?.(); }

  update() {
    const ts = this._chart?.timeScale?.();
    const data = this._series?.data?.() || [];
    if (!ts || !data.length) { this._rects = []; return; }
    const timeToIndex = new Map(data.map((b: any, i: number) => [b.time, i]));
    const x0 = ts.logicalToCoordinate(0);
    const x1 = ts.logicalToCoordinate(1);
    const step = Math.abs((x1 ?? 0) - (x0 ?? 0));
    const halfW = step / 2;
    const rects: Rect[] = [];
    for (const z of this._zones) {
      const li = timeToIndex.get(z.t1) as number | undefined;
      const ri = timeToIndex.get(z.t2) as number | undefined;
      if (li == null || ri == null) continue;
      const xLeft = ts.logicalToCoordinate(Math.min(li as number, ri as number)) - halfW;
      const xRight = ts.logicalToCoordinate(Math.max(li as number, ri as number)) + halfW;
      const yTop = this._series.priceToCoordinate(Math.max(z.pMin, z.pMax));
      const yBot = this._series.priceToCoordinate(Math.min(z.pMin, z.pMax));
      if ([xLeft, xRight, yTop, yBot].some((v: any) => v == null)) continue;
      rects.push({
        x: xLeft, y: yTop, w: xRight - xLeft, h: yBot - yTop,
        fill: z.fill, stroke: z.stroke, lineWidth: z.lineWidth,
        label: z.label, labelColor: z.labelColor,
      });
    }
    this._rects = rects;
  }

  renderer() { return new ZonesRenderer(this._rects); }
  zOrder() { return "top"; }
}

class ZonesRenderer {
  _rects: Rect[];
  constructor(rects: Rect[]) { this._rects = rects || []; }
  draw(target: any) {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context as CanvasRenderingContext2D;
      ctx.save();
      for (const r of this._rects) {
        if (r.fill) { ctx.fillStyle = r.fill; ctx.fillRect(r.x, r.y, r.w, r.h); }
        if (r.stroke && (r.lineWidth ?? 0) > 0) {
          ctx.lineWidth = r.lineWidth!;
          ctx.strokeStyle = r.stroke;
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(1, r.w) - 1, Math.max(1, r.h) - 1);
        }
        if (r.label) {
          ctx.fillStyle = r.labelColor || "#111";
          ctx.font = "11px system-ui, sans-serif";
          ctx.textBaseline = "top";
          ctx.fillText(r.label, r.x + 4, r.y + 4);
        }
      }
      ctx.restore();
    });
  }
}

class ZonesPrimitive {
  _view = new ZonesPaneView();
  attached(p: any) { this._view.attached(p); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setZones(zones: ZoneData[]) { this._view.setZones(zones || []); }
}

/* ─── ATR (SMA TR) ─── */

function calcATR_SMA(candles: CandlestickData<Time>[], period: number): number[] {
  const N = candles.length;
  if (!N) return [];
  const tr = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const c = candles[i];
    const pc = i > 0 ? candles[i - 1].close : c.close;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  const atr = new Array(N).fill(NaN);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    if (i >= period - 1) atr[i] = sum / period;
  }
  return atr;
}

/* ─── META ─── */

export const meta = {
  name: "Imbalance Suite (FVG/OG/VI)",
  defaultParams: {
    showFVG: true,
    showOG: true,
    showVI: true,
    fvgUseWidth: false,
    fvgMethod: "Points",
    fvgWidth: 0,
    ogUseWidth: false,
    ogMethod: "Points",
    ogWidth: 0,
    viUseWidth: false,
    viMethod: "Points",
    viWidth: 0,
    atrPeriod: 200,
    fvgExtend: 0,
    ogExtend: 0,
    viExtend: 5,
    bullFvgFill: "rgba(33,87,243,0.32)",
    bearFvgFill: "rgba(255,17,0,0.32)",
    bullOgFill: "rgba(33,87,243,0.50)",
    bearOgFill: "rgba(255,17,0,0.50)",
    bullViStroke: "#2157f3",
    bearViStroke: "#ff1100",
    viLineWidth: 1,
    showLabels: true,
    labelColor: "#111",
    placeDetectionMarker: false,
    buyText: "BUY",
    sellText: "SELL",
    buyShape: "arrowUp",
    sellShape: "arrowDown",
    buyColor: "#16a34a",
    sellColor: "#ef4444",
    buyTextColor: "#16a34a",
    sellTextColor: "#ef4444",
    maxBarsBack: 50,
  },
  paramMeta: {
    showFVG:     { label: "FVG: показывать", type: "boolean" as const },
    showOG:      { label: "OG: показывать", type: "boolean" as const },
    showVI:      { label: "VI: показывать", type: "boolean" as const },
    fvgUseWidth: { label: "FVG: фильтр ширины", type: "boolean" as const },
    fvgMethod:   { label: "FVG: метод", type: "select" as const, options: ["Points", "%", "ATR"] },
    fvgWidth:    { label: "FVG: мин. ширина", type: "number" as const, min: 0, max: 1e9, step: 0.00001 },
    ogUseWidth:  { label: "OG: фильтр ширины", type: "boolean" as const },
    ogMethod:    { label: "OG: метод", type: "select" as const, options: ["Points", "%", "ATR"] },
    ogWidth:     { label: "OG: мин. ширина", type: "number" as const, min: 0, max: 1e9, step: 0.00001 },
    viUseWidth:  { label: "VI: фильтр ширины", type: "boolean" as const },
    viMethod:    { label: "VI: метод", type: "select" as const, options: ["Points", "%", "ATR"] },
    viWidth:     { label: "VI: мин. ширина", type: "number" as const, min: 0, max: 1e9, step: 0.00001 },
    atrPeriod:   { label: "ATR период (для фильтра ATR)", type: "number" as const, min: 2, max: 500 },
    fvgExtend:   { label: "FVG: Extend (бары)", type: "number" as const, min: 0, max: 50 },
    ogExtend:    { label: "OG: Extend (бары)", type: "number" as const, min: 0, max: 50 },
    viExtend:    { label: "VI: Extend (бары)", type: "number" as const, min: 0, max: 50 },
    bullFvgFill: { label: "FVG Bull: заливка", type: "color" as const },
    bearFvgFill: { label: "FVG Bear: заливка", type: "color" as const },
    bullOgFill:  { label: "OG Bull: заливка", type: "color" as const },
    bearOgFill:  { label: "OG Bear: заливка", type: "color" as const },
    bullViStroke:{ label: "VI Bull: рамка", type: "color" as const },
    bearViStroke:{ label: "VI Bear: рамка", type: "color" as const },
    viLineWidth: { label: "VI: толщина рамки", type: "number" as const, min: 0, max: 4 },
    showLabels:  { label: "Подписи зон", type: "boolean" as const },
    labelColor:  { label: "Цвет подписи", type: "color" as const },
    placeDetectionMarker: { label: "Маркер при обнаружении", type: "boolean" as const },
    buyText:      { label: "Текст BUY", type: "text" as const, maxLength: 12 },
    sellText:     { label: "Текст SELL", type: "text" as const, maxLength: 12 },
    buyShape:     { label: "Форма BUY", type: "select" as const, options: ["arrowUp", "circle", "square"] },
    sellShape:    { label: "Форма SELL", type: "select" as const, options: ["arrowDown", "circle", "square"] },
    buyColor:     { label: "Цвет BUY", type: "color" as const },
    sellColor:    { label: "Цвет SELL", type: "color" as const },
    buyTextColor: { label: "Цвет текста BUY", type: "color" as const },
    sellTextColor:{ label: "Цвет текста SELL", type: "color" as const },
    maxBarsBack:  { label: "Макс. баров назад", type: "number" as const, min: 50, max: 500 },
  },
};

/* ─── INIT ─── */

interface ImbalanceContext {
  candleSeries: any;
  chart: IChartApi;
  params: typeof meta.defaultParams;
  createSeriesMarkers: any;
}

export function init(ctx: ImbalanceContext) {
  const { candleSeries, params, createSeriesMarkers } = ctx;
  const markersApi = createSeriesMarkers(candleSeries, []);

  const zonesPrimitive = new ZonesPrimitive();
  if (typeof candleSeries.attachPrimitive === "function") {
    candleSeries.attachPrimitive(zonesPrimitive);
  }

  function distPass(top: number, btm: number, method: string, width: number, atrVal: number) {
    const dist = top - btm;
    switch (method) {
      case "Points": return dist > width;
      case "%":      return btm !== 0 ? (dist / btm * 100) > width : false;
      case "ATR":    return (atrVal ?? 0) > 0 ? dist > (atrVal * width) : true;
      default:       return true;
    }
  }

  function zlabel(txt: string) { return params.showLabels ? txt : undefined; }

  function detectOG(c: CandlestickData<Time>, p1: CandlestickData<Time>) {
    return { bull: c.low > p1.high, bear: c.high < p1.low };
  }

  function detectVI(i: number, candles: CandlestickData<Time>[]) {
    const c = candles[i], p1 = candles[i - 1];
    if (!p1) return { bull: false, bear: false, bullTop: 0, bullBtm: 0, bearTop: 0, bearBtm: 0 };
    const bull_gap_top = Math.min(c.close, c.open);
    const bull_gap_btm = Math.max(p1.close, p1.open);
    const bear_gap_top = Math.min(p1.close, p1.open);
    const bear_gap_btm = Math.max(c.close, c.open);
    const bull = (c.open > p1.close) && (p1.high > c.low) && (c.close > p1.close) && (c.open > p1.open) && (p1.high < bull_gap_top);
    const bear = (c.open < p1.close) && (p1.low < c.high) && (c.close < p1.close) && (c.open < p1.open) && (p1.low > bear_gap_btm);
    return { bull, bear, bullTop: bull_gap_top, bullBtm: bull_gap_btm, bearTop: bear_gap_top, bearBtm: bear_gap_btm };
  }

  function detectFVG(i: number, candles: CandlestickData<Time>[]) {
    const C = candles[i], B = candles[i - 1], A = candles[i - 2];
    if (!A || !B || !C) return { bull: false, bear: false, bullTop: 0, bullBtm: 0, bearTop: 0, bearBtm: 0 };
    const bull = (C.low > A.high) && (B.close > A.high);
    const bear = (C.high < A.low) && (B.close < A.low);
    return { bull, bear, bullTop: C.low, bullBtm: A.high, bearTop: A.low, bearBtm: C.high };
  }

  function update(candles: CandlestickData<Time>[]) {
    const N = candles?.length || 0;
    if (N < 2) { markersApi.setMarkers([]); zonesPrimitive.setZones([]); return []; }

    const atr = calcATR_SMA(candles, Math.max(2, params.atrPeriod | 0));
    const zones: ZoneData[] = [];
    const markers: any[] = [];
    const ogFlags = new Array(N).fill(null).map(() => ({ bull: false, bear: false }));

    for (let i = 1; i < N; i++) {
      const c = candles[i], p1 = candles[i - 1];

      // OG
      if (params.showOG) {
        const og = detectOG(c, p1);
        if (og.bull) {
          const top = Math.min(c.close, c.open), btm = Math.max(p1.close, p1.open);
          const pass = !params.ogUseWidth || distPass(top, btm, params.ogMethod, params.ogWidth, atr[i]);
          if (pass) {
            const right = Math.min(N - 1, i + (params.ogExtend | 0));
            zones.push({ t1: candles[i - 1].time, t2: candles[right].time, pMin: Math.min(btm, top), pMax: Math.max(btm, top), fill: params.bullOgFill, label: zlabel("OG↑"), labelColor: params.labelColor });
            if (params.placeDetectionMarker) markers.push({ name: "buy", time: c.time, position: "belowBar", shape: params.buyShape, color: params.buyColor, textColor: params.buyTextColor, price: c.close, text: params.buyText });
            ogFlags[i].bull = true;
          }
        }
        if (og.bear) {
          const top = Math.min(p1.close, p1.open), btm = Math.max(c.close, c.open);
          const pass = !params.ogUseWidth || distPass(top, btm, params.ogMethod, params.ogWidth, atr[i]);
          if (pass) {
            const right = Math.min(N - 1, i + (params.ogExtend | 0));
            zones.push({ t1: candles[i - 1].time, t2: candles[right].time, pMin: Math.min(btm, top), pMax: Math.max(btm, top), fill: params.bearOgFill, label: zlabel("OG↓"), labelColor: params.labelColor });
            if (params.placeDetectionMarker) markers.push({ name: "sell", time: c.time, position: "aboveBar", shape: params.sellShape, color: params.sellColor, textColor: params.sellTextColor, price: c.close, text: params.sellText });
            ogFlags[i].bear = true;
          }
        }
      }

      // VI
      if (params.showVI) {
        const vi = detectVI(i, candles);
        if (vi.bull) {
          const pass = !params.viUseWidth || distPass(vi.bullTop, vi.bullBtm, params.viMethod, params.viWidth, atr[i]);
          if (pass) {
            const right = Math.min(N - 1, i + (params.viExtend | 0));
            zones.push({ t1: candles[i - 1].time, t2: candles[right].time, pMin: Math.min(vi.bullBtm, vi.bullTop), pMax: Math.max(vi.bullBtm, vi.bullTop), stroke: params.bullViStroke, lineWidth: Math.max(0, params.viLineWidth | 0), label: zlabel("VI↑"), labelColor: params.labelColor });
            if (params.placeDetectionMarker) markers.push({ name: "buy", time: c.time, position: "belowBar", shape: params.buyShape, color: params.buyColor, textColor: params.buyTextColor, price: c.close, text: params.buyText });
          }
        }
        if (vi.bear) {
          const pass = !params.viUseWidth || distPass(vi.bearTop, vi.bearBtm, params.viMethod, params.viWidth, atr[i]);
          if (pass) {
            const right = Math.min(N - 1, i + (params.viExtend | 0));
            zones.push({ t1: candles[i - 1].time, t2: candles[right].time, pMin: Math.min(vi.bearBtm, vi.bearTop), pMax: Math.max(vi.bearBtm, vi.bearTop), stroke: params.bearViStroke, lineWidth: Math.max(0, params.viLineWidth | 0), label: zlabel("VI↓"), labelColor: params.labelColor });
            if (params.placeDetectionMarker) markers.push({ name: "sell", time: c.time, position: "aboveBar", shape: params.sellShape, color: params.sellColor, textColor: params.sellTextColor, price: c.close, text: params.sellText });
          }
        }
      }

      // FVG
      if (params.showFVG && i >= 2) {
        const { bull, bear, bullTop, bullBtm, bearTop, bearBtm } = detectFVG(i, candles);
        if (bull && !(ogFlags[i]?.bull || ogFlags[i - 1]?.bull)) {
          const pass = !params.fvgUseWidth || distPass(bullTop, bullBtm, params.fvgMethod, params.fvgWidth, atr[i]);
          if (pass) {
            const right = Math.min(N - 1, i + (params.fvgExtend | 0));
            zones.push({ t1: candles[i - 2].time, t2: candles[right].time, pMin: Math.min(bullBtm, bullTop), pMax: Math.max(bullBtm, bullTop), fill: params.bullFvgFill, label: zlabel("FVG↑"), labelColor: params.labelColor });
            if (params.placeDetectionMarker) markers.push({ name: "buy", time: c.time, position: "belowBar", shape: params.buyShape, color: params.buyColor, textColor: params.buyTextColor, price: c.close, text: params.buyText });
          }
        }
        if (bear && !(ogFlags[i]?.bear || ogFlags[i - 1]?.bear)) {
          const pass = !params.fvgUseWidth || distPass(bearTop, bearBtm, params.fvgMethod, params.fvgWidth, atr[i]);
          if (pass) {
            const right = Math.min(N - 1, i + (params.fvgExtend | 0));
            zones.push({ t1: candles[i - 2].time, t2: candles[right].time, pMin: Math.min(bearBtm, bearTop), pMax: Math.max(bearBtm, bearTop), fill: params.bearFvgFill, label: zlabel("FVG↓"), labelColor: params.labelColor });
            if (params.placeDetectionMarker) markers.push({ name: "sell", time: c.time, position: "aboveBar", shape: params.sellShape, color: params.sellColor, textColor: params.sellTextColor, price: c.close, text: params.sellText });
          }
        }
      }
    }

    zonesPrimitive.setZones(zones);
    markersApi.setMarkers(markers);
    return markers;
  }

  function destroy() {
    markersApi.setMarkers([]);
    zonesPrimitive.setZones([]);
  }

  return { update, destroy };
}
