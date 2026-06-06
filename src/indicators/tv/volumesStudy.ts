/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  CustomIndicator,
  IPineStudyResult,
  PineJS,
  RawStudyMetaInfoId,
} from 'charting_library';

export function createVolumesStudy(PineJS: PineJS): CustomIndicator {
  return {
    name: 'Volumes',
    metainfo: {
      id: 'Volumes@custom-indicators-1' as RawStudyMetaInfoId,
      description: 'Volumes',
      shortDescription: 'Volumes',
      _metainfoVersion: 53,
      is_price_study: false,
      isCustomIndicator: true,
      format: { type: 'volume' as any },

      inputs: [
        { id: 'showMA', name: 'Show MA', type: 'bool' as any, defval: true },
        { id: 'maPeriod', name: 'MA Period', type: 'integer' as any, defval: 20, min: 1, max: 500 },
      ],

      plots: [
        { id: 'vol', type: 'line' as any },
        { id: 'volumePalette', palette: 'volumePalette', target: 'vol', type: 'colorer' as any },
        { id: 'vol_ma', type: 'line' as any },
      ],

      styles: {
        vol: { title: 'Volume', histogramBase: 0 },
        vol_ma: { title: 'Volume MA', histogramBase: 0 },
      },

      palettes: {
        volumePalette: {
          valToIndex: { 0: 0, 1: 1 },
          colors: {
            0: { name: 'Falling' },
            1: { name: 'Growing' },
          },
        },
      },

      defaults: {
        styles: {
          vol: {
            linestyle: 0,
            linewidth: 1,
            plottype: 5,
            trackPrice: false,
            transparency: 0,
            visible: true,
            color: '#22c55e',
          },
          vol_ma: {
            linestyle: 0,
            linewidth: 2,
            plottype: 0,
            trackPrice: false,
            transparency: 0,
            visible: true,
            color: '#f59e0b',
          },
        },
        palettes: {
          volumePalette: {
            colors: {
              0: { color: '#ef4444', width: 1, style: 0 },
              1: { color: '#22c55e', width: 1, style: 0 },
            },
          },
        },
        inputs: {
          showMA: true,
          maPeriod: 20,
        },
        precision: 0,
      },
    } as any,

    constructor: function (this: any) {
      this.main = function (ctx: any, inputs: any) {
        const showMA = inputs(0) !== false;
        const maPeriod = Math.max(1, Number(inputs(1)) || 20);
        const volume = PineJS.Std.volume(ctx);
        const open = PineJS.Std.open(ctx);
        const close = PineJS.Std.close(ctx);
        const volumeVar = ctx.new_var(volume);
        const ma = showMA ? PineJS.Std.sma(volumeVar, maPeriod, ctx) : NaN;
        const colorIndex = close >= open ? 1 : 0;

        return [volume, colorIndex, ma] as IPineStudyResult;
      };
    } as any,
  };
}