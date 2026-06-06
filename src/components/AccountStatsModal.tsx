import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BETTER_AUTH_RECOVERED_EVENT, getAccountStats, isBetterAuthStatusError, type AccountStatsResponse, type AccountTradingStats, type BetterAccount } from '../api/better';
import { setTradingTopVisibility } from '../api/copyTrading';
import { useI18n } from '../i18n';

type StatsTab = 'today' | 'month' | 'all';

interface AccountStatsModalProps {
  open: boolean;
  account: BetterAccount | null;
  onClose: () => void;
  onVisibilityChange?: (visible: boolean) => void;
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

export function AccountStatsModal({ open, account, onClose, onVisibilityChange }: AccountStatsModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<StatsTab>('today');
  const [stats, setStats] = useState<AccountStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  useEffect(() => {
    if (!open || !account || typeof window === 'undefined') return undefined;

    const handleBetterAuthRecovered = () => {
      setLoading(true);
      setError(null);
      getAccountStats(account.id)
        .then((data) => {
          setStats(data);
          const visible = data.leaderboard_visible ?? true;
          setLeaderboardVisible(visible);
          if ((account.leaderboard_visible ?? true) !== visible) {
            onVisibilityChange?.(visible);
          }
        })
        .catch((err) => {
          if (isBetterAuthStatusError(err)) return;
          setError(err instanceof Error ? err.message : 'Error');
        })
        .finally(() => setLoading(false));
    };

    window.addEventListener(BETTER_AUTH_RECOVERED_EVENT, handleBetterAuthRecovered as EventListener);
    return () => window.removeEventListener(BETTER_AUTH_RECOVERED_EVENT, handleBetterAuthRecovered as EventListener);
  }, [account, onVisibilityChange, open]);

  useEffect(() => {
    if (!open || !account) return;

    setTab('today');
    setError(null);
    setStats({
      account_id: account.id,
      stats_today: account.stats_today ?? null,
      stats_month: account.stats_month ?? null,
      stats_all: account.stats_all ?? null,
      stats_updated_at: account.stats_updated_at ?? null,
      leaderboard_visible: account.leaderboard_visible ?? true,
    });
    setLeaderboardVisible(account.leaderboard_visible ?? true);
    setLoading(true);

    getAccountStats(account.id)
      .then((data) => {
        setStats(data);
        const visible = data.leaderboard_visible ?? true;
        setLeaderboardVisible(visible);
        if ((account.leaderboard_visible ?? true) !== visible) {
          onVisibilityChange?.(visible);
        }
      })
      .catch((err) => {
        if (isBetterAuthStatusError(err)) return;
        setError(err instanceof Error ? err.message : 'Error');
      })
      .finally(() => setLoading(false));
  }, [open, account, onVisibilityChange]);

  const handleVisibilityToggle = async () => {
    if (!account) return;
    const nextVisible = !leaderboardVisible;
    setVisibilitySaving(true);
    setError(null);
    try {
      const result = await setTradingTopVisibility({
        visible: nextVisible,
        account_id: account.id,
      });
      setLeaderboardVisible(result.visible);
      setStats((prev) => prev ? { ...prev, leaderboard_visible: result.visible } : prev);
      onVisibilityChange?.(result.visible);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setVisibilitySaving(false);
  };

  const activeStats = useMemo<AccountTradingStats | null>(() => {
    if (!stats) return null;
    switch (tab) {
      case 'today':
        return stats.stats_today ?? null;
      case 'month':
        return stats.stats_month ?? null;
      case 'all':
        return stats.stats_all ?? null;
    }
  }, [stats, tab]);

  if (!open || !account) return null;

  return createPortal(
    <div className="account-stats-modal__backdrop" onMouseDown={onClose}>
      <div className="account-stats-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="account-stats-modal__header">
          <div>
            <div className="account-stats-modal__title">{t.accountStats}</div>
            <div className="account-stats-modal__subtitle">{account.email}</div>
          </div>
          <button type="button" className="account-stats-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="ct__tabs">
          <div className="ct__tabs-nav">
            <button
              type="button"
              className={`ct__tabs-btn${tab === 'today' ? ' ct__tabs-btn--active' : ''}`}
              onClick={() => setTab('today')}
            >
              {t.ctTabToday}
            </button>
            <button
              type="button"
              className={`ct__tabs-btn${tab === 'month' ? ' ct__tabs-btn--active' : ''}`}
              onClick={() => setTab('month')}
            >
              {t.ctTabMonth}
            </button>
            <button
              type="button"
              className={`ct__tabs-btn${tab === 'all' ? ' ct__tabs-btn--active' : ''}`}
              onClick={() => setTab('all')}
            >
              {t.ctTabAll}
            </button>
          </div>
        </div>

        <div className="account-stats-modal__body">
          <div className="account-stats-modal__visibility">
            <div>
              <div className="account-stats-modal__visibility-title">{t.accountStatsLeaderboard}</div>
              <div className="account-stats-modal__visibility-hint">
                {leaderboardVisible ? t.accountStatsLeaderboardVisible : t.accountStatsLeaderboardHidden}
              </div>
            </div>
            <button
              type="button"
              className={`account-stats-modal__toggle${leaderboardVisible ? '' : ' account-stats-modal__toggle--off'}`}
              onClick={handleVisibilityToggle}
              disabled={visibilitySaving}
            >
              {visibilitySaving ? '…' : leaderboardVisible ? t.accountStatsHideFromTop : t.accountStatsShowInTop}
            </button>
          </div>

          {loading && <div className="account-stats-modal__state">{t.loading}</div>}
          {!loading && error && <div className="account-stats-modal__state account-stats-modal__state--error">{error}</div>}
          {!loading && !error && !activeStats && <div className="account-stats-modal__state">{t.accountStatsNoData}</div>}
          {!loading && !error && activeStats && (
            <ul className="ct__stats-list">
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatTrades}</span>
                <span className="ct__stats-v">{activeStats.trades}</span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatProfitable}</span>
                <span className="ct__stats-v" style={{ color: activeStats.profitable_trades_pct >= 50 ? '#2ebd85' : '#f6465d' }}>
                  {activeStats.profitable_trades_pct.toFixed(1)}%
                </span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">Wins / Losses</span>
                <span className="ct__stats-v">{activeStats.wins} / {activeStats.losses}</span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatTurnover}</span>
                <span className="ct__stats-v">{formatMoney(activeStats.turnover, activeStats.currency)}</span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatProfit}</span>
                <span className="ct__stats-v" style={{ color: activeStats.total_profit >= 0 ? '#2ebd85' : '#f6465d' }}>
                  {activeStats.total_profit > 0 ? '+' : ''}{formatMoney(activeStats.total_profit, activeStats.currency)}
                </span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatMaxTrade}</span>
                <span className="ct__stats-v">{formatMoney(activeStats.max_trade, activeStats.currency)}</span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatMinTrade}</span>
                <span className="ct__stats-v">{formatMoney(activeStats.min_trade, activeStats.currency)}</span>
              </li>
              <li className="ct__stats-item">
                <span className="ct__stats-k">{t.ctStatMaxProfit}</span>
                <span className="ct__stats-v">{formatMoney(activeStats.max_profit, activeStats.currency)}</span>
              </li>
            </ul>
          )}
        </div>

        {stats?.stats_updated_at && (
          <div className="account-stats-modal__footer">
            {t.accountStatsUpdated}: {new Date(stats.stats_updated_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}