/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time } from 'lightweight-charts';

export const meta = {
  name: 'Streak Hunter',
  defaultParams: {
    minConsecutive: 3,
    buyText: 'BUY',
    sellText: 'SELL',
    buyColor: '#16a34a',
    sellColor: '#ef4444',
  },
  paramMeta: {
    minConsecutive: { label: 'Минимум подряд свечей', type: 'number' as const, min: 2, max: 10 },
    buyText: { label: 'Текст метки BUY', type: 'text' as const, placeholder: 'BUY', maxLength: 12 },
    sellText: { label: 'Текст метки SELL', type: 'text' as const, placeholder: 'SELL', maxLength: 12 },
    buyColor: { label: 'Цвет BUY', type: 'color' as const },
    sellColor: { label: 'Цвет SELL', type: 'color' as const },
  },
};

interface StreakHunterContext {
  candleSeries: any;
  params: typeof meta.defaultParams;
  createSeriesMarkers: any;
}

export function init(ctx: StreakHunterContext) {
  const { candleSeries, params, createSeriesMarkers } = ctx;
  const markersApi = createSeriesMarkers(candleSeries, []);

  function update(candles: CandlestickData<Time>[]) {
    const resolved = params || meta.defaultParams;
    const markers: any[] = [];
    if (!candles?.length) {
      markersApi.setMarkers([]);
      return [];
    }

    const minConsecutive = Math.max(2, Math.min(10, Number(resolved.minConsecutive) || 3));
    let upRun = 0;
    let downRun = 0;

    for (const candle of candles) {
      const isGreen = candle.close > candle.open;
      const isRed = candle.close < candle.open;

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
        markers.push({
          name: 'sell',
          time: candle.time,
          position: 'aboveBar',
          shape: 'arrowDown',
          color: resolved.sellColor,
          price: candle.close,
          text: resolved.sellText,
          textColor: resolved.sellColor,
        });
      }

      if (downRun === minConsecutive) {
        markers.push({
          name: 'buy',
          time: candle.time,
          position: 'belowBar',
          shape: 'arrowUp',
          color: resolved.buyColor,
          price: candle.close,
          text: resolved.buyText,
          textColor: resolved.buyColor,
        });
      }
    }

    markersApi.setMarkers(markers);
    return markers;
  }

  function destroy() {
    markersApi.setMarkers([]);
  }

  return { update, destroy };
}