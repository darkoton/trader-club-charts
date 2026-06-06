/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time, IChartApi, ISeriesApi } from 'lightweight-charts';

export const meta = {
  name: "Regression Channel",
  defaultParams: {
    length: 100,
    source: "close" as "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4",
    
    useUpperDev: true,
    upperMult: 2.0,
    useLowerDev: true,
    lowerMult: 2.0,
    
    extendLeft: false,
    extendRight: true,
    showPearson: true,
    
    colorUpper: "#3b82f680",
    colorLower: "#ef444480",
    colorBase: "#808080",
    lineWidth: 2,
    
    // Channel alerts
    alertChannelEntry: true,
    alertChannelExit: true,
    lookbackPeriod: 5,
    showSignals: true,
  },
  paramMeta: {
    length:      { label: "Длина LinReg", type: "number" as const, min: 1, max: 500 },
    source:      { label: "Источник", type: "select" as const, options: ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"] },
    
    useUpperDev: { label: "Верхнее отклонение", type: "boolean" as const },
    upperMult:   { label: "Множитель верхнего", type: "number" as const, min: 0.1, max: 10, step: 0.1 },
    useLowerDev: { label: "Нижнее отклонение", type: "boolean" as const },
    lowerMult:   { label: "Множитель нижнего", type: "number" as const, min: 0.1, max: 10, step: 0.1 },
    
    extendLeft:  { label: "Продлить влево", type: "boolean" as const },
    extendRight: { label: "Продлить вправо", type: "boolean" as const },
    showPearson: { label: "Показывать R Пирсона", type: "boolean" as const },
    
    colorUpper:  { label: "Цвет верхней линии", type: "color" as const },
    colorLower:  { label: "Цвет нижней линии", type: "color" as const },
    colorBase:   { label: "Цвет базовой линии", type: "color" as const },
    lineWidth:   { label: "Толщина линии", type: "number" as const, min: 1, max: 5 },
    
    alertChannelEntry: { label: "Алерт входа", type: "boolean" as const },
    alertChannelExit:  { label: "Алерт выхода", type: "boolean" as const },
    lookbackPeriod:    { label: "Период ретроспективы", type: "number" as const, min: 1, max: 20 },
    showSignals:       { label: "Показывать сигналы", type: "boolean" as const },
  },
};

interface RegressionChannelContext {
  chart: IChartApi;
  candleSeries: ISeriesApi<any>;
  params: typeof meta.defaultParams;
  LineSeries: any;
  createSeriesMarkers: any;
}

export function init(ctx: RegressionChannelContext) {
  const { chart, params, LineSeries, createSeriesMarkers } = ctx;
  
  let upperSeries: ISeriesApi<any> | null = null;
  let lowerSeries: ISeriesApi<any> | null = null;
  let baseSeries: ISeriesApi<any> | null = null;
  
  // History for channel entry/exit detection
  const upperHistory: number[] = [];
  const lowerHistory: number[] = [];
  const baseHistory: number[] = [];
  const trendHistory: number[] = [];
  
  const MAX_HISTORY = Math.max(params.lookbackPeriod + 5, 50);
  
  // Helper: get source value from candle
  function getSource(candle: CandlestickData<Time>): number {
    switch (params.source) {
      case "open": return candle.open;
      case "high": return candle.high;
      case "low": return candle.low;
      case "hl2": return (candle.high + candle.low) / 2;
      case "hlc3": return (candle.high + candle.low + candle.close) / 3;
      case "ohlc4": return (candle.open + candle.high + candle.low + candle.close) / 4;
      default: return candle.close;
    }
  }
  
  // Calculate linear regression slope
  function calcSlope(sources: number[], length: number): { slope: number; average: number; intercept: number } {
    if (length <= 1 || sources.length < length) {
      return { slope: 0, average: 0, intercept: 0 };
    }
    
    let sumX = 0;
    let sumY = 0;
    let sumXSqr = 0;
    let sumXY = 0;
    
    for (let i = 0; i < length; i++) {
      const val = sources[sources.length - length + i];
      const per = i + 1;
      sumX += per;
      sumY += val;
      sumXSqr += per * per;
      sumXY += val * per;
    }
    
    const slope = (length * sumXY - sumX * sumY) / (length * sumXSqr - sumX * sumX);
    const average = sumY / length;
    const intercept = average - (slope * sumX) / length + slope;
    
    return { slope, average, intercept };
  }
  
  // Calculate deviations
  function calcDev(
    sources: number[], 
    candles: CandlestickData<Time>[], 
    length: number, 
    slope: number, 
    average: number, 
    intercept: number
  ): { stdDev: number; pearsonR: number; upDev: number; dnDev: number } {
    let upDev = 0;
    let dnDev = 0;
    let stdDevAcc = 0;
    let dsxx = 0;
    let dsyy = 0;
    let dsxy = 0;
    
    const calcPeriods = length - 1;
    const daY = intercept + (slope * calcPeriods) / 2;
    let val = intercept;
    
    for (let j = 0; j < length; j++) {
      const idx = candles.length - length + j;
      if (idx < 0 || idx >= candles.length) continue;
      
      const candle = candles[idx];
      const source = sources[idx];
      
      // Check high deviation
      let price = candle.high - val;
      if (price > upDev) upDev = price;
      
      // Check low deviation
      price = val - candle.low;
      if (price > dnDev) dnDev = price;
      
      // Standard deviation and Pearson's R
      const dxt = source - average;
      const dyt = val - daY;
      price = source - val;
      
      stdDevAcc += price * price;
      dsxx += dxt * dxt;
      dsyy += dyt * dyt;
      dsxy += dxt * dyt;
      
      val += slope;
    }
    
    const stdDev = Math.sqrt(stdDevAcc / (calcPeriods === 0 ? 1 : calcPeriods));
    const pearsonR = dsxx === 0 || dsyy === 0 ? 0 : dsxy / Math.sqrt(dsxx * dsyy);
    
    return { stdDev, pearsonR, upDev, dnDev };
  }
  
  // Create series
  function ensureSeries() {
    if (!upperSeries) {
      upperSeries = chart.addSeries(LineSeries, {
        color: params.colorUpper.replace(/[0-9a-f]{2}$/i, ''),
        lineWidth: params.lineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    
    if (!lowerSeries) {
      lowerSeries = chart.addSeries(LineSeries, {
        color: params.colorLower.replace(/[0-9a-f]{2}$/i, ''),
        lineWidth: params.lineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    
    if (!baseSeries) {
      baseSeries = chart.addSeries(LineSeries, {
        color: params.colorBase,
        lineWidth: Math.max(1, params.lineWidth - 1),
        lineStyle: 2, // dotted
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
  }
  
  function update(candles: CandlestickData<Time>[]) {
    if (candles.length < params.length) return;
    
    ensureSeries();
    
    // Extract sources
    const sources = candles.map(c => getSource(c));
    
    // Calculate regression
    const { slope, average, intercept } = calcSlope(sources, params.length);
    const { stdDev, pearsonR, upDev, dnDev } = calcDev(sources, candles, params.length, slope, average, intercept);
    
    // Calculate channel values
    const startPrice = intercept + slope * (params.length - 1);
    const endPrice = intercept;
    
    const upperEndPrice = endPrice + (params.useUpperDev ? params.upperMult * stdDev : upDev);
    const lowerEndPrice = endPrice + (params.useLowerDev ? -params.lowerMult * stdDev : -dnDev);
    
    // Store in history
    upperHistory.unshift(upperEndPrice);
    lowerHistory.unshift(lowerEndPrice);
    baseHistory.unshift(endPrice);
    trendHistory.unshift(Math.sign(endPrice - startPrice));
    
    // Trim history
    if (upperHistory.length > MAX_HISTORY) upperHistory.pop();
    if (lowerHistory.length > MAX_HISTORY) lowerHistory.pop();
    if (baseHistory.length > MAX_HISTORY) baseHistory.pop();
    if (trendHistory.length > MAX_HISTORY) trendHistory.pop();
    
    // Build line data
    const upperData: any[] = [];
    const lowerData: any[] = [];
    const baseData: any[] = [];
    
    const startIdx = candles.length - params.length;
    const upperStartPrice = startPrice + (params.useUpperDev ? params.upperMult * stdDev : upDev);
    const lowerStartPrice = startPrice + (params.useLowerDev ? -params.lowerMult * stdDev : -dnDev);
    
    // Add start point if extending left
    if (params.extendLeft && startIdx >= 0) {
      const t0 = candles[0].time;
      upperData.push({ time: t0, value: upperStartPrice });
      lowerData.push({ time: t0, value: lowerStartPrice });
      baseData.push({ time: t0, value: startPrice });
    }
    
    // Add regression window
    for (let i = 0; i < params.length && startIdx + i < candles.length; i++) {
      const t = candles[startIdx + i].time;
      const progress = i / (params.length - 1);
      
      const upperVal = upperStartPrice + (upperEndPrice - upperStartPrice) * progress;
      const lowerVal = lowerStartPrice + (lowerEndPrice - lowerStartPrice) * progress;
      const baseVal = startPrice + (endPrice - startPrice) * progress;
      
      upperData.push({ time: t, value: upperVal });
      lowerData.push({ time: t, value: lowerVal });
      baseData.push({ time: t, value: baseVal });
    }
    
    // Extend right
    if (params.extendRight && candles.length > 0) {
      const lastTime = candles[candles.length - 1].time;
      // For simplicity, keep last values (not extending into future)
      upperData.push({ time: lastTime, value: upperEndPrice });
      lowerData.push({ time: lastTime, value: lowerEndPrice });
      baseData.push({ time: lastTime, value: endPrice });
    }
    
    upperSeries?.setData(upperData);
    lowerSeries?.setData(lowerData);
    baseSeries?.setData(baseData);
    
    // Channel entry/exit detection
    if (params.showSignals && candles.length >= params.lookbackPeriod + 1) {
      const markers: any[] = [];
      
      // Current bar position
      const currentCandle = candles[candles.length - 1];
      const priceInChannel = currentCandle.low <= upperEndPrice && currentCandle.high >= lowerEndPrice;
      const priceAboveChannel = currentCandle.low > upperEndPrice;
      const priceBelowChannel = currentCandle.high < lowerEndPrice;
      
      // Check if price was outside in lookback
      let wasOutside = true;
      if (upperHistory.length >= params.lookbackPeriod + 1) {
        for (let i = 1; i <= params.lookbackPeriod; i++) {
          const histUpper = upperHistory[i];
          const histLower = lowerHistory[i];
          const histCandle = candles[candles.length - 1 - i];
          
          if (histCandle.low <= histUpper && histCandle.high >= histLower) {
            wasOutside = false;
            break;
          }
        }
      }
      
      // Entry signal
      if (wasOutside && priceInChannel) {
        const color = priceBelowChannel ? '#22c55e' : priceAboveChannel ? '#ef4444' : '#3b82f6';
        markers.push({
          time: currentCandle.time,
          position: priceBelowChannel ? 'belowBar' : 'aboveBar',
          color,
          shape: 'arrowUp',
          text: 'Entry',
        });
      }
      
      // Exit signal
      const wasInside = upperHistory.length >= 2 ? 
        (candles[candles.length - 2].low <= upperHistory[1] && candles[candles.length - 2].high >= lowerHistory[1]) 
        : false;
      
      if (wasInside && !priceInChannel) {
        const color = priceBelowChannel ? '#3b82f6' : '#f97316';
        markers.push({
          time: currentCandle.time,
          position: priceBelowChannel ? 'belowBar' : 'aboveBar',
          color,
          shape: 'circle',
          text: 'Exit',
        });
      }
      
      if (markers.length > 0 && createSeriesMarkers) {
        createSeriesMarkers(markers);
      }
    }
    
    // Pearson's R display (could be via chart label/overlay - simplified here)
    if (params.showPearson) {
      const trend = trendHistory[0] > 0 ? "UPTREND" : trendHistory[0] < 0 ? "DOWNTREND" : "NEUTRAL";
      console.log(`Pearson's R: ${pearsonR.toFixed(2)} | Trend: ${trend}`);
    }
  }
  
  function destroy() {
    if (upperSeries) { chart.removeSeries(upperSeries); upperSeries = null; }
    if (lowerSeries) { chart.removeSeries(lowerSeries); lowerSeries = null; }
    if (baseSeries) { chart.removeSeries(baseSeries); baseSeries = null; }
  }
  
  return { update, destroy };
}
