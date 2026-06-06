import type { CandlestickData, Time } from 'lightweight-charts';

export function generateDemoData(count: number = 2000): CandlestickData<Time>[] {
  const data: CandlestickData<Time>[] = [];
  const basePrice = 50000;
  let currentPrice = basePrice;
  const startTime = Math.floor(Date.now() / 1000) - count * 3600; // начало от count часов назад

  for (let i = 0; i < count; i++) {
    const time = (startTime + i * 3600) as Time;
    
    // Случайное изменение цены
    const change = (Math.random() - 0.5) * 1000;
    currentPrice += change;
    
    // Генерация свечи
    const open = currentPrice;
    const close = currentPrice + (Math.random() - 0.5) * 500;
    const high = Math.max(open, close) + Math.random() * 200;
    const low = Math.min(open, close) - Math.random() * 200;

    data.push({
      time,
      open,
      high,
      low,
      close,
    });

    currentPrice = close;
  }

  return data;
}
