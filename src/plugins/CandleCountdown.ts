/**
 * CandleCountdown — Pane Primitive for lightweight-charts v5.
 *
 * Draws a compact countdown pill on the current price line.
 * Uses series.priceToCoordinate() at draw time for accurate positioning.
 */

/** Horizontal offset in CSS-px from the last candle to the pill left edge.
 *  Change this single value to adjust pill position. */
const PILL_OFFSET_FROM_LAST_CANDLE = 50;

/** Map timeframe string → interval in seconds */
const TF_SECONDS: Record<string, number> = {
  S5: 5,
  S30: 30,
  M1: 60,
  M2: 120,
  M3: 180,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  D1: 86400,
};

export function getTimeframeSeconds(tf: string): number {
  return TF_SECONDS[tf] ?? 60;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SeriesRef = { priceToCoordinate(price: number): number | null } & Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartRef = { timeScale(): { timeToCoordinate(time: any): number | null } } & Record<string, any>;

export class CandleCountdown {
  private _intervalSecs: number;
  private _timerId: ReturnType<typeof setInterval> | null = null;
  _remaining = 0;
  _progress = 0; // 0..1
  _price = 0;
  private _prevPrice = 0;
  _priceDirection: 'up' | 'down' | 'none' = 'none';
  _series: SeriesRef | null = null;
  _chart: ChartRef | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _lastTime: any = null;
  private _requestUpdate?: () => void;
  private _view: CandleCountdownView;
  /** Offset in seconds: serverTime - clientTime. Positive = client is behind. */
  private _serverOffset = 0;

  constructor(timeframe: string) {
    this._intervalSecs = getTimeframeSeconds(timeframe);
    this._view = new CandleCountdownView(this);
    this._tick();
    this._timerId = setInterval(() => this._tick(), 1000);
  }

  setSeries(series: SeriesRef) {
    this._series = series;
  }

  setChart(chart: ChartRef) {
    this._chart = chart;
  }

  setLastTime(time: unknown) {
    this._lastTime = time;
    this._requestUpdate?.();
  }

  setTimeframe(tf: string) {
    this._intervalSecs = getTimeframeSeconds(tf);
    this._tick();
  }

  setPrice(price: number, time?: unknown) {
    if (price === this._price && time === undefined) return;
    this._prevPrice = this._price;
    this._price = price;
    if (time !== undefined) this._lastTime = time;
    if (this._prevPrice > 0) {
      this._priceDirection = price > this._prevPrice ? 'up' : price < this._prevPrice ? 'down' : 'none';
    }
    this._requestUpdate?.();
  }

  /** Sync countdown to server clock using a server timestamp string (ISO 8601). */
  syncServerTime(serverTimestamp: string) {
    const serverNow = Math.floor(new Date(serverTimestamp).getTime() / 1000);
    const clientNow = Math.floor(Date.now() / 1000);
    this._serverOffset = serverNow - clientNow;
  }

  private _tick() {
    const now = Math.floor(Date.now() / 1000) + this._serverOffset;
    const elapsed = now % this._intervalSecs;
    this._remaining = this._intervalSecs - elapsed;
    this._progress = elapsed / this._intervalSecs;
    this._requestUpdate?.();
  }

  destroy() {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this._series = null;
    this._chart = null;
  }

  /* ─── IPanePrimitive interface ─── */

  requestUpdate() {
    this._requestUpdate?.();
  }

  attached({ requestUpdate }: { requestUpdate: () => void }) {
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._requestUpdate = undefined;
  }

  paneViews() {
    return [this._view];
  }
}

/**
 * Separate view class — `renderer()` is a proper method (not an arrow/object prop).
 * Computes priceToCoordinate at draw time for accurate Y positioning.
 */
class CandleCountdownView {
  private _renderer: CandleCountdownRenderer;

  constructor(source: CandleCountdown) {
    this._renderer = new CandleCountdownRenderer(source);
  }

  renderer() {
    return this._renderer;
  }
}

/**
 * Separate renderer class — `draw()` is called at paint time.
 * Gets priceToCoordinate HERE, not in paneViews.
 */
class CandleCountdownRenderer {
  private _source: CandleCountdown;

  constructor(source: CandleCountdown) {
    this._source = source;
  }

  draw(target: CanvasRenderingTarget2D) {
    const { _remaining: remaining, _progress: progress, _price: price, _priceDirection: priceDir, _series: series, _chart: chart, _lastTime: lastTime } = this._source;

    // Compute price Y at draw time — chart layout is guaranteed current
    let priceY: number | null = null;
    if (series && price > 0) {
      priceY = series.priceToCoordinate(price);
    }

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }: BitmapScope) => {
      const w = bitmapSize.width;
      const h = bitmapSize.height;

      ctx.save();
      try {
        const isMobile = w / hpr < 300;
        const fontSize = (isMobile ? 10 : 11) * hpr;
        const fontMedium = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

        // Measure countdown text
        const countdownText = formatCountdown(remaining);
        ctx.font = fontMedium;
        const countdownW = ctx.measureText(countdownText).width;

        // Sizes in bitmap pixels
        const iconR = (isMobile ? 3.5 : 4) * hpr;
        const iconSpace = iconR * 2 + 4 * hpr;
        const progressRingExtra = 6 * hpr;
        const pillH = (isMobile ? 18 : 20) * vpr;
        const padH = (isMobile ? 6 : 8) * hpr;
        const pillW = padH + progressRingExtra + iconSpace + countdownW + padH;
        const edgePad = (isMobile ? 2 : 4) * hpr;

        // Position pill relative to last candle + offset
        let pillX: number;
        if (chart && lastTime != null) {
          const candleX = chart.timeScale().timeToCoordinate(lastTime);
          if (candleX !== null) {
            pillX = candleX * hpr + PILL_OFFSET_FROM_LAST_CANDLE * hpr;
          } else {
            pillX = w - pillW - edgePad; // fallback: right edge
          }
        } else {
          pillX = w - pillW - edgePad; // fallback: right edge
        }
        // Clamp within visible area
        if (pillX + pillW > w - edgePad) pillX = w - pillW - edgePad;
        if (pillX < edgePad) pillX = edgePad;

        // Y: bottom edge of pill = 3px above the price line
        let cy: number;
        if (priceY !== null) {
          const priceLineY = priceY * vpr;
          const gap = 3 * vpr; // 3 CSS-px gap above the line
          // pill bottom = priceLineY - gap  →  cy = priceLineY - gap - pillH/2
          cy = priceLineY - gap - pillH / 2;
          const halfH = pillH / 2 + 2 * vpr;
          if (cy < halfH) cy = halfH;
          if (cy > h - halfH) cy = h - halfH;
        } else {
          cy = h - pillH / 2 - edgePad - 4 * vpr;
        }

        const y = cy - pillH / 2;

        // ─── Dashed connecting line to right edge ───
        if (priceY !== null) {
          const priceLineY = priceY * vpr;
          ctx.beginPath();
          ctx.moveTo(pillX + pillW, priceLineY);
          ctx.lineTo(w, priceLineY);
          ctx.strokeStyle = priceDir === 'up' ? 'rgba(46,189,133,0.25)' : priceDir === 'down' ? 'rgba(246,70,93,0.25)' : 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1 * hpr;
          ctx.setLineDash([3 * hpr, 2 * hpr]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // ─── Background pill ───
        const radius = pillH / 2;
        ctx.beginPath();
        roundRect(ctx, pillX, y, pillW, pillH, radius);
        ctx.fillStyle = priceDir === 'up'
          ? 'rgba(46, 189, 133, 0.12)'
          : priceDir === 'down'
            ? 'rgba(246, 70, 93, 0.12)'
            : 'rgba(10, 12, 18, 0.8)';
        ctx.fill();

        // Border
        ctx.beginPath();
        roundRect(ctx, pillX, y, pillW, pillH, radius);
        ctx.strokeStyle = priceDir === 'up'
          ? 'rgba(46, 189, 133, 0.3)'
          : priceDir === 'down'
            ? 'rgba(246, 70, 93, 0.3)'
            : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1 * hpr;
        ctx.stroke();

        let cursor = pillX + padH;

        // ─── Circular progress ring ───
        const ringCx = cursor + iconR + 1 * hpr;
        const ringCy = cy;
        const ringR = iconR + 1.5 * hpr;

        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1.8 * hpr;
        ctx.stroke();

        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + progress * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringR, startAngle, endAngle);
        ctx.strokeStyle = getProgressColor(remaining);
        ctx.lineWidth = 1.8 * hpr;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Clock hand
        ctx.beginPath();
        ctx.moveTo(ringCx, ringCy);
        const handAngle = -Math.PI / 2 + progress * Math.PI * 2;
        ctx.lineTo(
          ringCx + Math.cos(handAngle) * (iconR - 1 * hpr),
          ringCy + Math.sin(handAngle) * (iconR - 1 * vpr),
        );
        ctx.strokeStyle = getCountdownColor(remaining);
        ctx.lineWidth = 1 * hpr;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, 0.8 * hpr, 0, Math.PI * 2);
        ctx.fillStyle = getCountdownColor(remaining);
        ctx.fill();

        cursor += progressRingExtra + iconSpace;

        // ─── Countdown text ───
        ctx.font = fontMedium;
        ctx.fillStyle = getCountdownColor(remaining);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(countdownText, cursor, cy + 0.5 * vpr);
      } finally {
        ctx.restore();
      }
    });
  }
}

/* ─── Types & Helpers ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasRenderingTarget2D = any;

interface BitmapScope {
  context: CanvasRenderingContext2D;
  bitmapSize: { width: number; height: number };
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}

function getCountdownColor(remaining: number): string {
  if (remaining <= 5) return '#f6465d';
  if (remaining <= 15) return '#f59e0b';
  return 'rgba(255, 255, 255, 0.6)';
}

function getProgressColor(remaining: number): string {
  if (remaining <= 5) return 'rgba(246, 70, 93, 0.7)';
  if (remaining <= 15) return 'rgba(245, 158, 11, 0.5)';
  return 'rgba(46, 189, 133, 0.45)';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
