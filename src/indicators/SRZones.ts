import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

/**
 * 🔥 SR ZONES PRO MAX (Adaptive)
 *
 * Ported from PineScript v6.
 *
 * Detects Support/Resistance zones using pivot analysis + volume delta filter.
 * Zones dynamically flip roles (BUY ↔ SELL) on 2-candle breakouts.
 */

export const meta = {
  name: "SR Zones Pro",
  defaultParams: {
    lookbackPeriod: 10,
    volLen: 2,
    boxWidth: 1.0,
    activeAlpha: 0.45,
    idleAlpha: 0.20,
    maxZones: 50,
    showLabels: true,
    buyColor: "#26a69a",
    sellColor: "#ef5350",
    showBorder: true,
    borderWidth: 1,
  },
  paramMeta: {
    lookbackPeriod: { label: "Период поиска",          type: "number", min: 3, max: 50 },
    volLen:         { label: "Фильтр дельты",          type: "number", min: 1, max: 20 },
    boxWidth:       { label: "Ширина зоны (ATR)",      type: "number", min: 0.1, max: 5.0, step: 0.1 },
    activeAlpha:    { label: "Подсветка при касании",   type: "number", min: 0.05, max: 1, step: 0.05 },
    idleAlpha:      { label: "Обычная прозрачность",   type: "number", min: 0.05, max: 1, step: 0.05 },
    maxZones:       { label: "Макс. зон",              type: "number", min: 1, max: 50 },
    showLabels:     { label: "Показывать подписи",     type: "boolean" },
    buyColor:       { label: "Цвет BUY зоны",         type: "color" },
    sellColor:      { label: "Цвет SELL зоны",        type: "color" },
    showBorder:     { label: "Показывать рамку",       type: "boolean" },
    borderWidth:    { label: "Толщина рамки",          type: "number", min: 0, max: 6 },
  }
};

/* ─── lightweight-charts init (legacy, unused with TV Charting Library) ─── */

interface SRZonesContext {
  candleSeries: any;
  chart: IChartApi;
  params: typeof meta.defaultParams;
}

interface Box {
  t1: Time;
  t2: Time;
  i1: number;
  i2: number;
  top: number;
  bot: number;
  color: string;
  alpha: number;
}

export function init(ctx: SRZonesContext) {
  const { candleSeries, params } = ctx;

  class SRPrimitive {
    private _v: View;
    constructor(o: any = {}) { this._v = new View(o); }
    attached(p: any) { this._v.attached(p); }
    detached() { this._v.detached(); }
    paneViews() { return [this._v]; }
    updateAllViews() { this._v.update(); }
    setOptions(o: any) { this._v.setOptions(o); }
    setBoxes(list: Box[]) { this._v.setBoxes(list); }
  }

  class View {
    private _s: any = null;
    private _c: any = null;
    private _req: any = null;
    private _boxes: Box[] = [];
    private _rects: Array<{ x: number; y: number; w: number; h: number; color: string; alpha: number }> = [];
    private _o: any;

    constructor(o: any) {
      this._o = { showBorder: true, borderWidth: 1, ...o };
    }

    attached({ series, chart, requestUpdate }: any) {
      this._s = series; this._c = chart; this._req = requestUpdate;
    }
    detached() { this._s = this._c = this._req = null; }
    update() {
      const s = this._s;
      const c = this._c;
      const ts = c?.timeScale?.();
      if (!s || !ts || !this._boxes.length) {
        this._rects = [];
        return;
      }

      const x0 = ts.logicalToCoordinate(0);
      const x1 = ts.logicalToCoordinate(1);
      const rawStep = Math.abs((x1 ?? 0) - (x0 ?? 0));
      const halfW = Math.max(0.5, rawStep / 2);
      const rects: Array<{ x: number; y: number; w: number; h: number; color: string; alpha: number }> = [];

      for (const b of this._boxes) {
        const leftLogical = Math.min(b.i1, b.i2);
        const rightLogical = Math.max(b.i1, b.i2);
        const xLeftRaw = ts.logicalToCoordinate(leftLogical);
        const xRightRaw = ts.logicalToCoordinate(rightLogical);
        const yTop = s.priceToCoordinate(Math.max(b.top, b.bot));
        const yBot = s.priceToCoordinate(Math.min(b.top, b.bot));
        if (xLeftRaw == null || xRightRaw == null || yTop == null || yBot == null) continue;

        const xLeft = xLeftRaw - halfW;
        const xRight = xRightRaw + halfW;
        rects.push({
          x: xLeft,
          y: yTop,
          w: Math.max(1, xRight - xLeft),
          h: Math.max(1, yBot - yTop),
          color: b.color,
          alpha: b.alpha,
        });
      }

      this._rects = rects;
    }
    zOrder() { return 'top'; }

    setOptions(o: any) { Object.assign(this._o, o); this.update(); this._req?.(); }
    setBoxes(list: Box[]) { this._boxes = Array.isArray(list) ? list : []; this.update(); this._req?.(); }

    renderer() {
      const self = this;
      const drawImpl = (target: any) => {
        const o = self._o;

        const draw = (ctx: CanvasRenderingContext2D, prX: number = 1, prY: number = 1) => {
          ctx.save();
          ctx.scale(prX, prY);
          for (const r of self._rects) {
            ctx.globalAlpha = Math.max(0, Math.min(1, r.alpha));
            ctx.fillStyle = r.color;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            if (o.showBorder && (o.borderWidth | 0) > 0) {
              ctx.globalAlpha = 1;
              ctx.lineWidth = Math.max(1, o.borderWidth | 0);
              ctx.strokeStyle = r.color;
              ctx.strokeRect(r.x + .5, r.y + .5, Math.max(1, r.w) - 1, Math.max(1, r.h) - 1);
            }
          }
          ctx.restore();
        };

        if (typeof target.useBitmapCoordinateSpace === 'function') {
          target.useBitmapCoordinateSpace((sc: any) => {
            draw(sc.context, sc.horizontalPixelRatio, sc.verticalPixelRatio);
          });
        } else {
          draw(target.context, target.pixelRatio || 1, target.pixelRatio || 1);
        }
      };
      return { drawBackground: drawImpl, draw: drawImpl };
    }
  }

  let prim: SRPrimitive | null = new SRPrimitive({
    showBorder: params.showBorder,
    borderWidth: params.borderWidth,
  });

  if (typeof (candleSeries as any).attachPrimitive === 'function') {
    (candleSeries as any).attachPrimitive(prim);
  }

  /* ─── helpers ─── */

  function atrArr(c: CandlestickData<Time>[], L: number): number[] {
    const N = c.length, out = new Array(N).fill(NaN), tr = new Array(N).fill(0);
    if (!N) return out;
    tr[0] = c[0].high - c[0].low;
    for (let i = 1; i < N; i++) {
      const a = c[i], b = c[i - 1];
      tr[i] = Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    }
    let s = 0;
    for (let i = 0; i < N; i++) {
      s += tr[i];
      if (i >= L) s -= tr[i - L];
      if (i >= L - 1) out[i] = s / L;
    }
    return out;
  }

  function highest(arr: number[], L: number): number[] {
    const N = arr.length, out = new Array(N).fill(NaN);
    for (let i = L - 1; i < N; i++) {
      let mx = -Infinity;
      for (let k = i - L + 1; k <= i; k++) if (arr[k] > mx) mx = arr[k];
      out[i] = mx;
    }
    return out;
  }

  function lowest(arr: number[], L: number): number[] {
    const N = arr.length, out = new Array(N).fill(NaN);
    for (let i = L - 1; i < N; i++) {
      let mn = Infinity;
      for (let k = i - L + 1; k <= i; k++) if (arr[k] < mn) mn = arr[k];
      out[i] = mn;
    }
    return out;
  }

  function isPivotHigh(c: CandlestickData<Time>[], idx: number, L: number): boolean {
    if (idx - L < 0 || idx + L >= c.length) return false;
    const v = c[idx].close;
    for (let k = 1; k <= L; k++) { if (c[idx - k].close >= v) return false; }
    for (let k = 1; k <= L; k++) { if (c[idx + k].close > v) return false; }
    return true;
  }

  function isPivotLow(c: CandlestickData<Time>[], idx: number, L: number): boolean {
    if (idx - L < 0 || idx + L >= c.length) return false;
    const v = c[idx].close;
    for (let k = 1; k <= L; k++) { if (c[idx - k].close <= v) return false; }
    for (let k = 1; k <= L; k++) { if (c[idx + k].close < v) return false; }
    return true;
  }

  /* ─── main update ─── */

  function update(candles: CandlestickData<Time>[]) {
    const N = candles?.length || 0;
    const L = Math.max(3, params.lookbackPeriod | 0);
    if (N < 2 * L + 2) { prim?.setBoxes([]); return []; }

    const endIdx = N - 1;
    // Use a short ATR (14) so a single outlier candle doesn't inflate zone height.
    const atrVals = atrArr(candles, 14);

    // Volume delta (body size proxy if no volume)
    const volDelta: number[] = [];
    for (let i = 0; i < N; i++) {
      const c = candles[i];
      const vol = (c as any).volume || Math.abs(c.close - c.open) || 1;
      volDelta[i] = c.close > c.open ? vol : -vol;
    }
    const scaled = volDelta.map(v => v / 2.5);
    const volHi = highest(scaled, Math.max(1, params.volLen | 0));
    const volLo = lowest(scaled, Math.max(1, params.volLen | 0));

    // Detect zones
    interface Zone {
      type: 'buy' | 'sell';
      top: number;
      bot: number;
      startIdx: number;
      confirmIdx: number;
      endIdx: number;
      isBuyRole: boolean;
    }

    const buyZones: Zone[] = [];
    const sellZones: Zone[] = [];

    for (let j = 2 * L; j < N; j++) {
      const pivotIdx = j - L;

      // Pivot low → BUY zone
      if (isPivotLow(candles, pivotIdx, L)) {
        if (!isNaN(volHi[j]) && volDelta[j] > volHi[j]) {
          const pivotClose = candles[pivotIdx].close;
          const curAtr = Math.min(atrVals[j] || atrVals[endIdx] || 1, pivotClose * 0.03);
          const top = pivotClose;
          const bot = top - curAtr * (params.boxWidth || 1);
          buyZones.push({
            type: 'buy', top, bot,
            startIdx: pivotIdx,
            confirmIdx: j, endIdx: -1,
            isBuyRole: true,
          });
        }
      }

      // Pivot high → SELL zone
      if (isPivotHigh(candles, pivotIdx, L)) {
        if (!isNaN(volLo[j]) && volDelta[j] < volLo[j]) {
          const pivotClose = candles[pivotIdx].close;
          const curAtr = Math.min(atrVals[j] || atrVals[endIdx] || 1, pivotClose * 0.03);
          const bot = pivotClose;
          const top = bot + curAtr * (params.boxWidth || 1);
          sellZones.push({
            type: 'sell', top, bot,
            startIdx: pivotIdx,
            confirmIdx: j, endIdx: -1,
            isBuyRole: false,
          });
        }
      }
    }

    // Set endIdx: each zone extends until the next zone of same type, capped at 300 bars
    const MAX_ZONE_WIDTH = 300;
    for (let i = 0; i < buyZones.length; i++) {
      const naturalEnd = i < buyZones.length - 1 ? buyZones[i + 1].confirmIdx : endIdx;
      buyZones[i].endIdx = Math.min(naturalEnd, buyZones[i].startIdx + MAX_ZONE_WIDTH);
    }
    for (let i = 0; i < sellZones.length; i++) {
      const naturalEnd = i < sellZones.length - 1 ? sellZones[i + 1].confirmIdx : endIdx;
      sellZones[i].endIdx = Math.min(naturalEnd, sellZones[i].startIdx + MAX_ZONE_WIDTH);
    }

    // Role switching: simulate bar-by-bar breakout for each zone
    const processBreakouts = (zones: Zone[]) => {
      for (const z of zones) {
        for (let i = z.confirmIdx + 1; i <= z.endIdx && i < N; i++) {
          if (i < 1) continue;
          const c0 = candles[i].close;
          const c1 = candles[i - 1].close;

          if (z.isBuyRole && c0 < z.bot && c1 < z.bot) {
            z.isBuyRole = false;
          } else if (!z.isBuyRole && c0 > z.top && c1 > z.top) {
            z.isBuyRole = true;
          }
        }
      }
    };

    processBreakouts(buyZones);
    processBreakouts(sellZones);

    // Merge all zones and limit
    const allZones = [...buyZones, ...sellZones].sort((a, b) => a.confirmIdx - b.confirmIdx);
    const limited = allZones.slice(-Math.max(1, params.maxZones | 0));

    // Build boxes
    const lastClose = candles[endIdx].close;
    const boxes: Box[] = [];

    for (const z of limited) {
      const priceInZone = lastClose >= z.bot && lastClose <= z.top && z.endIdx === endIdx;
      const alpha = priceInZone ? (params.activeAlpha || 0.45) : (params.idleAlpha || 0.20);
      const color = z.isBuyRole ? (params.buyColor || '#26a69a') : (params.sellColor || '#ef5350');

      boxes.push({
        t1: candles[z.startIdx].time,
        t2: candles[Math.min(z.endIdx, endIdx)].time,
        i1: z.startIdx,
        i2: Math.min(z.endIdx, endIdx),
        top: z.top,
        bot: z.bot,
        color,
        alpha,
      });
    }

    prim?.setOptions({ showBorder: params.showBorder, borderWidth: params.borderWidth });
    prim?.setBoxes(boxes);
    return [];
  }

  function destroy() {
    try {
      prim?.setBoxes([]);
      if (typeof (candleSeries as any).detachPrimitive === 'function') (candleSeries as any).detachPrimitive(prim);
      else if (typeof (candleSeries as any).removePrimitive === 'function') (candleSeries as any).removePrimitive(prim);
    } catch (_) { /* ignore */ }
    prim = null;
  }

  return { update, destroy };
}
