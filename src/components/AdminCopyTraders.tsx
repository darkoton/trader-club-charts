/**
 * AdminCopyTraders — Admin tab for managing copy trading providers.
 *
 * CRUD for copy traders: create, edit, toggle active, delete, upload avatar.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  adminGetTraders,
  adminCreateTrader,
  adminUpdateTrader,
  adminDeleteTrader,
  adminSetTraderActiveState,
  adminUploadAvatar,
  adminGetAccounts,
  adminCorrectStats,
  adminGetCorrections,
  adminResetCorrections,
  adminGetTraderSubscriptions,
  adminDeactivateTraderSubscriptions,
  getAvatarUrl,
  type CopyTrader,
  type AdminAccount,
  type StatsCorrection,
  type CorrectionsDoc,
  type TraderSubscription,
} from '../api/copyTrading';

interface AdminCopyTradersProps {
  isActive: boolean;
  t: Record<string, string>;
  isAdmin: boolean;
}

export function AdminCopyTraders({ isActive, t, isAdmin }: AdminCopyTradersProps) {
  const [traders, setTraders] = useState<CopyTrader[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CopyTrader | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeToggleId, setActiveToggleId] = useState<string | null>(null);

  /* ─── Form state ─── */
  const [formName, setFormName] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formAccountEmail, setFormAccountEmail] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ─── Account selector state ─── */
  const [accountSearch, setAccountSearch] = useState('');
  const [accountResults, setAccountResults] = useState<AdminAccount[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AdminAccount | null>(null);
  const accountSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  /* ─── Stats correction state ─── */
  const [statsTrader, setStatsTrader] = useState<CopyTrader | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'month' | 'all'>('today');
  const [statsForm, setStatsForm] = useState<StatsCorrection>({ trades: 0, wins: 0, losses: 0, turnover: 0, total_profit: 0 });
  const [statsSaving, setStatsSaving] = useState(false);
  const [statsSuccess, setStatsSuccess] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<CorrectionsDoc | null>(null);

  /* ─── Subscriptions management state ─── */
  const [subscriptionsTrader, setSubscriptionsTrader] = useState<CopyTrader | null>(null);
  const [subscriptions, setSubscriptions] = useState<TraderSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsSaving, setSubscriptionsSaving] = useState(false);

  /* ─── Load ─── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetTraders();
      setTraders(data.traders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isActive) load();
  }, [isActive, load]);

  /* ─── Open create form ─── */
  const handleCreate = useCallback(() => {
    if (!isAdmin) return;
    setCreating(true);
    setEditing(null);
    setFormName('');
    setFormAccountId('');
    setFormAccountEmail('');
    setFormDescription('');
    setFormIsActive(true);
    setSelectedAccount(null);
    setAccountSearch('');
    setAccountResults([]);
    setError(null);
    setSuccess(null);
  }, []);

  /* ─── Open edit form ─── */
  const handleEdit = useCallback((trader: CopyTrader) => {
    if (!isAdmin) return;
    setEditing(trader);
    setCreating(false);
    setFormName(trader.name);
    setFormAccountId(trader.account_id);
    setFormAccountEmail(trader.account_email || '');
    setFormDescription(trader.description || '');
    setFormIsActive(trader.is_active);
    setSelectedAccount(null);
    setAccountSearch(trader.account_email || '');
    setAccountResults([]);
    setAccountDropdownOpen(false);
    setError(null);
    setSuccess(null);
  }, []);

  const buildBindingPayload = useCallback((source?: CopyTrader | null) => {
    const nextAccountId = formAccountId.trim();
    const nextAccountEmail = formAccountEmail.trim().toLowerCase();
    const currentAccountId = source?.account_id?.trim() || '';
    const currentAccountEmail = source?.account_email?.trim().toLowerCase() || '';

    if (!source) {
      if (nextAccountEmail) return { account_email: nextAccountEmail };
      if (nextAccountId) return { account_id: nextAccountId };
      return null;
    }

    if (nextAccountEmail && nextAccountEmail !== currentAccountEmail) {
      return { account_email: nextAccountEmail };
    }
    if (nextAccountId && nextAccountId !== currentAccountId) {
      return { account_id: nextAccountId };
    }
    return {};
  }, [formAccountEmail, formAccountId]);

  /* ─── Save (create or update) ─── */
  const handleSave = useCallback(async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (creating) {
        const bindingPayload = buildBindingPayload();
        if (!formName.trim() || !bindingPayload) {
          setError('Name and account email or account ID are required');
          setSaving(false);
          return;
        }
        await adminCreateTrader({
          name: formName.trim(),
          ...bindingPayload,
          description: formDescription.trim() || null,
          is_active: formIsActive,
        });
      } else if (editing) {
        const bindingPayload = buildBindingPayload(editing);
        await adminUpdateTrader(editing.id, {
          name: formName.trim() || undefined,
          ...bindingPayload,
          description: formDescription.trim() || null,
          is_active: formIsActive,
        });
      }
      setCreating(false);
      setEditing(null);
      await load();
      setSuccess(t.save);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSaving(false);
  }, [buildBindingPayload, creating, editing, formDescription, formIsActive, formName, isAdmin, load]);

  /* ─── Delete ─── */
  const handleDelete = useCallback(async (id: string) => {
    if (!isAdmin) return;
    if (!confirm(t.adminDeleteConfirm || 'Delete?')) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminDeleteTrader(id);
      await load();
      if (editing?.id === id) { setEditing(null); setCreating(false); }
      setSuccess(t.remove);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSaving(false);
  }, [editing, isAdmin, load, t]);

  /* ─── Upload avatar ─── */
  const handleAvatarUpload = useCallback(async (traderId: string, file: File) => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminUploadAvatar(traderId, file);
      await load();
      setSuccess(t.adminUploadSuccess || 'Uploaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSaving(false);
  }, [isAdmin, load, t.adminUploadSuccess]);

  const handleToggleActive = useCallback(async (trader: CopyTrader) => {
    const nextIsActive = !trader.is_active;
    setActiveToggleId(trader.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await adminSetTraderActiveState(trader.id, nextIsActive);
      setTraders((prev) => prev.map((item) => item.id === trader.id ? result.trader : item));
      const baseMessage = nextIsActive ? (t.ctAdminTraderActivated || 'Trader activated') : (t.ctAdminTraderDeactivated || 'Trader deactivated');
      const suffix = !nextIsActive && result.deactivated_subscriptions > 0
        ? ` (${result.deactivated_subscriptions} ${t.ctAdminSubscriptionsDeactivated || 'subscriptions deactivated'})`
        : '';
      setSuccess(`${trader.name}: ${baseMessage}${suffix}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setActiveToggleId(null);
  }, [t.ctAdminSubscriptionsDeactivated, t.ctAdminTraderActivated, t.ctAdminTraderDeactivated]);

  /* ─── Cancel edit ─── */
  const handleCancel = useCallback(() => {
    setCreating(false);
    setEditing(null);
    setError(null);
    setSuccess(null);
    setSelectedAccount(null);
    setAccountSearch('');
    setFormAccountEmail('');
    setAccountResults([]);
    setAccountDropdownOpen(false);
  }, []);

  /* ─── Open stats correction ─── */
  const handleOpenStats = useCallback(async (trader: CopyTrader) => {
    setStatsTrader(trader);
    setStatsPeriod('today');
    setStatsForm({ trades: 0, wins: 0, losses: 0, turnover: 0, total_profit: 0, max_trade: undefined, min_trade: undefined, max_profit: undefined });
    setStatsSuccess(null);
    setError(null);
    try {
      const doc = await adminGetCorrections(trader.id);
      setCorrections(doc);
    } catch {
      setCorrections(null);
    }
  }, []);

  /* ─── Apply stats correction ─── */
  const handleApplyStats = useCallback(async () => {
    if (!statsTrader || !isAdmin) return;
    // Filter out empty values
    const correction: StatsCorrection = {};
    // Additive fields — skip zeros
    if (statsForm.trades) correction.trades = statsForm.trades;
    if (statsForm.wins) correction.wins = statsForm.wins;
    if (statsForm.losses) correction.losses = statsForm.losses;
    if (statsForm.turnover) correction.turnover = statsForm.turnover;
    if (statsForm.total_profit) correction.total_profit = statsForm.total_profit;
    // Override fields — include if set (even 0 is valid)
    if (statsForm.max_trade != null) correction.max_trade = statsForm.max_trade;
    if (statsForm.min_trade != null) correction.min_trade = statsForm.min_trade;
    if (statsForm.max_profit != null) correction.max_profit = statsForm.max_profit;
    if (Object.keys(correction).length === 0) {
      setError('Enter at least one correction');
      return;
    }
    setStatsSaving(true);
    setError(null);
    try {
      await adminCorrectStats(statsTrader.id, statsPeriod, correction);
      setStatsSuccess(`Stats corrected for "${statsTrader.name}" (${statsPeriod})`);
      setStatsForm({ trades: 0, wins: 0, losses: 0, turnover: 0, total_profit: 0, max_trade: undefined, min_trade: undefined, max_profit: undefined });
      await load();
      // Reload corrections
      try {
        const doc = await adminGetCorrections(statsTrader.id);
        setCorrections(doc);
      } catch { setCorrections(null); }
      // Update trader reference with fresh data
      setStatsTrader((prev) => {
        if (!prev) return prev;
        const fresh = traders.find((tr) => tr.id === prev.id);
        return fresh ?? prev;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setStatsSaving(false);
  }, [statsTrader, statsPeriod, statsForm, isAdmin, load, traders]);

  const loadSubscriptions = useCallback(async (traderId: string) => {
    setSubscriptionsLoading(true);
    try {
      const data = await adminGetTraderSubscriptions(traderId);
      setSubscriptions(data.subscriptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setSubscriptions([]);
    }
    setSubscriptionsLoading(false);
  }, []);

  const handleOpenSubscriptions = useCallback(async (trader: CopyTrader) => {
    setSubscriptionsTrader(trader);
    setSubscriptions([]);
    setError(null);
    await loadSubscriptions(trader.id);
  }, [loadSubscriptions]);

  const handleDeactivateSubscription = useCallback(async (subscription: TraderSubscription) => {
    if (!subscriptionsTrader) return;
    setSubscriptionsSaving(true);
    setError(null);
    try {
      await adminDeactivateTraderSubscriptions(subscriptionsTrader.id, { subscriptionId: subscription.id });
      await loadSubscriptions(subscriptionsTrader.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSubscriptionsSaving(false);
  }, [subscriptionsTrader, loadSubscriptions, load]);

  const handleDeactivateAllSubscriptions = useCallback(async () => {
    if (!subscriptionsTrader) return;
    setSubscriptionsSaving(true);
    setError(null);
    try {
      await adminDeactivateTraderSubscriptions(subscriptionsTrader.id);
      await loadSubscriptions(subscriptionsTrader.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setSubscriptionsSaving(false);
  }, [subscriptionsTrader, loadSubscriptions, load]);

  /* ─── Account search (debounced) ─── */
  const searchAccounts = useCallback(async (query: string) => {
    setAccountLoading(true);
    try {
      const data = await adminGetAccounts(query, 20);
      setAccountResults(data.accounts);
    } catch { setAccountResults([]); }
    setAccountLoading(false);
  }, []);

  const handleAccountSearchChange = useCallback((value: string) => {
    setAccountSearch(value);
    setAccountDropdownOpen(true);
    if (accountSearchTimer.current) clearTimeout(accountSearchTimer.current);
    accountSearchTimer.current = setTimeout(() => searchAccounts(value), 300);
  }, [searchAccounts]);

  const handleSelectAccount = useCallback((acc: AdminAccount) => {
    setSelectedAccount(acc);
    setFormAccountId(acc.id);
    setFormAccountEmail(acc.email);
    setAccountSearch(acc.email);
    setAccountDropdownOpen(false);
  }, []);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading && traders.length === 0) {
    return (
      <div className="admin-panel__loading">
        <div className="loading__spinner" />
        {t.loading}
      </div>
    );
  }

  /* ─── Form view ─── */
  if (creating || editing) {
    return (
      <div className="admin-ct">
        <div className="admin-ct__form">
          <h3 className="admin-ct__form-title">
            {creating ? (t.ctAdminCreate || 'New Trader') : (t.ctAdminEdit || 'Edit Trader')}
          </h3>

          <label className="admin-ct__label">{t.ctAdminName || 'Name'}</label>
          <input
            className="admin-ct__input"
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Trader name"
          />

          {(creating || editing) && (
            <>
              <label className="admin-ct__label">{t.ctAdminSearchAccount || 'Search by email...'}</label>
              <div className="admin-ct__account-selector" ref={accountDropdownRef}>
                <input
                  className="admin-ct__input"
                  type="text"
                  value={accountSearch}
                  onChange={(e) => handleAccountSearchChange(e.target.value)}
                  onFocus={() => { setAccountDropdownOpen(true); if (!accountResults.length) searchAccounts(accountSearch); }}
                  placeholder={t.ctAdminSearchAccount || 'Search by email...'}
                  autoComplete="off"
                />
                {selectedAccount && (
                  <div className="admin-ct__account-selected">
                    ✓ {selectedAccount.email} (ID: {selectedAccount.id.slice(0, 8)}…)
                  </div>
                )}
                {accountDropdownOpen && (
                  <div className="admin-ct__account-dropdown">
                    {accountLoading && <div className="admin-ct__account-dropdown-loading">…</div>}
                    {!accountLoading && accountResults.length === 0 && (
                      <div className="admin-ct__account-dropdown-empty">{t.ctAdminNoAccounts || 'No accounts found'}</div>
                    )}
                    {accountResults.map((acc) => (
                      <div
                        key={acc.id}
                        className={`admin-ct__account-option${acc.id === formAccountId ? ' admin-ct__account-option--selected' : ''}`}
                        onClick={() => handleSelectAccount(acc)}
                      >
                        <span className="admin-ct__account-email">{acc.email}</span>
                        <span className="admin-ct__account-meta">
                          PO: {acc.po_user_id} · {acc.is_active ? '🟢' : '🔴'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="admin-ct__label">Email</label>
              <input
                className="admin-ct__input"
                type="email"
                value={formAccountEmail}
                onChange={(e) => {
                  setFormAccountEmail(e.target.value);
                  setSelectedAccount(null);
                }}
                placeholder="owner@example.com"
                autoComplete="off"
              />

              <label className="admin-ct__label">{t.ctAdminAccountId || 'Account ID'}</label>
              <input
                className="admin-ct__input"
                type="text"
                value={formAccountId}
                onChange={(e) => {
                  setFormAccountId(e.target.value);
                  setSelectedAccount(null);
                }}
                placeholder="Account ID"
                autoComplete="off"
              />
              <div className="admin-ct__account-selected">
                Use email for stable binding. Account ID is optional fallback.
              </div>
            </>
          )}

          <label className="admin-ct__label">{t.ctAdminDescription || 'Description'}</label>
          <textarea
            className="admin-ct__textarea"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Strategy description"
            rows={3}
          />

          <label className="admin-ct__checkbox-label">
            <input
              type="checkbox"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
            />
            <span>{t.ctAdminActive || 'Active'}</span>
          </label>

          {/* Avatar upload (only for existing traders) */}
          {editing && (
            <div className="admin-ct__avatar-section">
              <label className="admin-ct__label">{t.ctAdminAvatar || 'Avatar'}</label>
              {editing.avatar_url && (
                <img
                  className="admin-ct__avatar-preview"
                  src={getAvatarUrl(editing.avatar_url) || ''}
                  alt="avatar"
                />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && editing) handleAvatarUpload(editing.id, file);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
            </div>
          )}

          {error && <div className="admin-ct__error">{error}</div>}

          <div className="admin-ct__form-btns">
            <button
              className="admin-ct__btn admin-ct__btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '...' : t.save}
            </button>
            <button
              className="admin-ct__btn admin-ct__btn--secondary"
              onClick={handleCancel}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Stats correction view ─── */
  if (statsTrader) {
    const currentStats = statsPeriod === 'today' ? statsTrader.stats_today
      : statsPeriod === 'month' ? statsTrader.stats_month
      : statsTrader.stats_all;
    const cur = statsTrader.account_info?.currency ?? 'USD';
    const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', UAH: '₴', RUB: '₽' };
    const fmtMoney = (v: number) => {
      const s = sym[cur] ?? cur + ' ';
      return `${s}${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    type RowMode = 'additive' | 'override';
    const correctionRows: { key: keyof StatsCorrection; label: string; isMoney: boolean; mode: RowMode }[] = [
      { key: 'trades', label: t.ctStatTrades || 'Trades', isMoney: false, mode: 'additive' },
      { key: 'wins', label: 'Wins', isMoney: false, mode: 'additive' },
      { key: 'losses', label: 'Losses', isMoney: false, mode: 'additive' },
      { key: 'turnover', label: t.ctStatTurnover || 'Turnover', isMoney: true, mode: 'additive' },
      { key: 'total_profit', label: t.ctStatProfit || 'Profit', isMoney: true, mode: 'additive' },
      { key: 'max_trade', label: t.ctStatMaxTrade || 'Max trade', isMoney: true, mode: 'override' },
      { key: 'min_trade', label: t.ctStatMinTrade || 'Min trade', isMoney: true, mode: 'override' },
      { key: 'max_profit', label: t.ctStatMaxProfit || 'Max profit', isMoney: true, mode: 'override' },
    ];

    // Compute preview values
    const previewStats = (key: keyof StatsCorrection, mode: RowMode): number => {
      const base = currentStats ? (currentStats as unknown as Record<string, number>)[key] ?? 0 : 0;
      if (mode === 'override') {
        return statsForm[key] != null ? statsForm[key]! : base;
      }
      return base + (statsForm[key] ?? 0);
    };

    // Compute preview win%
    const previewWinPct = (): number => {
      const totalTrades = previewStats('trades', 'additive');
      const totalWins = previewStats('wins', 'additive');
      return totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    };

    return (
      <div className="admin-ct">
        {/* Header */}
        <div className="admin-ct__stats-header">
          <button
            className="admin-ct__back-btn"
            onClick={() => { setStatsTrader(null); setError(null); setStatsSuccess(null); }}
          >
            ←
          </button>
          <span className="admin-ct__stats-title">{statsTrader.name}</span>
        </div>

        {/* Tabs — same style as CopyTradingPanel */}
        <div className="ct__tabs">
          <div className="ct__tabs-nav">
            {(['today', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`ct__tabs-btn${statsPeriod === p ? ' ct__tabs-btn--active' : ''}`}
                onClick={() => setStatsPeriod(p)}
              >
                {p === 'today' ? (t.ctTabToday || 'Today') : p === 'month' ? (t.ctTabMonth || 'Month') : (t.ctTabAll || 'All time')}
              </button>
            ))}
          </div>
          <div className="ct__tabs-body">
            {/* Current stats display — same as CopyTradingPanel */}
            {currentStats ? (
              <ul className="ct__stats-list">
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatTrades || 'Trades'}</span>
                  <span className="ct__stats-v">{currentStats.trades}</span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatProfitable || 'Win %'}</span>
                  <span className="ct__stats-v" style={{ color: currentStats.profitable_trades_pct >= 50 ? '#2ebd85' : '#f6465d' }}>
                    {currentStats.profitable_trades_pct.toFixed(0)}%
                  </span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">Wins / Losses</span>
                  <span className="ct__stats-v">{currentStats.wins} / {currentStats.losses}</span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatTurnover || 'Turnover'}</span>
                  <span className="ct__stats-v">{fmtMoney(currentStats.turnover)}</span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatProfit || 'Profit'}</span>
                  <span className="ct__stats-v" style={{ color: currentStats.total_profit >= 0 ? '#2ebd85' : '#f6465d' }}>
                    {currentStats.total_profit > 0 ? '+' : ''}{fmtMoney(currentStats.total_profit)}
                  </span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatMaxTrade || 'Max trade'}</span>
                  <span className="ct__stats-v">{fmtMoney(currentStats.max_trade)}</span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatMinTrade || 'Min trade'}</span>
                  <span className="ct__stats-v">{fmtMoney(currentStats.min_trade)}</span>
                </li>
                <li className="ct__stats-item">
                  <span className="ct__stats-k">{t.ctStatMaxProfit || 'Max profit'}</span>
                  <span className="ct__stats-v" style={{ color: '#2ebd85' }}>{fmtMoney(currentStats.max_profit)}</span>
                </li>
              </ul>
            ) : (
              <div className="ct__stats-empty">{t.ctNoStats || 'No stats'}</div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="admin-ct__correction">
            <div className="admin-ct__correction-title">Correction</div>

            <div className="admin-ct__correction-table">
            {/* Table header */}
            <div className="admin-ct__correction-row admin-ct__correction-row--header">
              <span className="admin-ct__correction-cell admin-ct__correction-cell--label">Field</span>
              <span className="admin-ct__correction-cell">Current</span>
              <span className="admin-ct__correction-cell">Value</span>
              <span className="admin-ct__correction-cell">Result</span>
            </div>

            {/* Section: Additive */}
            <div className="admin-ct__correction-row admin-ct__correction-row--section">
              <span className="admin-ct__correction-section-label">± Additive (delta)</span>
            </div>
            {correctionRows.filter(r => r.mode === 'additive').map(({ key, label, isMoney }) => {
              const current = currentStats ? (currentStats as unknown as Record<string, number>)[key] ?? 0 : 0;
              const delta = statsForm[key] ?? 0;
              const result = previewStats(key, 'additive');
              return (
                <div className="admin-ct__correction-row" key={key}>
                  <span className="admin-ct__correction-cell admin-ct__correction-cell--label">{label}</span>
                  <span className="admin-ct__correction-cell admin-ct__correction-cell--current">
                    {isMoney ? fmtMoney(current) : current}
                  </span>
                  <span className="admin-ct__correction-cell admin-ct__correction-cell--input">
                    <input
                      type="number"
                      step={isMoney ? '0.01' : '1'}
                      value={delta || ''}
                      placeholder="±0"
                      onChange={(e) => setStatsForm((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    />
                  </span>
                  <span className={`admin-ct__correction-cell admin-ct__correction-cell--result${delta !== 0 ? ' admin-ct__correction-cell--changed' : ''}`}>
                    {isMoney ? fmtMoney(result) : result}
                  </span>
                </div>
              );
            })}
            {/* Win% preview row (read-only) */}
            <div className="admin-ct__correction-row admin-ct__correction-row--derived">
              <span className="admin-ct__correction-cell admin-ct__correction-cell--label">{t.ctStatProfitable || 'Win %'}</span>
              <span className="admin-ct__correction-cell admin-ct__correction-cell--current">
                {currentStats ? `${currentStats.profitable_trades_pct.toFixed(1)}%` : '—'}
              </span>
              <span className="admin-ct__correction-cell" />
              <span className={`admin-ct__correction-cell admin-ct__correction-cell--result${(statsForm.trades || statsForm.wins) ? ' admin-ct__correction-cell--changed' : ''}`}>
                {previewWinPct().toFixed(1)}%
              </span>
            </div>

            {/* Section: Override */}
            <div className="admin-ct__correction-row admin-ct__correction-row--section">
              <span className="admin-ct__correction-section-label">= Override (set)</span>
            </div>
            {correctionRows.filter(r => r.mode === 'override').map(({ key, label, isMoney }) => {
              const current = currentStats ? (currentStats as unknown as Record<string, number>)[key] ?? 0 : 0;
              const val = statsForm[key];
              const isSet = val != null;
              const result = previewStats(key, 'override');
              return (
                <div className="admin-ct__correction-row" key={key}>
                  <span className="admin-ct__correction-cell admin-ct__correction-cell--label">{label}</span>
                  <span className="admin-ct__correction-cell admin-ct__correction-cell--current">
                    {isMoney ? fmtMoney(current) : current}
                  </span>
                  <span className="admin-ct__correction-cell admin-ct__correction-cell--input">
                    <input
                      type="number"
                      step="0.01"
                      value={isSet ? val : ''}
                      placeholder="—"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setStatsForm((prev) => ({ ...prev, [key]: raw === '' ? undefined : Number(raw) }));
                      }}
                    />
                  </span>
                  <span className={`admin-ct__correction-cell admin-ct__correction-cell--result${isSet ? ' admin-ct__correction-cell--changed' : ''}`}>
                    {isMoney ? fmtMoney(result) : result}
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Active corrections for this period */}
        {(() => {
          const active = corrections?.[statsPeriod];
          if (!active) return null;
          const incKeys: (keyof StatsCorrection)[] = ['trades', 'wins', 'losses', 'turnover', 'total_profit'];
          const setKeys: (keyof StatsCorrection)[] = ['max_trade', 'min_trade', 'max_profit'];
          const allKeys = [...incKeys, ...setKeys];
          const hasValues = allKeys.some((k) => active[k] != null);
          if (!hasValues) return null;
          return (
            <div className="admin-ct__active-corrections">
              <div className="admin-ct__active-corrections-header">
                <span className="admin-ct__active-corrections-title">Active corrections ({statsPeriod})</span>
                {isAdmin && (
                  <button
                    className="admin-ct__active-corrections-reset"
                    disabled={statsSaving}
                    onClick={async () => {
                      if (!statsTrader) return;
                      setStatsSaving(true);
                      try {
                        await adminResetCorrections(statsTrader.id, statsPeriod);
                        await load();
                        const doc = await adminGetCorrections(statsTrader.id);
                        setCorrections(doc);
                        setStatsTrader((prev) => {
                          if (!prev) return prev;
                          const fresh = traders.find((tr) => tr.id === prev.id);
                          return fresh ?? prev;
                        });
                        setStatsSuccess(`Corrections reset for ${statsPeriod}`);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Error');
                      }
                      setStatsSaving(false);
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="admin-ct__active-corrections-values">
                {incKeys.map((k) => {
                  const v = active[k];
                  if (!v) return null;
                  const label = k === 'trades' ? 'Trades' : k === 'wins' ? 'Wins' : k === 'losses' ? 'Losses' : k === 'turnover' ? 'Turnover' : 'Profit';
                  return (
                    <span key={k} className={`admin-ct__active-corrections-chip${v > 0 ? ' admin-ct__active-corrections-chip--plus' : ' admin-ct__active-corrections-chip--minus'}`}>
                      ±{label}: {v > 0 ? '+' : ''}{v}
                    </span>
                  );
                })}
                {setKeys.map((k) => {
                  const v = active[k];
                  if (v == null) return null;
                  const label = k === 'max_trade' ? 'Max trade' : k === 'min_trade' ? 'Min trade' : 'Max profit';
                  return (
                    <span key={k} className="admin-ct__active-corrections-chip admin-ct__active-corrections-chip--set">
                      ={label}: {v}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {error && <div className="admin-ct__error">{error}</div>}
        {statsSuccess && <div className="admin-ct__success">{statsSuccess}</div>}

        {isAdmin && (
          <div className="admin-ct__form-btns">
            <button
              className="admin-ct__btn admin-ct__btn--primary"
              onClick={handleApplyStats}
              disabled={statsSaving}
            >
              {statsSaving ? '...' : (t.ctAdminApplyCorrection || 'Apply Correction')}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (subscriptionsTrader) {
    return (
      <div className="admin-ct">
        <div className="admin-ct__stats-header">
          <button
            className="admin-ct__back-btn"
            onClick={() => { setSubscriptionsTrader(null); setSubscriptions([]); setError(null); }}
          >
            ←
          </button>
          <span className="admin-ct__stats-title">{subscriptionsTrader.name}</span>
        </div>

        <div className="admin-ct__toolbar admin-ct__toolbar--between">
          <div className="admin-ct__toolbar-caption">
            {t.ctAdminSubscribersHint || 'Manage active subscribers for this trader'}
          </div>
          <button
            className="admin-ct__btn admin-ct__btn--danger"
            onClick={handleDeactivateAllSubscriptions}
            disabled={subscriptionsSaving || subscriptionsLoading || subscriptions.length === 0}
          >
            {subscriptionsSaving ? '...' : (t.ctAdminDisconnectAll || 'Disconnect all')}
          </button>
        </div>

        {error && <div className="admin-ct__error">{error}</div>}

        <div className="admin-ct__list">
          {subscriptionsLoading && <div className="admin-panel__loading">{t.loading}</div>}
          {!subscriptionsLoading && subscriptions.length === 0 && (
            <div className="admin-panel__empty">{t.ctAdminNoSubscribers || 'No subscribers found'}</div>
          )}
          {!subscriptionsLoading && subscriptions.map((subscription) => (
            <div key={subscription.id} className="admin-ct__item">
              <div className="admin-ct__item-avatar admin-ct__item-avatar--subscriber">
                <span className="admin-ct__item-initials">
                  {(subscription.subscriber_account?.email || String(subscription.user_id)).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="admin-ct__item-info">
                <div className="admin-ct__item-name">{subscription.subscriber_account?.email || `User ${subscription.user_id}`}</div>
                <div className="admin-ct__item-meta admin-ct__item-meta--wrap">
                  <span>User ID: {subscription.user_id}</span>
                  <span>Account: {subscription.subscriber_account_id.slice(0, 8)}…</span>
                  <span>Ratio: {subscription.proportion}%</span>
                  <span>Stop: {subscription.stop_balance}</span>
                  <span>Min: {subscription.min_copy_amount}</span>
                </div>
              </div>
              <div className="admin-ct__item-actions">
                <button
                  className="admin-ct__action-btn admin-ct__action-btn--danger"
                  onClick={() => handleDeactivateSubscription(subscription)}
                  disabled={subscriptionsSaving}
                  title={t.ctAdminDisconnect || 'Disconnect'}
                >
                  ⛔
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── List view ─── */
  return (
    <div className="admin-ct">
      <div className="admin-ct__toolbar">
        {isAdmin ? (
          <button className="admin-ct__btn admin-ct__btn--primary" onClick={handleCreate}>
            + {t.ctAdminCreate || 'New Trader'}
          </button>
        ) : (
          <div className="admin-ct__toolbar-caption">{t.ctAdminOwnerScope || 'You can view your traders and manage your subscribers.'}</div>
        )}
      </div>

      {error && <div className="admin-ct__error">{error}</div>}
      {success && <div className="admin-ct__success">{success}</div>}

      <div className="admin-ct__list">
        {traders.map((trader) => {
          const avatarSrc = getAvatarUrl(trader.avatar_url);
          return (
            <div key={trader.id} className={`admin-ct__item${!trader.is_active ? ' admin-ct__item--inactive' : ''}`}>
              <div className="admin-ct__item-avatar">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={trader.name} />
                ) : (
                  <span className="admin-ct__item-initials">{trader.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="admin-ct__item-info">
                <div className="admin-ct__item-name">
                  {trader.name}
                  {!trader.is_active && <span className="admin-ct__item-badge--inactive">(inactive)</span>}
                </div>
                {trader.description && (
                  <div className="admin-ct__item-desc">{trader.description}</div>
                )}
                <div className="admin-ct__item-meta">
                  <span>👥 {trader.subscriber_count}</span>
                  <span>ID: {trader.account_id.slice(0, 8)}…</span>
                  {trader.account_email && <span>Email: {trader.account_email}</span>}
                </div>
              </div>
              <div className="admin-ct__item-actions">
                <button
                  className={`admin-ct__action-btn ${trader.is_active ? 'admin-ct__action-btn--warn' : 'admin-ct__action-btn--success'}`}
                  onClick={() => handleToggleActive(trader)}
                  disabled={activeToggleId === trader.id}
                  title={trader.is_active ? (t.ctAdminDisableTrader || 'Disable trader') : (t.ctAdminEnableTrader || 'Enable trader')}
                >
                  {activeToggleId === trader.id ? '…' : trader.is_active ? '⏸' : '▶'}
                </button>
                <button
                  className="admin-ct__action-btn"
                  onClick={() => handleOpenSubscriptions(trader)}
                  title={t.ctAdminSubscribers || 'Subscribers'}
                >
                  👥
                </button>
                <button
                  className="admin-ct__action-btn"
                  onClick={() => handleOpenStats(trader)}
                  title="Stats correction"
                >
                  📊
                </button>
                {isAdmin && (
                  <>
                    <button
                      className="admin-ct__action-btn"
                      onClick={() => handleEdit(trader)}
                      title={t.settings || 'Edit'}
                    >
                      ✏️
                    </button>
                    <button
                      className="admin-ct__action-btn admin-ct__action-btn--danger"
                      onClick={() => handleDelete(trader.id)}
                      title={t.remove || 'Delete'}
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {traders.length === 0 && (
          <div className="admin-panel__empty">{t.ctNoTraders || 'No traders'}</div>
        )}
      </div>
    </div>
  );
}
