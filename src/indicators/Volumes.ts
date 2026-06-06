/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

export const meta = {
  name: 'Volumes',
  pane: 'separate' as const,
  defaultParams: {
    showMA: true,
    maPeriod: 20,
    upColor: '#22c55e',
    downColor: '#ef4444',
    maColor: '#f59e0b',
    maWidth: 2,
  },
  paramMeta: {
    showMA:    { label: 'Показывать среднюю', type: 'boolean' as const },
    maPeriod:  { label: 'Период MA', type: 'number' as const, min: 1, max: 500 },
    upColor:   { label: 'Цвет Up', type: 'color' as const },
    downColor: { label: 'Цвет Down', type: 'color' as const },
    maColor:   { label: 'Цвет MA', type: 'color' as const },
    maWidth:   { label: 'Толщина MA', type: 'number' as const, min: 1, max: 5 },
  },
};

type CandleWithVolume = CandlestickData<Time> & { volume?: number };

interface VolumesContext {
  chart: IChartApi;
  addSeries: (def: unknown, opts: unknown, pane?: number) => any;
  LineSeries: unknown;
  HistogramSeries: unknown;
  paneIndex?: number;
  params: typeof meta.defaultParams;
}

function calculateMA(data: number[], period: number): Array<number | undefined> {
  const ma = new Array<number | undefined>(data.length).fill(undefined);
  if (data.length < period) return ma;

  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i >= period - 1) ma[i] = sum / period;
  }

  return ma;
}

export function init(ctx: VolumesContext) {
  const { chart, addSeries, LineSeries, HistogramSeries, paneIndex, params } = ctx;

  const volumeSeries = addSeries(HistogramSeries, {
    priceLineVisible: false,
    lastValueVisible: true,
    base: 0,
  }, paneIndex);

  const maLine = addSeries(LineSeries, {
    lineWidth: params.maWidth || 2,
    priceLineVisible: false,
    lastValueVisible: false,
    color: params.maColor || '#f59e0b',
  }, paneIndex);

  function applyScaleOptions(series: any) {
    series.priceScale().applyOptions({
      mode: 0,
      autoScale: true,
      scaleMargins: { top: 0.1, bottom: 0 },
    });
  }

  [volumeSeries, maLine].forEach(applyScaleOptions);

  function update(candles: CandleWithVolume[]) {
    if (!candles || candles.length === 0) {
      volumeSeries.setData([]);
      maLine.setData([]);
      return [];
    }

    const volData: Array<{ time: Time; value: number; color: string }> = [];
    const volumesOnly: number[] = [];
    const upColor = params.upColor || '#22c55e';
    const downColor = params.downColor || '#ef4444';

    for (let i = 0; i < candles.length; i += 1) {
      const candle = candles[i];
      const numericVolume = Number(candle.volume);
      const volume = Number.isFinite(numericVolume) && numericVolume > 0 ? numericVolume : 1;

      volumesOnly.push(volume);
      volData.push({
        time: candle.time,
        value: volume,
        color: candle.close >= candle.open ? upColor : downColor,
      });
    }

    volumeSeries.setData(volData);

    if (params.showMA) {
      const maPeriod = Math.max(1, Number(params.maPeriod) || 20);
      const maValues = calculateMA(volumesOnly, maPeriod);
      const maData: Array<{ time: Time; value: number }> = [];

      for (let i = 0; i < maValues.length; i += 1) {
        if (maValues[i] === undefined) continue;
        maData.push({ time: candles[i].time, value: maValues[i] as number });
      }

      maLine.applyOptions({
        visible: true,
        color: params.maColor || '#f59e0b',
        lineWidth: Math.max(1, Math.min(5, Number(params.maWidth) || 2)),
      });
      maLine.setData(maData);
    } else {
      maLine.setData([]);
      maLine.applyOptions({ visible: false });
    }

    return [];
  }

  function destroy() {
    try { chart.removeSeries(volumeSeries); } catch { /* ignore */ }
    try { chart.removeSeries(maLine); } catch { /* ignore */ }
  }

  return { update, destroy };
}