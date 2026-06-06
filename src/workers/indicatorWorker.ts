/**
 * ═══════════════════════════════════════════════════════════════
 *  Indicator Sandbox Worker
 * ═══════════════════════════════════════════════════════════════
 *
 * Executes custom indicator JS code in an isolated WebWorker.
 * No access to DOM, fetch, localStorage, or any browser APIs.
 *
 * Protocol:
 *   Main → Worker:  { id, code, bars, params }
 *   Worker → Main:  { id, result: { shapes: [...] } }
 *                    { id, error: "..." }
 */

/* ─── Math Helpers (available as `helpers.*` inside user code) ─── */

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ShapePoint {
  time: number;
  price: number;
  price2?: number;  // used by area_fill (second Y boundary)
}

/**
 * Shape types supported by TradingView Charting Library.
 *
 * — Single-point (createShape): arrow_up, arrow_down, flag, vertical_line,
 *   horizontal_line, horizontal_ray, icon, emoji, sticker, text, anchored_text,
 *   note, anchored_note, price_label, price_note, long_position, short_position
 *
 * — Multi-point (createMultipointShape): rectangle, trend_line, parallel_channel,
 *   ray, extended, arrow, fib_retracement, fib_trend_ext,
 *   circle, ellipse, triangle, polyline, path, arc, regression_trend,
 *   pitchfork, schiff_pitchfork, inside_pitchfork, callout, balloon
 */
type SinglePointShape =
  | 'arrow_up' | 'arrow_down' | 'flag' | 'vertical_line'
  | 'horizontal_line' | 'horizontal_ray' | 'icon' | 'emoji' | 'sticker'
  | 'text' | 'anchored_text' | 'note' | 'anchored_note'
  | 'price_label' | 'price_note' | 'long_position' | 'short_position';

type MultiPointShape =
  | 'rectangle' | 'trend_line' | 'parallel_channel'
  | 'ray' | 'extended' | 'arrow' | 'fib_retracement' | 'fib_trend_ext'
  | 'circle' | 'ellipse' | 'triangle' | 'polyline' | 'path' | 'arc'
  | 'regression_trend' | 'pitchfork' | 'schiff_pitchfork' | 'inside_pitchfork'
  | 'callout' | 'balloon';

type VirtualShape = 'series_line' | 'area_fill';

type ShapeType = SinglePointShape | MultiPointShape | VirtualShape;

const SINGLE_POINT_SHAPES: Set<string> = new Set<SinglePointShape>([
  'arrow_up', 'arrow_down', 'flag', 'vertical_line',
  'horizontal_line', 'horizontal_ray', 'icon', 'emoji', 'sticker',
  'text', 'anchored_text', 'note', 'anchored_note',
  'price_label', 'price_note', 'long_position', 'short_position',
]);

/** Virtual shapes expanded in TVChart.tsx (not direct TV API shapes) */
const VIRTUAL_SHAPES: Set<string> = new Set<VirtualShape>(['series_line', 'area_fill']);
const MAX_VIRTUAL_SHAPES = 10;   // max virtual shapes per indicator
const MAX_VIRTUAL_POINTS = 500;  // max points per virtual shape

const ALL_ALLOWED_SHAPES: Set<string> = new Set<ShapeType>([
  // Single-point
  'arrow_up', 'arrow_down', 'flag', 'vertical_line',
  'horizontal_line', 'icon', 'emoji', 'sticker',
  'text', 'anchored_text', 'note', 'anchored_note',
  'price_label', 'price_note', 'long_position', 'short_position',
  // Multi-point
  'rectangle', 'trend_line', 'parallel_channel', 'horizontal_ray',
  'ray', 'extended', 'arrow', 'fib_retracement', 'fib_trend_ext',
  'circle', 'ellipse', 'triangle', 'polyline', 'path', 'arc',
  'regression_trend', 'pitchfork', 'schiff_pitchfork', 'inside_pitchfork',
  'callout', 'balloon',
  // Virtual (expanded to real shapes in TVChart.tsx)
  'series_line', 'area_fill',
]);

interface ShapeDescriptor {
  type: ShapeType;
  points: ShapePoint[];
  overrides: Record<string, unknown>;
  zOrder?: 'top' | 'bottom';
  text?: string;
  singlePoint?: boolean;
}

interface DashboardRow {
  label: string;
  value: string;
  color?: string;
}

interface DashboardConfig {
  position?: string;
  title?: string;
  rows: DashboardRow[];
}

interface AlertItem {
  message: string;
  fired: boolean;
  color?: string;
}

interface ComputeResult {
  shapes: ShapeDescriptor[];
  dashboard?: DashboardConfig | null;
  alerts?: AlertItem[];
}

/* ═══ Helper Functions ═══ */

function sma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period || period < 1) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period || period < 1) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function rma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period || period < 1) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + values[i]) / period;
  }
  return result;
}

function atr(bars: Bar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < 2 || period < 1) return result;
  const trArr: number[] = [];
  trArr.push(bars[0].high - bars[0].low);
  for (let i = 1; i < bars.length; i++) {
    trArr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    ));
  }
  if (trArr.length < period) return result;
  let avg = 0;
  for (let i = 0; i < period; i++) avg += trArr[i];
  avg /= period;
  result[period - 1] = avg;
  for (let i = period; i < trArr.length; i++) {
    avg = (avg * (period - 1) + trArr[i]) / period;
    result[i] = avg;
  }
  return result;
}

function rsi(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1 || period < 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change; else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function macd(closes: number[], fast: number, slow: number, signal: number): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(fastEma[i]) && !isNaN(slowEma[i])) macdLine[i] = fastEma[i] - slowEma[i];
  }
  const signalLine = ema(macdLine.map(v => isNaN(v) ? 0 : v), signal);
  const hist: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) hist[i] = macdLine[i] - signalLine[i];
  }
  return { macd: macdLine, signal: signalLine, histogram: hist };
}

function bollingerBands(closes: number[], period: number, mult: number): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - middle[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = middle[i] + mult * std;
    lower[i] = middle[i] - mult * std;
  }
  return { upper, middle, lower };
}

function stochastic(bars: Bar[], kPeriod: number, dPeriod: number): { k: number[]; d: number[] } {
  const N = bars.length;
  const kArr: number[] = new Array(N).fill(NaN);
  for (let i = kPeriod - 1; i < N; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].high > hi) hi = bars[j].high;
      if (bars[j].low < lo) lo = bars[j].low;
    }
    kArr[i] = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
  }
  const dArr = sma(kArr.filter(v => !isNaN(v)), dPeriod);
  // Align d back
  const dResult: number[] = new Array(N).fill(NaN);
  let di = 0;
  for (let i = 0; i < N; i++) {
    if (!isNaN(kArr[i])) {
      if (di < dArr.length) dResult[i] = dArr[di];
      di++;
    }
  }
  return { k: kArr, d: dResult };
}

function pivotHigh(values: number[], leftBars: number, rightBars: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  for (let i = leftBars; i < values.length - rightBars; i++) {
    let isPivot = true;
    for (let k = 1; k <= leftBars; k++) {
      if (values[i - k] >= values[i]) { isPivot = false; break; }
    }
    if (isPivot) {
      for (let k = 1; k <= rightBars; k++) {
        if (values[i + k] > values[i]) { isPivot = false; break; }
      }
    }
    if (isPivot) result[i] = values[i];
  }
  return result;
}

function pivotLow(values: number[], leftBars: number, rightBars: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  for (let i = leftBars; i < values.length - rightBars; i++) {
    let isPivot = true;
    for (let k = 1; k <= leftBars; k++) {
      if (values[i - k] <= values[i]) { isPivot = false; break; }
    }
    if (isPivot) {
      for (let k = 1; k <= rightBars; k++) {
        if (values[i + k] < values[i]) { isPivot = false; break; }
      }
    }
    if (isPivot) result[i] = values[i];
  }
  return result;
}

function highest(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let mx = -Infinity;
    for (let k = i - period + 1; k <= i; k++) {
      if (values[k] > mx) mx = values[k];
    }
    result[i] = mx;
  }
  return result;
}

function lowest(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let mn = Infinity;
    for (let k = i - period + 1; k <= i; k++) {
      if (values[k] < mn) mn = values[k];
    }
    result[i] = mn;
  }
  return result;
}

function crossover(a: number[], b: number[]): boolean[] {
  const result: boolean[] = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    result[i] = a[i] > b[i] && a[i - 1] <= b[i - 1];
  }
  return result;
}

function crossunder(a: number[], b: number[]): boolean[] {
  const result: boolean[] = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    result[i] = a[i] < b[i] && a[i - 1] >= b[i - 1];
  }
  return result;
}

function trueRange(bars: Bar[]): number[] {
  const result: number[] = new Array(bars.length).fill(0);
  result[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i++) {
    result[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
  }
  return result;
}

function linreg(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < period; j++) {
      sumX += j; sumY += values[i - period + 1 + j];
      sumXY += j * values[i - period + 1 + j]; sumX2 += j * j;
    }
    const slope = (period * sumXY - sumX * sumY) / (period * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / period;
    result[i] = intercept + slope * (period - 1);
  }
  return result;
}

function stdev(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    const mean = sum / period;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (values[j] - mean) ** 2;
    result[i] = Math.sqrt(sumSq / period);
  }
  return result;
}

/**
 * Weighted Moving Average
 */
function wma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period || period < 1) return result;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - period + 1 + j] * (j + 1);
    }
    result[i] = sum / denom;
  }
  return result;
}

/**
 * Average Directional Index (ADX)
 * Returns { adx, plusDI, minusDI } — each number[]
 */
function adx(bars: Bar[], diLen: number, adxLen: number): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const N = bars.length;
  const adxArr: number[] = new Array(N).fill(NaN);
  const pDI: number[] = new Array(N).fill(NaN);
  const mDI: number[] = new Array(N).fill(NaN);

  if (N < diLen + adxLen) return { adx: adxArr, plusDI: pDI, minusDI: mDI };

  // Raw +DM / -DM / TR
  const rawPDM: number[] = [0];
  const rawMDM: number[] = [0];
  const rawTR: number[] = [bars[0].high - bars[0].low];

  for (let i = 1; i < N; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    rawPDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    rawMDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    rawTR.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    ));
  }

  // RMA smoothing
  const smPDM = rma(rawPDM, diLen);
  const smMDM = rma(rawMDM, diLen);
  const smTR = rma(rawTR, diLen);

  // DI values
  const dx: number[] = new Array(N).fill(NaN);
  for (let i = 0; i < N; i++) {
    if (isNaN(smTR[i]) || smTR[i] === 0) continue;
    pDI[i] = (smPDM[i] / smTR[i]) * 100;
    mDI[i] = (smMDM[i] / smTR[i]) * 100;
    const diSum = pDI[i] + mDI[i];
    dx[i] = diSum === 0 ? 0 : (Math.abs(pDI[i] - mDI[i]) / diSum) * 100;
  }

  // ADX = RMA of DX
  const adxSmoothed = rma(dx.map(v => isNaN(v) ? 0 : v), adxLen);
  for (let i = 0; i < N; i++) {
    if (!isNaN(pDI[i])) adxArr[i] = adxSmoothed[i];
  }

  return { adx: adxArr, plusDI: pDI, minusDI: mDI };
}

/**
 * Donchian Channel
 * Returns { upper, lower, middle } — each number[]
 */
function donchian(bars: Bar[], period: number): { upper: number[]; lower: number[]; middle: number[] } {
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const upper = highest(highs, period);
  const lower = lowest(lows, period);
  const middle: number[] = new Array(bars.length).fill(NaN);
  for (let i = 0; i < bars.length; i++) {
    if (!isNaN(upper[i]) && !isNaN(lower[i])) middle[i] = (upper[i] + lower[i]) / 2;
  }
  return { upper, lower, middle };
}

/**
 * Pearson Correlation Coefficient (rolling)
 * Compares values against a linear sequence (bar index)
 */
function pearsonR(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let j = 0; j < period; j++) {
      const x = j;
      const y = values[i - period + 1 + j];
      sumX += x; sumY += y;
      sumXY += x * y; sumX2 += x * x; sumY2 += y * y;
    }
    const num = period * sumXY - sumX * sumY;
    const den = Math.sqrt((period * sumX2 - sumX * sumX) * (period * sumY2 - sumY * sumY));
    result[i] = den === 0 ? 0 : num / den;
  }
  return result;
}

/**
 * VWAP (Volume Weighted Average Price)
 * Simple rolling version
 */
function vwap(bars: Bar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    let sumPV = 0, sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (bars[j].high + bars[j].low + bars[j].close) / 3;
      const vol = bars[j].volume || 0;
      sumPV += tp * vol;
      sumV += vol;
    }
    result[i] = sumV === 0 ? NaN : sumPV / sumV;
  }
  return result;
}

/**
 * Bar-to-bar change
 */
function change(values: number[], length: number = 1): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = length; i < values.length; i++) {
    result[i] = values[i] - values[i - length];
  }
  return result;
}

/**
 * Bar-to-bar percent change
 */
function percentChange(values: number[], length: number = 1): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = length; i < values.length; i++) {
    result[i] = values[i - length] === 0 ? 0 : ((values[i] - values[i - length]) / Math.abs(values[i - length])) * 100;
  }
  return result;
}

/**
 * Rolling sum
 */
function sum(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let s = 0;
  for (let i = 0; i < period; i++) s += values[i];
  result[period - 1] = s;
  for (let i = period; i < values.length; i++) {
    s += values[i] - values[i - period];
    result[i] = s;
  }
  return result;
}

/**
 * Simple average of the entire array (not rolling)
 */
function avg(values: number[]): number {
  let s = 0, c = 0;
  for (const v of values) {
    if (!isNaN(v)) { s += v; c++; }
  }
  return c === 0 ? NaN : s / c;
}

/**
 * Median of the entire array
 */
function median(values: number[]): number {
  const sorted = values.filter(v => !isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ═══ Additional Moving Averages ═══ */

/**
 * Double EMA (ta.dema)
 */
function dema(values: number[], period: number): number[] {
  const e1 = ema(values, period);
  const e2 = ema(e1, period);
  return values.map((_, i) => 2 * e1[i] - e2[i]);
}

/**
 * Triple EMA (ta.tema)
 */
function tema(values: number[], period: number): number[] {
  const e1 = ema(values, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return values.map((_, i) => 3 * e1[i] - 3 * e2[i] + e3[i]);
}

/**
 * Hull Moving Average (ta.hma)
 * HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
 */
function hma(values: number[], period: number): number[] {
  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));
  const wmaHalf = wma(values, halfPeriod);
  const wmaFull = wma(values, period);
  const diff = wmaHalf.map((v, i) => 2 * v - wmaFull[i]);
  return wma(diff, sqrtPeriod);
}

/**
 * Symmetrically Weighted Moving Average (ta.swma)
 * Weights: [1, 2, 2, 1] / 6 over 4 bars
 */
function swma(values: number[]): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = 3; i < values.length; i++) {
    result[i] = (values[i - 3] + 2 * values[i - 2] + 2 * values[i - 1] + values[i]) / 6;
  }
  return result;
}

/**
 * Arnaud Legoux Moving Average (ta.alma)
 */
function alma(values: number[], period: number, offset = 0.85, sigma = 6): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const m = offset * (period - 1);
  const s = period / sigma;
  // Precompute weights
  const weights: number[] = [];
  let wSum = 0;
  for (let j = 0; j < period; j++) {
    const w = Math.exp(-((j - m) * (j - m)) / (2 * s * s));
    weights.push(w);
    wSum += w;
  }
  for (let j = 0; j < period; j++) weights[j] /= wSum;

  for (let i = period - 1; i < values.length; i++) {
    let v = 0;
    for (let j = 0; j < period; j++) {
      v += values[i - (period - 1 - j)] * weights[j];
    }
    result[i] = v;
  }
  return result;
}

/**
 * Volume Weighted Moving Average
 */
function vwma(bars: Bar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    let sumPV = 0, sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = bars[j].volume || 1;
      sumPV += bars[j].close * v;
      sumV += v;
    }
    result[i] = sumV > 0 ? sumPV / sumV : bars[i].close;
  }
  return result;
}

/* ═══ Additional Oscillators / Indicators ═══ */

/**
 * Commodity Channel Index (ta.cci)
 */
function cci(bars: Bar[], period: number): number[] {
  const typical: number[] = bars.map(b => (b.high + b.low + b.close) / 3);
  const smaArr = sma(typical, period);
  const result: number[] = new Array(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    let meanDev = 0;
    for (let j = i - period + 1; j <= i; j++) {
      meanDev += Math.abs(typical[j] - smaArr[i]);
    }
    meanDev /= period;
    result[i] = meanDev !== 0 ? (typical[i] - smaArr[i]) / (0.015 * meanDev) : 0;
  }
  return result;
}

/**
 * Money Flow Index (ta.mfi)
 */
function mfi(bars: Bar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  const typical: number[] = bars.map(b => (b.high + b.low + b.close) / 3);
  for (let i = period; i < bars.length; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const mf = typical[j] * (bars[j].volume || 1);
      if (typical[j] > typical[j - 1]) posFlow += mf;
      else if (typical[j] < typical[j - 1]) negFlow += mf;
    }
    result[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
  }
  return result;
}

/**
 * On Balance Volume (ta.obv)
 */
function obv(bars: Bar[]): number[] {
  const result: number[] = new Array(bars.length).fill(0);
  result[0] = bars[0]?.volume || 0;
  for (let i = 1; i < bars.length; i++) {
    const vol = bars[i].volume || 0;
    if (bars[i].close > bars[i - 1].close) result[i] = result[i - 1] + vol;
    else if (bars[i].close < bars[i - 1].close) result[i] = result[i - 1] - vol;
    else result[i] = result[i - 1];
  }
  return result;
}

/**
 * Rate of Change (ta.roc) — percentage change over period
 */
function roc(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i - period] !== 0 ? ((values[i] - values[i - period]) / values[i - period]) * 100 : 0;
  }
  return result;
}

/**
 * Momentum (ta.mom) — difference over period
 */
function mom(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] - values[i - period];
  }
  return result;
}

/**
 * Williams %R (ta.wpr)
 */
function williamsR(bars: Bar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low < ll) ll = bars[j].low;
    }
    const range = hh - ll;
    result[i] = range !== 0 ? ((hh - bars[i].close) / range) * -100 : 0;
  }
  return result;
}

/**
 * Chande Momentum Oscillator (ta.cmo)
 */
function cmo(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    let upSum = 0, downSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - values[j - 1];
      if (diff > 0) upSum += diff;
      else downSum += Math.abs(diff);
    }
    const total = upSum + downSum;
    result[i] = total !== 0 ? ((upSum - downSum) / total) * 100 : 0;
  }
  return result;
}

/**
 * Percent Rank (ta.percentrank) — % of past values ≤ current 
 */
function percentRank(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    let count = 0;
    for (let j = i - period; j < i; j++) {
      if (values[j] <= values[i]) count++;
    }
    result[i] = (count / period) * 100;
  }
  return result;
}

/**
 * Keltner Channels
 * Returns { upper, middle, lower }
 */
function keltnerChannels(bars: Bar[], emaPeriod: number, mult: number, atrPeriod: number): { upper: number[]; middle: number[]; lower: number[] } {
  const closes = bars.map(b => b.close);
  const middle = ema(closes, emaPeriod);
  const atrArr = atr(bars, atrPeriod);
  const upper = middle.map((m, i) => m + mult * (atrArr[i] || 0));
  const lower = middle.map((m, i) => m - mult * (atrArr[i] || 0));
  return { upper, middle, lower };
}

/**
 * SuperTrend indicator
 * Returns { supertrend: number[], direction: number[] } where direction=1 means up, -1 means down
 */
function supertrend(bars: Bar[], factor: number, atrPeriod: number): { supertrend: number[]; direction: number[] } {
  const atrArr = atr(bars, atrPeriod);
  const st: number[] = new Array(bars.length).fill(NaN);
  const dir: number[] = new Array(bars.length).fill(1);

  const upperBand: number[] = new Array(bars.length).fill(0);
  const lowerBand: number[] = new Array(bars.length).fill(0);

  for (let i = 0; i < bars.length; i++) {
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const a = atrArr[i] || 0;
    upperBand[i] = hl2 + factor * a;
    lowerBand[i] = hl2 - factor * a;

    if (i === 0) {
      st[i] = upperBand[i];
      dir[i] = -1;
      continue;
    }

    // Adjust bands
    if (lowerBand[i] < lowerBand[i - 1] && bars[i - 1].close > lowerBand[i - 1]) {
      // keep previous lower band if it was higher
    } else if (bars[i - 1].close > lowerBand[i - 1]) {
      lowerBand[i] = Math.max(lowerBand[i], lowerBand[i - 1]);
    }
    if (upperBand[i] > upperBand[i - 1] && bars[i - 1].close < upperBand[i - 1]) {
      // keep
    } else if (bars[i - 1].close < upperBand[i - 1]) {
      upperBand[i] = Math.min(upperBand[i], upperBand[i - 1]);
    }

    if (dir[i - 1] === 1) {
      // was bullish
      if (bars[i].close < lowerBand[i]) {
        dir[i] = -1;
        st[i] = upperBand[i];
      } else {
        dir[i] = 1;
        st[i] = lowerBand[i];
      }
    } else {
      // was bearish
      if (bars[i].close > upperBand[i]) {
        dir[i] = 1;
        st[i] = lowerBand[i];
      } else {
        dir[i] = -1;
        st[i] = upperBand[i];
      }
    }
  }

  return { supertrend: st, direction: dir };
}

/**
 * Parabolic SAR
 */
function sar(bars: Bar[], startAF = 0.02, incAF = 0.02, maxAF = 0.2): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < 2) return result;

  let isLong = bars[1].close > bars[0].close;
  let af = startAF;
  let ep = isLong ? bars[0].high : bars[0].low;
  let sarVal = isLong ? bars[0].low : bars[0].high;
  result[0] = sarVal;

  for (let i = 1; i < bars.length; i++) {
    sarVal = sarVal + af * (ep - sarVal);

    if (isLong) {
      // Ensure SAR is below prior two lows
      if (i >= 2) sarVal = Math.min(sarVal, bars[i - 1].low, bars[i - 2].low);
      else sarVal = Math.min(sarVal, bars[i - 1].low);

      if (bars[i].low < sarVal) {
        // Reverse to short
        isLong = false;
        sarVal = ep;
        ep = bars[i].low;
        af = startAF;
      } else {
        if (bars[i].high > ep) {
          ep = bars[i].high;
          af = Math.min(af + incAF, maxAF);
        }
      }
    } else {
      // Ensure SAR is above prior two highs
      if (i >= 2) sarVal = Math.max(sarVal, bars[i - 1].high, bars[i - 2].high);
      else sarVal = Math.max(sarVal, bars[i - 1].high);

      if (bars[i].high > sarVal) {
        // Reverse to long
        isLong = true;
        sarVal = ep;
        ep = bars[i].high;
        af = startAF;
      } else {
        if (bars[i].low < ep) {
          ep = bars[i].low;
          af = Math.min(af + incAF, maxAF);
        }
      }
    }

    result[i] = sarVal;
  }

  return result;
}

/* ═══ Array / Utility Helpers ═══ */

/**
 * Offset of highest value in period (negative, like PineScript ta.highestbars)
 * Returns number[] where result[i] = negative offset to the bar with highest value within period
 */
function highestbars(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let maxVal = -Infinity, maxIdx = i;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] > maxVal) { maxVal = values[j]; maxIdx = j; }
    }
    result[i] = maxIdx - i; // negative offset
  }
  return result;
}

/**
 * Offset of lowest value in period (negative, like PineScript ta.lowestbars)
 */
function lowestbars(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let minVal = Infinity, minIdx = i;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] < minVal) { minVal = values[j]; minIdx = j; }
    }
    result[i] = minIdx - i; // negative offset
  }
  return result;
}

/**
 * Bars since condition was true (ta.barssince)
 * Returns number[] — number of bars since cond[i] was true (0 = current bar is true)
 */
function barssince(cond: boolean[]): number[] {
  const result: number[] = new Array(cond.length).fill(NaN);
  let lastTrue = -1;
  for (let i = 0; i < cond.length; i++) {
    if (cond[i]) lastTrue = i;
    if (lastTrue >= 0) result[i] = i - lastTrue;
  }
  return result;
}

/**
 * Value of source when condition was true (ta.valuewhen)
 * occurrence: 0 = most recent, 1 = previous, etc.
 */
function valuewhen(cond: boolean[], source: number[], occurrence: number): number[] {
  const result: number[] = new Array(cond.length).fill(NaN);
  for (let i = 0; i < cond.length; i++) {
    let found = 0;
    for (let j = i; j >= 0; j--) {
      if (cond[j]) {
        if (found === occurrence) {
          result[i] = source[j];
          break;
        }
        found++;
      }
    }
  }
  return result;
}

/**
 * True if source has been rising for `length` bars (ta.rising)
 */
function rising(values: number[], length: number): boolean[] {
  const result: boolean[] = new Array(values.length).fill(false);
  for (let i = length; i < values.length; i++) {
    let allRising = true;
    for (let j = 1; j <= length; j++) {
      if (values[i - j + 1] <= values[i - j]) { allRising = false; break; }
    }
    result[i] = allRising;
  }
  return result;
}

/**
 * True if source has been falling for `length` bars (ta.falling)
 */
function falling(values: number[], length: number): boolean[] {
  const result: boolean[] = new Array(values.length).fill(false);
  for (let i = length; i < values.length; i++) {
    let allFalling = true;
    for (let j = 1; j <= length; j++) {
      if (values[i - j + 1] >= values[i - j]) { allFalling = false; break; }
    }
    result[i] = allFalling;
  }
  return result;
}

/**
 * Cumulative sum (ta.cum / math.sum without period)
 */
function cum(values: number[]): number[] {
  const result: number[] = new Array(values.length).fill(0);
  result[0] = values[0] || 0;
  for (let i = 1; i < values.length; i++) {
    result[i] = result[i - 1] + (values[i] || 0);
  }
  return result;
}

/**
 * Replace NaN/null/undefined with replacement (nz)
 */
function nz(value: number | null | undefined, replacement = 0): number {
  return (value === null || value === undefined || isNaN(value as number)) ? replacement : (value as number);
}

/**
 * Array version of nz — replace NaN with replacement in each element
 */
function nzArr(values: (number | null | undefined)[], replacement = 0): number[] {
  return values.map(v => nz(v, replacement));
}

/**
 * Check if value is NaN/null/undefined (na)
 */
function na(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && isNaN(value));
}

/**
 * Replace NaN with last non-NaN value (fixnan)
 */
function fixnan(values: number[]): number[] {
  const result: number[] = [...values];
  for (let i = 1; i < result.length; i++) {
    if (isNaN(result[i])) result[i] = result[i - 1];
  }
  return result;
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function toSec(ms: number): number {
  return Math.floor(ms / 1000);
}

/* ═══ Additional PineScript-compatible Helpers ═══ */

/** ta.tsi — True Strength Index */
function tsi(values: number[], shortLen: number, longLen: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  // Double-smoothed momentum
  const pc: number[] = new Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) pc[i] = values[i] - values[i - 1];
  const pcAbs = pc.map(v => Math.abs(v));
  const smooth1 = ema(pc, longLen);
  const dblSmooth = ema(smooth1, shortLen);
  const absSmooth1 = ema(pcAbs, longLen);
  const absDblSmooth = ema(absSmooth1, shortLen);
  for (let i = 0; i < values.length; i++) {
    if (!isNaN(dblSmooth[i]) && !isNaN(absDblSmooth[i]) && absDblSmooth[i] !== 0) {
      result[i] = dblSmooth[i] / absDblSmooth[i];
    }
  }
  return result;
}

/** ta.cog — Center of Gravity */
function cog(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sumV = 0, num = 0;
    for (let j = 0; j < period; j++) {
      sumV += values[i - j];
      num += values[i - j] * (j + 1);
    }
    result[i] = sumV !== 0 ? -num / sumV : 0;
  }
  return result;
}

/** ta.variance — Statistical variance */
function variance(values: number[], period: number, biased = true): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    const mean = s / period;
    let sqDiff = 0;
    for (let j = i - period + 1; j <= i; j++) sqDiff += (values[j] - mean) ** 2;
    result[i] = sqDiff / (biased ? period : period - 1);
  }
  return result;
}

/** ta.bbw — Bollinger Bands Width */
function bbw(values: number[], period: number, mult: number): number[] {
  const bb = bollingerBands(values, period, mult);
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (!isNaN(bb.upper[i]) && !isNaN(bb.lower[i]) && !isNaN(bb.middle[i]) && bb.middle[i] !== 0) {
      result[i] = ((bb.upper[i] - bb.lower[i]) / bb.middle[i]) * 100;
    }
  }
  return result;
}

/** ta.kcw — Keltner Channels Width */
function kcw(bars: Bar[], emaPeriod: number, mult: number, atrPeriod?: number): number[] {
  const kc = keltnerChannels(bars, emaPeriod, mult, atrPeriod || emaPeriod);
  const result: number[] = new Array(bars.length).fill(NaN);
  for (let i = 0; i < bars.length; i++) {
    if (!isNaN(kc.upper[i]) && !isNaN(kc.lower[i]) && !isNaN(kc.middle[i]) && kc.middle[i] !== 0) {
      result[i] = (kc.upper[i] - kc.lower[i]) / kc.middle[i];
    }
  }
  return result;
}

/** ta.dmi — Directional Movement Index → { plus: +DI, minus: -DI, adx: ADX } */
function dmi(bars: Bar[], diLen: number, adxSmoothing: number): { plus: number[]; minus: number[]; adx: number[] } {
  const r = adx(bars, diLen, adxSmoothing);
  return { plus: r.plusDI, minus: r.minusDI, adx: r.adx };
}

/** ta.percentile_linear_interpolation */
function percentile_linear(values: number[], period: number, pct: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1).sort((a, b) => a - b);
    const rank = (pct / 100) * (window.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    const frac = rank - lo;
    result[i] = lo === hi ? window[lo] : window[lo] * (1 - frac) + window[hi] * frac;
  }
  return result;
}

/** ta.percentile_nearest_rank */
function percentile_nearest(values: number[], period: number, pct: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1).sort((a, b) => a - b);
    const rank = Math.ceil((pct / 100) * window.length) - 1;
    result[i] = window[Math.max(0, rank)];
  }
  return result;
}

/** color.rgb — CSS color from RGB(A) */
function colorRgb(r: number, g: number, b: number, a = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Parse HEX → { r, g, b } */
function colorComponents(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/** math.todegrees */
function toDegrees(rad: number): number { return rad * (180 / Math.PI); }

/** math.toradians */
function toRadians(deg: number): number { return deg * (Math.PI / 180); }

/** math.round with precision */
function roundP(value: number, precision = 0): number {
  if (precision <= 0) return Math.round(value);
  const m = 10 ** precision;
  return Math.round(value * m) / m;
}

/* ═══ Helpers object exposed to user code ═══ */

const helpers = {
  // Moving averages
  sma, ema, rma, wma, linreg,
  dema, tema, hma, swma, alma, vwma,

  // Volatility / Range
  atr, trueRange, bollingerBands, stdev, donchian,
  keltnerChannels, supertrend, sar,

  // Momentum / Oscillators
  rsi, macd, stochastic, adx,
  cci, mfi, obv, roc, mom, williamsR, cmo, percentRank,

  // Volume
  vwap,

  // Pivots
  pivotHigh, pivotLow,

  // Array ops
  highest, lowest, highestbars, lowestbars,
  crossover, crossunder,
  rising, falling,
  change, percentChange, sum, avg, median, cum,
  barssince, valuewhen,

  // Null handling
  nz, nzArr, na, fixnan,

  // Statistics
  pearsonR,
  variance,
  tsi,
  cog,
  bbw,
  kcw,
  dmi,
  percentile_linear,
  percentile_nearest,

  // Color
  hexToRgba,
  colorRgb,
  colorComponents,

  // Time
  toSec,

  // Math shortcuts
  abs: Math.abs,
  max: Math.max,
  min: Math.min,
  sqrt: Math.sqrt,
  pow: Math.pow,
  log: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
  round: roundP,
  PI: Math.PI,
  E: Math.E,
  sign: Math.sign,
  atan2: Math.atan2,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log10: Math.log10,
  log2: Math.log2,
  hypot: Math.hypot,
  trunc: Math.trunc,
  clz32: Math.clz32,
  toDegrees,
  toRadians,
  random: Math.random,
  isFinite,
  isNaN,
  NaN,
  Infinity,

  // Logging (populated per-request, logs piped back to main thread)
  debug: (..._args: unknown[]) => { /* replaced per request */ },
};

/* ═══ Message Handler ═══ */

interface WorkerRequest {
  id: string;
  code: string;
  bars: Bar[];
  params: Record<string, unknown>;
  enableTrace?: boolean;
}

/* ═══ Tracing infrastructure ═══ */

interface TraceEntry {
  seq: number;
  fn: string;
  args: string;
  result: string;
  ms: number;
}

function summarizeValue(val: unknown, maxLen = 120): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val === 'number') return isNaN(val) ? 'NaN' : String(val);
  if (typeof val === 'boolean' || typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    const nonNaN = val.filter(v => typeof v === 'number' && !isNaN(v));
    if (val.length === 0) return '[] (len=0)';
    if (typeof val[0] === 'number') {
      const first = val.slice(0, 3).map(v => typeof v === 'number' && !isNaN(v) ? +v.toFixed(4) : 'NaN');
      return `number[${val.length}] nonNaN=${nonNaN.length} [${first.join(', ')}…]`;
    }
    if (typeof val[0] === 'boolean') {
      const trueCount = val.filter(Boolean).length;
      return `bool[${val.length}] true=${trueCount}`;
    }
    if (typeof val[0] === 'object' && val[0] !== null) {
      return `object[${val.length}] keys=${Object.keys(val[0]).join(',')}`;
    }
    return `array[${val.length}]`;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>);
    const parts: string[] = [];
    for (const k of keys.slice(0, 6)) {
      const v = (val as Record<string, unknown>)[k];
      if (Array.isArray(v)) parts.push(`${k}: array[${v.length}]`);
      else if (typeof v === 'number') parts.push(`${k}: ${isNaN(v) ? 'NaN' : +v.toFixed(4)}`);
      else parts.push(`${k}: ${typeof v}`);
    }
    const s = `{ ${parts.join(', ')} }`;
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  }
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function summarizeArgs(args: unknown[]): string {
  return args.map(a => summarizeValue(a, 80)).join(', ');
}

/** Non-tracing helper keys (math constants, simple wrappers) — skip for cleaner logs */
const SKIP_TRACE = new Set([
  'abs','max','min','sqrt','pow','log','floor','ceil','round',
  'PI','E','sign','atan2','sin','cos','tan','exp','log10','log2',
  'hypot','trunc','clz32','toDegrees','toRadians','random',
  'isFinite','isNaN','NaN','Infinity','nz','na','debug',
]);

function createTracedHelpers(base: typeof helpers): { proxy: typeof helpers; trace: TraceEntry[] } {
  const trace: TraceEntry[] = [];
  let seq = 0;
  const proxy = {} as typeof helpers;

  for (const key of Object.keys(base) as (keyof typeof helpers)[]) {
    const val = base[key];
    if (typeof val === 'function' && !SKIP_TRACE.has(key)) {
      (proxy as Record<string, unknown>)[key] = (...args: unknown[]) => {
        const t0 = performance.now();
        const result = (val as (...a: unknown[]) => unknown)(...args);
        const ms = +(performance.now() - t0).toFixed(3);
        trace.push({ seq: ++seq, fn: key, args: summarizeArgs(args), result: summarizeValue(result), ms });
        return result;
      };
    } else {
      (proxy as Record<string, unknown>)[key] = val;
    }
  }
  return { proxy, trace };
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, code, bars, params } = e.data;
  const enableTrace = !!e.data.enableTrace;

  // Collect logs from user code
  const logs: string[] = [];
  helpers.debug = (...args: unknown[]) => {
    logs.push(args.map(a => {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
      catch { return String(a); }
    }).join(' '));
  };

  // Build traced or plain helpers
  const { proxy: tracedHelpers, trace } = enableTrace
    ? createTracedHelpers(helpers)
    : { proxy: helpers, trace: [] as TraceEntry[] };
  // Ensure debug is on the proxy too
  tracedHelpers.debug = helpers.debug;

  const t0 = performance.now();

  try {
    // Build the function from user code
    // The code should define: function compute(bars, params, helpers) { return { shapes: [...] }; }
    // We wrap it to extract the compute function
    const wrappedCode = `
      'use strict';
      ${code}
      if (typeof compute !== 'function') {
        throw new Error('Функция compute() не найдена. Код должен содержать: function compute(bars, params, helpers) { ... }');
      }
      return compute(bars, params, helpers);
    `;

    // eslint-disable-next-line no-new-func
    const fn = new Function('bars', 'params', 'helpers', wrappedCode);
    const result: ComputeResult = fn(bars, params, tracedHelpers);

    // Validate result
    if (!result || !Array.isArray(result.shapes)) {
      throw new Error('compute() должна вернуть объект { shapes: [...] }');
    }

    // Validate & sanitize shapes
    const MAX_SHAPES = 500;
    const shapes: ShapeDescriptor[] = [];
    let regularCount = 0;
    let virtualCount = 0;

    for (let i = 0; i < result.shapes.length; i++) {
      const s = result.shapes[i];
      if (!s || !s.type || !Array.isArray(s.points)) continue;

      if (!ALL_ALLOWED_SHAPES.has(s.type)) continue;

      // --- Virtual shapes (series_line, area_fill) ---
      if (VIRTUAL_SHAPES.has(s.type)) {
        if (virtualCount >= MAX_VIRTUAL_SHAPES) continue;
        const pts = s.points.slice(0, MAX_VIRTUAL_POINTS);
        if (pts.length < 2) continue;

        const valid = pts.every((p: ShapePoint) => {
          if (typeof p.time !== 'number' || !isFinite(p.time)) return false;
          if (typeof p.price !== 'number' || !isFinite(p.price)) return false;
          if (s.type === 'area_fill' && (typeof p.price2 !== 'number' || !isFinite(p.price2))) return false;
          return true;
        });
        if (!valid) continue;

        virtualCount++;
        shapes.push({
          type: s.type,
          points: pts,
          overrides: s.overrides || {},
          zOrder: s.zOrder || 'bottom',
          text: '',
          singlePoint: false,
        });
        continue;
      }

      // --- Regular shapes ---
      if (regularCount >= MAX_SHAPES) continue;

      // Validate points
      const validPoints = s.points.every((p: ShapePoint) =>
        typeof p.time === 'number' && typeof p.price === 'number' &&
        isFinite(p.time) && isFinite(p.price)
      );
      if (!validPoints || s.points.length === 0) continue;

      regularCount++;
      shapes.push({
        type: s.type,
        points: s.points,
        overrides: s.overrides || {},
        zOrder: s.zOrder || 'bottom',
        text: s.text || '',
        singlePoint: s.singlePoint !== undefined ? !!s.singlePoint : SINGLE_POINT_SHAPES.has(s.type),
      });
    }

    // Validate & sanitize dashboard
    let dashboard: DashboardConfig | null = null;
    if (result.dashboard && typeof result.dashboard === 'object' && Array.isArray(result.dashboard.rows)) {
      const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      const pos = result.dashboard.position;
      dashboard = {
        position: typeof pos === 'string' && validPositions.includes(pos) ? pos : 'top-right',
        title: typeof result.dashboard.title === 'string' ? result.dashboard.title : undefined,
        rows: result.dashboard.rows
          .filter((r: DashboardRow) => r && typeof r.label === 'string' && typeof r.value === 'string')
          .slice(0, 20)
          .map((r: DashboardRow) => ({
            label: String(r.label),
            value: String(r.value),
            color: typeof r.color === 'string' ? r.color : undefined,
          })),
      };
    }

    // Validate & sanitize alerts
    const alerts: AlertItem[] = [];
    if (Array.isArray(result.alerts)) {
      for (const a of result.alerts.slice(0, 10)) {
        if (a && typeof a.message === 'string' && a.fired === true) {
          alerts.push({
            message: a.message,
            fired: true,
            color: typeof a.color === 'string' ? a.color : undefined,
          });
        }
      }
    }

    const totalMs = +(performance.now() - t0).toFixed(2);

    // Build trace summary
    const traceSummary = enableTrace ? {
      totalMs,
      barsCount: bars.length,
      params: JSON.parse(JSON.stringify(params)),
      helperCalls: trace,
      shapesCount: shapes.length,
      shapeTypes: [...new Set(shapes.map(s => s.type))],
      dashboardRows: dashboard?.rows?.length ?? 0,
      alertsFired: alerts.length,
      debugLogs: logs,
    } : undefined;

    (self as unknown as Worker).postMessage({ id, result: { shapes, dashboard, alerts }, logs, trace: traceSummary });
  } catch (err: unknown) {
    const totalMs = +(performance.now() - t0).toFixed(2);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    const traceSummary = enableTrace ? {
      totalMs,
      barsCount: bars.length,
      params: JSON.parse(JSON.stringify(params)),
      helperCalls: trace,
      error: message,
      errorStack: stack,
      debugLogs: logs,
    } : undefined;

    (self as unknown as Worker).postMessage({ id, error: message, logs, trace: traceSummary });
  }
};
