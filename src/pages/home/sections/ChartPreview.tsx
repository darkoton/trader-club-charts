/**
 * Stylised candlestick chart preview used across home-page cards
 * (features, partners, devices). Matches the Figma spec: green/red
 * candles on a subtle grid, with optional moving-average overlays.
 *
 * Colors come from CSS variables so the preview tracks the brand palette.
 */

type Variant = "signals" | "strategies" | "robots";

interface Candle {
  /** Open price (chart units, 0 at top, VIEW_H at bottom). */
  o: number;
  /** Close price. */
  c: number;
  /** High (smallest y value). */
  h: number;
  /** Low (largest y value). */
  l: number;
}

const VIEW_W = 400;
const VIEW_H = 260;

/** Pre-baked candle series per variant — keeps the SVG deterministic. */
/**
 * Build a zig-zag candle series along a trend curve.
 * `trend(i)` returns the desired mid-price (SVG y) at index i.
 * `amp(i)` sets the body half-height for that candle.
 * `pattern` is a list of "u" | "d" flags determining candle direction
 *   ("u" = bullish green, close above open). Length must match `count`.
 * `wick(i)` returns extra wick length on each side.
 */
function buildSeries(
  count: number,
  trend: (i: number) => number,
  amp: (i: number) => number,
  pattern: string,
  wick: (i: number) => number,
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i += 1) {
    const mid = trend(i);
    const half = amp(i);
    const bullish = pattern[i] === "u";
    // bullish → close above open → close has smaller y than open
    const o = bullish ? mid + half : mid - half;
    const c = bullish ? mid - half : mid + half;
    const w = wick(i);
    out.push({
      o,
      c,
      h: Math.min(o, c) - w,
      l: Math.max(o, c) + w,
    });
  }
  return out;
}

const SERIES: Record<Variant, Candle[]> = {
  // "Торговые Сигналы 24/7" — 18 candles, choppy uptrend (price climbs from
  // bottom-left to top-right with pronounced red pullbacks in between).
  signals: buildSeries(
    18,
    // Linear uptrend from y=232 down to y=50 (remember: smaller y = higher price)
    (i) => 232 - (i / 17) * 182 + Math.sin(i * 1.1) * 6,
    (i) => 11 + (i % 3 === 0 ? 4 : 0),
    "ududuudduududdduuu",
    (i) => 6 + ((i * 7) % 5),
  ),
  // "Торговые Стратегии" — 20 candles, V-shape: pullback → deep dip → rally.
  // Dip bottom around index 10, peak on the right.
  strategies: buildSeries(
    20,
    (i) => {
      // Piecewise: first climb down a bit, dip to bottom at i≈10, then rally up
      if (i <= 4) return 150 + i * 4; // 150 → 166 (small drift down / sideways)
      if (i <= 10) return 166 + (i - 4) * 7; // 166 → 208 (deep dip)
      return 208 - (i - 10) * 19; // 208 → 18 (strong rally to new highs)
    },
    (i) => 10 + (i % 4 === 0 ? 6 : 0),
    "udduduuduudduuudduud",
    (i) => 7 + ((i * 5) % 6),
  ),
  // "Автоматические Роботы" — 18 candles, mountain: rally to a peak around
  // index 10 (near the Auto Sell badge), then pullback on the right.
  robots: buildSeries(
    18,
    (i) => {
      if (i <= 9) return 210 - i * 18; // 210 → 48 (rally up)
      return 48 + (i - 9) * 16; // 48 → 192 (pullback down)
    },
    (i) => 10 + (i % 3 === 0 ? 5 : 0),
    "uduudduduuudddudud",
    (i) => 6 + ((i * 3) % 6),
  ),
};

/**
 * Simple N-period simple moving average over candle closes,
 * returned as SVG path points (xs aligned with candle centers).
 */
function maPoints(candles: Candle[], period: number, xStep: number, xOffset: number) {
  const pts: string[] = [];
  for (let i = period - 1; i < candles.length; i += 1) {
    let sum = 0;
    for (let k = 0; k < period; k += 1) sum += candles[i - k].c;
    const y = sum / period;
    const x = xOffset + i * xStep + xStep / 2;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export default function ChartPreview({
  height = 200,
  className = "",
  variant = "signals",
}: {
  height?: number;
  className?: string;
  variant?: Variant;
}) {
  const candles = SERIES[variant];
  const gap = 6;
  const totalGap = gap * (candles.length + 1);
  const candleW = (VIEW_W - totalGap) / candles.length;
  const step = candleW + gap;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height }}
    >
      {/* Background grid */}
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          x2={VIEW_W}
          y1={(i + 1) * 45}
          y2={(i + 1) * 45}
          stroke="rgb(var(--page-border) / 0.06)"
        />
      ))}

      {/* Candles */}
      {candles.map((cdl, i) => {
        const x = gap + i * step;
        const cx = x + candleW / 2;
        // lower y == higher price: close above open → bullish (green)
        const isUp = cdl.c <= cdl.o;
        const color = isUp ? "#22c55e" : "#ef4444";
        const bodyTop = Math.min(cdl.o, cdl.c);
        const bodyH = Math.max(1.5, Math.abs(cdl.o - cdl.c));
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={cdl.h} y2={cdl.l} stroke={color} strokeWidth={1.4} />
            <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} rx={1.5} />
          </g>
        );
      })}

      {/* Moving averages for the "strategies" variant */}
      {variant === "strategies" && (
        <>
          <polyline
            fill="none"
            stroke="#f5c14a"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={maPoints(candles, 3, step, gap)}
          />
          <polyline
            fill="none"
            stroke="#4aa8ff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={maPoints(candles, 6, step, gap)}
          />
        </>
      )}
    </svg>
  );
}
