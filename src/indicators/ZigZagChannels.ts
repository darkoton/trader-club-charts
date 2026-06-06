/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time } from 'lightweight-charts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ─── Polyline Primitive ─── */

interface PolyLine {
  points: Array<{ time: any; price: number }>;
  color: string;
  width?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
}

interface CoordLine {
  seg: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  dash: string;
}

class PolyLinesPaneView {
  _series: any = null;
  _chart: any = null;
  _requestUpdate: any = null;
  _lines: PolyLine[] = [];
  _coords: CoordLine[] = [];

  attached({ series, chart, requestUpdate }: any) {
    this._series = series; this._chart = chart; this._requestUpdate = requestUpdate;
  }
  detached() { this._series = this._chart = this._requestUpdate = null; }
  setLines(lines: PolyLine[]) { this._lines = lines || []; this._requestUpdate?.(); }

  update() {
    const ts = this._chart?.timeScale?.();
    const data = this._series?.data?.() || [];
    if (!ts || !data.length) { this._coords = []; return; }
    const t2i = new Map(data.map((b: any, i: number) => [b.time, i]));
    const coords: CoordLine[] = [];
    for (const L of this._lines) {
      const seg: Array<{ x: number; y: number }> = [];
      for (const p of L.points || []) {
        const idx = t2i.get(p.time);
        if (idx == null) continue;
        const x = ts.logicalToCoordinate(idx);
        const y = this._series.priceToCoordinate(p.price);
        if (x == null || y == null) continue;
        seg.push({ x, y });
      }
      if (seg.length >= 2) {
        coords.push({
          seg,
          color: L.color || '#9ca3af',
          width: Math.max(1, +(L.width || 2)),
          dash: L.dash || 'solid',
        });
      }
    }
    this._coords = coords;
  }

  renderer() { return new PolyLinesRenderer(this._coords); }
  zOrder() { return "top"; }
}

class PolyLinesRenderer {
  _coords: CoordLine[];
  constructor(coords: CoordLine[]) { this._coords = coords || []; }
  draw(target: any) {
    if (!this._coords.length) return;
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context as CanvasRenderingContext2D;
      const { width, height } = scope.mediaSize;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
      for (const L of this._coords) {
        ctx.beginPath();
        ctx.lineWidth = L.width;
        ctx.strokeStyle = L.color;
        if (L.dash === 'dashed') ctx.setLineDash([8, 6]);
        else if (L.dash === 'dotted') ctx.setLineDash([2, 4]);
        else ctx.setLineDash([]);
        ctx.moveTo(L.seg[0].x, L.seg[0].y);
        for (let i = 1; i < L.seg.length; i++) ctx.lineTo(L.seg[i].x, L.seg[i].y);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}

class PolyLinesPrimitive {
  _view = new PolyLinesPaneView();
  attached(p: any) { this._view.attached(p); }
  detached() { this._view.detached(); }
  paneViews() { return [this._view]; }
  updateAllViews() { this._view.update(); }
  setLines(lines: PolyLine[]) { this._view.setLines(lines); }
}

/* ─── META ─── */

export const meta = {
  name: "ZigZag + Channels",
  defaultParams: {
    length: 20,
    extendToLast: true,
    showExt: true,
    showLabels: true,
    showDots: false,
    midColor: "#FF8C00",
    upColor: "#F44336",
    dnColor: "#4CAF50",
    midWidth: 2,
    extWidth: 1,
    midDash: "solid",
    extDash: "dotted",
    maxBarsBack: 5000,
  },
  paramMeta: {
    length:       { label: "Длина окна", type: "number" as const, min: 2, max: 200 },
    extendToLast: { label: "Продлевать к последней свече", type: "boolean" as const },
    showExt:      { label: "Показывать границы канала", type: "boolean" as const },
    showLabels:   { label: "Показывать подписи", type: "boolean" as const },
    showDots:     { label: "Показывать точки", type: "boolean" as const },
    midColor:     { label: "Цвет ZigZag", type: "color" as const },
    upColor:      { label: "Цвет верхней границы", type: "color" as const },
    dnColor:      { label: "Цвет нижней границы", type: "color" as const },
    midWidth:     { label: "Толщина ZigZag", type: "number" as const, min: 1, max: 5 },
    extWidth:     { label: "Толщина границ", type: "number" as const, min: 1, max: 3 },
    midDash:      { label: "Стиль ZigZag", type: "select" as const, options: ["solid", "dashed", "dotted"] },
    extDash:      { label: "Стиль границ", type: "select" as const, options: ["solid", "dashed", "dotted"] },
    maxBarsBack:  { label: "Ограничение истории", type: "number" as const, min: 500, max: 20000 },
  },
};

/* ─── INIT ─── */

interface ZigZagContext {
  candleSeries: any;
  params: typeof meta.defaultParams;
  createSeriesMarkers: any;
}

export function init(ctx: ZigZagContext) {
  const { candleSeries, params, createSeriesMarkers } = ctx;
  const p = params || meta.defaultParams;

  const linesPrim = new PolyLinesPrimitive();
  if (typeof candleSeries.attachPrimitive === 'function') {
    candleSeries.attachPrimitive(linesPrim);
  }

  const labelsApi = createSeriesMarkers(candleSeries, []);

  function highestClose(candles: CandlestickData<Time>[], from: number, to: number) {
    let v = -Infinity;
    for (let i = from; i <= to; i++) v = Math.max(v, candles[i].close);
    return v;
  }

  function lowestClose(candles: CandlestickData<Time>[], from: number, to: number) {
    let v = +Infinity;
    for (let i = from; i <= to; i++) v = Math.min(v, candles[i].close);
    return v;
  }

  function buildChannels(candles: CandlestickData<Time>[]) {
    const N = candles.length;
    const L = clamp(p.length | 0, 2, 10000);
    if (N < L + 2) return { segments: [] as PolyLine[], labels: [] as any[] };

    const start = Math.max(0, N - Math.max(500, p.maxBarsBack | 0) - (L + 10));

    let osPrev = -1;
    for (let i = start + L; i <= start + L + 10 && i < N; i++) {
      const up = highestClose(candles, i - L + 1, i);
      const dn = lowestClose(candles, i - L + 1, i);
      const sLag = candles[i - L].close;
      const os = sLag > up ? 0 : sLag < dn ? 1 : -1;
      if (os !== -1) { osPrev = os; break; }
    }
    if (osPrev === -1) osPrev = 0;

    interface EventItem { i: number; anchorIdx: number; type: 'top' | 'btm'; price: number; time: any }
    const events: EventItem[] = [];
    let valTop = NaN, valBtm = NaN;

    for (let i = start + L; i < N; i++) {
      const up = highestClose(candles, i - L + 1, i);
      const dn = lowestClose(candles, i - L + 1, i);
      const sLag = candles[i - L].close;
      const os = sLag > up ? 0 : sLag < dn ? 1 : osPrev;

      const top = os === 0 && osPrev !== 0;
      const btm = os === 1 && osPrev !== 1;

      if (btm) {
        const anchorIdx = i - L;
        valBtm = candles[i - L].low;
        const ev: EventItem = { i, anchorIdx, type: 'btm', price: valBtm, time: candles[anchorIdx].time };
        events.push(ev);
      }
      if (top) {
        const anchorIdx = i - L;
        valTop = candles[i - L].high;
        const ev: EventItem = { i, anchorIdx, type: 'top', price: valTop, time: candles[anchorIdx].time };
        events.push(ev);
      }
      osPrev = os;
    }

    // Channel segments
    function createChannelSegments(aIdx: number, bIdx: number, aPrice: number, bPrice: number, dashOverride: string | null = null): PolyLine[] {
      if (bIdx <= aIdx || aIdx < 0 || bIdx >= N) return [];
      const aT = candles[aIdx].time, bT = candles[bIdx].time;
      const segments: PolyLine[] = [];

      let maxUp = 0, maxDn = 0;
      for (let k = aIdx; k <= bIdx; k++) {
        const t = (k - aIdx) / Math.max(1, bIdx - aIdx);
        const point = aPrice + t * (bPrice - aPrice);
        const hi = Math.max(candles[k].close, candles[k].open);
        const lo = Math.min(candles[k].close, candles[k].open);
        maxUp = Math.max(maxUp, hi - point);
        maxDn = Math.max(maxDn, point - lo);
      }

      segments.push({
        points: [{ time: aT, price: aPrice }, { time: bT, price: bPrice }],
        color: p.midColor || "#FF8C00",
        width: Math.max(1, p.midWidth | 0),
        dash: (dashOverride || p.midDash || "solid") as any,
      });

      if (p.showExt) {
        segments.push({
          points: [{ time: aT, price: aPrice + maxUp }, { time: bT, price: bPrice + maxUp }],
          color: p.upColor || "#F44336",
          width: Math.max(1, p.extWidth | 0),
          dash: (p.extDash || "dotted") as any,
        });
        segments.push({
          points: [{ time: aT, price: aPrice - maxDn }, { time: bT, price: bPrice - maxDn }],
          color: p.dnColor || "#4CAF50",
          width: Math.max(1, p.extWidth | 0),
          dash: (p.extDash || "dotted") as any,
        });
      }
      return segments;
    }

    const segments: PolyLine[] = [];
    const labels: any[] = [];
    let lastExt: EventItem | null = null;

    for (const ev of events) {
      if (!lastExt) { lastExt = ev; continue; }
      if (lastExt.type !== ev.type) {
        segments.push(...createChannelSegments(lastExt.anchorIdx, ev.anchorIdx, lastExt.price, ev.price));
        if (p.showLabels) {
          labels.push({
            name: "label", time: ev.time,
            position: ev.type === 'btm' ? "belowBar" : "aboveBar",
            shape: "circle", color: "rgba(0,0,0,0)",
            text: String(ev.price.toFixed(ev.price < 1 ? 5 : 4)),
            textColor: ev.type === 'btm' ? (p.dnColor || "#4CAF50") : (p.upColor || "#F44336"),
          });
        }
        if (p.showDots) {
          labels.push({
            name: "dot", time: ev.time,
            position: ev.type === 'btm' ? "belowBar" : "aboveBar",
            shape: "circle",
            color: ev.type === 'btm' ? (p.dnColor || "#4CAF50") : (p.upColor || "#F44336"),
            text: "",
          });
        }
        lastExt = ev;
      } else {
        if (ev.type === 'top') { if (ev.price > lastExt.price) lastExt = ev; }
        else { if (ev.price < lastExt.price) lastExt = ev; }
      }
    }

    // Extend to last candle
    if (p.extendToLast && lastExt) {
      const aIdx = lastExt.anchorIdx, bIdx = N - 1;
      if (bIdx > aIdx) {
        segments.push(...createChannelSegments(aIdx, bIdx, lastExt.price, candles[bIdx].close, "solid"));
      }
    }

    return { segments, labels };
  }

  function update(candles: CandlestickData<Time>[]) {
    const { segments, labels } = buildChannels(candles);
    linesPrim.setLines(segments);
    labelsApi.setMarkers(labels || []);
    return [];
  }

  function destroy() {
    linesPrim.setLines([]);
    labelsApi.setMarkers([]);
  }

  return { update, destroy };
}
