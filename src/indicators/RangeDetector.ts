import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

export const meta = {
  name: "Range Detector",
  defaultParams: {
    // Логика диапазона
    length: 20,          // минимум баров (и SMA)
    mult: 2.5,           // ширина = ATR(atrLen) × mult (было 1.0, увеличили для большего количества зон)
    atrLen: 14,          // ATR период
    lookbackBars: 500,   // сколько баров истории сканировать

    // Продление и пробои
    extendMode: "nBars", // 'none' | 'toNow' | 'nBars'
    extendBars: 12,
    invalidateRule: "close", // 'close' | 'wick'
    keepBroken: true,    // при пробое в продлении — оставлять серым

    // Ограничители/ускорители
    maxBoxes: 20,        // максимум зон
    strideBars: 1,       // шаг сканирования (1 = каждый бар)
    minGapBars: 0,       // пропустить после фиксации зоны

    // Визуал заливки
    fillAlpha: 0.18,     // прозрачность
    showBorder: true,
    borderWidth: 2,

    // Цвета статусов
    colorUnbroken: "#2157f3",
    colorUp:       "#089981",
    colorDown:     "#f23645",
    colorBroken:   "#9ca3af",
  },
  paramMeta: {
    length:        { label:"Минимум баров (SMA)", type:"number", min:2, max:1000 },
    mult:          { label:"Ширина = ATR×", type:"number", min:0, max:10, step:0.1 },
    atrLen:        { label:"ATR период", type:"number", min:1, max:5000 },
    lookbackBars:  { label:"Скан истории (бары)", type:"number", min:100, max:20000 },

    extendMode:    { label:"Продление", type:"select", options:["none","toNow","nBars"] },
    extendBars:    { label:"N баров (для nBars)", type:"number", min:1, max:1000 },
    invalidateRule:{ label:"Инвалидация", type:"select", options:["close","wick"] },
    keepBroken:    { label:"Показывать сломанные", type:"boolean" },

    maxBoxes:      { label:"Макс. зон", type:"number", min:1, max:200 },
    strideBars:    { label:"Шаг сканирования", type:"number", min:1, max:50 },
    minGapBars:    { label:"Анти-дубли (пропуск баров)", type:"number", min:0, max:200 },

    fillAlpha:     { label:"Прозрачность заливки", type:"number", min:0.05, max:1, step:0.05 },
    showBorder:    { label:"Показывать рамку", type:"boolean" },
    borderWidth:   { label:"Толщина рамки", type:"number", min:0, max:6 },

    colorUnbroken: { label:"Цвет: в диапазоне", type:"color" },
    colorUp:       { label:"Цвет: пробой вверх", type:"color" },
    colorDown:     { label:"Цвет: пробой вниз", type:"color" },
    colorBroken:   { label:"Цвет: сломанная", type:"color" },
  }
};

interface RangeDetectorContext {
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

export function init(ctx: RangeDetectorContext) {
  const { candleSeries, params } = ctx;

  // ====== Primitive (filled rectangles) ======
  class RangesPrimitive {
    private _view: View;

    constructor(o: any = {}) { 
      this._view = new View(o); 
    }
    
    attached(p: any) { 
      this._view.attached(p); 
    }
    
    detached() { 
      this._view.detached(); 
    }
    
    paneViews() { 
      return [this._view]; 
    }
    
    updateAllViews() { 
      this._view.update(); 
    }
    
    setOptions(o: any) { 
      this._view.setOptions(o); 
    }
    
    setBoxes(list: Box[]) { 
      this._view.setBoxes(list); 
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

        const drawRectangles = (ctx: CanvasRenderingContext2D, prX: number = 1, prY: number = 1) => {
          ctx.save();
          ctx.scale(prX, prY);
          for (const b of self._boxes) {
            const x1 = ts.timeToCoordinate(b.t1);
            const x2 = ts.timeToCoordinate(b.t2);
            const yT = s.priceToCoordinate(b.top);
            const yB = s.priceToCoordinate(b.bot);
            if (x1 == null || x2 == null || yT == null || yB == null) continue;

            const left = Math.min(x1, x2), right = Math.max(x1, x2);
            const top = Math.min(yT, yB), bottom = Math.max(yT, yB);
            const w = Math.max(1, right - left), h = Math.max(1, bottom - top);

            // fill
            ctx.globalAlpha = Math.max(0, Math.min(1, o.fillAlpha));
            ctx.fillStyle = b.color;
            ctx.fillRect(left, top, w, h);

            // border
            if (o.showBorder && (o.borderWidth | 0) > 0) {
              ctx.globalAlpha = 1;
              ctx.lineWidth = Math.max(1, o.borderWidth | 0);
              ctx.strokeStyle = b.color;
              ctx.strokeRect(left + 0.5, top + 0.5, w, h);
            }
          }
          ctx.restore();
        };

        if (typeof target.useBitmapCoordinateSpace === 'function') {
          target.useBitmapCoordinateSpace((sc: any) => {
            const ctx = sc.context;
            drawRectangles(ctx, sc.horizontalPixelRatio, sc.verticalPixelRatio);
          });
        } else {
          // fallback renderer API
          drawRectangles(target.context, target.pixelRatio || 1, target.pixelRatio || 1);
        }
      };
      return { drawBackground: drawImpl, draw: drawImpl };
    }
  }

  // один attach
  let prim: RangesPrimitive | null = new RangesPrimitive({
    fillAlpha: params.fillAlpha,
    showBorder: params.showBorder,
    borderWidth: params.borderWidth,
  });

  if (typeof (candleSeries as any).attachPrimitive === 'function') {
    (candleSeries as any).attachPrimitive(prim);
  }

  // ====== расчёт ======
  function atrArr(c: CandlestickData<Time>[], L: number): number[] {
    const N = c.length, out = new Array(N).fill(NaN), trs = new Array(N).fill(0);
    if (!N) return out;
    trs[0] = c[0].high - c[0].low;
    for (let i = 1; i < N; i++) {
      const a = c[i], b = c[i - 1];
      trs[i] = Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    }
    let s = 0;
    for (let i = 0; i < N; i++) {
      s += trs[i];
      if (i >= L) s -= trs[i - L];
      if (i >= L - 1) out[i] = s / L;
    }
    return out;
  }

  function smaClose(c: CandlestickData<Time>[], L: number): number[] {
    const N = c.length, out = new Array(N).fill(NaN);
    let s = 0;
    for (let i = 0; i < N; i++) {
      s += c[i].close;
      if (i >= L) s -= c[i - L].close;
      if (i >= L - 1) out[i] = s / L;
    }
    return out;
  }

  function inRangeWindow(candles: CandlestickData<Time>[], j: number, L: number, ma: number, band: number): boolean {
    if (j - L + 1 < 0 || !Number.isFinite(ma) || !Number.isFinite(band)) return false;
    for (let k = 0; k < L; k++) {
      const v = candles[j - k].close;
      if (Math.abs(v - ma) > band) return false;
    }
    return true;
  }

  function invalidateCheck(candles: CandlestickData<Time>[], top: number, bot: number, iStart: number, iEnd: number, rule: string): number {
    let status = 0; // 0 — внутри, +1 — пробой вверх, -1 — вниз
    for (let i = iStart; i <= iEnd; i++) {
      const c = candles[i];
      if (rule === "wick") {
        if (c.high > top) { status = +1; break; }
        if (c.low < bot) { status = -1; break; }
      } else {
        if (c.close > top) { status = +1; break; }
        if (c.close < bot) { status = -1; break; }
      }
    }
    return status;
  }

  function update(candles: CandlestickData<Time>[]) {
    const N = candles?.length || 0;
    const L = Math.max(2, params.length | 0);
    if (N < L + 2) {
      prim?.setBoxes([]);
      return [];
    }

    const look = Math.max(L + 2, Math.min((params.lookbackBars | 0) || 2000, N));
    const endIdx = N - 1;
    const startIdx = Math.max(0, endIdx - look + 1);
    const stride = Math.max(1, params.strideBars | 0);

    const atr = atrArr(candles, Math.max(1, params.atrLen | 0));
    const sma = smaClose(candles, L);

    // найти зоны
    interface Zone {
      i1: number;
      i2: number;
      top: number;
      bot: number;
    }

    const zones: Zone[] = [];
    let cur: Zone | null = null;

    for (let j = Math.max(startIdx, L - 1); j <= endIdx; j += stride) {
      const band = (atr[j] || atr[endIdx] || (candles[j].high - candles[j].low)) * (params.mult || 0);
      const ma = sma[j];
      const ok = inRangeWindow(candles, j, L, ma, band);

      if (ok) {
        const left = j - L + 1;
        const top = ma + band;
        const bot = ma - band;

        if (!cur) {
          cur = { i1: left, i2: j, top, bot };
        } else if (left <= cur.i2) { // перекрытие
          cur.top = Math.max(cur.top, top);
          cur.bot = Math.min(cur.bot, bot);
          cur.i2 = Math.max(cur.i2, j);
        } else {
          zones.push(cur);
          cur = { i1: left, i2: j, top, bot };
          j += Math.max(0, params.minGapBars | 0);
        }
      } else if (cur) {
        zones.push(cur);
        cur = null;
      }
    }
    if (cur) zones.push(cur);

    zones.sort((a, b) => a.i2 - b.i2);
    const picked = zones.slice(-Math.max(1, params.maxBoxes | 0));

    const rects: Box[] = [];
    for (const z of picked) {
      let right = z.i2;
      if (params.extendMode === "toNow") right = endIdx;
      else if (params.extendMode === "nBars") right = Math.min(endIdx, z.i2 + (params.extendBars | 0));

      // статус цвета
      let st = invalidateCheck(candles, z.top, z.bot, z.i2 + 1, right, params.invalidateRule);
      if (st === 0) {
        const c = candles[z.i2];
        if (params.invalidateRule === "wick") {
          if (c.high > z.top) st = +1;
          else if (c.low < z.bot) st = -1;
        } else {
          if (c.close > z.top) st = +1;
          else if (c.close < z.bot) st = -1;
        }
      }
      let color = params.colorUnbroken;
      if (st > 0) color = params.colorUp;
      else if (st < 0) color = params.colorDown;

      if (right > z.i2 && params.keepBroken) {
        const later = invalidateCheck(candles, z.top, z.bot, z.i2 + 1, right, params.invalidateRule);
        if (later !== 0) color = params.colorBroken;
      }

      rects.push({
        t1: candles[z.i1].time,
        t2: candles[right].time,
        top: z.top,
        bot: z.bot,
        color
      });
    }

    // обновляем опции и данные примитива
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
      if (typeof (candleSeries as any).detachPrimitive === 'function') {
        (candleSeries as any).detachPrimitive(prim);
      } else if (typeof (candleSeries as any).removePrimitive === 'function') {
        (candleSeries as any).removePrimitive(prim);
      }
    } catch (_) { }
    prim = null;
  }

  return { update, destroy };
}
