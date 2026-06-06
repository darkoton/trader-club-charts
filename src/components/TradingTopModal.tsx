import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAvatarUrl, getTradingTop100, type TradingTopLeader, type TradingTopPeriod, type TradingTopResponse, type TradingTopSortBy } from '../api/copyTrading';
import { useI18n } from '../i18n';

interface TradingTopModalProps {
  open: boolean;
  onClose: () => void;
}

function formatMoney(value: number, currency = 'USD'): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    UAH: '₴',
    RUB: '₽',
    KZT: '₸',
  };
  const prefix = symbols[currency] ?? `${currency} `;
  return `${prefix}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function TradingTopModal({ open, onClose }: TradingTopModalProps) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<TradingTopPeriod>('month');
  const [sortBy, setSortBy] = useState<TradingTopSortBy>('total_profit');
  const [payload, setPayload] = useState<TradingTopResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getTradingTop100({ period, sortBy, limit: 100 })
      .then((data) => setPayload(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [open, period, sortBy]);

  const leaders = useMemo<TradingTopLeader[]>(() => payload?.leaders ?? [], [payload]);
  const shownLeaders = leaders.length;
  const eligibleLeaders = payload?.total ?? leaders.length;
  const totalUniverse = payload
    ? eligibleLeaders + (payload.hidden_count ?? 0)
    : leaders.length;

  const metricLabel = useMemo(() => {
    switch (sortBy) {
      case 'profitable_trades_pct':
        return t.top100SortWinrate;
      case 'turnover':
        return t.top100SortTurnover;
      case 'wins':
        return t.top100SortWins;
      default:
        return t.top100SortProfit;
    }
  }, [sortBy, t.top100SortProfit, t.top100SortTurnover, t.top100SortWinrate, t.top100SortWins]);

  if (!open) return null;

  return createPortal(
    <div className="trading-top-modal__backdrop" onMouseDown={onClose}>
      <div className="trading-top-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="trading-top-modal__header">
          <div className="trading-top-modal__hero">
            <div className="trading-top-modal__hero-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8"/>
                <path d="M12 17v4"/>
                <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/>
                <path d="M7 5H5a2 2 0 0 0 2 3"/>
                <path d="M17 5h2a2 2 0 0 1-2 3"/>
              </svg>
            </div>
            <div>
              <div className="trading-top-modal__title">{t.top100Title}</div>
            </div>
          </div>
          <button type="button" className="trading-top-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="trading-top-modal__controls">
          <div className="ct__tabs">
            <div className="ct__tabs-nav">
              <button type="button" className={`ct__tabs-btn${period === 'today' ? ' ct__tabs-btn--active' : ''}`} onClick={() => setPeriod('today')}>{t.ctTabToday}</button>
              <button type="button" className={`ct__tabs-btn${period === 'month' ? ' ct__tabs-btn--active' : ''}`} onClick={() => setPeriod('month')}>{t.ctTabMonth}</button>
              <button type="button" className={`ct__tabs-btn${period === 'all' ? ' ct__tabs-btn--active' : ''}`} onClick={() => setPeriod('all')}>{t.ctTabAll}</button>
            </div>
          </div>

          <label className="trading-top-modal__sort">
            <span>{t.top100SortBy}</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as TradingTopSortBy)}>
              <option value="total_profit">{t.top100SortProfit}</option>
              <option value="profitable_trades_pct">{t.top100SortWinrate}</option>
              <option value="turnover">{t.top100SortTurnover}</option>
              <option value="wins">{t.top100SortWins}</option>
            </select>
          </label>

          <div className="trading-top-modal__summary">
            <span className="trading-top-modal__summary-chip">{shownLeaders} / {totalUniverse}</span>
            <span className="trading-top-modal__summary-chip trading-top-modal__summary-chip--accent">{metricLabel}</span>
          </div>
        </div>

        <div className="trading-top-modal__body">
          {loading && <div className="trading-top-modal__state">{t.loading}</div>}
          {!loading && error && <div className="trading-top-modal__state trading-top-modal__state--error">{error}</div>}
          {!loading && !error && leaders.length === 0 && <div className="trading-top-modal__state">{t.top100NoData}</div>}
          {!loading && !error && leaders.length > 0 && (
            <div className="trading-top-modal__list">
              {leaders.map((leader) => {
                const avatarSrc = getAvatarUrl(leader.avatar_url);
                const currency = leader.stats.currency ?? 'USD';
                const metricValue = sortBy === 'profitable_trades_pct'
                  ? `${leader.stats.profitable_trades_pct.toFixed(1)}%`
                  : sortBy === 'wins'
                    ? String(leader.stats.wins)
                    : sortBy === 'turnover'
                      ? formatMoney(leader.stats.turnover, currency)
                      : `${leader.stats.total_profit > 0 ? '+' : ''}${formatMoney(leader.stats.total_profit, currency)}`;
                return (
                  <div key={leader.account_id} className={`trading-top-modal__item trading-top-modal__item--rank-${Math.min(leader.rank, 4)}`}>
                    <div className={`trading-top-modal__rank trading-top-modal__rank--${Math.min(leader.rank, 4)}`}>
                      <span className="trading-top-modal__rank-label">#{leader.rank}</span>
                    </div>
                    <div className="trading-top-modal__avatar">
                      {avatarSrc ? <img src={avatarSrc} alt={leader.name} /> : <span>{leader.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="trading-top-modal__main">
                      <div className="trading-top-modal__name-row">
                        <span className="trading-top-modal__name">{leader.name}</span>
                      </div>
                      {/* <div className="trading-top-modal__desc">{t.top100UserIdLabel} {leader.user_id}</div> */}
                      <div className="trading-top-modal__stats-grid">
                        <span className="trading-top-modal__stat-pill">{t.ctStatTrades} {leader.stats.trades}</span>
                        <span className="trading-top-modal__stat-pill">{t.top100WinsLabel} {leader.stats.wins}</span>
                        <span className="trading-top-modal__stat-pill">{t.ctStatProfitable} {leader.stats.profitable_trades_pct.toFixed(1)}%</span>
                        <span className="trading-top-modal__stat-pill">{t.ctStatTurnover} {formatMoney(leader.stats.turnover, currency)}</span>
                        <span className="trading-top-modal__stat-pill">{t.top100PoIdLabel} {leader.po_user_id}</span>
                      </div>
                    </div>
                    <div className="trading-top-modal__metric">
                      <span className="trading-top-modal__metric-label">{metricLabel}</span>
                      <span className="trading-top-modal__metric-value">{metricValue}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {payload?.updated_at && (
          <div className="trading-top-modal__footer">
            {t.top100Updated}: {new Date(payload.updated_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}