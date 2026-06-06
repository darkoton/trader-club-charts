import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminLookupTerminalAuth, type AdminTerminalLookupResult } from '../api/admin';
import {
  adminCreateTradingTopFake,
  adminDeleteTradingTopFake,
  adminGetTradingTopAccounts,
  adminGetTradingTopCorrections,
  adminGetTradingTopFakes,
  adminPatchTradingTopStats,
  adminResetTradingTopCorrections,
  adminUpdateTradingTopAccount,
  adminUpdateTradingTopFake,
  getAvatarUrl,
  type AdminTradingTopAccount,
  type AdminTradingTopCorrections,
  type TradingTopFakePayload,
  type TradingTopFakeStatsInput,
  type TradingTopFakeEntry,
  type StatsCorrection,
} from '../api/copyTrading';
import routes from '../configs/routes';

type InnerTab = 'accounts' | 'fakes';
type Period = 'today' | 'month' | 'all';
type AccountVisibilityFilter = 'all' | 'visible' | 'hidden';
type StatsForm = Record<'trades' | 'wins' | 'losses' | 'turnover' | 'total_profit' | 'max_trade' | 'min_trade' | 'max_profit', string>;

interface AdminTradingTopProps {
  isActive: boolean;
  t: Record<string, string>;
}

const EMPTY_STATS_FORM: StatsForm = {
  trades: '',
  wins: '',
  losses: '',
  turnover: '',
  total_profit: '',
  max_trade: '',
  min_trade: '',
  max_profit: '',
};

const STATS_FIELDS: Array<keyof StatsForm> = ['trades', 'wins', 'losses', 'turnover', 'total_profit', 'max_trade', 'min_trade', 'max_profit'];

function toNumberOrUndefined(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildStatsPayload(form: StatsForm): StatsCorrection {
  const payload: StatsCorrection = {};
  STATS_FIELDS.forEach((field) => {
    const value = toNumberOrUndefined(form[field]);
    if (value == null) return;
    payload[field] = value;
  });
  return payload;
}

function buildFakeStatsPayload(form: StatsForm): TradingTopFakeStatsInput | undefined {
  const payload = buildStatsPayload(form);
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  const amount = Number(value ?? 0);
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    UAH: '₴',
    RUB: '₽',
    KZT: '₸',
  };
  const prefix = symbols[currency] ?? `${currency} `;
  return `${prefix}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function periodLabel(period: Period, t: Record<string, string>): string {
  switch (period) {
    case 'today':
      return t.ctTabToday;
    case 'month':
      return t.ctTabMonth;
    case 'all':
      return t.ctTabAll;
  }
}

export function AdminTradingTop({ isActive, t }: AdminTradingTopProps) {
  const [tab, setTab] = useState<InnerTab>('accounts');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [accountSearch, setAccountSearch] = useState('');
  const [accountVisibilityFilter, setAccountVisibilityFilter] = useState<AccountVisibilityFilter>('all');
  const [accounts, setAccounts] = useState<AdminTradingTopAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({
    leaderboard_visible: true,
    leaderboard_name_override: '',
    leaderboard_avatar_url_override: '',
  });
  const [corrections, setCorrections] = useState<AdminTradingTopCorrections | null>(null);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionPeriod, setCorrectionPeriod] = useState<Period>('today');
  const [correctionForm, setCorrectionForm] = useState<StatsForm>(EMPTY_STATS_FORM);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authResult, setAuthResult] = useState<AdminTerminalLookupResult | null>(null);

  const [fakes, setFakes] = useState<TradingTopFakeEntry[]>([]);
  const [fakesLoading, setFakesLoading] = useState(false);
  const [fakeSaving, setFakeSaving] = useState(false);
  const [editingFakeId, setEditingFakeId] = useState<string | null>(null);
  const [fakeForm, setFakeForm] = useState({
    name: '',
    avatar_url: '',
    po_user_id: '',
    real_balance_usd: '',
    is_visible: true,
    stats_today: EMPTY_STATS_FORM,
    stats_month: EMPTY_STATS_FORM,
    stats_all: EMPTY_STATS_FORM,
  });

  const filteredAccounts = useMemo(() => {
    if (accountVisibilityFilter === 'visible') {
      return accounts.filter((account) => account.leaderboard_visible);
    }
    if (accountVisibilityFilter === 'hidden') {
      return accounts.filter((account) => !account.leaderboard_visible);
    }
    return accounts;
  }, [accounts, accountVisibilityFilter]);

  const selectedAccount = useMemo(
    () => filteredAccounts.find((account) => account.id === selectedAccountId) ?? null,
    [filteredAccounts, selectedAccountId],
  );

  const loadAccounts = useCallback(async (search = '') => {
    setAccountsLoading(true);
    try {
      const data = await adminGetTradingTopAccounts(search);
      setAccounts(data.accounts);
      setSelectedAccountId((prev) => {
        if (prev && data.accounts.some((item) => item.id === prev)) return prev;
        return data.accounts[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setAccounts([]);
    }
    setAccountsLoading(false);
  }, []);

  const loadFakes = useCallback(async () => {
    setFakesLoading(true);
    try {
      const data = await adminGetTradingTopFakes();
      setFakes(data.fakes);
      setEditingFakeId((prev) => prev && data.fakes.some((item) => item.id === prev) ? prev : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setFakes([]);
    }
    setFakesLoading(false);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    setError(null);
    setSuccess(null);
    void loadAccounts('');
    void loadFakes();
  }, [isActive, loadAccounts, loadFakes]);

  const handleSearchAccounts = useCallback(() => {
    setError(null);
    setSuccess(null);
    void loadAccounts(accountSearch);
  }, [loadAccounts, accountSearch]);

  useEffect(() => {
    if (!selectedAccount) return;
    setAccountForm({
      leaderboard_visible: selectedAccount.leaderboard_visible,
      leaderboard_name_override: selectedAccount.leaderboard_name_override ?? '',
      leaderboard_avatar_url_override: selectedAccount.leaderboard_avatar_url_override ?? '',
    });
  }, [selectedAccount]);

  useEffect(() => {
    setAuthResult(null);
  }, [selectedAccountId]);

  useEffect(() => {
    setSelectedAccountId((prev) => {
      if (prev && filteredAccounts.some((account) => account.id === prev)) return prev;
      return filteredAccounts[0]?.id ?? null;
    });
  }, [filteredAccounts]);

  useEffect(() => {
    if (!selectedAccountId) {
      setCorrections(null);
      return;
    }
    setCorrectionsLoading(true);
    adminGetTradingTopCorrections(selectedAccountId)
      .then((data) => setCorrections(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setCorrectionsLoading(false));
  }, [selectedAccountId]);

  const handleSaveAccount = useCallback(async () => {
    if (!selectedAccount) return;
    setAccountSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminUpdateTradingTopAccount(selectedAccount.id, {
        leaderboard_visible: accountForm.leaderboard_visible,
        leaderboard_name_override: accountForm.leaderboard_name_override.trim() || null,
        leaderboard_avatar_url_override: accountForm.leaderboard_avatar_url_override.trim() || null,
      });
      await loadAccounts(accountSearch);
      setSuccess(t.adminTradingTopSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setAccountSaving(false);
  }, [selectedAccount, accountForm, loadAccounts, accountSearch, t]);

  const handleApplyCorrection = useCallback(async () => {
    if (!selectedAccount) return;
    const payload = buildStatsPayload(correctionForm);
    if (Object.keys(payload).length === 0) {
      setError(t.adminTradingTopCorrectionEmpty);
      return;
    }
    setCorrectionSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminPatchTradingTopStats(selectedAccount.id, correctionPeriod, payload);
      setCorrectionForm(EMPTY_STATS_FORM);
      setCorrections(await adminGetTradingTopCorrections(selectedAccount.id));
      await loadAccounts(accountSearch);
      setSuccess(t.adminTradingTopCorrectionsSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setCorrectionSaving(false);
  }, [selectedAccount, correctionForm, correctionPeriod, loadAccounts, accountSearch, t]);

  const handleResetCorrections = useCallback(async (period: Period) => {
    if (!selectedAccount) return;
    setCorrectionSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminResetTradingTopCorrections(selectedAccount.id, period);
      setCorrections(await adminGetTradingTopCorrections(selectedAccount.id));
      await loadAccounts(accountSearch);
      setSuccess(t.adminTradingTopCorrectionsReset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setCorrectionSaving(false);
  }, [selectedAccount, loadAccounts, accountSearch, t]);

  const handleLoginAsAccount = useCallback(async () => {
    if (!selectedAccount) return;
    setAuthLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await adminLookupTerminalAuth({
        account_id: selectedAccount.id,
        po_email: selectedAccount.email,
        po_user_id: selectedAccount.po_user_id,
        refresh: true,
      });

      setAuthResult(result);

      const terminalUrl = new URL(routes.Terminal, window.location.origin);
      terminalUrl.searchParams.set('token', result.access_token);

      const openedWindow = window.open(terminalUrl.toString(), '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        window.location.href = terminalUrl.toString();
      }

      setSuccess(t.adminTradingTopAuthOpened);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setAuthLoading(false);
  }, [selectedAccount, t]);

  const handleSelectFake = useCallback((fake: TradingTopFakeEntry) => {
    setEditingFakeId(fake.id);
    setFakeForm({
      name: fake.name,
      avatar_url: fake.avatar_url ?? '',
      po_user_id: String(fake.po_user_id || ''),
      real_balance_usd: String(fake.real_balance_usd || ''),
      is_visible: fake.is_visible,
      stats_today: Object.fromEntries(STATS_FIELDS.map((field) => [field, String(fake.stats_today[field] ?? '')])) as StatsForm,
      stats_month: Object.fromEntries(STATS_FIELDS.map((field) => [field, String(fake.stats_month[field] ?? '')])) as StatsForm,
      stats_all: Object.fromEntries(STATS_FIELDS.map((field) => [field, String(fake.stats_all[field] ?? '')])) as StatsForm,
    });
    setError(null);
    setSuccess(null);
  }, []);

  const handleCreateFake = useCallback(() => {
    setEditingFakeId(null);
    setFakeForm({
      name: '',
      avatar_url: '',
      po_user_id: '',
      real_balance_usd: '',
      is_visible: true,
      stats_today: EMPTY_STATS_FORM,
      stats_month: EMPTY_STATS_FORM,
      stats_all: EMPTY_STATS_FORM,
    });
    setError(null);
    setSuccess(null);
  }, []);

  const handleSaveFake = useCallback(async () => {
    if (!fakeForm.name.trim()) {
      setError(t.adminTradingTopNameRequired);
      return;
    }
    const payload: TradingTopFakePayload = {
      name: fakeForm.name.trim(),
      avatar_url: fakeForm.avatar_url.trim() || null,
      po_user_id: toNumberOrUndefined(fakeForm.po_user_id),
      real_balance_usd: toNumberOrUndefined(fakeForm.real_balance_usd),
      is_visible: fakeForm.is_visible,
      stats_today: buildFakeStatsPayload(fakeForm.stats_today),
      stats_month: buildFakeStatsPayload(fakeForm.stats_month),
      stats_all: buildFakeStatsPayload(fakeForm.stats_all),
    };

    setFakeSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingFakeId) {
        await adminUpdateTradingTopFake(editingFakeId, payload);
      } else {
        await adminCreateTradingTopFake(payload);
      }
      await loadFakes();
      setSuccess(editingFakeId ? t.adminTradingTopFakeUpdated : t.adminTradingTopFakeCreated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setFakeSaving(false);
  }, [editingFakeId, fakeForm, loadFakes, t]);

  const handleDeleteFake = useCallback(async () => {
    if (!editingFakeId) return;
    if (!confirm(t.adminDeleteConfirm || 'Delete?')) return;
    setFakeSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminDeleteTradingTopFake(editingFakeId);
      await loadFakes();
      handleCreateFake();
      setSuccess(t.adminTradingTopFakeDeleted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
    setFakeSaving(false);
  }, [editingFakeId, loadFakes, handleCreateFake, t]);

  const currentCorrections = corrections?.[correctionPeriod];

  return (
    <div className="admin-top">
      <div className="admin-top__tabs">
        <button
          type="button"
          className={`admin-top__tab${tab === 'accounts' ? ' admin-top__tab--active' : ''}`}
          onClick={() => setTab('accounts')}
        >
          {t.adminTradingTopAccounts}
        </button>
        <button
          type="button"
          className={`admin-top__tab${tab === 'fakes' ? ' admin-top__tab--active' : ''}`}
          onClick={() => setTab('fakes')}
        >
          {t.adminTradingTopFakes}
        </button>
      </div>

      {error && <div className="admin-top__message admin-top__message--error">{error}</div>}
      {success && <div className="admin-top__message admin-top__message--success">{success}</div>}

      {tab === 'accounts' && (
        <div className="admin-top__grid">
          <div className="admin-top__panel">
            <div className="admin-top__toolbar">
              <input
                className="admin-top__search"
                type="text"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchAccounts();
                  }
                }}
                placeholder={t.adminTradingTopSearchAccounts}
              />
              <select
                className="admin-top__input"
                value={accountVisibilityFilter}
                onChange={(e) => setAccountVisibilityFilter(e.target.value as AccountVisibilityFilter)}
              >
                <option value="all">{t.all}</option>
                <option value="visible">{t.adminTradingTopVisible}</option>
                <option value="hidden">{t.adminTradingTopHidden}</option>
              </select>
              <button type="button" className="admin-top__btn admin-top__btn--secondary" onClick={handleSearchAccounts}>
                {t.search}
              </button>
            </div>

            <div className="admin-top__list">
              {accountsLoading && <div className="admin-top__empty">{t.loading}</div>}
              {!accountsLoading && filteredAccounts.length === 0 && <div className="admin-top__empty">{t.adminTradingTopNoAccounts}</div>}
              {filteredAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`admin-top__item${selectedAccountId === account.id ? ' admin-top__item--active' : ''}`}
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  <div className="admin-top__item-main">
                    <div className="admin-top__item-title">{account.nickname || account.email}</div>
                    <div className="admin-top__item-subtitle">{account.email}</div>
                    <div className="admin-top__chips">
                      <span className="admin-top__chip">PO ID: {account.po_user_id}</span>
                      <span className="admin-top__chip">{formatMoney(account.real_balance, account.real_currency)}</span>
                      <span className={`admin-top__chip${account.leaderboard_visible ? ' admin-top__chip--green' : ''}`}>
                        {account.leaderboard_visible ? t.adminTradingTopVisible : t.adminTradingTopHidden}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-top__panel admin-top__panel--detail">
            {!selectedAccount && <div className="admin-top__empty">{t.adminTradingTopSelectAccount}</div>}
            {selectedAccount && (
              <>
                <div className="admin-top__detail-header">
                  <div>
                    <div className="admin-top__detail-title">{selectedAccount.nickname || selectedAccount.email}</div>
                    <div className="admin-top__detail-subtitle">{selectedAccount.real_login || selectedAccount.email}</div>
                  </div>
                  <div className="admin-top__avatar">
                    {selectedAccount.avatar_url ? <img src={getAvatarUrl(selectedAccount.avatar_url) ?? selectedAccount.avatar_url} alt="" /> : (selectedAccount.nickname || selectedAccount.email).slice(0, 2).toUpperCase()}
                  </div>
                </div>

                <div className="admin-top__section">
                  <div className="admin-top__section-title">{t.adminTradingTopTerminalAuth}</div>
                  <div className="admin-top__chips admin-top__chips--wrap">
                    <span className="admin-top__chip">account_id: {selectedAccount.id}</span>
                    <span className="admin-top__chip">email: {selectedAccount.email}</span>
                    <span className="admin-top__chip">PO ID: {selectedAccount.po_user_id}</span>
                  </div>

                  {authResult && (
                    <>
                      <div className="admin-top__chips admin-top__chips--wrap">
                        <span className="admin-top__chip">{t.adminTradingTopTerminalUserId}: {authResult.terminal_user_id}</span>
                        <span className={`admin-top__chip${authResult.is_active ? ' admin-top__chip--green' : ''}`}>
                          {t.adminTradingTopAccountActive}: {String(authResult.is_active)}
                        </span>
                        <span className={`admin-top__chip${authResult.token_refreshed ? ' admin-top__chip--green' : ''}`}>
                          {t.adminTradingTopTokenRefreshed}: {String(authResult.token_refreshed)}
                        </span>
                      </div>
                      <div className="admin-top__field">
                        <span className="admin-top__field-label">{t.adminTradingTopTokenExpires}</span>
                        <div className="admin-top__chip">{formatDateTime(authResult.token_expires_at)}</div>
                      </div>
                      <div className="admin-top__field">
                        <span className="admin-top__field-label">{t.adminTradingTopLastAuthAt}</span>
                        <div className="admin-top__chip">{formatDateTime(authResult.last_auth_at)}</div>
                      </div>
                    </>
                  )}

                  <div className="admin-top__actions">
                    <button
                      type="button"
                      className="admin-top__btn admin-top__btn--primary"
                      onClick={() => void handleLoginAsAccount()}
                      disabled={authLoading}
                    >
                      {authLoading ? '…' : t.adminTradingTopOpenTerminal}
                    </button>
                  </div>
                </div>

                <div className="admin-top__section">
                  <label className="admin-top__checkbox">
                    <input
                      type="checkbox"
                      checked={accountForm.leaderboard_visible}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, leaderboard_visible: e.target.checked }))}
                    />
                    <span>{t.adminTradingTopVisible}</span>
                  </label>
                  <label className="admin-top__label">{t.adminTradingTopOverrideName}</label>
                  <input
                    className="admin-top__input"
                    type="text"
                    value={accountForm.leaderboard_name_override}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, leaderboard_name_override: e.target.value }))}
                    placeholder={t.adminTradingTopPublicName}
                  />
                  <label className="admin-top__label">{t.adminTradingTopOverrideAvatar}</label>
                  <input
                    className="admin-top__input"
                    type="text"
                    value={accountForm.leaderboard_avatar_url_override}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, leaderboard_avatar_url_override: e.target.value }))}
                    placeholder={t.adminTradingTopPublicAvatar}
                  />
                  <button type="button" className="admin-top__btn admin-top__btn--primary" onClick={handleSaveAccount} disabled={accountSaving}>
                    {accountSaving ? '…' : t.adminTradingTopSave}
                  </button>
                </div>

                <div className="admin-top__section">
                  <div className="admin-top__section-title">{t.adminTradingTopCorrections}</div>
                  <div className="ct__tabs">
                    <div className="ct__tabs-nav">
                      {(['today', 'month', 'all'] as Period[]).map((period) => (
                        <button
                          key={period}
                          type="button"
                          className={`ct__tabs-btn${correctionPeriod === period ? ' ct__tabs-btn--active' : ''}`}
                          onClick={() => setCorrectionPeriod(period)}
                        >
                          {periodLabel(period, t)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {correctionsLoading ? (
                    <div className="admin-top__empty">{t.loading}</div>
                  ) : (
                    <div className="admin-top__chips admin-top__chips--wrap">
                      <span className="admin-top__chip">{t.adminTradingTopVisible}: {corrections?.leaderboard_visible ? t.confirm : t.adminTradingTopHidden}</span>
                      {currentCorrections && Object.entries(currentCorrections).map(([key, value]) => (
                        value != null && key !== 'date' && key !== 'year_month' ? (
                          <span key={key} className="admin-top__chip">{key}: {String(value)}</span>
                        ) : null
                      ))}
                    </div>
                  )}

                  <div className="admin-top__stats-grid">
                    {STATS_FIELDS.map((field) => (
                      <label key={field} className="admin-top__field">
                        <span className="admin-top__field-label">{field}</span>
                        <input
                          className="admin-top__input"
                          type="number"
                          value={correctionForm[field]}
                          onChange={(e) => setCorrectionForm((prev) => ({ ...prev, [field]: e.target.value }))}
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="admin-top__actions">
                    <button type="button" className="admin-top__btn admin-top__btn--primary" onClick={handleApplyCorrection} disabled={correctionSaving}>
                      {correctionSaving ? '…' : t.adminTradingTopApplyCorrections}
                    </button>
                    <button type="button" className="admin-top__btn admin-top__btn--secondary" onClick={() => setCorrectionForm(EMPTY_STATS_FORM)}>
                      {t.reset}
                    </button>
                    <button type="button" className="admin-top__btn admin-top__btn--danger" onClick={() => void handleResetCorrections(correctionPeriod)} disabled={correctionSaving}>
                      {t.adminTradingTopResetCorrections}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'fakes' && (
        <div className="admin-top__grid">
          <div className="admin-top__panel">
            <div className="admin-top__toolbar admin-top__toolbar--between">
              <div className="admin-top__section-title">{t.adminTradingTopFakes}</div>
              <button type="button" className="admin-top__btn admin-top__btn--primary" onClick={handleCreateFake}>
                {t.adminTradingTopCreateFake}
              </button>
            </div>

            <div className="admin-top__list">
              {fakesLoading && <div className="admin-top__empty">{t.loading}</div>}
              {!fakesLoading && fakes.length === 0 && <div className="admin-top__empty">{t.adminTradingTopNoFakes}</div>}
              {fakes.map((fake) => (
                <button
                  key={fake.id}
                  type="button"
                  className={`admin-top__item${editingFakeId === fake.id ? ' admin-top__item--active' : ''}`}
                  onClick={() => handleSelectFake(fake)}
                >
                  <div className="admin-top__item-main">
                    <div className="admin-top__item-title">{fake.name}</div>
                    <div className="admin-top__item-subtitle">PO ID: {fake.po_user_id}</div>
                    <div className="admin-top__chips">
                      <span className="admin-top__chip">{formatMoney(fake.real_balance_usd, 'USD')}</span>
                      <span className={`admin-top__chip${fake.is_visible ? ' admin-top__chip--green' : ''}`}>{fake.is_visible ? t.adminTradingTopVisible : t.adminTradingTopHidden}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-top__panel admin-top__panel--detail">
            {!editingFakeId && !fakeForm.name && <div className="admin-top__empty">{t.adminTradingTopSelectFake}</div>}

            <div className="admin-top__section">
              <label className="admin-top__label">{t.adminTradingTopName}</label>
              <input className="admin-top__input" type="text" value={fakeForm.name} onChange={(e) => setFakeForm((prev) => ({ ...prev, name: e.target.value }))} />
              <label className="admin-top__label">{t.adminTradingTopAvatarUrl}</label>
              <input className="admin-top__input" type="text" value={fakeForm.avatar_url} onChange={(e) => setFakeForm((prev) => ({ ...prev, avatar_url: e.target.value }))} />
              <div className="admin-top__stats-grid admin-top__stats-grid--two">
                <label className="admin-top__field">
                  <span className="admin-top__field-label">{t.adminTradingTopPoId}</span>
                  <input className="admin-top__input" type="number" value={fakeForm.po_user_id} onChange={(e) => setFakeForm((prev) => ({ ...prev, po_user_id: e.target.value }))} />
                </label>
                <label className="admin-top__field">
                  <span className="admin-top__field-label">{t.adminTradingTopBalance}</span>
                  <input className="admin-top__input" type="number" value={fakeForm.real_balance_usd} onChange={(e) => setFakeForm((prev) => ({ ...prev, real_balance_usd: e.target.value }))} />
                </label>
              </div>
              <label className="admin-top__checkbox">
                <input type="checkbox" checked={fakeForm.is_visible} onChange={(e) => setFakeForm((prev) => ({ ...prev, is_visible: e.target.checked }))} />
                <span>{t.adminTradingTopVisible}</span>
              </label>
            </div>

            {(['stats_today', 'stats_month', 'stats_all'] as const).map((key) => (
              <div key={key} className="admin-top__section">
                <div className="admin-top__section-title">
                  {key === 'stats_today' ? t.ctTabToday : key === 'stats_month' ? t.ctTabMonth : t.ctTabAll}
                </div>
                <div className="admin-top__stats-grid">
                  {STATS_FIELDS.map((field) => (
                    <label key={`${key}-${field}`} className="admin-top__field">
                      <span className="admin-top__field-label">{field}</span>
                      <input
                        className="admin-top__input"
                        type="number"
                        value={fakeForm[key][field]}
                        onChange={(e) => setFakeForm((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], [field]: e.target.value },
                        }))}
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="admin-top__actions">
              <button type="button" className="admin-top__btn admin-top__btn--primary" onClick={handleSaveFake} disabled={fakeSaving}>
                {fakeSaving ? '…' : editingFakeId ? t.adminTradingTopUpdateFake : t.adminTradingTopCreateFake}
              </button>
              <button type="button" className="admin-top__btn admin-top__btn--secondary" onClick={handleCreateFake}>
                {t.reset}
              </button>
              {editingFakeId && (
                <button type="button" className="admin-top__btn admin-top__btn--danger" onClick={handleDeleteFake} disabled={fakeSaving}>
                  {t.adminTradingTopDeleteFake}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}