/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

export const meta = {
  name: "Adaptive Trend Finder",
  defaultParams: {
    showShort: true,
    colorShort: "#808080",
    showLong: false,
    colorLong: "#808080",
    showPrev: true,  // ← показываем предыдущий канал
    colorPrev: "#505050",
    showMidline: true,  // ← показываем среднюю линию
    colorMid: "#808080",
    devMultiplier: 2.0,
    useLog: false,
    lineWidth: 2,
    lineStyle: "Solid",
    autoColor: true,
  },
  paramMeta: {
    showShort:     { label: "Short Channel (20-200)", type: "boolean" as const },
    colorShort:    { label: "Short Color", type: "color" as const },
    showLong:      { label: "Long Channel (300-1200)", type: "boolean" as const },
    colorLong:     { label: "Long Color", type: "color" as const },
    showPrev:      { label: "Show Previous Channel", type: "boolean" as const },
    colorPrev:     { label: "Previous Channel Color", type: "color" as const },
    showMidline:   { label: "Show Midline", type: "boolean" as const },
    colorMid:      { label: "Midline Color", type: "color" as const },
    devMultiplier: { label: "Deviation Mult", type: "number" as const, min: 0.1, max: 5, step: 0.1 },
    useLog:        { label: "Log Scale", type: "boolean" as const },
    lineWidth:     { label: "Line Width", type: "number" as const, min: 1, max: 5 },
    lineStyle:     { label: "Line Style", type: "select" as const, options: ["Solid", "Dashed", "Dotted"] },
    autoColor:     { label: "Auto Color (Strong Trend)", type: "boolean" as const },
  },
};

interface ATFContext {
  chart: IChartApi;
  params: typeof meta.defaultParams;
  LineSeries: any;
}

export function init(ctx: ATFContext) {
  const { chart, params, LineSeries } = ctx;

  const series: Record<string, any> = {
    shortUp: null, shortDn: null, shortMid: null,
    shortPrevUp: null, shortPrevDn: null,
    longUp: null, longDn: null, longMid: null,
    longPrevUp: null, longPrevDn: null,
  };

  const STYLE: Record<string, number> = { Solid: 0, Dotted: 1, Dashed: 2 };

  function ensureSeries(key: string, color: string, styleStr: string, width: number) {
    let s = series[key];
    const style = STYLE[styleStr] || 0;
    const base = {
      color,
      lineWidth: width || 2,
      lineStyle: style,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => null,
    };
    if (!s) {
      s = chart.addSeries(LineSeries, base);
      series[key] = s;
    } else {
      s.applyOptions(base);
    }
    return s;
  }

  function clearSeries(keys: string[]) {
    for (const k of keys) {
      const s = series[k];
      if (s) { chart.removeSeries(s); series[k] = null; }
    }
  }

  function clearAll() { clearSeries(Object.keys(series)); }

  /* --- Math Helpers --- */
  const RMA = (arr: number[], len: number): (number | null)[] => {
    if (arr.length < len) return new Array(arr.length).fill(null);
    const alpha = 1 / len;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += arr[i];
    let val = sum / len;
    const out: (number | null)[] = new Array(arr.length).fill(null);
    out[len - 1] = val;
    for (let i = len; i < arr.length; i++) {
      val = alpha * arr[i] + (1 - alpha) * val;
      out[i] = val;
    }
    return out;
  };

  const calcDev = (src: number[], len: number, isLog: boolean, endIndex: number) => {
    if (endIndex < len - 1 || endIndex >= src.length) return null;
    const startIdx = endIndex - len + 1;
    const base: number[] = [];
    for (let i = 0; i < len; i++) {
      let v = src[startIdx + i];
      if (isLog) { if (v <= 0) v = 0.00001; v = Math.log(v); }
      base.push(v);
    }
    let sumX = 0, sumXX = 0, sumYX = 0, sumY = 0;
    for (let i = 1; i <= len; i++) {
      const val = base[i - 1];
      sumX += i; sumXX += i * i; sumYX += i * val; sumY += val;
    }
    const slope = (len * sumYX - sumX * sumY) / (len * sumXX - sumX * sumX);
    const avg = sumY / len;
    const intercept = avg - slope * sumX / len + slope;
    const n1 = len - 1;
    const regMid = intercept + slope * n1 * 0.5;
    let lineV = intercept;
    let sumDxx = 0, sumDyy = 0, sumDyx = 0, sumDev = 0;
    for (let i = 0; i <= n1; i++) {
      const v = base[i];
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
    const unStdDev = Math.sqrt(sumDev / df);
    const divisor = sumDxx * sumDyy;
    const r = divisor > 0 ? (sumDyx / Math.sqrt(divisor)) : 0;
    return { stdDev: unStdDev, r, slope, intercept };
  };

  const calcAdx = (high: number[], low: number[], close: number[], diLen: number, adxLen: number) => {
    const n = close.length;
    if (n < diLen + adxLen) return 0;
    const tr = [0], plus = [0], minus = [0];
    for (let i = 1; i < n; i++) {
      const h = high[i], l = low[i], prevC = close[i - 1];
      const up = h - high[i - 1], down = low[i - 1] - l;
      tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
      plus.push(up > down && up > 0 ? up : 0);
      minus.push(down > up && down > 0 ? down : 0);
    }
    const trRMA = RMA(tr, diLen);
    const plusRMA = RMA(plus, diLen);
    const minusRMA = RMA(minus, diLen);
    const dx: number[] = [];
    for (let i = 0; i < n; i++) {
      const v1 = (trRMA[i] as number) || 1;
      const diPlus = 100 * ((plusRMA[i] as number) || 0) / v1;
      const diMinus = 100 * ((minusRMA[i] as number) || 0) / v1;
      const sum = diPlus + diMinus;
      dx.push(sum === 0 ? 0 : 100 * Math.abs(diPlus - diMinus) / sum);
    }
    const adxArr = RMA(dx, adxLen);
    return (adxArr[n - 1] as number) || 0;
  };

  const getAdxParamsShort = (p: number): [number, number] => {
    if (p <= 40) return [7, 5];
    if (p <= 60) return [10, 7];
    if (p <= 90) return [14, 7];
    if (p <= 130) return [20, 10];
    if (p <= 165) return [24, 12];
    return [28, 14];
  };

  const getAdxParamsLong = (p: number): [number, number] => {
    if (p <= 450) return [28, 14];
    if (p <= 700) return [35, 17];
    if (p <= 950) return [42, 21];
    return [50, 25];
  };

  function isValidPoint(p: number) { return Number.isFinite(p) && p > 0.0000001; }

  function getLinePoints(candles: CandlestickData<Time>[], data: any, len: number, isLog: boolean, devMult: number, type: string, anchorTime?: Time) {
    let endIndex: number;
    if (anchorTime) {
      endIndex = candles.findIndex((c) => c.time === anchorTime);
      if (endIndex === -1) return null;
    } else {
      endIndex = candles.length - 1;
    }
    if (endIndex < len - 1) return null;
    const t1 = candles[endIndex - len + 1].time;
    const t2 = candles[endIndex].time;
    let valStart_Base = data.intercept;
    let valEnd_Base = data.intercept + data.slope * (len - 1);
    const dev = data.stdDev * devMult;
    let valStart: number, valEnd: number;
    if (isLog) {
      const baseS = Math.exp(valStart_Base);
      const baseE = Math.exp(valEnd_Base);
      if (type === 'up') { valStart = baseS * Math.exp(dev); valEnd = baseE * Math.exp(dev); }
      else if (type === 'dn') { valStart = baseS / Math.exp(dev); valEnd = baseE / Math.exp(dev); }
      else { valStart = baseS; valEnd = baseE; }
    } else {
      if (type === 'up') { valStart = valStart_Base + dev; valEnd = valEnd_Base + dev; }
      else if (type === 'dn') { valStart = valStart_Base - dev; valEnd = valEnd_Base - dev; }
      else { valStart = valStart_Base; valEnd = valEnd_Base; }
    }
    if (!isValidPoint(valStart) || !isValidPoint(valEnd)) return null;
    return [{ time: t1, value: valStart }, { time: t2, value: valEnd }];
  }

  function findBestChannel(candles: CandlestickData<Time>[], close: number[], atIndex: number, minLen: number, maxLen: number, step: number) {
    let best: any = null;
    let maxR = -1;
    for (let p = minLen; p <= maxLen; p += step) {
      const res = calcDev(close, p, params.useLog, atIndex);
      if (res && res.r !== null && Math.abs(res.r) > maxR) {
        maxR = Math.abs(res.r);
        best = { ...res, len: p, pearson: res.r, endTime: candles[atIndex].time };
      }
    }
    return best;
  }

  function findPreviousChannel(candles: CandlestickData<Time>[], close: number[], currentIndex: number, currentSlope: number, minLen: number, maxLen: number, step: number) {
    const searchStep = 5;
    const maxLookback = Math.min(currentIndex, 500);
    for (let i = currentIndex - searchStep; i > currentIndex - maxLookback; i -= searchStep) {
      const candidate = findBestChannel(candles, close, i, minLen, maxLen, step);
      if (candidate) {
        const isDifferentTrend = Math.sign(candidate.slope) !== Math.sign(currentSlope);
        const isStrongEnough = Math.abs(candidate.pearson) > 0.3;
        if (isDifferentTrend && isStrongEnough) return candidate;
      }
    }
    return null;
  }

  function update(candles: CandlestickData<Time>[]) {
    const N = candles.length;
    if (N < 50) { clearAll(); return; }
    const endIdx = N - 1;
    const close = candles.map((c) => c.close);
    const high = candles.map((c) => c.high);
    const low = candles.map((c) => c.low);

    // Short Channel
    let bestS: any = null, prevS: any = null;
    if (params.showShort) {
      bestS = findBestChannel(candles, close, endIdx, 20, Math.min(200, N), 10);
      if (bestS && params.showPrev) {
        prevS = findPreviousChannel(candles, close, endIdx, bestS.slope, 20, Math.min(200, N), 10);
      }
    }

    // Long Channel
    let bestL: any = null, prevL: any = null;
    if (params.showLong) {
      bestL = findBestChannel(candles, close, endIdx, 300, Math.min(1200, N), 50);
      if (bestL && params.showPrev) {
        prevL = findPreviousChannel(candles, close, endIdx, bestL.slope, 300, Math.min(1200, N), 50);
      }
    }

    // Draw Short
    if (bestS) {
      const [diLen, adxLen] = getAdxParamsShort(bestS.len);
      const adxVal = calcAdx(high, low, close, diLen, adxLen);
      let col = params.colorShort;
      if (params.autoColor && adxVal >= 25 && Math.abs(bestS.pearson) >= 0.9) {
        col = bestS.slope > 0 ? "#10b981" : "#ef4444";
      }
      const ptsUp = getLinePoints(candles, bestS, bestS.len, params.useLog, params.devMultiplier, 'up');
      const ptsDn = getLinePoints(candles, bestS, bestS.len, params.useLog, params.devMultiplier, 'dn');
      const ptsMd = getLinePoints(candles, bestS, bestS.len, params.useLog, params.devMultiplier, 'mid');
      if (ptsUp) ensureSeries("shortUp", col, params.lineStyle, params.lineWidth).setData(ptsUp);
      if (ptsDn) ensureSeries("shortDn", col, params.lineStyle, params.lineWidth).setData(ptsDn);
      if (params.showMidline && ptsMd) ensureSeries("shortMid", params.colorMid, "Dotted", 1).setData(ptsMd);
      else clearSeries(["shortMid"]);
      if (prevS) {
        const ptsPrevUp = getLinePoints(candles, prevS, prevS.len, params.useLog, params.devMultiplier, 'up', prevS.endTime);
        const ptsPrevDn = getLinePoints(candles, prevS, prevS.len, params.useLog, params.devMultiplier, 'dn', prevS.endTime);
        if (ptsPrevUp) ensureSeries("shortPrevUp", params.colorPrev, "Dashed", 1).setData(ptsPrevUp);
        if (ptsPrevDn) ensureSeries("shortPrevDn", params.colorPrev, "Dashed", 1).setData(ptsPrevDn);
      } else { clearSeries(["shortPrevUp", "shortPrevDn"]); }
    } else { clearSeries(["shortUp", "shortDn", "shortMid", "shortPrevUp", "shortPrevDn"]); }

    // Draw Long
    if (bestL) {
      const [diLen, adxLen] = getAdxParamsLong(bestL.len);
      const adxVal = calcAdx(high, low, close, diLen, adxLen);
      let col = params.colorLong;
      if (params.autoColor && adxVal >= 25 && Math.abs(bestL.pearson) >= 0.9) {
        col = bestL.slope > 0 ? "#10b981" : "#ef4444";
      }
      const ptsUp = getLinePoints(candles, bestL, bestL.len, params.useLog, params.devMultiplier, 'up');
      const ptsDn = getLinePoints(candles, bestL, bestL.len, params.useLog, params.devMultiplier, 'dn');
      const ptsMd = getLinePoints(candles, bestL, bestL.len, params.useLog, params.devMultiplier, 'mid');
      if (ptsUp) ensureSeries("longUp", col, params.lineStyle, params.lineWidth).setData(ptsUp);
      if (ptsDn) ensureSeries("longDn", col, params.lineStyle, params.lineWidth).setData(ptsDn);
      if (params.showMidline && ptsMd) ensureSeries("longMid", params.colorMid, "Dotted", 1).setData(ptsMd);
      else clearSeries(["longMid"]);
      if (prevL) {
        const ptsPrevUp = getLinePoints(candles, prevL, prevL.len, params.useLog, params.devMultiplier, 'up', prevL.endTime);
        const ptsPrevDn = getLinePoints(candles, prevL, prevL.len, params.useLog, params.devMultiplier, 'dn', prevL.endTime);
        if (ptsPrevUp) ensureSeries("longPrevUp", params.colorPrev, "Dashed", 1).setData(ptsPrevUp);
        if (ptsPrevDn) ensureSeries("longPrevDn", params.colorPrev, "Dashed", 1).setData(ptsPrevDn);
      } else { clearSeries(["longPrevUp", "longPrevDn"]); }
    } else { clearSeries(["longUp", "longDn", "longMid", "longPrevUp", "longPrevDn"]); }
  }

  function destroy() { clearAll(); }

  return { update, destroy };
}
