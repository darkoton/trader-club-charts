/**
 * CopyTradingPanel — PocketOption-style copy trading panel.
 *
 * Shows list of available signal providers (traders).
 * Trader detail: profile card + trading stats tabs + copy settings.
 * On mobile renders as a bottom-sheet portal.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import {
  getTraders,
  getTrader,
  subscribe,
  updateSubscription,
  unsubscribeFromTrader,
  getAvatarUrl,
  type CopyTraderWithSub,
  type CopyTraderStats,
} from '../api/copyTrading';
import type { BetterAccount } from '../api/better';

import CloseIcon from '../assets/icons/close.svg?react';
import ArrowRightIcon from '../assets/icons/arrow-right.svg?react';
import ArrowLeftIcon from '../assets/icons/arrow-left.svg?react';
import YoutubeIcon from '../assets/icons/youtube.svg?react';

/* ─── Proportion presets ─── */
const PROPORTION_PRESETS = [
  { value: 50, label: '×0.5' },
  { value: 100, label: '×1' },
  { value: 200, label: '×2' },
  { value: 500, label: '×5' },
  { value: 1000, label: '×10' },
] as const;

type StatsTab = 'today' | 'month' | 'all';

function isNetworkRequestError(error: unknown): boolean {
  return error instanceof Error && /network request failed|failed to fetch|networkerror|load failed/i.test(error.message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatMoney(v: number | null | undefined, currency = 'USD', fallback = '—'): string {
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', UAH: '₴', RUB: '₽' };
  const s = sym[currency] ?? currency + ' ';
  if (!isFiniteNumber(v)) return fallback;
  return `${s}${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPercent(v: number | null | undefined, fallback = '—'): string {
  if (!isFiniteNumber(v)) return fallback;
  return `${v.toFixed(0)}%`;
}

interface CopyTradingPanelProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  account: BetterAccount | null;
}

export function CopyTradingPanel({ open, onClose, isMobile, account }: CopyTradingPanelProps) {
  const { t } = useI18n();
  const [traders, setTraders] = useState<CopyTraderWithSub[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<CopyTraderWithSub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ─── Stats tab ─── */
  const [statsTab, setStatsTab] = useState<StatsTab>('today');

  /* ─── Copy settings state ─── */
  const [proportion, setProportion] = useState(100);
  const [stopBalance, setStopBalance] = useState(1);
  const [minCopyAmount, setMinCopyAmount] = useState(1);
  const [saving, setSaving] = useState(false);

  /* ─── Load traders ─── */
  const loadTraders = useCallback(async (): Promise<CopyTraderWithSub[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTraders();
      setTraders(data.traders);
      return data.traders;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const reconcileSubscription = useCallback(async (
    traderId: string,
    matcher: (trader: CopyTraderWithSub) => boolean,
  ): Promise<boolean> => {
    try {
      const data = await getTrader(traderId);
      if (!matcher(data.trader)) return false;
      await loadTraders();
      setSelectedTrader(null);
      setShowForm(false);
      return true;
    } catch {
      return false;
    }
  }, [loadTraders]);

  useEffect(() => {
    if (open) {
      // Reset state on every open
      setSelectedTrader(null);
      setShowForm(false);
      setStatsTab('today');
      setError(null);
      setProportion(100);
      setStopBalance(1);
      setMinCopyAmount(1);
      loadTraders();
    }
  }, [open, loadTraders]);

  /* ─── When selecting a trader, fetch full detail ─── */
  const handleSelectTrader = useCallback(async (trader: CopyTraderWithSub) => {
    setSelectedTrader(trader);
    setStatsTab('today');
    setShowForm(false);
    if (trader.my_subscription) {
      setProportion(trader.my_subscription.proportion);
      setStopBalance(trader.my_subscription.stop_balance);
      setMinCopyAmount(trader.my_subscription.min_copy_amount);
    } else {
      setProportion(100);
      setStopBalance(1);
      setMinCopyAmount(1);
    }
    // Fetch full trader data (with stats)
    try {
      const data = await getTrader(trader.id);
      setSelectedTrader(data.trader);
    } catch {
      // Keep the basic data from list
    }
  }, []);

  /* ─── Subscribe / Update ─── */
  const handleSubscribe = useCallback(async () => {
    if (!selectedTrader || !account) return;
    setSaving(true);
    setError(null);
    try {
      if (selectedTrader.my_subscription) {
        const subscriberAccountId = selectedTrader.my_subscription.subscriber_account_id;
        await updateSubscription(selectedTrader.id, {
          subscriber_account_id: subscriberAccountId,
          proportion,
          stop_balance: stopBalance,
          min_copy_amount: minCopyAmount,
        });
      } else {
        await subscribe(selectedTrader.id, {
          subscriber_account_id: account.id,
          proportion,
          stop_balance: stopBalance,
          min_copy_amount: minCopyAmount,
        });
      }
      await loadTraders();
      setSelectedTrader(null);
      setShowForm(false);
    } catch (err) {
      if (isNetworkRequestError(err)) {
        const applied = await reconcileSubscription(selectedTrader.id, (trader) => {
          const sub = trader.my_subscription;
          return Boolean(
            sub &&
            sub.subscriber_account_id === account.id &&
            sub.proportion === proportion &&
            sub.stop_balance === stopBalance &&
            sub.min_copy_amount === minCopyAmount,
          );
        });
        if (applied) {
          setSaving(false);
          return;
        }
      }
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSaving(false);
  }, [selectedTrader, account, proportion, stopBalance, minCopyAmount, loadTraders, reconcileSubscription]);

  /* ─── Unsubscribe ─── */
  const handleUnsubscribe = useCallback(async () => {
    if (!selectedTrader) return;
    setSaving(true);
    setError(null);
    try {
      const subscriberAccountId = selectedTrader.my_subscription?.subscriber_account_id ?? account?.id;
      await unsubscribeFromTrader(selectedTrader.id, subscriberAccountId);
      await loadTraders();
      setSelectedTrader(null);
      setShowForm(false);
    } catch (err) {
      if (isNetworkRequestError(err)) {
        const applied = await reconcileSubscription(selectedTrader.id, (trader) => !trader.my_subscription);
        if (applied) {
          setSaving(false);
          return;
        }
      }
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSaving(false);
  }, [selectedTrader, account, loadTraders, reconcileSubscription]);

  /* ─── Back to list ─── */
  const handleBack = useCallback(() => {
    if (showForm) {
      setShowForm(false);
    } else {
      setSelectedTrader(null);
      setError(null);
    }
  }, [showForm]);

  if (!open) return null;

  /* ─── Get level name ─── */


  /* ─── Get active stats ─── */
  const getActiveStats = (): CopyTraderStats | null => {
    if (!selectedTrader) return null;
    switch (statsTab) {
      case 'today': return selectedTrader.stats_today ?? null;
      case 'month': return selectedTrader.stats_month ?? null;
      case 'all': return selectedTrader.stats_all ?? null;
    }
  };

  /* ─── Trader List View ─── */
  const renderTraderList = () => (
    <div className="ct__list">
      {loading && <div className="ct__loading">{t.loading}</div>}
      {error && !loading && <div className="ct__error">{error}</div>}
      {!loading && traders.length === 0 && !error && (
        <div className="ct__empty">{t.ctNoTraders}</div>
      )}
      {traders.map((trader) => {
        const avatarSrc = getAvatarUrl(trader.avatar_url);
        const isSub = !!trader.my_subscription;
        const level = trader.account_info?.user_level ?? 0;
        const winPct = trader.stats_today?.profitable_trades_pct;
        const profit = trader.stats_today?.total_profit;
        const cur = trader.account_info?.currency ?? 'USD';
        const hasWinPct = isFiniteNumber(winPct);
        const hasProfit = isFiniteNumber(profit);
        return (
          <div
            key={trader.id}
            className={`ct__trader${isSub ? ' ct__trader--subscribed' : ''}`}
            onClick={() => handleSelectTrader(trader)}
          >
            <div className={`ct__trader-avatar${level ? ` ct__trader-avatar--level-${Math.min(level, 4)}` : ''}`}>
              <span className="ct__trader-initials">
                {trader.name.charAt(0).toUpperCase()}
              </span>
              {avatarSrc && (
                <img
                  src={avatarSrc}
                  alt={trader.name}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
            </div>
            <div className="ct__trader-info">
              <div className="ct__trader-name-row">
                <span className="ct__trader-name">{trader.name}</span>

              </div>
              <div className="ct__trader-meta">
                <span className="ct__trader-subs">
                  {trader.subscriber_count} {t.ctFollowers}
                </span>
                {hasWinPct && (
                  <span className="ct__trader-winrate" style={{ color: winPct >= 50 ? '#80ffcc' : '#f27b7b' }}>
                    {formatPercent(winPct)}
                  </span>
                )}
                {hasProfit && profit !== 0 && (
                  <span style={{ color: profit > 0 ? '#2ebd85' : '#f6465d', fontSize: 12, fontWeight: 600 }}>
                    {profit > 0 ? '+' : ''}{formatMoney(profit, cur)}
                  </span>
                )}
              </div>
              {isSub && (
                <span className="ct__trader-badge">{t.ctCopying}</span>
              )}
            </div>
            <span className="ct__trader-chevron"><ArrowRightIcon/></span>
          </div>
        );
      })}
    </div>
  );

  /* ─── Render stats block ─── */
  const renderStats = () => {
    const stats = getActiveStats();
    const cur = selectedTrader?.account_info?.currency ?? 'USD';
    if (!stats) {
      return <div className="ct__stats-empty">{t.ctNoStats}</div>;
    }
    return (
      <ul className="ct__stats-list">
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatTrades}</span>
          <span className="ct__stats-v">{stats.trades}</span>
        </li>
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatProfitable}</span>
          <span
            className="ct__stats-v"
            style={{ color: isFiniteNumber(stats.profitable_trades_pct) && stats.profitable_trades_pct >= 50 ? '#2ebd85' : '#f6465d' }}
          >
            {formatPercent(stats.profitable_trades_pct)}
          </span>
        </li>
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatTurnover}</span>
          <span className="ct__stats-v">{formatMoney(stats.turnover, cur)}</span>
        </li>
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatProfit}</span>
          <span
            className="ct__stats-v"
            style={{ color: isFiniteNumber(stats.total_profit) && stats.total_profit >= 0 ? '#80ffcc' : '#f27b7b' }}
          >
            {isFiniteNumber(stats.total_profit) && stats.total_profit > 0 ? '+' : ''}{formatMoney(stats.total_profit, cur)}
          </span>
        </li>
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatMaxTrade}</span>
          <span className="ct__stats-v">{formatMoney(stats.max_trade, cur)}</span>
        </li>
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatMinTrade}</span>
          <span className="ct__stats-v">{formatMoney(stats.min_trade, cur)}</span>
        </li>
        <li className="ct__stats-item">
          <span className="ct__stats-k">{t.ctStatMaxProfit}</span>
          <span className="ct__stats-v" style={{ color: '#80ffcc' }}>
            {formatMoney(stats.max_profit, cur)}
          </span>
        </li>
      </ul>
    );
  };

  /* ─── Trader Detail View (PocketOption-style) ─── */
  const renderTraderDetail = () => {
    if (!selectedTrader) return null;
    const isSub = !!selectedTrader.my_subscription;
    const avatarSrc = getAvatarUrl(selectedTrader.avatar_url);
    const ai = selectedTrader.account_info;
    const level = ai?.user_level ?? 0;
    const cur = ai?.currency ?? 'USD';
    const winPct = selectedTrader.stats_today?.profitable_trades_pct;

    const hasWinPct = isFiniteNumber(winPct);

    return (
      <div className="ct__detail">
        {/* ─── User profile block ─── */}
        <div className="ct__profile">
          <div className={`ct__profile-avatar${level ? ` ct__profile-avatar--level-${Math.min(level, 4)}` : ''}`}>
            <span className="ct__profile-initials">
              {selectedTrader.name.charAt(0).toUpperCase()}
            </span>
            {avatarSrc && (
              <img
                src={avatarSrc}
                alt={selectedTrader.name}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            {level > 0 && (
              <div className="ct__profile-level-ring" />
            )}
          </div>
          <div className="ct__profile-info">
            <div className="ct__profile-name">{selectedTrader.name}</div>
            <div className="ct__profile-counters">
              <span>{selectedTrader.subscriber_count} {t.ctFollowers}</span>

            {hasWinPct && (
                  <span className="ct_profile-winrate" style={{ color: winPct >= 50 ? '#80ffcc' : '#f27b7b' }}>
                    {formatPercent(winPct)}
                  </span>
            )}
            </div>
      
            {/* {selectedTrader.description && (
              <div className="ct__profile-desc">{selectedTrader.description}</div>
            )} */}
          </div>

          <a href='#' target='_blank' className="ct__profile-channel"><YoutubeIcon/></a>
        </div>

        {/* ─── Trading stats tabs ─── */}
        <div className="ct__tabs">
          <div className="ct__tabs-nav">
            <button
              type="button"
              className={`ct__tabs-btn${statsTab === 'today' ? ' ct__tabs-btn--active' : ''}`}
              onClick={() => setStatsTab('today')}
            >
              {t.ctTabToday}
            </button>
            <button
              type="button"
              className={`ct__tabs-btn${statsTab === 'month' ? ' ct__tabs-btn--active' : ''}`}
              onClick={() => setStatsTab('month')}
            >
              {t.ctTabMonth}
            </button>
            <button
              type="button"
              className={`ct__tabs-btn${statsTab === 'all' ? ' ct__tabs-btn--active' : ''}`}
              onClick={() => setStatsTab('all')}
            >
              {t.ctTabAll}
            </button>
          </div>
          <div className="ct__tabs-body">
            {renderStats()}
          </div>
        </div>

        {/* ─── Action buttons ─── */}
        <div className="ct__actions">
          {isSub ? (
            <>
              <button
                type="button"
                className="ct__btn ct__btn--danger"
                onClick={handleUnsubscribe}
                disabled={saving}
              >
                {t.ctStopCopy}
              </button>
              <button
                type="button"
                className="ct__btn ct__btn--primary"
                onClick={() => { setShowForm(true); }}
              >
                {t.ctCopySettings}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ct__btn ct__btn--primary ct__btn--full"
              onClick={() => { setShowForm(true); }}
              disabled={!account}
            >
              {t.ctCopyBtn}
            </button>
          )}
          {!account && (
            <div className="ct__error">{t.ctNoAccount}</div>
          )}
        </div>

        {/* ─── Account info row ─── */}
        {ai && (
          <div className="ct__account-info">
            <span>ID: {ai.po_user_id}</span>
            <span>{t.ctCurrency}: {cur}</span>
            <span>{t.ctTradeRange}: {formatMoney(ai.min_trade_amount, cur)} – {formatMoney(ai.max_trade_amount, cur)}</span>
          </div>
        )}
      </div>
    );
  };

  /* ─── Copy Settings Form ─── */
  const renderCopyForm = () => {
    if (!selectedTrader) return null;
    const isSub = !!selectedTrader.my_subscription;
    const cur = selectedTrader.account_info?.currency ?? 'USD';
    const curSym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', UAH: '₴', RUB: '₽' };
    const sym = curSym[cur] ?? '$';

    return (
      <div className="ct__form">
        {/* <h3 className="ct__form-title">{t.ctCopySettings}</h3> */}

        {/* Proportion */}
        <div className="ct__field">
          <label className="ct__field-label">{t.ctProportion}</label>
          <div className="ct__field-input-wrap">
            <input
              type="number"
              className="ct__field-input"
              value={proportion}
              onChange={(e) => setProportion(Math.max(1, Number(e.target.value) || 0))}
              min={1}
            />
            <span className="ct__field-addon">%</span>
          </div>
          <div className="ct__presets">
            {PROPORTION_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`ct__preset-btn${proportion === p.value ? ' ct__preset-btn--active' : ''}`}
                onClick={() => setProportion(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stop Balance */}
        <div className="ct__field">
          <label className="ct__field-label">{t.ctStopBalance}</label>
          <div className="ct__field-input-wrap">
            <input
              type="number"
              className="ct__field-input"
              value={stopBalance}
              onChange={(e) => setStopBalance(Math.max(0, Number(e.target.value) || 0))}
              min={0}
            />
            <span className="ct__field-addon">{sym}</span>
          </div>
        </div>

        {/* Min Copy Amount */}
        <div className="ct__field">
          <label className="ct__field-label">{t.ctMinCopyAmount}</label>
          <div className="ct__field-input-wrap">
            <input
              type="number"
              className="ct__field-input"
              value={minCopyAmount}
              onChange={(e) => setMinCopyAmount(Math.max(0, Number(e.target.value) || 0))}
              min={0}
              placeholder={t.ctUnlimited}
            />
            <span className="ct__field-addon">{sym}</span>
          </div>
        </div>

        {/* Summary */}
        <div className="ct__form-summary">
          <div className="ct__form-summary-row">
            <span className="ct__form-summary-k">{t.ctSummaryProportion}</span>
            <span className="ct__form-summary-v">{proportion}%</span>
          </div>
          <div className="ct__form-summary-row">
            <span className="ct__form-summary-k">{t.ctSummaryStop}</span>
            <span className="ct__form-summary-v">{sym}{stopBalance}</span>
          </div>
          <div className="ct__form-summary-row">
            <span className="ct__form-summary-k">{t.ctSummaryMin}</span>
            <span className="ct__form-summary-v">{sym}{minCopyAmount}</span>
          </div>
        </div>

        {error && <div className="ct__error">{error}</div>}

        {/* Buttons */}
        <div className="ct__form-btns">
          <button
            type="button"
            className="ct__btn ct__btn--primary"
            onClick={handleSubscribe}
            disabled={saving || !account}
          >
            {saving ? '...' : isSub ? t.ctUpdate : t.ctConfirm}
          </button>
          <button
            type="button"
            className="ct__btn ct__btn--secondary"
            onClick={() => setShowForm(false)}
          >
            {t.ctBack}
          </button>
        </div>
      </div>
    );
  };

  /* ─── Panel Content ─── */
  const panelContent = (
    <div className="ct" ref={panelRef}>
      <div className="ct__header">
        <span className="ct__title">
          {showForm ? t.ctCopySettings : selectedTrader ? selectedTrader.name : t.ctTitle}
        </span>

                {(selectedTrader || showForm) && (
          <button type="button" className="ct__back" onClick={handleBack}>
            <ArrowLeftIcon />
          </button>
        )}
        <button type="button" className="ct__close" onClick={onClose}>
          <CloseIcon/>
        </button>
      </div>
      <div className="ct__body">
        {showForm
          ? renderCopyForm()
          : selectedTrader
            ? renderTraderDetail()
            : renderTraderList()}
      </div>
    </div>
  );

  /* ─── Mobile: bottom-sheet portal ─── */
  if (isMobile) {
    return createPortal(
      <div className="ct-portal" onClick={onClose}>
        <div className="ct-portal__sheet" onClick={(e) => e.stopPropagation()}>
          <div className="portal-sheet__handle" />
          {panelContent}
        </div>
      </div>,
      document.body
    );
  }

  /* ─── Desktop: centered modal with backdrop ─── */
  return createPortal(
    <div className="ct-modal__backdrop" onMouseDown={onClose}>
      <div className="ct-modal" onMouseDown={(e) => e.stopPropagation()}>
        {panelContent}
      </div>
    </div>,
    document.body
  );
}
