/**
 * AdminPage — Standalone admin page (opens in a new window).
 * Sidebar navigation on desktop, bottom tabs on mobile.
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { getMyProfile, persistUserAccess, type UserProfile } from '../api/user';
import { getCurrencies, getCategories, type Currency, type CategoryInfo } from '../api/currencies';

/* Heavy admin sub-pages are code-split per tab so the admin bundle loads on demand. */
const AdminIndicatorEditor = lazy(() => import('./AdminIndicatorEditor').then((m) => ({ default: m.AdminIndicatorEditor })));
const AdminCopyTraders = lazy(() => import('./AdminCopyTraders').then((m) => ({ default: m.AdminCopyTraders })));
const AdminTradingTop = lazy(() => import('./AdminTradingTop').then((m) => ({ default: m.AdminTradingTop })));
const AdminChats = lazy(() => import('./AdminChats').then((m) => ({ default: m.AdminChats })));
const AdminBlogArticles = lazy(() => import('./AdminBlogArticles').then((m) => ({ default: m.AdminBlogArticles })));
const AdminBots = lazy(() => import('./AdminBots').then((m) => ({ default: m.AdminBots })));
const AdminAutobotMonitor = lazy(() => import('./AdminAutobotMonitor').then((m) => ({ default: m.AdminAutobotMonitor })));
const AdminServiceLogs = lazy(() => import('./AdminServiceLogs').then((m) => ({ default: m.AdminServiceLogs })));
const AdminBetterAuthEvents = lazy(() => import('./AdminBetterAuthEvents').then((m) => ({ default: m.AdminBetterAuthEvents })));
const AdminBetterJwtDecoder = lazy(() => import('./AdminBetterJwtDecoder').then((m) => ({ default: m.AdminBetterJwtDecoder })));
const AdminPocketErrors = lazy(() => import('./AdminPocketErrors').then((m) => ({ default: m.AdminPocketErrors })));
const AdminAdmins = lazy(() => import('./AdminAdmins').then((m) => ({ default: m.AdminAdmins })));
const AdminTerminalUsers = lazy(() => import('./AdminTerminalUsers').then((m) => ({ default: m.AdminTerminalUsers })));
import {
  getIconOverrides,
  setCategoryIcon,
  setCurrencyIcon,
  uploadCategoryIcon,
  uploadCurrencyIcon,
  removeCategoryIcon,
  removeCurrencyIcon,
  type IconOverrides,
} from '../api/admin';
import {
  getWhitelist,
  addWhitelistEntry,
  deleteWhitelistEntry,
  type WhitelistEntry,
} from '../api/better';
import {
  IconRow,
  MappingTab,
  AdminCandleStats,
} from './AdminPanel';
import { buildPath } from '../configs/routes';

type Tab = 'categories' | 'currencies' | 'indicators' | 'mapping' | 'copyTraders' | 'tradingTop' | 'quotes' | 'whitelist' | 'chats' | 'bots' | 'autobot' | 'serviceLogs' | 'betterAuthEvents' | 'betterJwtDecoder' | 'terminalUsers' | 'pocketErrors' | 'blog' | 'admins';

const TAB_SECTION_MAP: Record<Tab, string> = {
  categories: 'categories',
  currencies: 'currencies',
  indicators: 'indicators',
  mapping: 'mapping',
  copyTraders: 'copy-traders',
  tradingTop: 'trading-top',
  quotes: 'quotes',
  whitelist: 'whitelist',
  chats: 'chats',
  bots: 'bots',
  autobot: 'autobot',
  serviceLogs: 'service-logs',
  betterAuthEvents: 'better-auth-events',
  betterJwtDecoder: 'better-jwt-decoder',
  terminalUsers: 'terminal-users',
  pocketErrors: 'pocket-errors',
  blog: 'blog',
  admins: 'admins',
};

const SECTION_TAB_MAP = Object.fromEntries(
  Object.entries(TAB_SECTION_MAP).map(([tab, section]) => [section, tab as Tab]),
) as Record<string, Tab>;

const SIDEBAR_ITEMS: { id: Tab; icon: string; labelKey: string }[] = [
  { id: 'categories', icon: '📂', labelKey: 'adminCategories' },
  { id: 'currencies', icon: '💱', labelKey: 'adminCurrencies' },
  { id: 'indicators', icon: '📊', labelKey: 'adminIndicators' },
  { id: 'mapping', icon: '🔗', labelKey: 'adminMapping' },
  { id: 'copyTraders', icon: '👥', labelKey: 'ctAdminTab' },
  { id: 'tradingTop', icon: '🏆', labelKey: 'adminTradingTop' },
  { id: 'quotes', icon: '📈', labelKey: 'adminQuotes' },
  { id: 'whitelist', icon: '✅', labelKey: 'adminWhitelist' },
  { id: 'chats', icon: '💬', labelKey: 'adminChats' },
  { id: 'bots', icon: '🤖', labelKey: 'Bots' },
  { id: 'autobot', icon: '🦾', labelKey: 'Autobot' },
  { id: 'serviceLogs', icon: '📜', labelKey: 'Service Logs' },
  { id: 'betterAuthEvents', icon: '🔐', labelKey: 'Better Auth' },
  { id: 'betterJwtDecoder', icon: '🪪', labelKey: 'JWT Decoder' },
  { id: 'terminalUsers', icon: '👤', labelKey: 'Authorized Users' },
  { id: 'pocketErrors', icon: '🧾', labelKey: 'Pocket Errors' },
  { id: 'admins', icon: '👨‍💼', labelKey: 'Admins' },
  { id: 'blog', icon: '📝', labelKey: 'adminBlog' },
];

interface AdminPageProps {
  mode?: 'admin' | 'copy-trader';
}

/* ════════════════════════════════════════
   WhitelistTab
   ════════════════════════════════════════ */

function WhitelistTab({ isActive, t }: { isActive: boolean; t: Record<string, string> }) {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Add form
  const [poUserId, setPoUserId] = useState('');
  const [email, setEmail] = useState('');
  const [comment, setComment] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    setLoading(true);
    getWhitelist()
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [isActive]);

  const handleAdd = useCallback(async () => {
    const pid = poUserId.trim() ? Number(poUserId.trim()) : undefined;
    const em = email.trim() || undefined;
    if (!pid && !em) {
      setAddError(t.adminWlNeedIdOrEmail);
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const entry = await addWhitelistEntry({ po_user_id: pid, email: em, comment: comment.trim() || undefined });
      setEntries((prev) => [entry, ...prev]);
      setPoUserId('');
      setEmail('');
      setComment('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/409|already exists|уже существует/i.test(msg)) {
        setAddError(t.adminWlDuplicate);
      } else {
        setAddError(msg);
      }
    } finally {
      setAdding(false);
    }
  }, [poUserId, email, comment, t]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t.adminWlDeleteConfirm)) return;
    setDeleting(id);
    try {
      await deleteWhitelistEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }, [t]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter((e) =>
      (e.email && e.email.toLowerCase().includes(q)) ||
      (e.po_user_id && String(e.po_user_id).includes(q)) ||
      (e.comment && e.comment.toLowerCase().includes(q))
    );
  }, [entries, search]);

  if (loading) {
    return (
      <div className="admin-page__loading">
        <div className="loading__spinner" />
      </div>
    );
  }

  if (error) {
    return <div className="admin-page__error">{error}</div>;
  }

  return (
    <div className="admin-wl">
      {/* Add form */}
      <div className="admin-wl__form">
        <div className="admin-wl__form-row">
          <input
            className="admin-wl__input"
            type="number"
            placeholder={t.adminWlPoUserId}
            value={poUserId}
            onChange={(e) => setPoUserId(e.target.value)}
          />
          <input
            className="admin-wl__input admin-wl__input--wide"
            type="email"
            placeholder={t.adminWlEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="admin-wl__form-row">
          <input
            className="admin-wl__input admin-wl__input--wide"
            type="text"
            placeholder={t.adminWlComment}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="admin-wl__add-btn" onClick={handleAdd} disabled={adding}>
            {adding ? '…' : t.adminWlAdd}
          </button>
        </div>
        {addError && <div className="admin-wl__form-error">{addError}</div>}
      </div>

      {/* Search */}
      <div className="admin-wl__search">
        <input
          className="admin-wl__input admin-wl__input--wide"
          type="text"
          placeholder={t.search || 'Search…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="admin-wl__count">{filtered.length} / {entries.length}</span>
      </div>

      {/* List */}
      <div className="admin-wl__list">
        {filtered.length === 0 ? (
          <div className="admin-page__empty">{entries.length === 0 ? t.adminWlEmpty : t.noResults}</div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="admin-wl__row">
              <div className="admin-wl__row-main">
                {entry.po_user_id != null && (
                  <span className="admin-wl__badge admin-wl__badge--id">ID: {entry.po_user_id}</span>
                )}
                {entry.email && (
                  <span className="admin-wl__badge admin-wl__badge--email">{entry.email}</span>
                )}
                {entry.comment && (
                  <span className="admin-wl__comment">{entry.comment}</span>
                )}
              </div>
              <div className="admin-wl__row-meta">
                <span className="admin-wl__date">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                {entry.added_by != null && (
                  <span className="admin-wl__added-by">{t.adminWlAddedBy}: {entry.added_by}</span>
                )}
              </div>
              <button
                className="admin-wl__del-btn"
                onClick={() => handleDelete(entry.id)}
                disabled={deleting === entry.id}
                title={t.remove}
              >
                🗑
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   AdminPage (main)
   ════════════════════════════════════════ */

export function AdminPage({ mode = 'admin' }: AdminPageProps) {
  const { t, tCategory } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { section } = useParams<{ section?: string }>();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [icons, setIcons] = useState<IconOverrides>({ categories: {}, currencies: {} });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile()
      .then((data) => {
        setProfile(data);
        persistUserAccess(data);
      })
      .catch((err) => setAccessError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setAccessLoading(false));
  }, []);

  const isAdmin = profile?.is_admin ?? false;
  const hasCopyTraderAccess = profile?.copy_trader_access?.has_access ?? false;
  const limitedMode = mode === 'copy-trader' || (!isAdmin && hasCopyTraderAccess);
  const routeMode: AdminPageProps['mode'] = limitedMode ? 'copy-trader' : 'admin';
  const visibleSidebarItems = useMemo(
    () => (limitedMode ? SIDEBAR_ITEMS.filter((item) => item.id === 'copyTraders') : SIDEBAR_ITEMS),
    [limitedMode],
  );

  const routeTab = section ? SECTION_TAB_MAP[section] ?? null : null;
  const activeTab = useMemo(() => {
    const fallbackTab = visibleSidebarItems[0]?.id ?? (limitedMode ? 'copyTraders' : 'categories');
    return routeTab && visibleSidebarItems.some((item) => item.id === routeTab) ? routeTab : fallbackTab;
  }, [limitedMode, routeTab, visibleSidebarItems]);

  useEffect(() => {
    if (visibleSidebarItems.length === 0 || accessLoading) return;

    const expectedPath = buildPath.adminSection(routeMode, TAB_SECTION_MAP[activeTab]);
    if (location.pathname !== expectedPath) {
      navigate({ pathname: expectedPath, search: location.search }, { replace: true });
    }
  }, [accessLoading, activeTab, location.pathname, location.search, navigate, routeMode, visibleSidebarItems.length]);

  useEffect(() => {
    setSearch('');
    setSidebarOpen(false);
  }, [activeTab]);

  /* ─── Load icons data ─── */
  useEffect(() => {
    if (accessLoading || limitedMode || (!isAdmin && !hasCopyTraderAccess)) return;
    setLoading(true);
    Promise.all([
      getCategories(),
      getCurrencies(undefined, true),
      getIconOverrides().catch(() => ({ categories: {}, currencies: {} } as IconOverrides)),
    ])
      .then(([cats, curs, iconData]) => {
        setCategories(cats);
        setCurrencies(curs);
        setIcons(iconData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accessLoading, limitedMode, isAdmin, hasCopyTraderAccess]);

  /* ─── Icon handlers ─── */
  const handleSaveCatEmoji = useCallback(async (cat: string, emoji: string) => {
    setSaving(cat);
    try {
      await setCategoryIcon(cat, emoji);
      setIcons((prev) => ({ ...prev, categories: { ...prev.categories, [cat]: emoji } }));
    } finally { setSaving(null); }
  }, []);

  const handleUploadCatFile = useCallback(async (cat: string, file: File) => {
    setSaving(cat);
    try {
      const result = await uploadCategoryIcon(cat, file);
      setIcons((prev) => ({ ...prev, categories: { ...prev.categories, [cat]: result.icon_url } }));
    } finally { setSaving(null); }
  }, []);

  const handleDeleteCat = useCallback(async (cat: string) => {
    setSaving(cat);
    try {
      await removeCategoryIcon(cat);
      setIcons((prev) => {
        const next = { ...prev.categories };
        delete next[cat];
        return { ...prev, categories: next };
      });
    } finally { setSaving(null); }
  }, []);

  const handleSaveCurEmoji = useCallback(async (cur: string, emoji: string) => {
    setSaving(cur);
    try {
      await setCurrencyIcon(cur, emoji);
      setIcons((prev) => ({ ...prev, currencies: { ...prev.currencies, [cur]: emoji } }));
    } finally { setSaving(null); }
  }, []);

  const handleUploadCurFile = useCallback(async (cur: string, file: File) => {
    setSaving(cur);
    try {
      const result = await uploadCurrencyIcon(cur, file);
      setIcons((prev) => ({ ...prev, currencies: { ...prev.currencies, [cur]: result.icon_url } }));
    } finally { setSaving(null); }
  }, []);

  const handleDeleteCur = useCallback(async (cur: string) => {
    setSaving(cur);
    try {
      await removeCurrencyIcon(cur);
      setIcons((prev) => {
        const next = { ...prev.currencies };
        delete next[cur];
        return { ...prev, currencies: next };
      });
    } finally { setSaving(null); }
  }, []);

  const filteredCurrencies = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return currencies;
    return currencies.filter((c) => c.currency.toLowerCase().includes(q));
  }, [currencies, search]);

  const tStr = t as unknown as Record<string, string>;

  const handleTabChange = useCallback((nextTab: Tab) => {
    navigate({ pathname: buildPath.adminSection(routeMode, TAB_SECTION_MAP[nextTab]), search: location.search });
  }, [location.search, navigate, routeMode]);

  /* Render tab content */
  const renderContent = () => {
    switch (activeTab) {
      case 'quotes':
        return <AdminCandleStats t={tStr} isActive={activeTab === 'quotes'} />;
      case 'indicators':
        return <AdminIndicatorEditor t={tStr} onRequestHideModal={() => {}} />;
      case 'mapping':
        return <MappingTab isActive={true} t={tStr} />;
      case 'copyTraders':
        return <AdminCopyTraders isActive={true} t={tStr} isAdmin={isAdmin} />;
      case 'tradingTop':
        return <AdminTradingTop isActive={activeTab === 'tradingTop'} t={tStr} />;
      case 'whitelist':
        return <WhitelistTab isActive={activeTab === 'whitelist'} t={tStr} />;
      case 'chats':
        return <AdminChats isActive={activeTab === 'chats'} t={tStr} />;
      case 'bots':
        return <AdminBots isActive={activeTab === 'bots'} t={tStr} />;
      case 'autobot':
        return <AdminAutobotMonitor isActive={activeTab === 'autobot'} t={tStr} />;
      case 'serviceLogs':
        return <AdminServiceLogs isActive={activeTab === 'serviceLogs'} t={tStr} />;
      case 'betterAuthEvents':
        return <AdminBetterAuthEvents isActive={activeTab === 'betterAuthEvents'} t={tStr} />;
      case 'betterJwtDecoder':
        return <AdminBetterJwtDecoder isActive={activeTab === 'betterJwtDecoder'} t={tStr} />;
      case 'terminalUsers':
        return <AdminTerminalUsers isActive={activeTab === 'terminalUsers'} t={tStr} />;
      case 'pocketErrors':
        return <AdminPocketErrors isActive={activeTab === 'pocketErrors'} t={tStr} />;
      case 'admins':
        return <AdminAdmins isActive={activeTab === 'admins'} t={tStr} />;
      case 'blog':
        return <AdminBlogArticles isActive={activeTab === 'blog'} t={tStr} />;
      case 'categories':
        return loading ? (
          <div className="admin-page__loading"><div className="loading__spinner" />{t.loading}</div>
        ) : (
          <div className="admin-panel__list">
            {categories.map((cat) => (
              <IconRow
                key={cat.name}
                name={cat.name}
                displayName={tCategory(cat.name)}
                savedIcon={icons.categories[cat.name]}
                onSaveEmoji={handleSaveCatEmoji}
                onUploadFile={handleUploadCatFile}
                onDelete={handleDeleteCat}
                saving={saving}
                t={tStr}
              />
            ))}
            {categories.length === 0 && (
              <div className="admin-page__empty">{t.adminNoCategories}</div>
            )}
          </div>
        );
      case 'currencies':
        return loading ? (
          <div className="admin-page__loading"><div className="loading__spinner" />{t.loading}</div>
        ) : (
          <>
            <div className="admin-panel__search">
              <input
                className="admin-panel__search-input"
                type="text"
                placeholder={t.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="admin-panel__list">
              {filteredCurrencies.map((cur) => (
                <IconRow
                  key={cur.currency}
                  name={cur.currency}
                  subtitle={cur.category}
                  savedIcon={icons.currencies[cur.currency]}
                  onSaveEmoji={handleSaveCurEmoji}
                  onUploadFile={handleUploadCurFile}
                  onDelete={handleDeleteCur}
                  saving={saving}
                  t={tStr}
                />
              ))}
              {filteredCurrencies.length === 0 && (
                <div className="admin-page__empty">{t.currenciesNotFound}</div>
              )}
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const currentLabel = visibleSidebarItems.find((i) => i.id === activeTab);

  if (accessLoading) {
    return <div className="admin-page__loading"><div className="loading__spinner" />{t.loading}</div>;
  }

  if (accessError) {
    return <div className="admin-page__error">{accessError}</div>;
  }

  if (!isAdmin && !hasCopyTraderAccess) {
    return <div className="admin-page__error">{t.copyTraderAccessDenied}</div>;
  }

  return (
    <div className="admin-page">
      {/* Mobile header */}
      <div className="admin-page__mobile-header">
        <button className="admin-page__burger" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <h1 className="admin-page__mobile-title">
          {currentLabel ? tStr[currentLabel.labelKey] || currentLabel.labelKey : t.adminPanel}
        </h1>
      </div>

      {/* Sidebar */}
      <aside className={`admin-page__sidebar${sidebarOpen ? ' admin-page__sidebar--open' : ''}`}>
        <div className="admin-page__sidebar-header">
          <span className="admin-page__sidebar-logo">{limitedMode ? '👥' : '⚙'}</span>
          <span className="admin-page__sidebar-title">{limitedMode ? t.copyTraderMenu : t.adminPanel}</span>
        </div>
        <nav className="admin-page__nav">
          {visibleSidebarItems.map((item) => (
            <button
              key={item.id}
              className={`admin-page__nav-item${activeTab === item.id ? ' admin-page__nav-item--active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="admin-page__nav-icon">{item.icon}</span>
              <span className="admin-page__nav-label">{tStr[item.labelKey] || item.labelKey}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && <div className="admin-page__overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Content */}
      <main className="admin-page__main">
        <div className="admin-page__content-header">
          <h2 className="admin-page__content-title">
            {currentLabel && <span className="admin-page__content-icon">{currentLabel.icon}</span>}
            {currentLabel ? tStr[currentLabel.labelKey] || currentLabel.labelKey : ''}
          </h2>
        </div>
        <div className="admin-page__content">
          <Suspense fallback={<div className="admin-page__loading"><div className="loading__spinner" />{t.loading}</div>}>
            {renderContent()}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
