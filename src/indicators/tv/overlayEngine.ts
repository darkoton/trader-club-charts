/**
 * ═══════════════════════════════════════════════════════════════
 *  Custom Indicator Overlay Engine for TradingView Charting Library
 * ═══════════════════════════════════════════════════════════════
 *
 * Pure computation functions for each custom indicator.
 * Input: OHLCV bar array + params → Output: shape descriptors.
 * The TVChart component draws shapes using the TV chart API.
 */

/* ─── Types ─── */

export interface OHLCVBar {
  time: number; // milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TVShapeDescriptor {
  type: string;
  points: Array<{ time: number; price: number; price2?: number }>;  // time in seconds for TV API; price2 for area_fill
  overrides: Record<string, unknown>;
  zOrder?: 'top' | 'bottom';
  text?: string;
  /** If true, use createShape (single-point) instead of createMultipointShape */
  singlePoint?: boolean;
}

/* ─── Dashboard (table overlay) ─── */

export interface DashboardRow {
  label: string;
  value: string;
  color?: string;
}

export interface DashboardConfig {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  title?: string;
  rows: DashboardRow[];
}

/* ─── Alerts (toast notifications) ─── */

export interface AlertItem {
  message: string;
  fired: boolean;
  color?: string;
}

/* ─── Result ─── */

export interface OverlayResult {
  shapes: TVShapeDescriptor[];
  dashboard?: DashboardConfig | null;
  alerts?: AlertItem[];
}

/* ─── Math Helpers ─── */

function sma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

function atr(bars: OHLCVBar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < 2) return result;
  const trArr: number[] = [];
  trArr.push(bars[0].high - bars[0].low);
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    trArr.push(tr);
  }
  // RMA-style ATR
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

function sar(bars: OHLCVBar[], startAF = 0.02, incAF = 0.02, maxAF = 0.2): number[] {
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
      sarVal = i >= 2 ? Math.min(sarVal, bars[i - 1].low, bars[i - 2].low) : Math.min(sarVal, bars[i - 1].low);

      if (bars[i].low < sarVal) {
        isLong = false;
        sarVal = ep;
        ep = bars[i].low;
        af = startAF;
      } else if (bars[i].high > ep) {
        ep = bars[i].high;
        af = Math.min(af + incAF, maxAF);
      }
    } else {
      sarVal = i >= 2 ? Math.max(sarVal, bars[i - 1].high, bars[i - 2].high) : Math.max(sarVal, bars[i - 1].high);

      if (bars[i].high > sarVal) {
        isLong = true;
        sarVal = ep;
        ep = bars[i].high;
        af = startAF;
      } else if (bars[i].low < ep) {
        ep = bars[i].low;
        af = Math.min(af + incAF, maxAF);
      }
    }

    result[i] = sarVal;
  }

  return result;
}

function rsi(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
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

function resolveSignalText(rawValue: unknown, uiLang: string, english: string, russian: string): string {
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!trimmed) return uiLang === 'RU' ? russian : english;
  if (uiLang === 'RU' && trimmed === english) return russian;
  return trimmed;
}

function calcSuperTrendLines(bars: OHLCVBar[], len: number, mult: number): { upLine: number[]; downLine: number[]; atrValues: number[] } {
  const closes = bars.map((bar) => bar.close);
  const hl2 = bars.map((bar) => (bar.high + bar.low) / 2);
  const atrValues = atr(bars, len);
  const basicUpper = hl2.map((value, index) => (Number.isFinite(atrValues[index]) ? value + mult * atrValues[index] : NaN));
  const basicLower = hl2.map((value, index) => (Number.isFinite(atrValues[index]) ? value - mult * atrValues[index] : NaN));
  const finalUpper = new Array(bars.length).fill(NaN);
  const finalLower = new Array(bars.length).fill(NaN);

  let startIndex = 0;
  while (startIndex < bars.length && !(Number.isFinite(basicUpper[startIndex]) && Number.isFinite(basicLower[startIndex]))) {
    startIndex += 1;
  }

  if (startIndex >= bars.length) {
    return {
      upLine: new Array(bars.length).fill(NaN),
      downLine: new Array(bars.length).fill(NaN),
      atrValues,
    };
  }

  finalUpper[startIndex] = basicUpper[startIndex];
  finalLower[startIndex] = basicLower[startIndex];

  for (let i = startIndex + 1; i < bars.length; i++) {
    const prevUpper = finalUpper[i - 1];
    const prevLower = finalLower[i - 1];
    finalUpper[i] = basicUpper[i] < prevUpper || closes[i - 1] > prevUpper ? basicUpper[i] : prevUpper;
    finalLower[i] = basicLower[i] > prevLower || closes[i - 1] < prevLower ? basicLower[i] : prevLower;
  }

  const upLine = new Array(bars.length).fill(NaN);
  const downLine = new Array(bars.length).fill(NaN);
  let bull = closes[startIndex] >= finalLower[startIndex];

  for (let i = startIndex + 1; i < bars.length; i++) {
    if (bull && closes[i] < finalLower[i - 1]) bull = false;
    else if (!bull && closes[i] > finalUpper[i - 1]) bull = true;

    if (bull) upLine[i] = finalLower[i];
    else downLine[i] = finalUpper[i];
  }

  return { upLine, downLine, atrValues };
}

function calcZigZagPivots(bars: OHLCVBar[], deviation: number): Array<{ idx: number; price: number; type: 'high' | 'low' }> {
  if (bars.length < 10) return [];

  let atrSum = 0;
  const atrBars = Math.min(49, bars.length - 1);
  for (let i = 1; i <= atrBars; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    atrSum += tr;
  }
  const avgAtr = atrBars > 0 ? atrSum / atrBars : 0;
  const threshold = avgAtr * (deviation / 2);
  if (!(threshold > 0)) return [];

  let maxIdx = 0;
  let minIdx = 0;
  let maxPrice = bars[0].high;
  let minPrice = bars[0].low;

  for (let i = 1; i < Math.min(10, bars.length); i++) {
    if (bars[i].high > maxPrice) {
      maxPrice = bars[i].high;
      maxIdx = i;
    }
    if (bars[i].low < minPrice) {
      minPrice = bars[i].low;
      minIdx = i;
    }
  }

  let lastPivot = minIdx < maxIdx
    ? { idx: minIdx, price: minPrice, type: 'low' as const }
    : { idx: maxIdx, price: maxPrice, type: 'high' as const };

  const pivots: Array<{ idx: number; price: number; type: 'high' | 'low' }> = [{ ...lastPivot }];

  for (let i = lastPivot.idx + 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;

    if (lastPivot.type === 'high') {
      if (high > lastPivot.price) {
        pivots[pivots.length - 1] = { idx: i, price: high, type: 'high' };
        lastPivot = { idx: i, price: high, type: 'high' };
      } else if (lastPivot.price - low >= threshold) {
        pivots.push({ idx: i, price: low, type: 'low' });
        lastPivot = { idx: i, price: low, type: 'low' };
      }
    } else if (low < lastPivot.price) {
      pivots[pivots.length - 1] = { idx: i, price: low, type: 'low' };
      lastPivot = { idx: i, price: low, type: 'low' };
    } else if (high - lastPivot.price >= threshold) {
      pivots.push({ idx: i, price: high, type: 'high' });
      lastPivot = { idx: i, price: high, type: 'high' };
    }
  }

  return pivots;
}

/** ms → seconds for TV shape API */
function toSec(ms: number): number {
  return Math.floor(ms / 1000);
}

/* ═══════════════════════════════════════════════════════════════
   1. RANGE DETECTOR — consolidation zones
   ═══════════════════════════════════════════════════════════════ */

export function computeRangeDetector(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const length = (params.length as number) || 20;
  const mult = (params.mult as number) ?? 2.5;  // ← обновлено с 1.0
  const atrLen = (params.atrLen as number) || 14;
  const lookbackBars = (params.lookbackBars as number) || 500;
  const extendMode = (params.extendMode as string) || 'nBars';
  const extendBarsN = (params.extendBars as number) || 12;
  const invalidateRule = (params.invalidateRule as string) || 'close';
  const keepBroken = params.keepBroken !== false;
  const maxBoxes = (params.maxBoxes as number) || 20;
  const strideBars = (params.strideBars as number) || 1;
  const fillAlpha = (params.fillAlpha as number) ?? 0.18;
  const colorUnbroken = (params.colorUnbroken as string) || '#2157f3';
  const colorUp = (params.colorUp as string) || '#089981';
  const colorDown = (params.colorDown as string) || '#f23645';
  const colorBroken = (params.colorBroken as string) || '#9ca3af';

  console.log(`[RangeDetector] params.mult=${params.mult}, using mult=${mult}`);

  if (bars.length < length + 1) return { shapes: [] };

  const closes = bars.map((b) => b.close);
  const smaVals = sma(closes, length);
  const atrVals = atr(bars, atrLen);

  const startIdx = Math.max(0, bars.length - lookbackBars);

  interface Zone { left: number; right: number; top: number; bot: number; brokenDir?: 'up' | 'down' }
  const rawZones: Zone[] = [];

  for (let i = startIdx; i <= bars.length - length; i += strideBars) {
    const smaVal = smaVals[i + length - 1];
    const atrVal = atrVals[i + length - 1];
    if (isNaN(smaVal) || isNaN(atrVal) || atrVal <= 0) continue;

    const half = atrVal * mult;
    const upper = smaVal + half;
    const lower = smaVal - half;

    let fits = true;
    for (let j = i; j < i + length; j++) {
      if (bars[j].high > upper || bars[j].low < lower) { fits = false; break; }
    }
    if (!fits) continue;

    // Actual range from bars
    let top = -Infinity, bot = Infinity;
    for (let j = i; j < i + length; j++) {
      if (bars[j].high > top) top = bars[j].high;
      if (bars[j].low < bot) bot = bars[j].low;
    }

    rawZones.push({ left: i, right: i + length - 1, top, bot });
  }

  console.log(`[RangeDetector] Found ${rawZones.length} raw zones (before merge), mult=${mult}, length=${length}`);

  // Merge overlapping zones
  const merged: Zone[] = [];
  for (const z of rawZones) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (z.left <= prev.right) {
        prev.right = Math.max(prev.right, z.right);
        prev.top = Math.max(prev.top, z.top);
        prev.bot = Math.min(prev.bot, z.bot);
        continue;
      }
    }
    merged.push({ ...z });
  }

  // Take last N zones
  const zones = merged.slice(-maxBoxes);

  // Determine right edge and breakout status
  const lastIdx = bars.length - 1;
  const shapes: TVShapeDescriptor[] = [];

  for (const z of zones) {
    let rightIdx = z.right;
    if (extendMode === 'toNow') rightIdx = lastIdx;
    else if (extendMode === 'nBars') rightIdx = Math.min(z.right + extendBarsN, lastIdx);

    // Check breakout
    let broken = false;
    let brokenDir: 'up' | 'down' | null = null;
    for (let j = z.right + 1; j <= rightIdx && j < bars.length; j++) {
      const checkVal = invalidateRule === 'close' ? bars[j].close : (bars[j].close > z.top ? bars[j].high : bars[j].low);
      if (checkVal > z.top) { broken = true; brokenDir = 'up'; break; }
      if (checkVal < z.bot) { broken = true; brokenDir = 'down'; break; }
    }

    if (broken && !keepBroken) continue;

    let fillColor = colorUnbroken;
    if (broken) {
      fillColor = brokenDir === 'up' ? colorUp : brokenDir === 'down' ? colorDown : colorBroken;
    }

    shapes.push({
      type: 'rectangle',
      points: [
        { time: toSec(bars[z.left].time), price: z.top },
        { time: toSec(bars[Math.min(rightIdx, lastIdx)].time), price: z.bot },
      ],
      overrides: {
        backgroundColor: hexToRgba(fillColor, fillAlpha),
        color: fillColor,
        linewidth: (params.showBorder !== false) ? ((params.borderWidth as number) || 2) : 0,
        transparency: 0,
        fillBackground: true,
      },
      zOrder: 'bottom',
    });
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   2. ORDER BLOCKS — BOS + pivot-based order blocks
   ═══════════════════════════════════════════════════════════════ */

export function computeOrderBlocks(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const side = (params.side as string) || 'both';
  const leftBars = (params.leftBars as number) || 3;
  const rightBars = (params.rightBars as number) || 3;
  const lookbackBars = (params.lookbackBars as number) || 500;
  const bosConfirm = (params.bosConfirm as string) || 'close';
  const obLookbackBars = (params.obLookbackBars as number) || 20;
  const minImpulseATR = (params.minImpulseATR as number) ?? 0.3;  // ← обновлено с 0.8
  const atrPeriod = (params.atrPeriod as number) || 14;
  const zoneMode = (params.zoneMode as string) || 'openExtreme';
  const extendMode = (params.extendMode as string) || 'toNow';
  const extendBarsN = (params.extendBars as number) || 60;
  const touchMode = (params.touchMode as string) || 'wick';
  const invalidateRule = (params.invalidateRule as string) || 'close';
  const stopOnEvent = (params.stopOnEvent as string) || 'invalid';
  const maxZones = (params.maxZones as number) || 20;
  const maxZonesPerSide = (params.maxZonesPerSide as number) || 10;
  const minGapBars = (params.minGapBars as number) || 5;
  const ttlBars = (params.ttlBars as number) || 0;
  const mergeEnabled = params.mergeEnabled !== false;
  const mergeTolAtr = (params.mergeTolAtr as number) ?? 0.25;
  const mergeTimeGap = (params.mergeTimeGap as number) || 10;
  const fillAlpha = (params.fillAlpha as number) ?? 0.08;
  const bullColor = (params.bullColor as string) || '#10b981';
  const bearColor = (params.bearColor as string) || '#f43f5e';
  const mitigatedColor = (params.mitigatedColor as string) || '#3b82f6';
  const invalidColor = (params.invalidColor as string) || '#9ca3af';
  const keepMitigated = params.keepMitigated === true;
  const keepInvalid = params.keepInvalid === true;

  console.log(`[OrderBlocks] params.minImpulseATR=${params.minImpulseATR}, using minImpulseATR=${minImpulseATR}`);

  if (bars.length < leftBars + rightBars + 2) return { shapes: [] };

  const atrVals = atr(bars, atrPeriod);
  const endIdx = bars.length - 1;
  const startIdx = Math.max(leftBars, endIdx - lookbackBars + 1);
  const atrRef = atrVals[endIdx] || atrVals.filter(Number.isFinite).slice(-1)[0] || (bars[endIdx].high - bars[endIdx].low);

  // --- Pre-collect all pivots (matching original approach) ---
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = startIdx; i <= endIdx - rightBars; i++) {
    if (i - leftBars < 0) continue;
    let isPH = true;
    for (let k = 1; k <= leftBars; k++) if (bars[i - k].high >= bars[i].high) { isPH = false; break; }
    if (isPH) for (let k = 1; k <= rightBars; k++) if (bars[i + k].high > bars[i].high) { isPH = false; break; }
    if (isPH) pivotHighs.push(i);

    let isPL = true;
    for (let k = 1; k <= leftBars; k++) if (bars[i - k].low <= bars[i].low) { isPL = false; break; }
    if (isPL) for (let k = 1; k <= rightBars; k++) if (bars[i + k].low < bars[i].low) { isPL = false; break; }
    if (isPL) pivotLows.push(i);
  }

  function lastPivotHigh(before: number): number | null {
    for (let k = pivotHighs.length - 1; k >= 0; k--) if (pivotHighs[k] < before) return pivotHighs[k];
    return null;
  }
  function lastPivotLow(before: number): number | null {
    for (let k = pivotLows.length - 1; k >= 0; k--) if (pivotLows[k] < before) return pivotLows[k];
    return null;
  }

  // --- Zone from candle (matching original) ---
  function zoneFromCandle(b: OHLCVBar, zoneSide: 'bull' | 'bear'): { top: number; bot: number } {
    if (zoneMode === 'wick') return { top: b.high, bot: b.low };
    if (zoneMode === 'body') return { top: Math.max(b.open, b.close), bot: Math.min(b.open, b.close) };
    // openExtreme
    if (zoneSide === 'bull') return { top: b.open, bot: Math.min(b.open, b.low) };
    return { top: Math.max(b.open, b.high), bot: b.open };
  }

  const wantBull = side === 'bull' || side === 'both';
  const wantBear = side === 'bear' || side === 'both';

  interface OBZone {
    side: 'bull' | 'bear'; i1: number; i2: number; top: number; bot: number; born: number;
  }
  const zones: OBZone[] = [];

  for (let i = startIdx + leftBars; i <= endIdx; i++) {
    const bar = bars[i];
    const curATR = atrVals[i] || atrRef;

    if (wantBull) {
      const sh = lastPivotHigh(i);
      if (sh != null) {
        const ref = bars[sh].high;
        const bos = bosConfirm === 'close' ? bar.close > ref : bar.high > ref;
        if (bos) {
          const from = Math.max(0, i - obLookbackBars);
          for (let j = i - 1; j >= from; j--) {
            if (bars[j].close < bars[j].open) {
              const impulse = Math.abs(bar.close - bars[j].open);
              if (impulse >= minImpulseATR * curATR) {
                const zone = zoneFromCandle(bars[j], 'bull');
                zones.push({ side: 'bull', i1: j, i2: i, top: zone.top, bot: zone.bot, born: i });
                i += Math.max(0, minGapBars);
                break;
              }
            }
          }
        }
      }
    }

    if (wantBear) {
      const sl = lastPivotLow(i);
      if (sl != null) {
        const ref = bars[sl].low;
        const bos = bosConfirm === 'close' ? bar.close < ref : bar.low < ref;
        if (bos) {
          const from = Math.max(0, i - obLookbackBars);
          for (let j = i - 1; j >= from; j--) {
            if (bars[j].close > bars[j].open) {
              const impulse = Math.abs(bars[j].open - bar.close);
              if (impulse >= minImpulseATR * curATR) {
                const zone = zoneFromCandle(bars[j], 'bear');
                zones.push({ side: 'bear', i1: j, i2: i, top: zone.top, bot: zone.bot, born: i });
                i += Math.max(0, minGapBars);
                break;
              }
            }
          }
        }
      }
    }
  }

  // --- Merge nearby zones (matching original) ---
  function mergeOBZones(list: OBZone[]): OBZone[] {
    if (!mergeEnabled || list.length <= 1) return list;
    const tol = mergeTolAtr * (atrRef || 1);
    const arr = list.slice().sort((a, b) => a.i1 - b.i1);
    const out: OBZone[] = [];
    let cur: OBZone | null = null;
    for (const z of arr) {
      if (!cur) { cur = { ...z }; continue; }
      const priceClose = Math.abs(z.top - cur.top) <= tol && Math.abs(z.bot - cur.bot) <= tol;
      const timeClose = z.i1 <= cur.i2 + mergeTimeGap;
      const sameSide = z.side === cur.side;
      if (priceClose && timeClose && sameSide) {
        cur.top = (cur.top + z.top) / 2;
        cur.bot = (cur.bot + z.bot) / 2;
        cur.i2 = Math.max(cur.i2, z.i2);
        cur.born = Math.max(cur.born, z.born);
      } else {
        out.push(cur);
        cur = { ...z };
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  const merged = mergeOBZones(zones);

  console.log(`[OrderBlocks] Found ${zones.length} zones → ${merged.length} after merge, pivotHighs=${pivotHighs.length}, pivotLows=${pivotLows.length}`);

  // Limit per side
  const bulls = merged.filter((z) => z.side === 'bull').slice(-maxZonesPerSide);
  const bearsArr = merged.filter((z) => z.side === 'bear').slice(-maxZonesPerSide);
  let filtered = [...bulls, ...bearsArr].sort((a, b) => a.i1 - b.i1).slice(-maxZones);

  // --- Event detection helper (matching original) ---
  function firstEventIndex(z: OBZone, iStart: number, iEnd: number): { mit: number | null; inv: number | null } {
    let mit: number | null = null;
    let inv: number | null = null;
    for (let i = iStart; i <= iEnd && i < bars.length; i++) {
      const bar = bars[i];
      if (mit == null) {
        if (touchMode === 'close') {
          if (bar.close >= z.bot && bar.close <= z.top) mit = i;
        } else {
          if (bar.low <= z.top && bar.high >= z.bot) mit = i;
        }
      }
      if (inv == null) {
        if (invalidateRule === 'close') {
          if (z.side === 'bull' && bar.close < z.bot) inv = i;
          if (z.side === 'bear' && bar.close > z.top) inv = i;
        } else {
          if (z.side === 'bull' && bar.low < z.bot) inv = i;
          if (z.side === 'bear' && bar.high > z.top) inv = i;
        }
      }
      if (mit != null && inv != null) break;
    }
    return { mit, inv };
  }

  // --- Build shapes ---
  const shapes: TVShapeDescriptor[] = [];

  for (const z of filtered) {
    // Base right edge
    let right: number;
    if (extendMode === 'toNow') right = endIdx;
    else if (extendMode === 'nBars') right = Math.min(endIdx, z.i1 + extendBarsN);
    else right = Math.min(endIdx, z.i1 + 1);

    // StopOnEvent: truncate right edge at first event
    if (stopOnEvent !== 'none') {
      const e = firstEventIndex(z, z.i1 + 1, right);
      let stopIdx: number | null = null;
      if (stopOnEvent === 'mitigation') stopIdx = e.mit;
      else if (stopOnEvent === 'invalid') stopIdx = e.inv;
      else /* either */ stopIdx = e.mit == null ? e.inv : (e.inv == null ? e.mit : Math.min(e.mit, e.inv));
      if (stopIdx != null) right = Math.max(z.i1 + 1, stopIdx);
    }

    // Status for coloring (matching original: zones are NEVER skipped, only
    // right-edge is truncated by stopOnEvent and color changes based on status)
    const e = firstEventIndex(z, z.i1 + 1, right);
    let status: 'active' | 'mitigated' | 'invalid' = 'active';
    if (e.inv != null) status = 'invalid';
    else if (e.mit != null) status = 'mitigated';

    // TTL check: skip stale fresh zones that were never touched
    if (ttlBars > 0 && status === 'active' && (endIdx - z.born > ttlBars)) continue;

    let color = z.side === 'bull' ? bullColor : bearColor;
    if (status === 'mitigated' && keepMitigated) color = mitigatedColor;
    if (status === 'invalid' && keepInvalid) color = invalidColor;

    shapes.push({
      type: 'rectangle',
      points: [
        { time: toSec(bars[z.i1].time), price: z.top },
        { time: toSec(bars[Math.min(right, endIdx)].time), price: z.bot },
      ],
      overrides: {
        backgroundColor: hexToRgba(color, fillAlpha),
        color,
        linewidth: (params.showBorder !== false) ? ((params.borderWidth as number) || 1) : 0,
        transparency: 0,
        fillBackground: true,
      },
      zOrder: 'bottom',
    });
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   3. ADAPTIVE TREND FINDER — regression channels
   ═══════════════════════════════════════════════════════════════ */

export function computeAdaptiveTrend(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const showShort = params.showShort !== false;
  const colorShort = (params.colorShort as string) || '#808080';
  const showLong = params.showLong === true;
  const colorLong = (params.colorLong as string) || '#808080';
  const showPrev = params.showPrev !== false;  // ← обновлено: true по умолчанию
  const colorPrev = (params.colorPrev as string) || '#505050';
  const showMidline = params.showMidline !== false;  // ← обновлено: true по умолчанию
  const colorMid = (params.colorMid as string) || '#808080';
  const devMultiplier = (params.devMultiplier as number) ?? 2.0;
  const useLog = params.useLog === true;
  const lineWidth = (params.lineWidth as number) || 2;
  const lineStyleStr = (params.lineStyle as string) || 'Solid';
  const autoColor = params.autoColor !== false;

  console.log(`[AdaptiveTrend] params.showPrev=${params.showPrev}, using showPrev=${showPrev}, params.showMidline=${params.showMidline}, using showMidline=${showMidline}`);

  if (bars.length < 30) return { shapes: [] };

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const n = closes.length;

  // Map line style string to TV linestyle number
  const STYLE_MAP: Record<string, number> = { Solid: 0, Dashed: 2, Dotted: 1 };
  const lineStyle = STYLE_MAP[lineStyleStr] ?? 0;

  // RMA helper (matching original)
  function rmaArr(arr: number[], len: number): number[] {
    const out = new Array(arr.length).fill(NaN);
    if (arr.length < len) return out;
    const alpha = 1 / len;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += arr[i];
    let val = sum / len;
    out[len - 1] = val;
    for (let i = len; i < arr.length; i++) {
      val = alpha * arr[i] + (1 - alpha) * val;
      out[i] = val;
    }
    return out;
  }

  // ADX calculation (matching original)
  function calcAdx(diLen: number, adxLen: number): number {
    if (n < diLen + adxLen) return 0;
    const tr: number[] = [0];
    const plus: number[] = [0];
    const minus: number[] = [0];
    for (let i = 1; i < n; i++) {
      const prevC = closes[i - 1];
      tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - prevC), Math.abs(lows[i] - prevC)));
      const up = highs[i] - highs[i - 1];
      const down = lows[i - 1] - lows[i];
      plus.push(up > down && up > 0 ? up : 0);
      minus.push(down > up && down > 0 ? down : 0);
    }
    const trRMA = rmaArr(tr, diLen);
    const plusRMA = rmaArr(plus, diLen);
    const minusRMA = rmaArr(minus, diLen);
    const dx: number[] = [];
    for (let i = 0; i < n; i++) {
      const v1 = isNaN(trRMA[i]) ? 1 : (trRMA[i] || 1);
      const diPlus = 100 * (isNaN(plusRMA[i]) ? 0 : plusRMA[i]) / v1;
      const diMinus = 100 * (isNaN(minusRMA[i]) ? 0 : minusRMA[i]) / v1;
      const dsum = diPlus + diMinus;
      dx.push(dsum === 0 ? 0 : 100 * Math.abs(diPlus - diMinus) / dsum);
    }
    const adxArr = rmaArr(dx, adxLen);
    return isNaN(adxArr[n - 1]) ? 0 : adxArr[n - 1];
  }

  // ADX period mapping (from original)
  function getAdxParamsShort(p: number): [number, number] {
    if (p <= 40) return [7, 5];
    if (p <= 60) return [10, 7];
    if (p <= 90) return [14, 7];
    if (p <= 130) return [20, 10];
    if (p <= 165) return [24, 12];
    return [28, 14];
  }
  function getAdxParamsLong(p: number): [number, number] {
    if (p <= 450) return [28, 14];
    if (p <= 700) return [35, 17];
    if (p <= 950) return [42, 21];
    return [50, 25];
  }

  // Linear regression with Pearson R (matching original's calcDev with 1-based x, df correction)
  function calcChannel(endIndex: number, len: number): {
    slope: number; intercept: number; stdDev: number; r: number;
  } | null {
    if (endIndex < len - 1 || endIndex >= n) return null;
    const startI = endIndex - len + 1;
    const src: number[] = [];
    for (let i = 0; i < len; i++) {
      let v = closes[startI + i];
      if (useLog) { if (v <= 0) v = 0.00001; v = Math.log(v); }
      src.push(v);
    }
    let sumX = 0, sumXX = 0, sumYX = 0, sumY = 0;
    for (let i = 1; i <= len; i++) {
      const val = src[i - 1];
      sumX += i; sumXX += i * i; sumYX += i * val; sumY += val;
    }
    const denom = len * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const slope = (len * sumYX - sumX * sumY) / denom;
    const avg = sumY / len;
    const intercept = avg - slope * sumX / len + slope;

    const n1 = len - 1;
    const regMid = intercept + slope * n1 * 0.5;
    let lineV = intercept;
    let sumDxx = 0, sumDyy = 0, sumDyx = 0, sumDev = 0;
    for (let i = 0; i <= n1; i++) {
      const v = src[i];
      const dxt = v - avg;
      const dyt = lineV - regMid;
      const resid = v - lineV;
      lineV += slope;
      sumDxx += dxt * dxt;
      sumDyy += dyt * dyt;
      sumDyx += dxt * dyt;
      sumDev += resid * resid;
    }
    const df = Math.max(1, len - 2);
    const stdDev = Math.sqrt(sumDev / df);
    const divisor = sumDxx * sumDyy;
    const r = divisor > 0 ? sumDyx / Math.sqrt(divisor) : 0;

    return { slope, intercept, stdDev, r };
  }

  // Find best channel in period range
  function bestChannel(minP: number, maxP: number, step: number): {
    period: number; slope: number; intercept: number; stdDev: number; r: number;
    startIdx: number; endIdx: number;
  } | null {
    let bestR = 0;
    let best: ReturnType<typeof bestChannel> = null;
    const endIndex = n - 1;
    for (let p = minP; p <= maxP && p <= n; p += step) {
      const res = calcChannel(endIndex, p);
      if (!res) continue;
      if (Math.abs(res.r) > bestR) {
        bestR = Math.abs(res.r);
        best = {
          period: p, slope: res.slope, intercept: res.intercept,
          stdDev: res.stdDev, r: res.r,
          startIdx: endIndex - p + 1, endIdx: endIndex,
        };
      }
    }
    return best;
  }

  // Find previous channel with opposite slope direction (matching original)
  function findPrevChannel(currentSlope: number, minP: number, maxP: number, step: number): ReturnType<typeof bestChannel> {
    const searchStep = 5;
    const maxLookback = Math.min(n - 1, 500);
    for (let idx = n - 1 - searchStep; idx > n - 1 - maxLookback; idx -= searchStep) {
      let bR = 0;
      let cand: ReturnType<typeof bestChannel> = null;
      for (let p = minP; p <= maxP && p <= idx + 1; p += step) {
        const res = calcChannel(idx, p);
        if (!res) continue;
        if (Math.abs(res.r) > bR) {
          bR = Math.abs(res.r);
          cand = {
            period: p, slope: res.slope, intercept: res.intercept,
            stdDev: res.stdDev, r: res.r,
            startIdx: idx - p + 1, endIdx: idx,
          };
        }
      }
      if (cand && Math.sign(cand.slope) !== Math.sign(currentSlope) && Math.abs(cand.r) > 0.3) {
        return cand;
      }
    }
    return null;
  }

  const shapes: TVShapeDescriptor[] = [];

  function addChannel(ch: NonNullable<ReturnType<typeof bestChannel>>, color: string, style: number, width: number, isPrevCh = false) {
    const { slope, intercept, stdDev, startIdx: si, endIdx: ei } = ch;
    const dev = stdDev * devMultiplier;

    let lineColor = color;
    if (autoColor && !isPrevCh) {
      const [diLen, adxLen] = ch.period <= 200 ? getAdxParamsShort(ch.period) : getAdxParamsLong(ch.period);
      const adxVal = calcAdx(diLen, adxLen);
      if (adxVal >= 25 && Math.abs(ch.r) >= 0.9) {
        lineColor = slope > 0 ? '#10b981' : '#ef4444';
      }
    }

    const len = ei - si + 1;
    const startY = intercept;
    const endY = intercept + slope * (len - 1);

    const convertDev = (base: number, d: number, dir: 'up' | 'dn') => {
      if (useLog) {
        const expBase = Math.exp(base);
        return dir === 'up' ? expBase * Math.exp(d) : expBase / Math.exp(d);
      }
      return dir === 'up' ? base + d : base - d;
    };
    const convert = (v: number) => useLog ? Math.exp(v) : v;

    // Upper channel line
    shapes.push({
      type: 'trend_line',
      points: [
        { time: toSec(bars[si].time), price: convertDev(startY, dev, 'up') },
        { time: toSec(bars[ei].time), price: convertDev(endY, dev, 'up') },
      ],
      overrides: { linecolor: lineColor, linewidth: width, linestyle: style, showLabel: false },
    });
    // Lower channel line
    shapes.push({
      type: 'trend_line',
      points: [
        { time: toSec(bars[si].time), price: convertDev(startY, dev, 'dn') },
        { time: toSec(bars[ei].time), price: convertDev(endY, dev, 'dn') },
      ],
      overrides: { linecolor: lineColor, linewidth: width, linestyle: style, showLabel: false },
    });

    // Midline
    if (showMidline && !isPrevCh) {
      shapes.push({
        type: 'trend_line',
        points: [
          { time: toSec(bars[si].time), price: convert(startY) },
          { time: toSec(bars[ei].time), price: convert(endY) },
        ],
        overrides: { linecolor: colorMid, linewidth: 1, linestyle: 1, showLabel: false },
      });
    }
  }

  if (showShort) {
    const ch = bestChannel(20, Math.min(200, n), 10);
    if (ch) {
      addChannel(ch, colorShort, lineStyle, lineWidth);
      if (showPrev) {
        const prev = findPrevChannel(ch.slope, 20, Math.min(200, n), 10);
        if (prev) addChannel(prev, colorPrev, 2, 1, true);
      }
    }
  }
  if (showLong) {
    const ch = bestChannel(300, Math.min(1200, n), 50);
    if (ch) {
      addChannel(ch, colorLong, lineStyle, lineWidth);
      if (showPrev) {
        const prev = findPrevChannel(ch.slope, 300, Math.min(1200, n), 50);
        if (prev) addChannel(prev, colorPrev, 2, 1, true);
      }
    }
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   4. IMBALANCE SUITE — FVG / OG / VI
   ═══════════════════════════════════════════════════════════════ */

export function computeImbalanceSuite(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const showFVG = params.showFVG !== false;
  const showOG = params.showOG !== false;
  const showVI = params.showVI !== false;
  const _atrPeriod = (params.atrPeriod as number) || 200; void _atrPeriod;
  const fvgExtend = (params.fvgExtend as number) || 0;
  const ogExtend = (params.ogExtend as number) || 0;
  const viExtend = (params.viExtend as number) || 5;
  const bullFvgFill = (params.bullFvgFill as string) || 'rgba(33,87,243,0.32)';
  const bearFvgFill = (params.bearFvgFill as string) || 'rgba(255,17,0,0.32)';
  const bullOgFill = (params.bullOgFill as string) || 'rgba(33,87,243,0.50)';
  const bearOgFill = (params.bearOgFill as string) || 'rgba(255,17,0,0.50)';
  const bullViStroke = (params.bullViStroke as string) || '#2157f3';
  const bearViStroke = (params.bearViStroke as string) || '#ff1100';

  const showLabels = params.showLabels !== false;
  const _labelColor = (params.labelColor as string) || '#eee'; void _labelColor;
  const placeDetectionMarker = params.placeDetectionMarker === true;
  const buyText = (params.buyText as string) || 'BUY';
  const sellText = (params.sellText as string) || 'SELL';
  const buyColor = (params.buyColor as string) || '#16a34a';
  const sellColor = (params.sellColor as string) || '#ef4444';

  // Limit visible bars to prevent creating thousands of shapes
  const maxBarsBack = Math.min((params.maxBarsBack as number) || 200, 500);

  if (bars.length < 3) return { shapes: [] };

  const startIdx = Math.max(1, bars.length - maxBarsBack);
  const lastIdx = bars.length - 1;
  const shapes: TVShapeDescriptor[] = [];
  const ogFlags = new Set<number>();

  for (let i = startIdx; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];

    // OG (Opening Gap) — 2-candle gap
    if (showOG) {
      if (curr.low > prev.high) {
        // Bull OG
        const right = Math.min(i + ogExtend, lastIdx);
        shapes.push({
          type: 'rectangle',
          points: [
            { time: toSec(prev.time), price: curr.low },
            { time: toSec(bars[right].time), price: prev.high },
          ],
          overrides: { backgroundColor: bullOgFill, color: bullOgFill, linewidth: 0, fillBackground: true, transparency: 0 },
          zOrder: 'bottom',
          text: showLabels ? 'OG↑' : undefined,
        });
        if (placeDetectionMarker) {
          shapes.push({
            type: 'arrow_up', singlePoint: true,
            points: [{ time: toSec(curr.time), price: curr.low }],
            overrides: { color: buyColor },
            text: buyText,
          });
        }
        ogFlags.add(i);
      } else if (curr.high < prev.low) {
        // Bear OG
        const right = Math.min(i + ogExtend, lastIdx);
        shapes.push({
          type: 'rectangle',
          points: [
            { time: toSec(prev.time), price: prev.low },
            { time: toSec(bars[right].time), price: curr.high },
          ],
          overrides: { backgroundColor: bearOgFill, color: bearOgFill, linewidth: 0, fillBackground: true, transparency: 0 },
          zOrder: 'bottom',
          text: showLabels ? 'OG↓' : undefined,
        });
        if (placeDetectionMarker) {
          shapes.push({
            type: 'arrow_down', singlePoint: true,
            points: [{ time: toSec(curr.time), price: curr.high }],
            overrides: { color: sellColor },
            text: sellText,
          });
        }
        ogFlags.add(i);
      }
    }

    // VI (Volume Imbalance) — 2-candle body gap with wick overlap
    if (showVI && i >= 1) {
      const pOpen = prev.open, pClose = prev.close;
      const cOpen = curr.open, cClose = curr.close;
      const pBody = [Math.min(pOpen, pClose), Math.max(pOpen, pClose)];
      const cBody = [Math.min(cOpen, cClose), Math.max(cOpen, cClose)];

      if (cBody[0] > pBody[1] && prev.high >= curr.low) {
        // Bull VI
        const right = Math.min(i + viExtend, lastIdx);
        shapes.push({
          type: 'rectangle',
          points: [
            { time: toSec(prev.time), price: cBody[0] },
            { time: toSec(bars[right].time), price: pBody[1] },
          ],
          overrides: {
            backgroundColor: 'rgba(0,0,0,0)', color: bullViStroke,
            linewidth: (params.viLineWidth as number) || 1, fillBackground: false, transparency: 0,
          },
          zOrder: 'bottom',
          text: showLabels ? 'VI↑' : undefined,
        });
        if (placeDetectionMarker) {
          shapes.push({
            type: 'arrow_up', singlePoint: true,
            points: [{ time: toSec(curr.time), price: curr.low }],
            overrides: { color: buyColor },
            text: buyText,
          });
        }
      } else if (cBody[1] < pBody[0] && prev.low <= curr.high) {
        // Bear VI
        const right = Math.min(i + viExtend, lastIdx);
        shapes.push({
          type: 'rectangle',
          points: [
            { time: toSec(prev.time), price: pBody[0] },
            { time: toSec(bars[right].time), price: cBody[1] },
          ],
          overrides: {
            backgroundColor: 'rgba(0,0,0,0)', color: bearViStroke,
            linewidth: (params.viLineWidth as number) || 1, fillBackground: false, transparency: 0,
          },
          zOrder: 'bottom',
          text: showLabels ? 'VI↓' : undefined,
        });
        if (placeDetectionMarker) {
          shapes.push({
            type: 'arrow_down', singlePoint: true,
            points: [{ time: toSec(curr.time), price: curr.high }],
            overrides: { color: sellColor },
            text: sellText,
          });
        }
      }
    }

    // FVG (Fair Value Gap) — 3-candle gap
    if (showFVG && i >= 2) {
      const a = bars[i - 2]; // candle A
      const c = curr;        // candle C

      if (c.low > a.high && !ogFlags.has(i) && !ogFlags.has(i - 1)) {
        // Bull FVG
        const right = Math.min(i + fvgExtend, lastIdx);
        shapes.push({
          type: 'rectangle',
          points: [
            { time: toSec(a.time), price: c.low },
            { time: toSec(bars[right].time), price: a.high },
          ],
          overrides: { backgroundColor: bullFvgFill, color: bullFvgFill, linewidth: 0, fillBackground: true, transparency: 0 },
          zOrder: 'bottom',
          text: showLabels ? 'FVG↑' : undefined,
        });
        if (placeDetectionMarker) {
          shapes.push({
            type: 'arrow_up', singlePoint: true,
            points: [{ time: toSec(c.time), price: c.low }],
            overrides: { color: buyColor },
            text: buyText,
          });
        }
      } else if (c.high < a.low && !ogFlags.has(i) && !ogFlags.has(i - 1)) {
        // Bear FVG
        const right = Math.min(i + fvgExtend, lastIdx);
        shapes.push({
          type: 'rectangle',
          points: [
            { time: toSec(a.time), price: a.low },
            { time: toSec(bars[right].time), price: c.high },
          ],
          overrides: { backgroundColor: bearFvgFill, color: bearFvgFill, linewidth: 0, fillBackground: true, transparency: 0 },
          zOrder: 'bottom',
          text: showLabels ? 'FVG↓' : undefined,
        });
        if (placeDetectionMarker) {
          shapes.push({
            type: 'arrow_down', singlePoint: true,
            points: [{ time: toSec(c.time), price: c.high }],
            overrides: { color: sellColor },
            text: sellText,
          });
        }
      }
    }
  }

  return { shapes };
}

function detectImbalanceSignalsOG(curr: OHLCVBar, prev: OHLCVBar) {
  return { bull: curr.low > prev.high, bear: curr.high < prev.low };
}

function detectImbalanceSignalsVI(index: number, bars: OHLCVBar[]) {
  const candle = bars[index];
  const prev = bars[index - 1];
  if (!prev) return { bull: false, bear: false, bullTop: 0, bullBtm: 0, bearTop: 0, bearBtm: 0 };

  const bullTop = Math.min(candle.close, candle.open);
  const bullBtm = Math.max(prev.close, prev.open);
  const bearTop = Math.min(prev.close, prev.open);
  const bearBtm = Math.max(candle.close, candle.open);
  const bull = candle.open > prev.close && prev.high > candle.low && candle.close > prev.close && candle.open > prev.open && prev.high < bullTop;
  const bear = candle.open < prev.close && prev.low < candle.high && candle.close < prev.close && candle.open < prev.open && prev.low > bearBtm;

  return { bull, bear, bullTop, bullBtm, bearTop, bearBtm };
}

function detectImbalanceSignalsFVG(index: number, bars: OHLCVBar[]) {
  const current = bars[index];
  const middle = bars[index - 1];
  const first = bars[index - 2];
  if (!current || !middle || !first) return { bull: false, bear: false, bullTop: 0, bullBtm: 0, bearTop: 0, bearBtm: 0 };

  const bull = current.low > first.high && middle.close > first.high;
  const bear = current.high < first.low && middle.close < first.low;
  return { bull, bear, bullTop: current.low, bullBtm: first.high, bearTop: first.low, bearBtm: current.high };
}

function mapHudAnchor(anchor: unknown): DashboardConfig['position'] {
  switch ((typeof anchor === 'string' ? anchor : 'TR').toUpperCase()) {
    case 'TL': return 'top-left';
    case 'BR': return 'bottom-right';
    case 'BL': return 'bottom-left';
    default: return 'top-right';
  }
}

function buildImbalanceSignalsDashboard(
  bars: OHLCVBar[],
  events: Array<{ i: number; side: 'buy' | 'sell' }>,
  params: Record<string, unknown>,
): DashboardConfig | null {
  if (params.useStats === false || params.signalsEnabled === false || params.showHudCard === false) return null;

  const maxDogons = Math.max(0, Math.min(7, Number(params.dogons) || 0));
  const expiryBars = Math.max(1, Number(params.expiryBars) || 1);
  const dogonBars = (Number(params.dogonBars) || 0) > 0 ? (Number(params.dogonBars) || 0) : expiryBars;
  const lookbackBars = Math.max(1, Number(params.statsLookbackBars) || 300);
  const fromBar = Math.max(0, bars.length - 1 - lookbackBars);
  const winsAt = new Array(maxDogons + 2).fill(0);
  let losses = 0;

  for (const event of events) {
    if (event.i < fromBar) continue;
    const sign = event.side === 'buy' ? 1 : -1;
    let attempt = 1;
    let entryIndex = event.i;
    let done = false;

    while (!done) {
      const duration = attempt === 1 ? expiryBars : dogonBars;
      const exitIndex = entryIndex + duration;
      if (exitIndex >= bars.length) break;

      const delta = (bars[exitIndex].close - bars[entryIndex].close) * sign;
      if (delta > 0) {
        winsAt[attempt] += 1;
        done = true;
      } else if (attempt <= maxDogons) {
        attempt += 1;
        entryIndex = exitIndex;
      } else {
        losses += 1;
        done = true;
      }
    }
  }

  const totalWins = winsAt.reduce((sum, count) => sum + count, 0);
  const total = totalWins + losses;
  const wrPct = total > 0 ? Math.round((totalWins / total) * 100) : null;
  const neutralColor = '#94a3b8';
  const buyColor = (params.buyColor as string) || '#16a34a';
  const sellColor = (params.sellColor as string) || '#ef4444';
  const statsColor = totalWins > losses ? buyColor : losses > totalWins ? sellColor : neutralColor;

  const rows: DashboardRow[] = [{
    label: '📊',
    value: `+${totalWins} -${losses}${wrPct != null ? ` | WR ${wrPct}%` : ''}`,
    color: statsColor,
  }];
  const dogonParts: string[] = [];
  for (let attempt = 1; attempt <= maxDogons + 1; attempt++) {
    dogonParts.push(`${attempt}:+${winsAt[attempt] || 0}`);
  }
  rows.push({ label: '🏆', value: `${dogonParts.join(', ')}, -:${losses}`, color: statsColor });

  return {
    position: mapHudAnchor(params.hudAnchor),
    title: 'Imbalance Signals',
    rows,
  };
}

/* ═══════════════════════════════════════════════════════════════
   7. IMBALANCE SIGNALS — FVG / OG / VI with BUY/SELL + HUD stats
   ═══════════════════════════════════════════════════════════════ */

export function computeImbalanceSignals(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  if (bars.length < 2) return { shapes: [] };

  const maxRenderedSignalHistory = 10;

  const showFVG = params.showFVG !== false;
  const showOG = params.showOG !== false;
  const showVI = params.showVI !== false;
  const signalsEnabled = params.signalsEnabled !== false;
  const signalsFVG = params.signalsFVG !== false;
  const signalsOG = params.signalsOG !== false;
  const signalsVI = params.signalsVI !== false;
  const cooldownBars = Math.max(0, Number(params.cooldownBars) || 0);
  const buyColor = (params.buyColor as string) || '#16a34a';
  const sellColor = (params.sellColor as string) || '#ef4444';
  const buyTextColor = (params.buyTextColor as string) || '#d1fae5';
  const sellTextColor = (params.sellTextColor as string) || '#fee2e2';
  const zoneEntries: Array<{ index: number; shape: TVShapeDescriptor }> = [];
  const signalEntries: Array<{ index: number; shape: TVShapeDescriptor }> = [];
  const events: Array<{ i: number; side: 'buy' | 'sell' }> = [];
  const ogFlags = Array.from({ length: bars.length }, () => ({ bull: false, bear: false }));
  let lastSignalIndex = -1;

  const pushSignal = (index: number, side: 'buy' | 'sell') => {
    if (!signalsEnabled) return;
    if (cooldownBars > 0 && lastSignalIndex >= 0 && index - lastSignalIndex <= cooldownBars) return;

    events.push({ i: index, side });
    signalEntries.push({
      index,
      shape: {
        type: side === 'buy' ? 'arrow_up' : 'arrow_down',
        singlePoint: true,
        points: [{ time: toSec(bars[index].time), price: side === 'buy' ? bars[index].low : bars[index].high }],
        overrides: {
          color: side === 'buy' ? buyColor : sellColor,
          textcolor: side === 'buy' ? buyTextColor : sellTextColor,
        },
        text: side === 'buy' ? 'BUY' : 'SELL',
        zOrder: 'top',
      },
    });
    lastSignalIndex = index;
  };

  const pushZone = (left: number, right: number, top: number, bottom: number, kind: 'FVG' | 'OG' | 'VI', bullish: boolean) => {
    const fill = bullish ? (kind === 'FVG' ? 'rgba(33,87,243,0.32)' : 'rgba(33,87,243,0.50)') : (kind === 'FVG' ? 'rgba(255,17,0,0.32)' : 'rgba(255,17,0,0.50)');
    const stroke = bullish ? '#2157f3' : '#ff1100';
    zoneEntries.push({
      index: right,
      shape: {
        type: 'rectangle',
        points: [
          { time: toSec(bars[left].time), price: Math.max(top, bottom) },
          { time: toSec(bars[right].time), price: Math.min(top, bottom) },
        ],
        overrides: kind === 'VI'
          ? {
              backgroundColor: 'rgba(0,0,0,0)',
              color: stroke,
              linewidth: 1,
              fillBackground: false,
              transparency: 0,
              showLabel: true,
              textcolor: '#111111',
              fontsize: 11,
              bold: true,
            }
          : {
              backgroundColor: fill,
              color: fill,
              linewidth: 0,
              fillBackground: true,
              transparency: 0,
              showLabel: true,
              textcolor: '#111111',
              fontsize: 11,
              bold: true,
            },
        text: `${kind}${bullish ? '↑' : '↓'}`,
        zOrder: 'bottom',
      },
    });
  };

  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];

    if (showOG) {
      const og = detectImbalanceSignalsOG(curr, prev);
      if (og.bull) {
        pushZone(i - 1, i, Math.min(curr.close, curr.open), Math.max(prev.close, prev.open), 'OG', true);
        if (signalsOG) pushSignal(i, 'buy');
        ogFlags[i].bull = true;
      }
      if (og.bear) {
        pushZone(i - 1, i, Math.min(prev.close, prev.open), Math.max(curr.close, curr.open), 'OG', false);
        if (signalsOG) pushSignal(i, 'sell');
        ogFlags[i].bear = true;
      }
    }

    if (showVI) {
      const vi = detectImbalanceSignalsVI(i, bars);
      if (vi.bull) {
        pushZone(i - 1, i, vi.bullTop, vi.bullBtm, 'VI', true);
        if (signalsVI) pushSignal(i, 'buy');
      }
      if (vi.bear) {
        pushZone(i - 1, i, vi.bearTop, vi.bearBtm, 'VI', false);
        if (signalsVI) pushSignal(i, 'sell');
      }
    }

    if (showFVG && i >= 2) {
      const fvg = detectImbalanceSignalsFVG(i, bars);
      if (fvg.bull && !(ogFlags[i]?.bull || ogFlags[i - 1]?.bull)) {
        pushZone(i - 2, i, fvg.bullTop, fvg.bullBtm, 'FVG', true);
        if (signalsFVG) pushSignal(i, 'buy');
      }
      if (fvg.bear && !(ogFlags[i]?.bear || ogFlags[i - 1]?.bear)) {
        pushZone(i - 2, i, fvg.bearTop, fvg.bearBtm, 'FVG', false);
        if (signalsFVG) pushSignal(i, 'sell');
      }
    }
  }

  const recentSignalEntries = signalEntries.slice(-maxRenderedSignalHistory);
  const firstVisibleSignalIndex = recentSignalEntries[0]?.index ?? null;
  const shapes = [
    ...(
      firstVisibleSignalIndex == null
        ? zoneEntries.map((entry) => entry.shape)
        : zoneEntries
          .filter((entry) => entry.index >= firstVisibleSignalIndex)
          .map((entry) => entry.shape)
    ),
    ...recentSignalEntries.map((entry) => entry.shape),
  ];

  return {
    shapes,
    dashboard: buildImbalanceSignalsDashboard(bars, events, params),
  };
}

/* ═══════════════════════════════════════════════════════════════
   8. STREAK HUNTER — reversal after consecutive same-color candles
   ═══════════════════════════════════════════════════════════════ */

export function computeStreakHunter(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  if (!bars.length) return { shapes: [] };

  const minConsecutive = Math.max(2, Math.min(10, Number(params.minConsecutive) || 3));
  const buyText = (params.buyText as string) || 'BUY';
  const sellText = (params.sellText as string) || 'SELL';
  const buyColor = (params.buyColor as string) || '#16a34a';
  const sellColor = (params.sellColor as string) || '#ef4444';
  const shapes: TVShapeDescriptor[] = [];

  let upRun = 0;
  let downRun = 0;
  for (const bar of bars) {
    const isGreen = bar.close > bar.open;
    const isRed = bar.close < bar.open;

    if (isGreen) {
      upRun += 1;
      downRun = 0;
    } else if (isRed) {
      downRun += 1;
      upRun = 0;
    } else {
      upRun = 0;
      downRun = 0;
    }

    if (upRun === minConsecutive) {
      shapes.push({
        type: 'arrow_down',
        singlePoint: true,
        points: [{ time: toSec(bar.time), price: bar.close }],
        overrides: { color: sellColor, textcolor: sellColor },
        text: sellText,
        zOrder: 'top',
      });
    }

    if (downRun === minConsecutive) {
      shapes.push({
        type: 'arrow_up',
        singlePoint: true,
        points: [{ time: toSec(bar.time), price: bar.close }],
        overrides: { color: buyColor, textcolor: buyColor },
        text: buyText,
        zOrder: 'top',
      });
    }
  }

  return { shapes };
}

function buildVolumeProfileBins(bars: OHLCVBar[], params: Record<string, unknown>): { bins: Array<{ bot: number; top: number; buyVol: number; sellVol: number; total: number }>; maxVol: number; startIdx: number; endIdx: number } {
  const barsCount = bars.length;
  const lookback = Math.min(barsCount, Math.max(2, Number(params.lookback) || 1000));
  const subset = bars.slice(-lookback);
  const startIdx = barsCount - subset.length;
  const endIdx = barsCount - 1;
  if (subset.length < 2) return { bins: [], maxVol: 0, startIdx, endIdx };

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const bar of subset) {
    if (bar.low < minPrice) minPrice = bar.low;
    if (bar.high > maxPrice) maxPrice = bar.high;
  }
  if (!Number.isFinite(minPrice) || maxPrice === minPrice) return { bins: [], maxVol: 0, startIdx, endIdx };

  const rows = Math.max(10, Math.min(1000, Number(params.rows) || 200));
  const step = (maxPrice - minPrice) / rows;
  const bins = Array.from({ length: rows }, (_, index) => ({
    bot: minPrice + index * step,
    top: minPrice + (index + 1) * step,
    buyVol: 0,
    sellVol: 0,
    total: 0,
  }));

  for (const bar of subset) {
    const numericVolume = Number(bar.volume);
    const volume = Number.isFinite(numericVolume) && numericVolume > 0 ? numericVolume : 1;
    const isUp = bar.close >= bar.open;
    const range = bar.high - bar.low;

    if (range === 0) {
      const rawIndex = Math.floor((bar.close - minPrice) / step);
      const index = Math.max(0, Math.min(rows - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
      if (isUp) bins[index].buyVol += volume;
      else bins[index].sellVol += volume;
      bins[index].total += volume;
      continue;
    }

    for (const bin of bins) {
      const overlapTop = Math.min(bar.high, bin.top);
      const overlapBottom = Math.max(bar.low, bin.bot);
      if (overlapTop <= overlapBottom) continue;
      const ratio = (overlapTop - overlapBottom) / range;
      const binVolume = volume * ratio;
      if (isUp) bin.buyVol += binVolume;
      else bin.sellVol += binVolume;
      bin.total += binVolume;
    }
  }

  let maxVol = 0;
  for (const bin of bins) {
    if (bin.total > maxVol) maxVol = bin.total;
  }

  return { bins, maxVol, startIdx, endIdx };
}

/* ═══════════════════════════════════════════════════════════════
   9. VOLUME PROFILE — horizontal volume histogram approximation
   ═══════════════════════════════════════════════════════════════ */

export function computeVolumeProfile(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const { bins, maxVol, startIdx, endIdx } = buildVolumeProfileBins(bars, params);
  if (!bins.length || maxVol <= 0 || startIdx < 0 || endIdx <= startIdx) return { shapes: [] };

  const position = (params.position as string) || 'Справа';
  const displayMode = (params.displayMode as string) || 'Раздельный';
  const widthPerc = Math.max(5, Math.min(80, Number(params.widthPerc) || 25));
  const alpha = Math.max(0.1, Math.min(1, Number(params.alpha) || 0.65));
  const lineAlpha = Math.max(0.1, Math.min(1, Number(params.lineAlpha) || 0.8));
  const buyColor = (params.buyColor as string) || '#16a34a';
  const sellColor = (params.sellColor as string) || '#ef4444';
  const showPoc = params.showPoc === true;
  const pocColor = (params.pocColor as string) || '#f59e0b';
  const showPocLine = params.showPocLine !== false;
  const visibleFromSec = Number(params.__tvVisibleRangeFrom);
  const visibleToSec = Number(params.__tvVisibleRangeTo);
  const hasVisibleRange = Number.isFinite(visibleFromSec) && Number.isFinite(visibleToSec) && visibleToSec > visibleFromSec;

  const profileBars = Math.max(2, Math.round((endIdx - startIdx + 1) * (widthPerc / 100)));
  const anchorStart = position === 'Слева' ? startIdx : Math.max(startIdx, endIdx - profileBars + 1);
  const anchorEnd = position === 'Слева' ? Math.min(endIdx, startIdx + profileBars - 1) : endIdx;
  const baseStartSec = toSec(bars[startIdx].time);
  const baseEndSec = toSec(bars[endIdx].time);
  const avgBarSec = Math.max(1, (baseEndSec - baseStartSec) / Math.max(1, endIdx - startIdx));
  const latestAnchorSec = baseEndSec + avgBarSec * 2;
  const clampedVisibleToSec = hasVisibleRange
    ? (position === 'Слева' ? visibleToSec : Math.min(visibleToSec, latestAnchorSec))
    : 0;
  const effectiveVisibleSpanSec = hasVisibleRange
    ? Math.max(avgBarSec * 2, clampedVisibleToSec - visibleFromSec)
    : 0;
  const profileSpanSec = hasVisibleRange
    ? Math.max(avgBarSec * 2, effectiveVisibleSpanSec * (widthPerc / 100))
    : 0;
  const anchorWindowStartSec = hasVisibleRange
    ? (position === 'Слева'
        ? visibleFromSec
        : Math.max(baseStartSec, clampedVisibleToSec - effectiveVisibleSpanSec))
    : 0;
  const anchorWindowEndSec = hasVisibleRange
    ? (position === 'Слева'
        ? Math.min(visibleToSec, visibleFromSec + effectiveVisibleSpanSec)
        : clampedVisibleToSec)
    : 0;

  const shapes: TVShapeDescriptor[] = [];
  let pocCenter: number | null = null;
  let pocTop: number | null = null;
  let pocBottom: number | null = null;
  let pocSpanStart = hasVisibleRange ? anchorWindowStartSec : anchorStart;
  let pocSpanEnd = hasVisibleRange ? anchorWindowEndSec : anchorEnd;

  for (const bin of bins) {
    if (bin.total <= 0) continue;

    const totalBarsSpan = Math.max(1, Math.round((bin.total / maxVol) * (anchorEnd - anchorStart + 1)));
    const totalEnd = position === 'Слева' ? Math.min(endIdx, anchorStart + totalBarsSpan - 1) : anchorEnd;
    const totalStart = position === 'Слева' ? anchorStart : Math.max(startIdx, anchorEnd - totalBarsSpan + 1);
    const totalSpanSec = hasVisibleRange
      ? Math.max(avgBarSec, (bin.total / maxVol) * profileSpanSec)
      : 0;
    const totalStartSec = hasVisibleRange
      ? (position === 'Слева' ? anchorWindowStartSec : Math.max(anchorWindowStartSec, anchorWindowEndSec - totalSpanSec))
      : 0;
    const totalEndSec = hasVisibleRange
      ? (position === 'Слева' ? Math.min(anchorWindowEndSec, anchorWindowStartSec + totalSpanSec) : anchorWindowEndSec)
      : 0;

    if (displayMode === 'Доминирующий') {
      shapes.push({
        type: 'rectangle',
        points: [
          { time: hasVisibleRange ? totalStartSec : toSec(bars[totalStart].time), price: bin.top },
          { time: hasVisibleRange ? totalEndSec : toSec(bars[totalEnd].time), price: bin.bot },
        ],
        overrides: {
          backgroundColor: hexToRgba(bin.buyVol >= bin.sellVol ? buyColor : sellColor, alpha),
          color: 'rgba(0,0,0,0)',
          linewidth: 0,
          fillBackground: true,
          transparency: 0,
        },
        zOrder: 'top',
      });
    } else {
      const sellBarsSpan = bin.total > 0 ? Math.max(0, Math.round((bin.sellVol / bin.total) * totalBarsSpan)) : 0;
      const buyBarsSpan = Math.max(0, totalBarsSpan - sellBarsSpan);
      const sellSpanSec = hasVisibleRange && bin.total > 0 ? Math.max(0, (bin.sellVol / bin.total) * totalSpanSec) : 0;
      const buySpanSec = hasVisibleRange ? Math.max(0, totalSpanSec - sellSpanSec) : 0;

      if (position === 'Слева') {
        if (buyBarsSpan > 0) {
          const buyEnd = Math.min(endIdx, anchorStart + buyBarsSpan - 1);
          shapes.push({
            type: 'rectangle',
            points: [
              { time: hasVisibleRange ? anchorWindowStartSec : toSec(bars[anchorStart].time), price: bin.top },
              { time: hasVisibleRange ? Math.min(anchorWindowEndSec, anchorWindowStartSec + buySpanSec) : toSec(bars[buyEnd].time), price: bin.bot },
            ],
            overrides: { backgroundColor: hexToRgba(buyColor, alpha), color: 'rgba(0,0,0,0)', linewidth: 0, fillBackground: true, transparency: 0 },
            zOrder: 'top',
          });
        }
        if (sellBarsSpan > 0) {
          const sellStart = Math.min(endIdx, anchorStart + buyBarsSpan);
          const sellEnd = Math.min(endIdx, sellStart + sellBarsSpan - 1);
          if (sellEnd >= sellStart) {
            shapes.push({
              type: 'rectangle',
              points: [
                { time: hasVisibleRange ? Math.min(anchorWindowEndSec, anchorWindowStartSec + buySpanSec) : toSec(bars[sellStart].time), price: bin.top },
                { time: hasVisibleRange ? Math.min(anchorWindowEndSec, anchorWindowStartSec + buySpanSec + sellSpanSec) : toSec(bars[sellEnd].time), price: bin.bot },
              ],
              overrides: { backgroundColor: hexToRgba(sellColor, alpha), color: 'rgba(0,0,0,0)', linewidth: 0, fillBackground: true, transparency: 0 },
              zOrder: 'top',
            });
          }
        }
      } else {
        if (sellBarsSpan > 0) {
          const sellStart = Math.max(startIdx, anchorEnd - sellBarsSpan + 1);
          shapes.push({
            type: 'rectangle',
            points: [
              { time: hasVisibleRange ? Math.max(anchorWindowStartSec, anchorWindowEndSec - sellSpanSec) : toSec(bars[sellStart].time), price: bin.top },
              { time: hasVisibleRange ? anchorWindowEndSec : toSec(bars[anchorEnd].time), price: bin.bot },
            ],
            overrides: { backgroundColor: hexToRgba(sellColor, alpha), color: 'rgba(0,0,0,0)', linewidth: 0, fillBackground: true, transparency: 0 },
            zOrder: 'top',
          });
        }
        if (buyBarsSpan > 0) {
          const buyEnd = Math.max(startIdx, anchorEnd - sellBarsSpan);
          const buyStart = Math.max(startIdx, buyEnd - buyBarsSpan + 1);
          if (buyEnd >= buyStart) {
            shapes.push({
              type: 'rectangle',
              points: [
                { time: hasVisibleRange ? Math.max(anchorWindowStartSec, anchorWindowEndSec - sellSpanSec - buySpanSec) : toSec(bars[buyStart].time), price: bin.top },
                { time: hasVisibleRange ? Math.max(anchorWindowStartSec, anchorWindowEndSec - sellSpanSec) : toSec(bars[buyEnd].time), price: bin.bot },
              ],
              overrides: { backgroundColor: hexToRgba(buyColor, alpha), color: 'rgba(0,0,0,0)', linewidth: 0, fillBackground: true, transparency: 0 },
              zOrder: 'top',
            });
          }
        }
      }
    }

    if (bin.total === maxVol) {
      pocCenter = (bin.top + bin.bot) / 2;
      pocTop = bin.top;
      pocBottom = bin.bot;
      pocSpanStart = hasVisibleRange ? totalStartSec : totalStart;
      pocSpanEnd = hasVisibleRange ? totalEndSec : totalEnd;
    }
  }

  if (showPoc && pocTop != null && pocBottom != null) {
    shapes.push({
      type: 'rectangle',
      points: [
        { time: hasVisibleRange ? pocSpanStart : toSec(bars[pocSpanStart].time), price: pocTop },
        { time: hasVisibleRange ? pocSpanEnd : toSec(bars[pocSpanEnd].time), price: pocBottom },
      ],
      overrides: {
        backgroundColor: 'rgba(0,0,0,0)',
        color: hexToRgba(pocColor, lineAlpha),
        linewidth: 1,
        fillBackground: false,
        transparency: 0,
      },
      zOrder: 'top',
    });
  }

  if (showPocLine && pocCenter != null) {
    shapes.push({
      type: 'trend_line',
      points: [
        { time: hasVisibleRange ? visibleFromSec : toSec(bars[startIdx].time), price: pocCenter },
        { time: hasVisibleRange ? visibleToSec : toSec(bars[endIdx].time), price: pocCenter },
      ],
      overrides: {
        linecolor: hexToRgba(pocColor, lineAlpha),
        linewidth: 1,
        linestyle: 2,
        showLabel: false,
      },
      zOrder: 'top',
    });
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   5. SUPER TREND — ATR trend line + BUY/SELL badges
   ═══════════════════════════════════════════════════════════════ */

export function computeSuperTrend(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  if (bars.length < 3) return { shapes: [] };

  const signalHistoryLimit = 8;
  const renderHistoryBars = Math.min(220, Math.max(100, Number(params.renderHistoryBars) || 220));
  const atrPeriod = Math.max(2, Number(params.atrPeriod) || 10);
  const warmupBars = Math.max(100, atrPeriod * 20);
  const calculationBars = Math.min(bars.length, renderHistoryBars + warmupBars);
  const calculationStartIndex = Math.max(0, bars.length - calculationBars);
  const sourceBars = calculationStartIndex > 0 ? bars.slice(calculationStartIndex) : bars;
  const lastIndex = sourceBars.length - 1;
  const renderStartIndex = Math.max(0, lastIndex - Math.min(renderHistoryBars, sourceBars.length) + 1);
  const multiplier = Number(params.multiplier ?? 3);
  const uiLang = (params.uiLang as string) === 'RU' ? 'RU' : 'EN';
  const showUp = params.showUp !== false;
  const showDown = params.showDown !== false;
  const showLabels = params.showLabels !== false;
  const labelsOnClose = params.labelsOnClose === true;
  const upColor = (params.upColor as string) || '#84cc16';
  const downColor = (params.downColor as string) || '#ef4444';
  const upWidth = Math.max(1, Math.min(6, Number(params.upWidth) || 2));
  const downWidth = Math.max(1, Math.min(6, Number(params.downWidth) || 2));
  const labelTextColor = (params.labelTextColor as string) || '#ffffff';
  const labelOffsetXBars = Math.round((Number(params.labelOffsetX) || 0) / 12);
  const labelOffsetY = Math.max(0, Number(params.labelOffsetY) || 8);
  const buyText = resolveSignalText(params.buyText, uiLang, 'BUY', 'Купить');
  const sellText = resolveSignalText(params.sellText, uiLang, 'SELL', 'Продать');

  const { upLine, downLine, atrValues } = calcSuperTrendLines(sourceBars, atrPeriod, multiplier);
  const shapes: TVShapeDescriptor[] = [];

  function pushSegmentedLine(values: number[], color: string, width: number) {
    let points: Array<{ time: number; price: number }> = [];
    let carryPoint: { time: number; price: number } | null = null;

    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) {
        if (points.length > 1) {
          shapes.push({
            type: 'series_line',
            points,
            overrides: { linecolor: color, linewidth: width, showLabel: false },
            zOrder: 'bottom',
          });
        }
        points = [];
        carryPoint = null;
        continue;
      }

      const point = { time: toSec(sourceBars[i].time), price: values[i] };
      if (i < renderStartIndex) {
        carryPoint = point;
        continue;
      }

      if (points.length === 0 && carryPoint) {
        points.push(carryPoint);
      }

      points.push(point);
    }

    if (points.length > 1) {
      shapes.push({
        type: 'series_line',
        points,
        overrides: { linecolor: color, linewidth: width, showLabel: false },
        zOrder: 'bottom',
      });
    }
  }

  if (showUp) pushSegmentedLine(upLine, upColor, upWidth);
  if (showDown) pushSegmentedLine(downLine, downColor, downWidth);

  const limitIndex = labelsOnClose ? Math.max(1, lastIndex - 1) : lastIndex;
  const signalStartIndex = Math.max(1, renderStartIndex);
  const signalShapes: TVShapeDescriptor[][] = [];

  for (let i = signalStartIndex; i <= limitIndex; i++) {
    const prevBull = Number.isFinite(upLine[i - 1]);
    const currBull = Number.isFinite(upLine[i]);
    const isNewBuy = !prevBull && currBull;
    const isNewSell = prevBull && !currBull;
    const range = Math.max(sourceBars[i].high - sourceBars[i].low, atrValues[i] || 0, 0.0000001);
    const offset = range * (0.35 + labelOffsetY / 20);
    const shiftedIndex = Math.max(0, Math.min(lastIndex, i + labelOffsetXBars));
    const shiftedTime = toSec(sourceBars[shiftedIndex].time);

    if (isNewBuy) {
      const entryShapes: TVShapeDescriptor[] = [{
        type: 'arrow_up',
        singlePoint: true,
        points: [{ time: toSec(sourceBars[i].time), price: sourceBars[i].low }],
        overrides: { color: upColor },
        zOrder: 'top',
      }];

      if (showLabels) {
        entryShapes.push({
          type: 'text',
          singlePoint: true,
          points: [{ time: shiftedTime, price: upLine[i] - offset }],
          text: buyText,
          overrides: {
            color: labelTextColor,
            fontsize: 12,
            bold: true,
            backgroundColor: upColor,
          },
          zOrder: 'top',
        });
      }

      signalShapes.push(entryShapes);
    } else if (isNewSell) {
      const entryShapes: TVShapeDescriptor[] = [{
        type: 'arrow_down',
        singlePoint: true,
        points: [{ time: toSec(sourceBars[i].time), price: sourceBars[i].high }],
        overrides: { color: downColor },
        zOrder: 'top',
      }];

      if (showLabels) {
        entryShapes.push({
          type: 'text',
          singlePoint: true,
          points: [{ time: shiftedTime, price: downLine[i] + offset }],
          text: sellText,
          overrides: {
            color: labelTextColor,
            fontsize: 12,
            bold: true,
            backgroundColor: downColor,
          },
          zOrder: 'top',
        });
      }

      signalShapes.push(entryShapes);
    }
  }

  shapes.push(...signalShapes.slice(-signalHistoryLimit).flat());

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   6. ZIGZAG — ATR pivot polyline + pivot markers
   ═══════════════════════════════════════════════════════════════ */

export function computeZigZag(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const deviation = Math.max(0.5, Number(params.deviation) || 5);
  const lineColor = (params.lineColor as string) || '#2962FF';
  const lineWidth = Math.max(1, Math.min(5, Number(params.lineWidth) || 2));
  const showPivots = params.showPivots !== false;
  const pivotHighColor = (params.pivotHighColor as string) || '#ef4444';
  const pivotLowColor = (params.pivotLowColor as string) || '#22c55e';
  const showLabels = params.showLabels === true;
  const labelSize = Math.max(8, Math.min(16, Number(params.labelSize) || 10));

  const pivots = calcZigZagPivots(bars, deviation);
  if (pivots.length < 2) return { shapes: [] };

  const shapes: TVShapeDescriptor[] = [];
  shapes.push({
    type: 'series_line',
    points: pivots.map((pivot) => ({ time: toSec(bars[pivot.idx].time), price: pivot.price })),
    overrides: { linecolor: lineColor, linewidth: lineWidth, showLabel: false },
    zOrder: 'top',
  });

  if (showPivots || showLabels) {
    for (const pivot of pivots) {
      const color = pivot.type === 'high' ? pivotHighColor : pivotLowColor;
      const price = pivot.price;
      const time = toSec(bars[pivot.idx].time);
      const range = Math.max(bars[pivot.idx].high - bars[pivot.idx].low, 0.0000001);

      if (showPivots) {
        shapes.push({
          type: 'text',
          singlePoint: true,
          points: [{ time, price }],
          text: '●',
          overrides: {
            color,
            fontsize: Math.max(10, labelSize + 4),
            bold: true,
          },
          zOrder: 'top',
        });
      }

      if (showLabels) {
        const offset = range * 0.6;
        shapes.push({
          type: 'text',
          singlePoint: true,
          points: [{ time, price: pivot.type === 'high' ? price + offset : price - offset }],
          text: price.toFixed(price < 1 ? 5 : 4),
          overrides: {
            color,
            fontsize: labelSize,
            bold: false,
          },
          zOrder: 'top',
        });
      }
    }
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   5. ZIGZAG + CHANNELS
   ═══════════════════════════════════════════════════════════════ */

export function computeZigZagChannels(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const length = (params.length as number) || 20;
  const extendToLast = params.extendToLast !== false;
  const showExt = params.showExt !== false;
  const showLabels = params.showLabels !== false;
  const midColor = (params.midColor as string) || '#FF8C00';
  const upColor = (params.upColor as string) || '#F44336';
  const dnColor = (params.dnColor as string) || '#4CAF50';
  const midWidth = (params.midWidth as number) || 2;
  const extWidth = (params.extWidth as number) || 1;
  const maxBarsBack = (params.maxBarsBack as number) || 5000;

  const n = bars.length;
  if (n < length * 2) return { shapes: [] };

  const startIdx = Math.max(0, n - maxBarsBack);
  const closes = bars.map((b) => b.close);

  // Donchian-like oscillator
  const os: number[] = new Array(n).fill(0);
  let curOs = 0;

  for (let i = startIdx + length; i < n; i++) {
    let highest = -Infinity, lowest = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      if (closes[j] > highest) highest = closes[j];
      if (closes[j] < lowest) lowest = closes[j];
    }
    const lagClose = closes[i - length];
    if (lagClose !== undefined) {
      if (lagClose > highest) curOs = 0;
      else if (lagClose < lowest) curOs = 1;
    }
    os[i] = curOs;
  }

  // Detect zigzag events
  interface ZZEvent { type: 'top' | 'btm'; idx: number; price: number }
  const events: ZZEvent[] = [];

  for (let i = startIdx + length + 1; i < n; i++) {
    if (os[i] !== os[i - 1]) {
      const lagIdx = i - length;
      if (lagIdx < 0) continue;
      if (os[i] === 0) {
        // Lag broke above highest → lag bar was a TOP
        events.push({ type: 'top', idx: lagIdx, price: bars[lagIdx].high });
      } else {
        // Lag broke below lowest → lag bar was a BOTTOM
        events.push({ type: 'btm', idx: lagIdx, price: bars[lagIdx].low });
      }
    }
  }

  // Collapse consecutive same-type events (keep extreme)
  const collapsed: ZZEvent[] = [];
  for (const ev of events) {
    if (collapsed.length > 0 && collapsed[collapsed.length - 1].type === ev.type) {
      const last = collapsed[collapsed.length - 1];
      if (ev.type === 'top' && ev.price > last.price) { last.price = ev.price; last.idx = ev.idx; }
      if (ev.type === 'btm' && ev.price < last.price) { last.price = ev.price; last.idx = ev.idx; }
    } else {
      collapsed.push({ ...ev });
    }
  }

  const shapes: TVShapeDescriptor[] = [];

  // Draw zigzag lines and channels
  for (let i = 1; i < collapsed.length; i++) {
    const a = collapsed[i - 1];
    const b = collapsed[i];

    // Zigzag line (mid)
    shapes.push({
      type: 'trend_line',
      points: [
        { time: toSec(bars[a.idx].time), price: a.price },
        { time: toSec(bars[b.idx].time), price: b.price },
      ],
      overrides: { linecolor: midColor, linewidth: midWidth, linestyle: 0, showLabel: false },
    });

    // Channel boundaries
    if (showExt) {
      let maxUp = 0, maxDn = 0;
      for (let j = a.idx; j <= b.idx && j < n; j++) {
        const segLen = b.idx - a.idx;
        if (segLen === 0) continue;
        const t = (j - a.idx) / segLen;
        const midPrice = a.price + t * (b.price - a.price);
        const bodyHi = Math.max(bars[j].open, bars[j].close);
        const bodyLo = Math.min(bars[j].open, bars[j].close);
        const devUp = bodyHi - midPrice;
        const devDn = midPrice - bodyLo;
        if (devUp > maxUp) maxUp = devUp;
        if (devDn > maxDn) maxDn = devDn;
      }

      // Upper channel
      shapes.push({
        type: 'trend_line',
        points: [
          { time: toSec(bars[a.idx].time), price: a.price + maxUp },
          { time: toSec(bars[b.idx].time), price: b.price + maxUp },
        ],
        overrides: { linecolor: upColor, linewidth: extWidth, linestyle: 2, showLabel: false },
      });
      // Lower channel
      shapes.push({
        type: 'trend_line',
        points: [
          { time: toSec(bars[a.idx].time), price: a.price - maxDn },
          { time: toSec(bars[b.idx].time), price: b.price - maxDn },
        ],
        overrides: { linecolor: dnColor, linewidth: extWidth, linestyle: 2, showLabel: false },
      });
    }

    // Price label at pivot
    if (showLabels) {
      const labelText = b.price < 1 ? b.price.toFixed(5) : b.price.toFixed(4);
      const labelColor = b.type === 'btm' ? dnColor : upColor;
      shapes.push({
        type: 'text',
        singlePoint: true,
        points: [{ time: toSec(bars[b.idx].time), price: b.price }],
        overrides: { color: labelColor, fontsize: 10, bold: false },
        text: labelText,
      });
    }
  }

  // Extend to last bar
  if (extendToLast && collapsed.length >= 2) {
    const last = collapsed[collapsed.length - 1];
    const lastBar = bars[n - 1];

    if (last.idx < n - 1) {
      const endPrice = lastBar.close;

      // Main zigzag extension line
      shapes.push({
        type: 'trend_line',
        points: [
          { time: toSec(bars[last.idx].time), price: last.price },
          { time: toSec(lastBar.time), price: endPrice },
        ],
        overrides: { linecolor: midColor, linewidth: midWidth, linestyle: 0, showLabel: false },
      });

      // Channel boundaries for extension
      if (showExt) {
        let maxUp = 0, maxDn = 0;
        const segLen = (n - 1) - last.idx;
        for (let j = last.idx; j < n; j++) {
          if (segLen === 0) continue;
          const t = (j - last.idx) / segLen;
          const midPrice = last.price + t * (endPrice - last.price);
          const bodyHi = Math.max(bars[j].open, bars[j].close);
          const bodyLo = Math.min(bars[j].open, bars[j].close);
          const devUp = bodyHi - midPrice;
          const devDn = midPrice - bodyLo;
          if (devUp > maxUp) maxUp = devUp;
          if (devDn > maxDn) maxDn = devDn;
        }
        shapes.push({
          type: 'trend_line',
          points: [
            { time: toSec(bars[last.idx].time), price: last.price + maxUp },
            { time: toSec(lastBar.time), price: endPrice + maxUp },
          ],
          overrides: { linecolor: upColor, linewidth: extWidth, linestyle: 2, showLabel: false },
        });
        shapes.push({
          type: 'trend_line',
          points: [
            { time: toSec(bars[last.idx].time), price: last.price - maxDn },
            { time: toSec(lastBar.time), price: endPrice - maxDn },
          ],
          overrides: { linecolor: dnColor, linewidth: extWidth, linestyle: 2, showLabel: false },
        });
      }
    }
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   6. REGRESSION CHANNEL — Linear regression with deviation bands
   ═══════════════════════════════════════════════════════════════ */

export function computeRegressionChannel(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const length = (params.length as number) || 100;
  const source = (params.source as string) || 'close';
  const useUpperDev = params.useUpperDev !== false;
  const upperMult = (params.upperMult as number) ?? 2.0;
  const useLowerDev = params.useLowerDev !== false;
  const lowerMult = (params.lowerMult as number) ?? 2.0;
  const extendLeft = params.extendLeft === true;
  const extendRight = params.extendRight !== false;
  const colorUpper = (params.colorUpper as string) || '#3b82f6';
  const colorLower = (params.colorLower as string) || '#ef4444';
  const colorBase = (params.colorBase as string) || '#808080';
  const lineWidth = (params.lineWidth as number) || 2;

  console.log(`[RegressionChannel] Called with ${bars.length} bars, length=${length}`);

  if (bars.length < length) return { shapes: [] };

  // Get source values
  const sources: number[] = bars.map((b) => {
    if (source === 'open') return b.open;
    if (source === 'high') return b.high;
    if (source === 'low') return b.low;
    if (source === 'hl2') return (b.high + b.low) / 2;
    if (source === 'hlc3') return (b.high + b.low + b.close) / 3;
    if (source === 'ohlc4') return (b.open + b.high + b.low + b.close) / 4;
    return b.close;
  });

  // Calculate linear regression
  const n = length;
  let sumX = 0, sumY = 0, sumXSqr = 0, sumXY = 0;

  for (let i = 0; i < n; i++) {
    const val = sources[sources.length - n + i];
    const per = i + 1;
    sumX += per;
    sumY += val;
    sumXSqr += per * per;
    sumXY += val * per;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXSqr - sumX * sumX);
  const average = sumY / n;
  const intercept = average - (slope * sumX) / n + slope;

  // Calculate deviations
  let upDev = 0, dnDev = 0, stdDevAcc = 0;
  let dsxx = 0, dsyy = 0, dsxy = 0;
  const calcPeriods = n - 1;
  const daY = intercept + (slope * calcPeriods) / 2;
  let val = intercept;

  for (let j = 0; j < n; j++) {
    const idx = bars.length - n + j;
    const bar = bars[idx];
    const sourceVal = sources[idx];

    // High/low deviation
    let price = bar.high - val;
    if (price > upDev) upDev = price;
    price = val - bar.low;
    if (price > dnDev) dnDev = price;

    // Standard deviation
    const dxt = sourceVal - average;
    const dyt = val - daY;
    price = sourceVal - val;
    stdDevAcc += price * price;
    dsxx += dxt * dxt;
    dsyy += dyt * dyt;
    dsxy += dxt * dyt;

    val += slope;
  }

  const stdDev = Math.sqrt(stdDevAcc / (calcPeriods === 0 ? 1 : calcPeriods));

  // Calculate channel boundaries
  const startPrice = intercept + slope * (n - 1);
  const endPrice = intercept;

  const upperStartPrice = startPrice + (useUpperDev ? upperMult * stdDev : upDev);
  const upperEndPrice = endPrice + (useUpperDev ? upperMult * stdDev : upDev);
  const lowerStartPrice = startPrice + (useLowerDev ? -lowerMult * stdDev : -dnDev);
  const lowerEndPrice = endPrice + (useLowerDev ? -lowerMult * stdDev : -dnDev);

  const shapes: TVShapeDescriptor[] = [];
  const startIdx = bars.length - length;
  const endIdx = bars.length - 1;

  // Upper line
  shapes.push({
    type: 'trend_line',
    points: [
      { time: toSec(bars[extendLeft ? 0 : startIdx].time), price: upperStartPrice },
      { time: toSec(bars[extendRight ? endIdx : endIdx].time), price: upperEndPrice },
    ],
    overrides: {
      linecolor: colorUpper,
      linewidth: lineWidth,
      linestyle: 0, // solid
      showLabel: false,
      extendLeft: extendLeft,
      extendRight: extendRight,
    },
  });

  // Base line (dotted)
  shapes.push({
    type: 'trend_line',
    points: [
      { time: toSec(bars[extendLeft ? 0 : startIdx].time), price: startPrice },
      { time: toSec(bars[extendRight ? endIdx : endIdx].time), price: endPrice },
    ],
    overrides: {
      linecolor: colorBase,
      linewidth: Math.max(1, lineWidth - 1),
      linestyle: 2, // dotted
      showLabel: false,
      extendLeft: extendLeft,
      extendRight: extendRight,
    },
  });

  // Lower line
  shapes.push({
    type: 'trend_line',
    points: [
      { time: toSec(bars[extendLeft ? 0 : startIdx].time), price: lowerStartPrice },
      { time: toSec(bars[extendRight ? endIdx : endIdx].time), price: lowerEndPrice },
    ],
    overrides: {
      linecolor: colorLower,
      linewidth: lineWidth,
      linestyle: 0, // solid
      showLabel: false,
      extendLeft: extendLeft,
      extendRight: extendRight,
    },
  });

  console.log(`[RegressionChannel] Returning ${shapes.length} shapes`);

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   7. RSI ZONES — overlay computation (uses TV custom study instead,
      but included here for completeness / fallback)
   ═══════════════════════════════════════════════════════════════ */

// RSI is implemented as a proper TradingView custom study (see TVChart.tsx)
// This function is not used directly but kept for reference.
export function computeRSI(bars: OHLCVBar[], params: Record<string, unknown>): number[] {
  const period = (params.period as number) || 14;
  const closes = bars.map((b) => b.close);
  return rsi(closes, period);
}

/* ─── Utility ─── */

/* ═══════════════════════════════════════════════════════════════
   8. SR ZONES PRO — adaptive S/R zones with volume delta + pivot + role flip
   ═══════════════════════════════════════════════════════════════ */

export function computeSRZones(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  const lookbackPeriod = (params.lookbackPeriod as number) || 10;
  const volLen = (params.volLen as number) || 2;
  const boxWidth = (params.boxWidth as number) ?? 1.0;
  const activeAlpha = (params.activeAlpha as number) ?? 0.45;
  const idleAlpha = (params.idleAlpha as number) ?? 0.20;
  const maxZones = (params.maxZones as number) || 50;
  const showLabels = params.showLabels !== false;
  const buyColor = (params.buyColor as string) || '#26a69a';
  const sellColor = (params.sellColor as string) || '#ef5350';

  const N = bars.length;
  const L = Math.max(3, lookbackPeriod);
  if (N < 2 * L + 2) return { shapes: [] };

  const endIdx = N - 1;

  // ATR(200)
  const atrVals = atr(bars, 200);

  // Volume delta: close > open → +vol, else → −vol
  // Fallback to body size when volume is unavailable
  const volDelta: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const b = bars[i];
    const vol = b.volume || Math.abs(b.close - b.open) || 1;
    volDelta[i] = b.close > b.open ? vol : -vol;
  }

  // Scaled vol = volDelta / 2.5, then highest / lowest over volLen
  const scaled: number[] = volDelta.map(v => v / 2.5);

  function highestArr(arr: number[], period: number): number[] {
    const out = new Array(arr.length).fill(NaN);
    for (let i = period - 1; i < arr.length; i++) {
      let mx = -Infinity;
      for (let k = i - period + 1; k <= i; k++) if (arr[k] > mx) mx = arr[k];
      out[i] = mx;
    }
    return out;
  }

  function lowestArr(arr: number[], period: number): number[] {
    const out = new Array(arr.length).fill(NaN);
    for (let i = period - 1; i < arr.length; i++) {
      let mn = Infinity;
      for (let k = i - period + 1; k <= i; k++) if (arr[k] < mn) mn = arr[k];
      out[i] = mn;
    }
    return out;
  }

  const volHi = highestArr(scaled, Math.max(1, volLen));
  const volLo = lowestArr(scaled, Math.max(1, volLen));

  // Pivot detection using close price (matching PineScript ta.pivothigh/low with close)
  function isPivotHigh(idx: number): boolean {
    if (idx - L < 0 || idx + L >= N) return false;
    const v = bars[idx].close;
    for (let k = 1; k <= L; k++) { if (bars[idx - k].close >= v) return false; }
    for (let k = 1; k <= L; k++) { if (bars[idx + k].close > v) return false; }
    return true;
  }

  function isPivotLow(idx: number): boolean {
    if (idx - L < 0 || idx + L >= N) return false;
    const v = bars[idx].close;
    for (let k = 1; k <= L; k++) { if (bars[idx - k].close <= v) return false; }
    for (let k = 1; k <= L; k++) { if (bars[idx + k].close < v) return false; }
    return true;
  }

  // Detect zones: pivot confirmed at bar j, pivot is at j - L
  interface SRZone {
    type: 'buy' | 'sell';
    top: number;
    bot: number;
    startIdx: number;
    confirmIdx: number;
    endIdx: number;
    isBuyRole: boolean;
  }

  const buyZones: SRZone[] = [];
  const sellZones: SRZone[] = [];

  for (let j = 2 * L; j < N; j++) {
    const pivotIdx = j - L;

    // Pivot low → BUY zone
    if (isPivotLow(pivotIdx)) {
      if (!isNaN(volHi[j]) && volDelta[j] > volHi[j]) {
        const curAtr = atrVals[j] || atrVals[endIdx] || 1;
        const top = bars[pivotIdx].close;
        const bot = top - curAtr * boxWidth;
        buyZones.push({
          type: 'buy', top, bot,
          startIdx: Math.max(0, pivotIdx - L),
          confirmIdx: j, endIdx: -1,
          isBuyRole: true,
        });
      }
    }

    // Pivot high → SELL zone
    if (isPivotHigh(pivotIdx)) {
      if (!isNaN(volLo[j]) && volDelta[j] < volLo[j]) {
        const curAtr = atrVals[j] || atrVals[endIdx] || 1;
        const bot = bars[pivotIdx].close;
        const top = bot + curAtr * boxWidth;
        sellZones.push({
          type: 'sell', top, bot,
          startIdx: Math.max(0, pivotIdx - L),
          confirmIdx: j, endIdx: -1,
          isBuyRole: false,
        });
      }
    }
  }

  // Each zone extends until the next zone of same type (or to endIdx for the latest)
  for (let i = 0; i < buyZones.length; i++) {
    buyZones[i].endIdx = i < buyZones.length - 1 ? buyZones[i + 1].confirmIdx : endIdx;
  }
  for (let i = 0; i < sellZones.length; i++) {
    sellZones[i].endIdx = i < sellZones.length - 1 ? sellZones[i + 1].confirmIdx : endIdx;
  }

  // Role switching: 2-candle breakout flips zone role (buy ↔ sell)
  function processBreakouts(zones: SRZone[]) {
    for (const z of zones) {
      for (let i = z.confirmIdx + 1; i <= z.endIdx && i < N; i++) {
        if (i < 1) continue;
        const c0 = bars[i].close;
        const c1 = bars[i - 1].close;

        if (z.isBuyRole && c0 < z.bot && c1 < z.bot) {
          z.isBuyRole = false;
        } else if (!z.isBuyRole && c0 > z.top && c1 > z.top) {
          z.isBuyRole = true;
        }
      }
    }
  }

  processBreakouts(buyZones);
  processBreakouts(sellZones);

  // Merge, limit, build shapes
  const allZones = [...buyZones, ...sellZones]
    .sort((a, b) => a.confirmIdx - b.confirmIdx)
    .slice(-Math.max(1, maxZones));

  const lastClose = bars[endIdx].close;
  const shapes: TVShapeDescriptor[] = [];

  for (const z of allZones) {
    const priceInZone = lastClose >= z.bot && lastClose <= z.top && z.endIdx === endIdx;
    const alpha = priceInZone ? activeAlpha : idleAlpha;
    const color = z.isBuyRole ? buyColor : sellColor;
    const label = z.isBuyRole ? '🟢 BUY ZONE' : '🔴 SELL ZONE';

    shapes.push({
      type: 'rectangle',
      points: [
        { time: toSec(bars[z.startIdx].time), price: z.top },
        { time: toSec(bars[Math.min(z.endIdx, endIdx)].time), price: z.bot },
      ],
      overrides: {
        backgroundColor: hexToRgba(color, alpha),
        color,
        linewidth: (params.showBorder !== false) ? ((params.borderWidth as number) || 1) : 0,
        transparency: 0,
        fillBackground: true,
        showLabel: showLabels,
        textcolor: '#ffffff',
        fontsize: 11,
        bold: true,
      },
      zOrder: 'bottom',
      text: showLabels ? label : '',
    });
  }

  return { shapes };
}

/* ═══════════════════════════════════════════════════════════════
   9. SAR WAVE SIGNALS — SAR pivot waves + labels + buy/sell icons
   ═══════════════════════════════════════════════════════════════ */

export function computeSARWaveSignals(bars: OHLCVBar[], params: Record<string, unknown>): OverlayResult {
  if (bars.length < 5) return { shapes: [] };

  const start = 0.01;
  const increment = 0.01;
  const max = 0.1;
  const showSignals = params.showSignals !== false;
  const showZigzag = params.showZigzag !== false;
  const bullColor = (params.bullColor as string) || '#26a69a';
  const bearColor = (params.bearColor as string) || '#ef5350';

  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const closes = bars.map((bar) => bar.close);
  const sarArr = sar(bars, start, increment, max);

  const pivots: Array<{ i: number; price: number }> = [];
  for (let i = 1; i < bars.length; i++) {
    const out = sarArr[i];
    const prevOut = sarArr[i - 1];
    if (!Number.isFinite(out) || !Number.isFinite(prevOut)) continue;

    const x = out === closes[i] ? prevOut - closes[i - 1] : out - closes[i];
    const prevX = prevOut - closes[i - 1];

    const crossedDown = prevX > 0 && x < 0;
    const crossedUp = prevX < 0 && x > 0;

    if (!crossedDown && !crossedUp) continue;

    const price = crossedDown
      ? (lows[i] + out) / 2
      : (highs[i] + out) / 2;

    if (Number.isFinite(price)) {
      pivots.push({ i, price });
    }
  }

  const maxShapes = 500;
  const shapes: TVShapeDescriptor[] = [];

  for (let k = 4; k < pivots.length; k++) {
    const p4 = pivots[k];
    const p3 = pivots[k - 1];
    const isUp = p4.price > p3.price;
    const time = toSec(bars[p4.i].time);
    const basePrice = p4.price;
    const waveIndex = (k % 5) + 1;

    shapes.push({
      type: 'text',
      singlePoint: true,
      points: [{ time, price: basePrice }],
      text: `(${waveIndex})`,
      overrides: {
        color: '#ffffff',
        fontsize: 12,
        bold: true,
        backgroundColor: isUp ? bullColor : bearColor,
      },
      zOrder: 'top',
    });

    const offset = (highs[p4.i] - lows[p4.i]) * 0.4;

    if (showSignals && isUp) {
      shapes.push({
        type: 'text',
        singlePoint: true,
        points: [{ time, price: basePrice + offset }],
        text: '🐻',
        overrides: {
          color: bearColor,
          fontsize: 30,
          bold: true,
        },
        zOrder: 'top',
      });
    }

    if (showSignals && !isUp) {
      shapes.push({
        type: 'text',
        singlePoint: true,
        points: [{ time, price: basePrice - offset }],
        text: '🐂',
        overrides: {
          color: bullColor,
          fontsize: 30,
          bold: true,
        },
        zOrder: 'top',
      });
    }

    if (shapes.length > maxShapes) break;
  }

  if (showZigzag) {
    for (let k = 1; k < pivots.length; k++) {
      const from = pivots[k - 1];
      const to = pivots[k];

      shapes.push({
        type: 'trend_line',
        points: [
          { time: toSec(bars[from.i].time), price: from.price },
          { time: toSec(bars[to.i].time), price: to.price },
        ],
        overrides: {
          linecolor: to.price > from.price ? bullColor : bearColor,
          linewidth: 2,
          showLabel: false,
          showPrice: false,
          showBarsRange: false,
          showDateTimeRange: false,
          showDistance: false,
          showPercentPriceRange: false,
          extendLeft: false,
          extendRight: false,
        },
        zOrder: 'top',
      });

      if (shapes.length > maxShapes) break;
    }
  }

  return { shapes: shapes.slice(0, maxShapes) };
}

function hexToRgba(hex: string, alpha: number): string {
  // If already rgba/rgb, return as-is
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ═══════════════════════════════════════════════════════════════
   COMPUTE DISPATCHER — maps indicator key → compute function
   ═══════════════════════════════════════════════════════════════ */

export const OVERLAY_COMPUTE: Record<string, (bars: OHLCVBar[], params: Record<string, unknown>) => OverlayResult> = {
  rangeDetector: computeRangeDetector,
  orderBlocks: computeOrderBlocks,
  adaptiveTrend: computeAdaptiveTrend,
  imbalanceSignals: computeImbalanceSignals,
  imbalanceSuite: computeImbalanceSuite,
  streakHunter: computeStreakHunter,
  superTrend: computeSuperTrend,
  zigzag: computeZigZag,
  zigzagChannels: computeZigZagChannels,
  regressionChannel: computeRegressionChannel,
  srZones: computeSRZones,
  sarWaveSignals: computeSARWaveSignals,
  // rsiZones is handled as a TV custom study, not overlay shapes
};
