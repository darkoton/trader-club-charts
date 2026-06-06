export const meta = {
  name: 'SAR Wave Signals',
  defaultParams: {
    start: 0.01,
    increment: 0.01,
    max: 0.1,
    showSignals: true,
    showZigzag: true,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
  },
  paramMeta: {
    start:       { label: 'Старт SAR',          type: 'number' as const, min: 0.001, max: 1, step: 0.001, readonly: true },
    increment:   { label: 'Шаг SAR',            type: 'number' as const, min: 0.001, max: 1, step: 0.001, readonly: true },
    max:         { label: 'Макс. SAR',          type: 'number' as const, min: 0.01, max: 2, step: 0.01, readonly: true },
    showSignals: { label: 'Показывать сигналы', type: 'boolean' as const },
    showZigzag:  { label: 'Показывать ZigZag',  type: 'boolean' as const },
    bullColor:   { label: 'Цвет BUY',           type: 'color' as const },
    bearColor:   { label: 'Цвет SELL',          type: 'color' as const },
  },
};