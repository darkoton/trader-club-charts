import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

export const meta = {
  name: "Order Blocks",
  defaultParams: {
    // --- Логика BOS/пивотов ---
    side: "both",           // 'bull' | 'bear' | 'both'
    leftBars: 3,
    rightBars: 3,
    lookbackBars: 500,
    bosConfirm: "close",    // 'close' | 'wick'

    // --- Поиск OB (свеча-источник) ---
    obLookbackBars: 20,
    minImpulseATR: 0.3,  // ← снизили с 0.8 для большего количества зон
    atrPeriod: 14,

    // --- Зона OB ---
    zoneMode: "openExtreme",// 'body' | 'wick' | 'openExtreme'
    extendMode: "toNow",    // 'none' | 'toNow' | 'nBars'
    extendBars: 60,
    touchMode: "wick",      // 'wick' | 'close'
    invalidateRule: "close",// 'close' | 'wick'

    // --- Новое: где останавливаться ---
    stopOnEvent: "invalid", // 'none' | 'mitigation' | 'invalid' | 'either'

    // --- Отображение после события ---
    keepMitigated: false,   // держать после касания (если stopOnEvent не сработал)
    keepInvalid:   false,   // держать после инвалидации (если stopOnEvent не сработал)
    ttlBars: 0,             // авто-удаление «свежих» без касаний (0=off)

    // --- Анти-спам и слияние ---
    minGapBars: 5,
    maxZones: 20,
    maxZonesPerSide: 10,    // лимит на сторону (0 = без лимита)
    mergeEnabled: true,
    mergeTolAtr: 0.25,
    mergeTimeGap: 10,

    // --- Визуал ---
    fillAlpha: 0.08,
    showBorder: true,
    borderWidth: 1,
    bullColor: "#10b981",
    bearColor: "#f43f5e",
    mitigatedColor: "#3b82f6",
    invalidColor: "#9ca3af",
  },
  paramMeta: {
    side:           { label:"Сторона", type:"select", options:["bull","bear","both"] },
    leftBars:       { label:"Пивот слева", type:"number", min:1, max:20 },
    rightBars:      { label:"Пивот справа", type:"number", min:1, max:20 },
    lookbackBars:   { label:"Скан (бары)", type:"number", min:200, max:10000 },
    bosConfirm:     { label:"BOS подтверждение", type:"select", options:["close","wick"] },

    obLookbackBars: { label:"OB поиск (бары назад)", type:"number", min:1, max:200 },
    minImpulseATR:  { label:"Мин. импульс (×ATR)", type:"number", min:0, max:5, step:0.05 },
    atrPeriod:      { label:"ATR период", type:"number", min:5, max:200 },

    zoneMode:       { label:"Метод зоны", type:"select", options:["body","wick","openExtreme"] },
    extendMode:     { label:"Продление", type:"select", options:["none","toNow","nBars"] },
    extendBars:     { label:"N баров продления", type:"number", min:1, max:5000 },
    touchMode:      { label:"Митигейшн по", type:"select", options:["wick","close"] },
    invalidateRule: { label:"Инвалидация по", type:"select", options:["close","wick"] },

    stopOnEvent:    { label:"Останов по событию", type:"select", options:["none","mitigation","invalid","either"] },

    keepMitigated:  { label:"Хранить митигированные", type:"boolean" },
    keepInvalid:    { label:"Хранить сломанные", type:"boolean" },
    ttlBars:        { label:"TTL без касаний (0=off)", type:"number", min:0, max:10000 },

    minGapBars:     { label:"Анти-спам (пропуск баров)", type:"number", min:0, max:200 },
    maxZones:       { label:"Макс. зон", type:"number", min:1, max:60 },
    maxZonesPerSide:{ label:"Макс. зон на сторону", type:"number", min:0, max:60 },
    mergeEnabled:   { label:"Сливать близкие", type:"boolean" },
    mergeTolAtr:    { label:"Слияние: допуск ×ATR", type:"number", min:0.05, max:2, step:0.05 },
    mergeTimeGap:   { label:"Слияние: разрыв (бары)", type:"number", min:0, max:200 },

    fillAlpha:      { label:"Заливка (прозр.)", type:"number", min:0.05, max:1, step:0.05 },
    showBorder:     { label:"Показывать рамку", type:"boolean" },
    borderWidth:    { label:"Толщина рамки", type:"number", min:0, max:6 },
    bullColor:      { label:"Цвет Bull OB", type:"color" },
    bearColor:      { label:"Цвет Bear OB", type:"color" },
    mitigatedColor: { label:"Цвет Митиг.", type:"color" },
    invalidColor:   { label:"Цвет Инвалид.", type:"color" },
  }
};

interface OrderBlocksContext {
  candleSeries: any;
  chart: IChartApi;
  params: typeof meta.defaultParams;
}

interface Box {
  t1: Time;
  t2: Time;
  top: number;
  bot: number;
  color: string;
}

export function init(ctx: OrderBlocksContext) {
  const { candleSeries, params } = ctx;

  // ===== Primitive =====
  class ZonesPrimitive {
    private _v: View;
    
    constructor(o: any = {}) { 
      this._v = new View(o); 
    }
    
    attached(p: any) { 
      this._v.attached(p); 
    }
    
    detached() { 
      this._v.detached(); 
    }
    
    paneViews() { 
      return [this._v]; 
    }
    
    updateAllViews() { 
      this._v.update(); 
    }
    
    setOptions(o: any) { 
      this._v.setOptions(o); 
    }
    
    setBoxes(list: Box[]) { 
      this._v.setBoxes(list); 
    }
  }

  class View {
    private _s: any = null;
    private _c: any = null;
    private _req: any = null;
    private _boxes: Box[] = [];
    private _o: any;

    constructor(o: any) {
      this._o = { fillAlpha: .18, showBorder: true, borderWidth: 2, ...o };
    }

    attached({ series, chart, requestUpdate }: any) { 
      this._s = series; 
      this._c = chart; 
      this._req = requestUpdate; 
    }

    detached() { 
      this._s = this._c = this._req = null; 
    }

    update() {}

    zOrder() { 
      return 'top'; 
    }

    setOptions(o: any) { 
      Object.assign(this._o, o); 
      this._req?.(); 
    }

    setBoxes(list: Box[]) { 
      this._boxes = Array.isArray(list) ? list : []; 
      this._req?.(); 
    }

    renderer() {
      const self = this;
      const drawImpl = (target: any) => {
        const s = self._s, c = self._c;
        if (!s || !c) return;
        const ts = c.timeScale();
        if (!ts) return;
        const o = self._o;

        const draw = (ctx: CanvasRenderingContext2D, prX: number = 1, prY: number = 1) => {
          ctx.save();
          ctx.scale(prX, prY);
          for (const b of self._boxes) {
            const x1 = ts.timeToCoordinate(b.t1), x2 = ts.timeToCoordinate(b.t2);
            const y1 = s.priceToCoordinate(b.top), y2 = s.priceToCoordinate(b.bot);
            if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
            const l = Math.min(x1, x2), r = Math.max(x1, x2);
            const t = Math.min(y1, y2), B = Math.max(y1, y2);
            const w = Math.max(1, r - l), h = Math.max(1, B - t);
            ctx.globalAlpha = Math.max(0, Math.min(1, o.fillAlpha));
            ctx.fillStyle = b.color;
            ctx.fillRect(l, t, w, h);
            if (o.showBorder && (o.borderWidth | 0) > 0) {
              ctx.globalAlpha = 1;
              ctx.lineWidth = Math.max(1, o.borderWidth | 0);
              ctx.strokeStyle = b.color;
              ctx.strokeRect(l + .5, t + .5, w, h);
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

  let prim: ZonesPrimitive | null = new ZonesPrimitive({
    fillAlpha: params.fillAlpha,
    showBorder: params.showBorder,
    borderWidth: params.borderWidth,
  });

  if (typeof (candleSeries as any).attachPrimitive === 'function') {
    (candleSeries as any).attachPrimitive(prim);
  }

  // ===== utils =====
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

  function isPH(c: CandlestickData<Time>[], i: number, L: number, R: number): boolean {
    const v = c[i].high;
    for (let k = 1; k <= L; k++) if (c[i - k].high >= v) return false;
    for (let k = 1; k <= R; k++) if (c[i + k].high > v) return false;
    return true;
  }

  function isPL(c: CandlestickData<Time>[], i: number, L: number, R: number): boolean {
    const v = c[i].low;
    for (let k = 1; k <= L; k++) if (c[i - k].low <= v) return false;
    for (let k = 1; k <= R; k++) if (c[i + k].low < v) return false;
    return true;
  }

  function zoneFromCandle(c: CandlestickData<Time>, side: string) {
    if (params.zoneMode === "wick") return { top: c.high, bot: c.low };
    if (params.zoneMode === "body") {
      const top = Math.max(c.open, c.close), bot = Math.min(c.open, c.close);
      return { top, bot };
    }
    // openExtreme
    if (side === 'bull') return { top: c.open, bot: Math.min(c.open, c.low) };
    return { top: Math.max(c.open, c.high), bot: c.open };
  }

  function mergeZones(list: any[], atrNow: number) {
    if (!params.mergeEnabled || list.length <= 1) return list;
    const tol = (params.mergeTolAtr || 0.25) * (atrNow || 1);
    const gap = Math.max(0, params.mergeTimeGap | 0);
    const arr = list.slice().sort((a, b) => a.i1 - b.i1);
    const out = [];
    let cur: any = null;
    for (const z of arr) {
      if (!cur) { cur = { ...z }; continue; }
      const priceClose = Math.abs(z.top - cur.top) <= tol && Math.abs(z.bot - cur.bot) <= tol;
      const timeClose = z.i1 <= cur.i2 + gap;
      if (priceClose && timeClose) {
        cur.top = (cur.top + z.top) / 2;
        cur.bot = (cur.bot + z.bot) / 2;
        cur.i2 = Math.max(cur.i2, z.i2);
      } else {
        out.push(cur);
        cur = { ...z };
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function firstEventIndex(c: CandlestickData<Time>[], z: any, iStart: number, iEnd: number) {
    let mit = null, inv = null;
    for (let i = iStart; i <= iEnd; i++) {
      const bar = c[i];
      // mitigation
      if (params.touchMode === "close") {
        if (bar.close >= z.bot && bar.close <= z.top && mit == null) mit = i;
      } else {
        if (bar.low <= z.top && bar.high >= z.bot && mit == null) mit = i;
      }
      // invalidation
      if (params.invalidateRule === "close") {
        if (z.side === 'bull' && bar.close < z.bot && inv == null) inv = i;
        if (z.side === 'bear' && bar.close > z.top && inv == null) inv = i;
      } else {
        if (z.side === 'bull' && bar.low < z.bot && inv == null) inv = i;
        if (z.side === 'bear' && bar.high > z.top && inv == null) inv = i;
      }
      if (mit != null && inv != null) break;
    }
    return { mit, inv };
  }

  function statusOnRange(candles: CandlestickData<Time>[], z: any, iStart: number, iEnd: number): number {
    const e = firstEventIndex(candles, z, iStart, iEnd);
    if (e.inv != null) return -1;
    if (e.mit != null) return 1;
    return 0;
  }

  function update(candles: CandlestickData<Time>[]) {
    const N = candles?.length || 0;
    const L = Math.max(1, params.leftBars | 0), R = Math.max(1, params.rightBars | 0);
    if (N < (L + R + 10)) {
      prim?.setBoxes([]);
      return [];
    }

    const endIdx = N - 1;
    const look = Math.max(200, Math.min((params.lookbackBars | 0) || 1500, N));
    const startIdx = Math.max(L, endIdx - look + 1);

    const atr = atrArr(candles, Math.max(5, params.atrPeriod | 0));
    const atrRef = atr[endIdx] || atr.filter(Number.isFinite).slice(-1)[0] || (candles[endIdx].high - candles[endIdx].low);

    // пивоты
    const ph: number[] = [], pl: number[] = [];
    for (let i = startIdx + L; i <= endIdx - R; i++) {
      if (isPH(candles, i, L, R)) ph.push(i);
      if (isPL(candles, i, L, R)) pl.push(i);
    }
    const lastSwingHigh = (before: number) => {
      for (let k = ph.length - 1; k >= 0; k--) if (ph[k] < before) return ph[k];
      return null;
    };
    const lastSwingLow = (before: number) => {
      for (let k = pl.length - 1; k >= 0; k--) if (pl[k] < before) return pl[k];
      return null;
    };

    const wantBull = params.side === "bull" || params.side === "both";
    const wantBear = params.side === "bear" || params.side === "both";
    const zones: any[] = [];

    for (let i = startIdx + L; i <= endIdx; i++) {
      const bar = candles[i];

      if (wantBull) {
        const sh = lastSwingHigh(i);
        if (sh != null) {
          const ref = candles[sh].high;
          const bos = params.bosConfirm === "close" ? (bar.close > ref) : (bar.high > ref);
          if (bos) {
            const from = Math.max(startIdx, i - (params.obLookbackBars | 0));
            let j = null;
            for (let k = i - 1; k >= from; k--) {
              if (candles[k].close < candles[k].open) {
                j = k;
                break;
              }
            }
            if (j != null) {
              const src = candles[j], zone = zoneFromCandle(src, 'bull');
              const disp = Math.abs(bar.close - src.open);
              if ((disp / Math.max(1e-9, atr[i] || atrRef)) >= (params.minImpulseATR || 0)) {
                zones.push({ side: 'bull', i1: j, i2: i, top: zone.top, bot: zone.bot, born: i });
                i += Math.max(0, params.minGapBars | 0);
              }
            }
          }
        }
      }

      if (wantBear) {
        const sl = lastSwingLow(i);
        if (sl != null) {
          const ref = candles[sl].low;
          const bos = params.bosConfirm === "close" ? (bar.close < ref) : (bar.low < ref);
          if (bos) {
            const from = Math.max(startIdx, i - (params.obLookbackBars | 0));
            let j = null;
            for (let k = i - 1; k >= from; k--) {
              if (candles[k].close > candles[k].open) {
                j = k;
                break;
              }
            }
            if (j != null) {
              const src = candles[j], zone = zoneFromCandle(src, 'bear');
              const disp = Math.abs(src.open - bar.close);
              if ((disp / Math.max(1e-9, atr[i] || atrRef)) >= (params.minImpulseATR || 0)) {
                zones.push({ side: 'bear', i1: j, i2: i, top: zone.top, bot: zone.bot, born: i });
                i += Math.max(0, params.minGapBars | 0);
              }
            }
          }
        }
      }
    }

    const merged = mergeZones(zones, atrRef).sort((a, b) => a.i1 - b.i1);

    // лимиты по сторонам
    const bulls = merged.filter(z => z.side === 'bull');
    const bears = merged.filter(z => z.side === 'bear');
    const cutBySide = (arr: any[]) => (params.maxZonesPerSide > 0 ? arr.slice(-params.maxZonesPerSide) : arr);
    let filtered = [];
    if (params.side === "bull") filtered = cutBySide(bulls);
    else if (params.side === "bear") filtered = cutBySide(bears);
    else filtered = cutBySide(bulls).concat(cutBySide(bears)).sort((a, b) => a.i1 - b.i1);

    // потом общий лимит
    const picked = filtered.slice(-Math.max(1, params.maxZones | 0));

    // собрать прямоугольники
    const rects: Box[] = [];
    for (const z of picked) {
      // базовое продление
      let right;
      if (params.extendMode === "toNow") right = endIdx;
      else if (params.extendMode === "nBars") right = Math.min(endIdx, z.i1 + (params.extendBars | 0));
      else /* none */ right = Math.min(endIdx, z.i1 + 1);

      // событие для остановки
      if (params.stopOnEvent !== "none") {
        const e = firstEventIndex(candles, z, z.i1 + 1, right);
        let stopIdx = null;
        if (params.stopOnEvent === "mitigation") stopIdx = e.mit;
        else if (params.stopOnEvent === "invalid") stopIdx = e.inv;
        else /* either */ stopIdx = (e.mit == null) ? e.inv : (e.inv == null ? e.mit : Math.min(e.mit, e.inv));
        if (stopIdx != null) right = Math.max(z.i1 + 1, stopIdx);
      }

      // статус на отрезке (для цвета/скрытия)
      const st = statusOnRange(candles, z, z.i1 + 1, right);

      let color = (z.side === 'bull') ? params.bullColor : params.bearColor;
      if (st === 1 && params.keepMitigated) color = params.mitigatedColor;
      if (st === -1 && params.keepInvalid) color = params.invalidColor;

      // TTL: если зона ещё «fresh» и давно, можно не рисовать
      if (params.ttlBars > 0 && st === 0 && (endIdx - z.born > params.ttlBars)) continue;

      rects.push({
        t1: candles[z.i1].time,
        t2: candles[right].time,
        top: z.top,
        bot: z.bot,
        color
      });
      if (rects.length >= (params.maxZones | 0)) break;
    }

    prim?.setOptions({
      fillAlpha: params.fillAlpha,
      showBorder: params.showBorder,
      borderWidth: params.borderWidth,
    });
    prim?.setBoxes(rects);

    return [];
  }

  function destroy() {
    try {
      prim?.setBoxes([]);
      if (typeof (candleSeries as any).detachPrimitive === 'function') (candleSeries as any).detachPrimitive(prim);
      else if (typeof (candleSeries as any).removePrimitive === 'function') (candleSeries as any).removePrimitive(prim);
    } catch (_) { }
    prim = null;
  }

  return { update, destroy };
}
