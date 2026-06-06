/**
 * FavoritesBar — PocketOption-style quick-access strip under the header.
 *
 * Renders favorite currency pairs as small cards with:
 *   - currency name
 *   - last price / change %
 *   - tiny monochrome sparkline (SVG path from recent close prices)
 *
 * Clicking a card adds (or focuses) that currency as a chart.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { getHistoricalData, getCurrency, type Candle } from '../api/currencies';
import { socketService, type PriceUpdate } from '../api/socket';
import { betterSocket } from '../api/betterSocket';
import { useAccountBonus } from '../hooks/useAccountBonus';
import { resolveDisplayPayout } from '../utils/payout';

/* ─── Types ─── */

interface SparkData {
  prices: number[];
  lastPrice: number;
  profit: number; // % доходность валюты из API
}

interface FavoritesBarProps {
  /** Called when user clicks a favorite card */
  onSelectCurrency: (currency: string) => void;
  /** Externally managed list for reactivity */
  favorites: string[];
  /** Callback to remove from favorites via star */
  onToggleFavorite: (currency: string) => void;
}

/* ─── Constants ─── */
const SPARK_BARS = 30; // number of recent candles for the sparkline
const SPARK_W = 72;
const SPARK_H = 28;

/* ═══════════ Component ═══════════ */

export function FavoritesBar({ onSelectCurrency, favorites, onToggleFavorite }: FavoritesBarProps) {
  const [sparkMap, setSparkMap] = useState<Record<string, SparkData>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { applyBonus } = useAccountBonus();
  const [, setPoAssetsRevision] = useState(0);

  useEffect(() => {
    const unsub = betterSocket.onPoAssets(() => setPoAssetsRevision((value) => value + 1));
    return unsub;
  }, []);

  /* Fetch sparkline data for each favorite */
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      const entries: [string, SparkData][] = [];
      await Promise.allSettled(
        favorites.map(async (cur) => {
          try {
            // Загружаем данные валюты для получения profit и исторические свечи
            const [currencyInfo, candles] = await Promise.all([
              getCurrency(cur),
              getHistoricalData(cur, 'M1', SPARK_BARS),
            ]);
            if (cancelled || !candles.length) return;
            const prices = candles.map((c: Candle) => c.close);
            const lastPrice = prices[prices.length - 1];
            entries.push([cur, { prices, lastPrice, profit: currencyInfo.profit }]);
          } catch { /* skip */ }
        }),
      );
      if (!cancelled) {
        setSparkMap(Object.fromEntries(entries));
      }
    }

    if (favorites.length > 0) fetchAll();
    return () => { cancelled = true; };
  }, [favorites]);

  /* Live price updates via socket */
  useEffect(() => {
    if (favorites.length === 0) return;

    const unsubs: Array<() => void> = [];

    const handlePrice = (update: PriceUpdate) => {
      setSparkMap((prev) => {
        const existing = prev[update.currency];
        if (!existing) return prev;
        const prices = [...existing.prices.slice(1), update.price];
        return { ...prev, [update.currency]: { prices, lastPrice: update.price, profit: existing.profit } };
      });
    };

    // Подписка на обновления profit через currencies_updated
    const unsubCurrenciesUpdate = socketService.onCurrenciesUpdated((data) => {
      setSparkMap((prev) => {
        const updated = { ...prev };
        data.currencies.forEach((cur) => {
          if (updated[cur.currency] && favorites.includes(cur.currency)) {
            updated[cur.currency] = { ...updated[cur.currency], profit: cur.profit };
          }
        });
        return updated;
      });
    });
    unsubs.push(unsubCurrenciesUpdate);

    favorites.forEach((cur) => {
      socketService.subscribeToCurrency(cur);
      unsubs.push(socketService.onPriceUpdate(cur, handlePrice));
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [favorites]);

  /* Horizontal scroll with mouse wheel */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  if (favorites.length === 0) return null;

  return (
    <div className="fav-bar" onWheel={handleWheel} ref={scrollRef}>
      {favorites.map((cur) => {
        const spark = sparkMap[cur];
        const isUp = spark ? spark.profit >= 0 : true;
        return (
          <div
            key={cur}
            className="fav-card"
            onClick={() => onSelectCurrency(cur)}
          >
            {/* Unfavorite button */}
            <button
              className="fav-card__star"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(cur); }}
              title="★"
            >
              ★
            </button>

            {/* Info */}
            <div className="fav-card__info">
              <span className="fav-card__name">{cur}</span>
              {spark && (
                (() => {
                  const payout = resolveDisplayPayout({ currency: cur });
                  if (payout === undefined) return null;
                  const displayPayout = applyBonus(payout);
                  return (
                    <span className={`fav-card__change ${isUp ? 'fav-card__change--up' : 'fav-card__change--down'}`}>
                      {displayPayout.toFixed(0)}%
                    </span>
                  );
                })()
              )}
            </div>

            {/* Sparkline */}
            <div className="fav-card__spark">
              {spark ? (
                <MiniSparkline prices={spark.prices} up={isUp} />
              ) : (
                <div className="fav-card__spark-placeholder" />
              )}
            </div>

            {/* Price */}
            {spark && (
              <span className="fav-card__price">{formatPrice(spark.lastPrice)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════ Mini SVG Sparkline ═══════════ */

function MiniSparkline({ prices, up }: { prices: number[]; up: boolean }) {
  if (prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padY = 2;

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * SPARK_W;
    const y = SPARK_H - padY - ((p - min) / range) * (SPARK_H - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const strokeColor = up ? 'rgba(46,189,133,0.7)' : 'rgba(246,70,93,0.7)';

  // Build fill path (area under curve)
  const firstX = 0;
  const lastX = SPARK_W;
  const fillPoints = [
    `${firstX},${SPARK_H}`,
    ...points,
    `${lastX},${SPARK_H}`,
  ];
  const fillColor = up ? 'rgba(46,189,133,0.08)' : 'rgba(246,70,93,0.08)';

  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="fav-sparkline"
    >
      <polygon points={fillPoints.join(' ')} fill={fillColor} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ═══════════ Helpers ═══════════ */

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}
