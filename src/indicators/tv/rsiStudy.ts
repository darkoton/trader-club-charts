/**
 * ═══════════════════════════════════════════════════════════════
 *  RSI Zones — TradingView Custom Study (PineJS)
 * ═══════════════════════════════════════════════════════════════
 *
 * Proper TradingView custom indicator for RSI with
 * overbought/oversold zones and dynamic coloring.
 */

import type {
  CustomIndicator,
  PineJS,
  IPineStudyResult,
  RawStudyMetaInfoId,
} from 'charting_library';

export function createRSIZonesStudy(PineJS: PineJS): CustomIndicator {
  return {
    name: 'RSI Zones',
    metainfo: {
      id: 'RSIZones@custom-indicators-1' as RawStudyMetaInfoId,
      description: 'RSI Zones',
      shortDescription: 'RSI Zones',
      _metainfoVersion: 53,
      is_price_study: false, // separate pane
      isCustomIndicator: true,
      format: { type: 'price', precision: 2 },

      inputs: [
        { id: 'period', name: 'Period', type: 'integer' as any, defval: 14, min: 2, max: 200 },
        { id: 'overboughtLevel', name: 'Overbought', type: 'integer' as any, defval: 70, min: 50, max: 100 },
        { id: 'oversoldLevel', name: 'Oversold', type: 'integer' as any, defval: 30, min: 0, max: 50 },
        { id: 'dynamicColor', name: 'Dynamic Color', type: 'bool' as any, defval: true },
      ],

      plots: [
        { id: 'rsiPlot', type: 'line' as any },
        { id: 'rsiColorer', type: 'colorer' as any, target: 'rsiPlot', palette: 'rsiPalette' },
      ],

      palettes: {
        rsiPalette: {
          valToIndex: { 0: 0, 1: 1, 2: 2 },
          colors: {
            0: { name: 'Neutral' },
            1: { name: 'Overbought' },
            2: { name: 'Oversold' },
          },
        },
      },

      bands: [
        { id: 'hline_ob', name: 'Overbought', isHidden: false },
        { id: 'hline_os', name: 'Oversold', isHidden: false },
        { id: 'hline_mid', name: 'Middle', isHidden: false },
      ],

      filledAreas: [
        {
          id: 'fill_ob',
          objAId: 'hline_ob',
          objBId: 'hline_mid',
          title: 'Overbought Zone',
          type: 'hline_hline' as any,
        },
        {
          id: 'fill_os',
          objAId: 'hline_mid',
          objBId: 'hline_os',
          title: 'Oversold Zone',
          type: 'hline_hline' as any,
        },
      ],

      defaults: {
        inputs: {
          period: 14,
          overboughtLevel: 70,
          oversoldLevel: 30,
          dynamicColor: true,
        },
        styles: {
          rsiPlot: {
            linestyle: 0,
            linewidth: 2,
            plottype: 0, // Line
            trackPrice: false,
            transparency: 0,
            color: '#8b5cf6',
          },
        },
        bands: [
          { color: '#ef4444', linestyle: 2, linewidth: 1, value: 70, visible: true },
          { color: '#22c55e', linestyle: 2, linewidth: 1, value: 30, visible: true },
          { color: '#6b7280', linestyle: 2, linewidth: 1, value: 50, visible: true },
        ],
        filledAreasStyle: {
          fill_ob: { color: '#ef4444', transparency: 90, visible: true },
          fill_os: { color: '#22c55e', transparency: 90, visible: true },
        },
        palettes: {
          rsiPalette: {
            colors: {
              0: { color: '#8b5cf6', width: 2, style: 0 },
              1: { color: '#ef4444', width: 2, style: 0 },
              2: { color: '#22c55e', width: 2, style: 0 },
            },
          },
        },
        precision: 2,
      },

      styles: {
        rsiPlot: { title: 'RSI', histogramBase: 0 },
      },
    } as any,

    constructor: function (this: any) {
      this.init = function (ctx: any, _inputs: any) {
        // Set price scale to 0-100
        ctx.setMinimumAdditionalDepth?.(0);
      };

      this.main = function (ctx: any, inputs: any) {
        const period = inputs(0) as number;
        const overbought = inputs(1) as number;
        const oversold = inputs(2) as number;
        const dynamicColor = inputs(3) as boolean;

        const close = PineJS.Std.close(ctx);
        const closeVar = ctx.new_var(close);
        const change = close - (closeVar.get(1) ?? close);

        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);

        const gainVar = ctx.new_var(gain);
        const lossVar = ctx.new_var(loss);

        const avgGain = PineJS.Std.rma(gainVar, period, ctx);
        const avgLoss = PineJS.Std.rma(lossVar, period, ctx);

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

        // Color index: 0 = neutral, 1 = overbought, 2 = oversold
        let colorIdx = 0;
        if (dynamicColor) {
          if (rsiVal >= overbought) colorIdx = 1;
          else if (rsiVal <= oversold) colorIdx = 2;
        }

        return [rsiVal, colorIdx] as IPineStudyResult;
      };
    } as any,
  };
}
