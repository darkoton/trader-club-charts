import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ChartConfig, GridLayout } from '../types/chart';
import { TIMEFRAMES, INDICATOR_REGISTRY, getGridTemplateAreas, getChartGridArea, getGridCols, getGridRows } from '../types/chart';
import { useI18n } from '../i18n';
import { TVChart } from './TVChart';
import type { ChartHandle, TVStudyInfo } from './TVChart';
import type { Currency } from '../api/currencies';
import { getCategoryIcon, getCurrencyDisplayIcon, renderIcon } from '../utils/icons';
import { useAccountBonus } from '../hooks/useAccountBonus';
import { resolveDisplayPayout } from '../utils/payout';
import { TradingPanel } from './TradingPanel';
import type { ActiveBet } from './TradingPanel';
import { BetHistory } from './BetHistory';
import type { BetterAccount } from '../api/better';
import { betterSocket } from '../api/betterSocket';
import type { PoAsset } from '../api/betterSocket';

/** Currency-type categories that support OTC/Forex sub-filter */
const CURRENCY_CATS = ['currency', 'currencies', 'forex'];
const CCP_MIN_PAYOUT_KEY = 'ccp_minPayout';
const CCP_NAV_BINDINGS_KEY = 'ccp_nav_bindings_v1';

interface CurrencyNavBindings {
  prevKey: string;
  nextKey: string;
}

function normalizeShortcutKey(key: string): string {
  if (!key) return '';
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toUpperCase() : key;
}

function readCurrencyNavBindings(): CurrencyNavBindings {
  try {
    const raw = localStorage.getItem(CCP_NAV_BINDINGS_KEY);
    if (!raw) return { prevKey: 'ArrowLeft', nextKey: 'ArrowRight' };
    const parsed = JSON.parse(raw) as Partial<CurrencyNavBindings>;
    return {
      prevKey: normalizeShortcutKey(parsed.prevKey ?? 'ArrowLeft') || 'ArrowLeft',
      nextKey: normalizeShortcutKey(parsed.nextKey ?? 'ArrowRight') || 'ArrowRight',
    };
  } catch {
    return { prevKey: 'ArrowLeft', nextKey: 'ArrowRight' };
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function isDragBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (isEditableTarget(target)) return true;
  if (target.closest('[data-card-drag-handle="true"]')) return false;

  const interactive = target.closest('button, a, input, textarea, select, [role="button"], [data-no-card-drag="true"]');
  return Boolean(interactive);
}

/**
 * Find a Currency by PO asset name (e.g. "CADJPY_otc").
 * Tries: exact match by api_name → exact by currency → fuzzy by normalizing the PO name.
 */
function buildAssetLookupKeys(value: string | null | undefined): string[] {
  if (!value) return [];
  const raw = value.trim();
  if (!raw) return [];

  const upper = raw.toUpperCase();
  const hasOtc = /(?:\bOTC\b|_OTC$)/i.test(raw);
  const withoutOtc = upper
    .replace(/_OTC$/i, '')
    .replace(/\bOTC\b/gi, '')
    .trim();
  const compact = withoutOtc.replace(/[^A-Z0-9]/g, '');

  const keys = new Set<string>();
  keys.add(upper);
  keys.add(upper.replace(/\s+/g, ' '));

  if (compact) {
    keys.add(compact);
    keys.add(hasOtc ? `${compact}_OTC` : compact);
    keys.add(hasOtc ? `${compact} OTC` : compact);
  }

  if (hasOtc && compact) {
    keys.add(`${compact}_OTC`);
    keys.add(`${compact} OTC`);
  }

  return Array.from(keys).filter(Boolean);
}

function findCurrencyByAsset(currencies: Currency[], assetName: string): Currency | undefined {
  const lookupKeys = new Set(buildAssetLookupKeys(assetName));
  const targetHasOtc = /(?:\bOTC\b|_OTC$)/i.test(assetName);

  const normalized = currencies.find((currency) => {
    const currencyHasOtc = /(?:\bOTC\b|_OTC$)/i.test(`${currency.api_name ?? ''} ${currency.currency}`);
    if (targetHasOtc !== currencyHasOtc && (targetHasOtc || currencyHasOtc)) {
      return false;
    }

    const currencyKeys = new Set([
      ...buildAssetLookupKeys(currency.currency),
      ...buildAssetLookupKeys(currency.api_name ?? undefined),
    ]);

    for (const key of currencyKeys) {
      if (lookupKeys.has(key)) return true;
    }
    return false;
  });
  if (normalized) return normalized;

  // 1. Direct match (display name or api_name)
  const direct = currencies.find((c) => c.currency === assetName || c.api_name === assetName);
  if (direct) return direct;

  // 2. Normalize: "CADJPY_otc" → base "CADJPY", isOtc=true
  const isOtc = assetName.toLowerCase().endsWith('_otc');
  const base = isOtc ? assetName.slice(0, -4) : assetName;

  // Try to split 6-char forex pair: "CADJPY" → "CAD" + "JPY" → "CAD/JPY"
  if (base.length === 6 && /^[A-Z]{6}$/i.test(base)) {
    const left = base.slice(0, 3).toUpperCase();
    const right = base.slice(3, 6).toUpperCase();
    const displayNameSlash = `${left}/${right}`;
    // Try with and without OTC suffix
    const candidates = isOtc
      ? [`${displayNameSlash} OTC`, `${displayNameSlash} otc`, displayNameSlash]
      : [displayNameSlash, `${displayNameSlash} OTC`];
    for (const name of candidates) {
      const found = currencies.find((c) => c.currency === name);
      if (found) return found;
    }
  }

  // 3. Fuzzy: strip all non-alphanumeric, compare lowercased
  const norm = base.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fuzzy = currencies.find((c) => {
    const cn = c.currency.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cn === norm || cn === norm + 'otc';
  });
  if (fuzzy) return fuzzy;

  return undefined;
}

interface ChartGridProps {
  charts: ChartConfig[];
  layout: GridLayout;
  onOpenSettings: (chartId: string) => void;
  onRemoveChart: (chartId: string) => void;
  onUpdateChart: (chart: ChartConfig) => void;
  onSwapCharts: (fromIdx: number, toIdx: number) => void;
  currencies: Currency[];
  favorites: string[];
  onToggleFavorite: (currency: string) => void;
  dragEnabled: boolean;
  autoScroll?: number;
  /* Trading panel props */
  betterAccount: BetterAccount | null;
  isBetDemo: boolean;
  balanceCurrency?: string;
  isMobile?: boolean;
  showBetting?: boolean;
  onOpenCopyTrading?: () => void;
  onOpenAccountStats?: () => void;
  onOpenTradingTop?: () => void;
  onOpenWebApp?: () => void;
}

export function ChartGrid({
  charts,
  layout,
  onOpenSettings,
  onRemoveChart,
  onUpdateChart,
  onSwapCharts,
  currencies,
  favorites,
  onToggleFavorite,
  dragEnabled,
  autoScroll,
  betterAccount,
  isBetDemo,
  balanceCurrency,
  isMobile,
  showBetting = true,
  onOpenCopyTrading,
  onOpenAccountStats,
  onOpenTradingTop,
  onOpenWebApp,
}: ChartGridProps) {
  const visibleCharts = charts.slice(0, layout.maxCharts);
  const isMultiDesktop = !isMobile && layout.maxCharts > 1;

  /* ─── Drag & Drop state ─── */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback((idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      onSwapCharts(dragIdx, idx);
    }
    setDragIdx(null);
    setOverIdx(null);
  }, [dragIdx, onSwapCharts]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  const gridEl = (
    <div
      className={`chart-grid${dragEnabled ? ' chart-grid--drag-mode' : ''}`}
      style={{
        gridTemplateColumns: `repeat(${getGridCols(layout)}, 1fr)`,
        gridTemplateRows: `repeat(${getGridRows(layout)}, 1fr)`,
        gridTemplateAreas: getGridTemplateAreas(layout),
      }}
    >
      {visibleCharts.map((config, idx) => (
        <ChartCard
          key={config.id}
          config={config}
          index={idx}
          gridArea={getChartGridArea(idx)}
          onOpenSettings={onOpenSettings}
          onRemoveChart={onRemoveChart}
          onUpdateChart={onUpdateChart}
          currencies={currencies}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          dragEnabled={dragEnabled}
          autoScroll={autoScroll}
          betterAccount={betterAccount}
          isBetDemo={isBetDemo}
          balanceCurrency={balanceCurrency}
          isMobile={isMobile}
          /* Sidebar mode */
          showTradingPanel={showBetting}
          hideHistory={isMultiDesktop}
          onOpenCopyTrading={onOpenCopyTrading}
          onOpenAccountStats={onOpenAccountStats}
          onOpenTradingTop={onOpenTradingTop}
          onOpenWebApp={onOpenWebApp}
          /* Drag & Drop */
          isDragging={dragIdx === idx}
          isDragOver={overIdx === idx && dragIdx !== idx}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(idx));
            const dragGhost = document.createElement('canvas');
            dragGhost.width = 1;
            dragGhost.height = 1;
            e.dataTransfer.setDragImage(dragGhost, 0, 0);
            handleDragStart(idx);
          }}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={() => handleDrop(idx)}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );

  if (!isMultiDesktop) return gridEl;

  return (
    <div className="chart-grid-wrapper">
      {gridEl}
      <div className="chart-grid-sidebar">
        <BetHistory
          account={betterAccount}
          isDemo={isBetDemo}
          currencies={currencies}
          balanceCurrency={balanceCurrency}
          onOpenCopyTrading={onOpenCopyTrading}
          onOpenAccountStats={onOpenAccountStats}
          onOpenTradingTop={onOpenTradingTop}
          onOpenWebApp={onOpenWebApp}
          onSelectAsset={(assetName) => {
            const cur = findCurrencyByAsset(currencies, assetName);
            console.debug('[ChartGrid:sidebar] onSelectAsset:', assetName, '→ found:', cur?.currency ?? 'NOT FOUND', 'api_name:', cur?.api_name, 'currencies.length:', currencies.length);
            if (visibleCharts.length === 0) return;
            if (cur) {
              onUpdateChart({
                ...visibleCharts[0],
                currency: cur.currency,
                currencyInfo: {
                  currency: cur.currency,
                  profit: cur.profit,
                  category: cur.category,
                  is_active: cur.is_active,
                  api_name: cur.api_name ?? null,
                },
              });
            } else {
              console.warn('[ChartGrid:sidebar] currency not found for asset:', assetName);
            }
          }}
        />
      </div>
    </div>
  );
}

/* ─── Individual chart card ─── */

interface ChartCardProps {
  config: ChartConfig;
  index: number;
  gridArea: string;
  onOpenSettings: (chartId: string) => void;
  onRemoveChart: (chartId: string) => void;
  onUpdateChart: (chart: ChartConfig) => void;
  currencies: Currency[];
  favorites: string[];
  onToggleFavorite: (currency: string) => void;
  dragEnabled: boolean;
  autoScroll?: number;
  betterAccount: BetterAccount | null;
  isBetDemo: boolean;
  balanceCurrency?: string;
  isMobile?: boolean;
  /* Layout mode */
  showTradingPanel: boolean;
  hideHistory?: boolean;
  onOpenCopyTrading?: () => void;
  onOpenAccountStats?: () => void;
  onOpenTradingTop?: () => void;
  onOpenWebApp?: () => void;
  /* Drag & Drop */
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function ChartCard({
  config,
  index,
  gridArea,
  onOpenSettings,
  onRemoveChart,
  onUpdateChart,
  currencies,
  favorites,
  onToggleFavorite,
  dragEnabled,
  autoScroll,
  betterAccount,
  isBetDemo,
  balanceCurrency,
  isMobile,
  showTradingPanel,
  hideHistory,
  onOpenCopyTrading,
  onOpenAccountStats,
  onOpenTradingTop,
  onOpenWebApp,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ChartCardProps) {
  const { t, tCategory, locale: appLocale } = useI18n();
  const { applyBonus } = useAccountBonus();
  const chartRef = useRef<ChartHandle | null>(null);
  const displayName = config.currency || `${t.chartN} #${index + 1}`;

  /* ─── Active bets state (shared between TradingPanel and TVChart) ─── */
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const getCurrentPrice = useCallback(() => chartRef.current?.getCurrentPrice() ?? null, []);

  // Debug: log apiName for this chart card
  useEffect(() => {
    console.debug('[ChartCard] currency=', config.currency, 'apiName=', config.currencyInfo?.api_name, 'showTradingPanel=', showTradingPanel);
  }, [config.currency, config.currencyInfo?.api_name, showTradingPanel]);

  /* ─── PO asset timeframe limits ─── */
  const findPoAsset = useCallback((): PoAsset | undefined => {
    const apiName = config.currencyInfo?.api_name;
    if (apiName) {
      const exact = betterSocket.getPoAsset(apiName);
      if (exact) return exact;
    }
    const cur = config.currency;
    if (cur) {
      // Detect OTC by api_name suffix or display name suffix (" OTC")
      const isOtcCurrency = apiName?.toLowerCase().endsWith('_otc')
        || cur.toLowerCase().trimEnd().endsWith(' otc');
      // Strip " OTC" suffix first, then separators: "CAD/CHF OTC" → "CADCHF"
      const normalized = cur
        .replace(/\s+otc\s*$/i, '')
        .replace(/[\s/\\-]/g, '');
      if (isOtcCurrency) {
        // For OTC currencies try the canonical "_otc" symbol first
        const byOtc = betterSocket.getPoAsset(normalized + '_otc');
        if (byOtc) return byOtc;
      }
      // Try exact normalized name (forex or symbol already in po_assets)
      const byName = betterSocket.getPoAsset(normalized);
      if (byName) return byName;
    }
    return undefined;
  }, [config.currencyInfo?.api_name, config.currency]);

  const [poAsset, setPoAsset] = useState<PoAsset | undefined>(findPoAsset);
  useEffect(() => {
    const unsub = betterSocket.onPoAssets(() => {
      setPoAsset(findPoAsset());
    });
    return unsub;
  }, [findPoAsset]);
  // Also update when currency changes (even without new po_assets event)
  useEffect(() => {
    setPoAsset(findPoAsset());
  }, [findPoAsset]);

  const getCurrencyPayout = useCallback((currency: Currency): number | undefined => (
    (() => {
      const payout = resolveDisplayPayout({
        currency: currency.currency,
        apiName: currency.api_name ?? null,
        fallbackProfit: currency.profit,
      });
      return payout === undefined ? undefined : applyBonus(payout);
    })()
  ), [applyBonus]);

  const currentDisplayPayout = (() => {
    const payout = resolveDisplayPayout({
      currency: config.currency,
      apiName: config.currencyInfo?.api_name ?? null,
      fallbackProfit: config.currencyInfo?.profit,
    });
    return payout === undefined ? undefined : applyBonus(payout);
  })();

  /* ─── Currency popup state ─── */
  const [showCurrencyPopup, setShowCurrencyPopup] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [selectedCat, setSelectedCat] = useState(() => localStorage.getItem('ccp_selectedCat') ?? 'all');
  const [minPayoutFilter, setMinPayoutFilter] = useState(() => {
    const raw = localStorage.getItem(CCP_MIN_PAYOUT_KEY);
    const parsed = Number(raw ?? '0');
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const [otcFilter, setOtcFilter] = useState<'all' | 'otc' | 'forex'>(
    () => (localStorage.getItem('ccp_otcFilter') as 'all' | 'otc' | 'forex') ?? 'all'
  );
  const [navBindings, setNavBindings] = useState<CurrencyNavBindings>(readCurrencyNavBindings);
  const [copiedCurrency, setCopiedCurrency] = useState<string | null>(null);
  const ccpListRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hotkeysEnabled, setHotkeysEnabled] = useState(false);
  // const [currencyCloseShield, setCurrencyCloseShield] = useState(false);
  // const currencyCloseShieldTimeoutRef = useRef<number | null>(null);

  const handleSetCat = useCallback((cat: string) => {
    setSelectedCat(cat);
    localStorage.setItem('ccp_selectedCat', cat);
  }, []);

  const handleSetOtcFilter = useCallback((f: 'all' | 'otc' | 'forex') => {
    setOtcFilter(f);
    localStorage.setItem('ccp_otcFilter', f);
  }, []);

  const handleSetMinPayoutFilter = useCallback((value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 3);
    const next = cleaned ? Math.min(100, Number(cleaned)) : 0;
    setMinPayoutFilter(next);
    localStorage.setItem(CCP_MIN_PAYOUT_KEY, String(next));
  }, []);

  const handleSetNavBinding = useCallback((field: keyof CurrencyNavBindings, key: string) => {
    const normalized = normalizeShortcutKey(key);
    if (!normalized) return;
    setNavBindings((prev) => {
      const next = { ...prev, [field]: normalized };
      localStorage.setItem(CCP_NAV_BINDINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const closeCurrencyPopup = useCallback(() => {
    if (ccpListRef.current) savedScrollRef.current = ccpListRef.current.scrollTop;
    setShowCurrencyPopup(false);
    setCurrencySearch('');
    if (!isMobile) return;
    // setCurrencyCloseShield(true);
    // if (currencyCloseShieldTimeoutRef.current !== null) {
    //   window.clearTimeout(currencyCloseShieldTimeoutRef.current);
    // }
    // currencyCloseShieldTimeoutRef.current = window.setTimeout(() => {
    //   setCurrencyCloseShield(false);
    //   currencyCloseShieldTimeoutRef.current = null;
    // }, 350);
  }, [isMobile]);

  useEffect(() => () => {
    // if (currencyCloseShieldTimeoutRef.current !== null) {
    //   window.clearTimeout(currencyCloseShieldTimeoutRef.current);
    // }
  }, []);

  /* Restore ccp-list scroll position when popup re-opens */
  useEffect(() => {
    if (showCurrencyPopup) {
      requestAnimationFrame(() => {
        if (ccpListRef.current) ccpListRef.current.scrollTop = savedScrollRef.current;
      });
    }
  }, [showCurrencyPopup]);

  /* ─── Indicator panel state ─── */
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const indicatorPanelRef = useRef<HTMLDivElement>(null);
  const [tvIndicatorsOpen, setTvIndicatorsOpen] = useState(false);
  const [tvStudySearch, setTvStudySearch] = useState('');
  const [tvForceKey, setTvForceKey] = useState(0);

  /* ─── Timeframe dropdown state ─── */
  const [showTfDropdown, setShowTfDropdown] = useState(false);
  const tfDropdownRef = useRef<HTMLDivElement>(null);

  /* ─── Portal position state ─── */
  const [currencyRect, setCurrencyRect] = useState<{ top: number; left: number } | null>(null);
  const [tfRect, setTfRect] = useState<{ top: number; left: number } | null>(null);

  /* Close popups on outside click */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;

      // Currency popup: skip close if click inside portal
      const currencyPortal = document.querySelector('.currency-dropdown-portal');
      if (dropdownRef.current && !dropdownRef.current.contains(target) && (!currencyPortal || !currencyPortal.contains(target))) {
        closeCurrencyPopup();
      }
      // Skip indicator panel close if click is inside the portal backdrop/panel
      const portalPanel = document.querySelector('.chart-card__indicator-panel-backdrop');
      if (indicatorPanelRef.current && !indicatorPanelRef.current.contains(target) && (!portalPanel || !portalPanel.contains(target))) {
        setShowIndicatorPanel(false);
      }
      // TF dropdown: skip close if click inside portal
      const tfPortal = document.querySelector('.tf-dropdown-portal');
      if (tfDropdownRef.current && !tfDropdownRef.current.contains(target) && (!tfPortal || !tfPortal.contains(target))) {
        setShowTfDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeCurrencyPopup]);

  /* api_name → readable display name */
  const assetNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of currencies) {
      if (c.api_name) m.set(c.api_name, c.currency);
    }
    return m;
  }, [currencies]);

  /* Derive categories from all currencies with custom order */
  const categories = useMemo(() => {
    const catMap = new Map<string, string | null | undefined>();
    currencies.forEach((c) => {
      // Keep the first non-null category_icon we find
      if (!catMap.has(c.category) || (!catMap.get(c.category) && c.category_icon)) {
        catMap.set(c.category, c.category_icon);
      }
    });

    // Custom category order
    const categoryOrder = [
      'currency', 'forex',           // Валюты
      'cryptocurrency', 'crypto',     // Криптовалюты
      'commodities', 'commodity',     // Сырьевые товары
      'stocks', 'stock', 'shares',    // Акции
      'indices', 'index',             // Индексы
    ];

    return [...catMap.entries()]
      .sort(([a], [b]) => {
        const indexA = categoryOrder.indexOf(a.toLowerCase());
        const indexB = categoryOrder.indexOf(b.toLowerCase());
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([name, icon]) => ({ name, icon: icon ?? null }));
  }, [currencies]);

  const handleTimeframeChange = (tf: string) => {
    onUpdateChart({ ...config, timeframe: tf });
  };

  const handleCurrencySelect = useCallback((cur: Currency) => {
    onUpdateChart({
      ...config,
      currency: cur.currency,
      currencyInfo: {
        currency: cur.currency,
        profit: cur.profit,
        category: cur.category,
        is_active: cur.is_active,
        api_name: cur.api_name ?? null,
      },
    });
  }, [config, onUpdateChart]);

  const toggleIndicator = (key: string) => {
    onUpdateChart({
      ...config,
      activeIndicators: { ...config.activeIndicators, [key]: !config.activeIndicators[key] },
    });
  };

  const filteredCurrencies = useMemo(() => {
    const rawQ = currencySearch.toLowerCase().trim();
    // Remove slashes for search normalization (so "eurusd" finds "EUR/USD")
    const q = rawQ.replace(/\//g, '');
    const isGlobalSearch = rawQ.length > 0;
    // A category supports OTC filter if ANY currency in it has an OTC variant
    const catsWithOtc = new Set(
      currencies
        .filter((c) => c.api_name?.toLowerCase().endsWith('_otc') || c.currency.toLowerCase().trimEnd().endsWith(' otc'))
        .map((c) => c.category)
    );
    const isCurrencyCat = !isGlobalSearch && selectedCat !== 'all' && selectedCat !== 'favorites'
      && CURRENCY_CATS.includes(selectedCat.toLowerCase())
      && catsWithOtc.has(selectedCat);
    return currencies
      .filter((c) => {
        if (selectedCat === 'favorites') {
          if (!favorites.includes(c.currency)) return false;
        } else if (selectedCat !== 'all' && !isGlobalSearch) {
          // When searching — ignore category (global search across all assets)
          if (c.category !== selectedCat) return false;
        }
        // OTC / FOREX sub-filter
        if (isCurrencyCat && otcFilter !== 'all') {
          const isOtc = c.api_name?.toLowerCase().endsWith('_otc') || c.currency.toLowerCase().trimEnd().endsWith(' otc');
          if (otcFilter === 'otc' && !isOtc) return false;
          if (otcFilter === 'forex' && isOtc) return false;
        }
        if (rawQ) {
          const normalized = c.currency.toLowerCase().replace(/\//g, '');
          if (!normalized.includes(q)) return false;
        }
        const payout = getCurrencyPayout(c);
        if (payout === undefined) return false;
        if (payout < minPayoutFilter) return false;
        return true;
      })
      .sort((a, b) => (getCurrencyPayout(b) ?? -1) - (getCurrencyPayout(a) ?? -1));
  }, [currencies, currencySearch, selectedCat, favorites, otcFilter, minPayoutFilter, getCurrencyPayout]);

  const navigableCurrencies = useMemo(() => {
    if (filteredCurrencies.length > 0) return filteredCurrencies;
    return [...currencies]
      .filter((currency) => {
        const payout = getCurrencyPayout(currency);
        return payout !== undefined && payout >= minPayoutFilter;
      })
      .sort((a, b) => (getCurrencyPayout(b) ?? -1) - (getCurrencyPayout(a) ?? -1));
  }, [currencies, filteredCurrencies, getCurrencyPayout, minPayoutFilter]);

  const cycleCurrency = useCallback((direction: 'prev' | 'next') => {
    if (navigableCurrencies.length === 0) return;
    const currentIndex = navigableCurrencies.findIndex((currency) => currency.currency === config.currency);
    if (currentIndex === -1) {
      handleCurrencySelect(direction === 'next' ? navigableCurrencies[0] : navigableCurrencies[navigableCurrencies.length - 1]);
      return;
    }
    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % navigableCurrencies.length
      : (currentIndex - 1 + navigableCurrencies.length) % navigableCurrencies.length;
    handleCurrencySelect(navigableCurrencies[nextIndex]);
  }, [config.currency, handleCurrencySelect, navigableCurrencies]);

  const handlePrevCurrencyShortcut = useCallback(() => {
    cycleCurrency('prev');
  }, [cycleCurrency]);

  const handleNextCurrencyShortcut = useCallback(() => {
    cycleCurrency('next');
  }, [cycleCurrency]);

  useEffect(() => {
    if (!hotkeysEnabled && !showCurrencyPopup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const key = normalizeShortcutKey(event.key);
      if (!key) return;
      if (key === navBindings.prevKey) {
        event.preventDefault();
        cycleCurrency('prev');
      } else if (key === navBindings.nextKey) {
        event.preventDefault();
        cycleCurrency('next');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cycleCurrency, hotkeysEnabled, navBindings.nextKey, navBindings.prevKey, showCurrencyPopup]);

  const catsWithOtcMemo = useMemo(() => {
    return new Set(
      currencies
        .filter((c) => c.api_name?.toLowerCase().endsWith('_otc') || c.currency.toLowerCase().trimEnd().endsWith(' otc'))
        .map((c) => c.category)
    );
  }, [currencies]);

  const showOtcTabs = !currencySearch
    && selectedCat !== 'all'
    && selectedCat !== 'favorites'
    && CURRENCY_CATS.includes(selectedCat.toLowerCase())
    && catsWithOtcMemo.has(selectedCat);

  const activeIndicatorCount = Object.entries(config.activeIndicators)
    .filter(([key, active]) => active && key in INDICATOR_REGISTRY).length;

  /* ─── Card class ─── */
  const cardClass = [
    'chart-card',
    dragEnabled && isDragging ? 'chart-card--dragging' : '',
    dragEnabled && isDragOver ? 'chart-card--drag-over' : '',
    dragEnabled ? 'chart-card--drag-enabled' : '',
  ].filter(Boolean).join(' ');

  const currentTfLabel = TIMEFRAMES.find((tf) => tf.value === config.timeframe)?.label ?? config.timeframe;

  const handleCardDragStart = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (isDragBlockedTarget(event.target)) {
      event.preventDefault();
      return;
    }
    onDragStart(event);
  }, [onDragStart]);

  return (
    <div
      className={cardClass}
      draggable={dragEnabled}
      style={{ gridArea }}
      onMouseEnter={() => setHotkeysEnabled(true)}
      onMouseLeave={() => setHotkeysEnabled(false)}
      onDragStart={dragEnabled ? handleCardDragStart : undefined}
      onDragEnd={dragEnabled ? onDragEnd : undefined}
      onDragOver={dragEnabled ? onDragOver : undefined}
      onDrop={dragEnabled ? (e) => { e.preventDefault(); onDrop(); } : undefined}
    >
      {/* Chart + Trading Panel wrapper */}
      <div
        className={`chart-card__content-row${isMobile ? ' chart-card__content-row--compact' : ''}`}
        style={isMobile ? undefined : { flexDirection: 'row' }}
      >
        {/* Chart body — fills main area */}
        <div className="chart-card__body">
          <TVChart
            ref={chartRef}
            currency={config.currency}
            timeframe={config.timeframe}
            activeIndicators={config.activeIndicators}
            indicatorParams={config.indicatorParams}
            autoScroll={autoScroll}
            locale={appLocale}
            activeBets={activeBets}
            balanceCurrency={balanceCurrency}
            onOpenCopyTrading={onOpenCopyTrading}
            onOpenAccountStats={onOpenAccountStats}
            onOpenTradingTop={onOpenTradingTop}
            onOpenWebApp={onOpenWebApp}
            shortcutPrevKey={navBindings.prevKey}
            shortcutNextKey={navBindings.nextKey}
            onPrevCurrencyShortcut={handlePrevCurrencyShortcut}
            onNextCurrencyShortcut={handleNextCurrencyShortcut}
          />

          {/* ── Overlay toolbar (semi-transparent, on top of chart) ── */}
          <div className="chart-overlay">
            <div className="chart-overlay__left">
              {/* Drag handle */}
              {dragEnabled && (
                <div
                  className="chart-card__drag-handle"
                  title="Drag to reorder"
                  data-card-drag-handle="true"
                >
                  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" opacity="0.4">
                    <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" />
                    <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
                    <circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
                  </svg>
                </div>
              )}

              {/* Currency selector */}
              <div className="chart-card__currency-wrap" ref={dropdownRef}>
                <button
                  className="chart-card__currency-btn"
                  onClick={() => {
                    if (!showCurrencyPopup) {
                      const rect = dropdownRef.current?.getBoundingClientRect();
                      if (rect) setCurrencyRect({ top: rect.bottom + 4, left: rect.left });
                    }
                    setShowCurrencyPopup(!showCurrencyPopup);
                    setCurrencySearch('');
                  }}
                >
                  <span className={`chart-card__dot${config.currency ? '' : ' chart-card__dot--inactive'}`} />
                  <span className="chart-card__name">{displayName}</span>
                  {currentDisplayPayout !== undefined && (
                    <span className={`chart-card__profit ${currentDisplayPayout >= 0 ? 'chart-card__profit--up' : 'chart-card__profit--down'}`}>
                      {currentDisplayPayout.toFixed(0)}%
                    </span>
                  )}
                  <svg className="chart-card__chevron" width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Timeframe dropdown */}
              <div className="chart-overlay__tf-wrap" ref={tfDropdownRef}>
                <button
                  className="chart-overlay__tf-btn"
                  onClick={() => {
                    if (!showTfDropdown) {
                      const rect = tfDropdownRef.current?.getBoundingClientRect();
                      if (rect) setTfRect({ top: rect.bottom + 4, left: rect.left });
                    }
                    setShowTfDropdown(!showTfDropdown);
                  }}
                >
                  {currentTfLabel}
                  <svg width="1em" height="1em" viewBox="0 0 8 5" fill="none">
                    <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Indicator quick-toggle (toolbar-style) */}
              <div className="chart-card__indicator-wrap" ref={indicatorPanelRef}>
                <button
                  className={`chart-overlay__tool-btn${activeIndicatorCount > 0 ? ' chart-overlay__tool-btn--accent' : ''}`}
                  onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  {activeIndicatorCount > 0 && (
                    <span className="chart-overlay__tool-badge">{activeIndicatorCount}</span>
                  )}
                </button>
                {showIndicatorPanel && createPortal(
                  <div className="chart-card__indicator-panel-backdrop" onClick={() => setShowIndicatorPanel(false)}>
                    <div className="chart-card__indicator-panel" onClick={e => e.stopPropagation()}>
                      <div className="chart-card__indicator-panel-title">{t.indicators}</div>
                      {Object.entries(INDICATOR_REGISTRY).map(([key, entry]) => {
                        const isActive = !!config.activeIndicators[key];
                        return (
                          <button
                            key={key}
                            className={`chart-card__ind-toggle${isActive ? ' chart-card__ind-toggle--active' : ''}`}
                            onClick={() => toggleIndicator(key)}
                          >
                            <span
                              className="chart-card__ind-tag"
                              style={{ background: isActive ? `${entry.color}33` : 'transparent', color: entry.color }}
                            >
                              {entry.tag}
                            </span>
                            <span className="chart-card__ind-name">{entry.meta.name}</span>
                            <span className="chart-card__ind-check">{isActive ? '✓' : ''}</span>
                          </button>
                        );
                      })}
                      <div className="chart-card__ind-panel-footer">
                        <button
                          className="chart-card__ind-settings-btn"
                          onClick={() => {
                            setShowIndicatorPanel(false);
                            setTvIndicatorsOpen(true);
                            setTvStudySearch('');
                          }}
                        >
                          📊 {t.tvIndicators}
                        </button>
                        <button
                          className="chart-card__ind-settings-btn"
                          onClick={() => { setShowIndicatorPanel(false); onOpenSettings(config.id); }}
                        >
                          ⚙ {t.settings}
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            </div>

            <div className="chart-overlay__right">
              {/* Close button */}
              <button
                className="chart-overlay__close-btn"
                onClick={() => onRemoveChart(config.id)}
                title={t.remove}
              >✕</button>
            </div>
          </div>

          {/* Low profit warning */}
          {config.currencyInfo && currentDisplayPayout !== undefined && currentDisplayPayout < 70 && (
            <div className="chart-card__low-profit">
              <span className="chart-card__low-profit-icon">⚠</span>
              <span className="chart-card__low-profit-text">
                {t.lowProfit} ({currentDisplayPayout.toFixed(0)}%)
              </span>
            </div>
          )}

          {/* Currency dropdown portal */}
          {showCurrencyPopup && createPortal(
            <div className="currency-dropdown-portal" onClick={closeCurrencyPopup}>
              <div
                className="chart-card__dropdown"
                style={currencyRect ? { position: 'fixed', top: currencyRect.top, left: currencyRect.left } : undefined}
                onClick={e => e.stopPropagation()}
              >
                {/* Mobile drag handle + close header */}
                <div className="portal-sheet__handle" />
                <div className="portal-sheet__close-header">
                  <span className="portal-sheet__close-title">{t.selectCurrency}</span>
                  <button className="portal-sheet__close-btn" onClick={closeCurrencyPopup}>✕</button>
                </div>
                {/* Category icon bar */}
                <div className="ccp-catbar">
                  <button
                    className={`ccp-catbar__btn${selectedCat === 'all' ? ' ccp-catbar__btn--active' : ''}`}
                    onClick={() => handleSetCat('all')}
                    title={t.all}
                  >
                    <span className="ccp-catbar__icon">🌐</span>
                    <span className="ccp-catbar__label">{t.all}</span>
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.name}
                      className={`ccp-catbar__btn${selectedCat === cat.name ? ' ccp-catbar__btn--active' : ''}`}
                      onClick={() => handleSetCat(cat.name)}
                      title={tCategory(cat.name)}
                    >
                      <span className="ccp-catbar__icon">{renderIcon(getCategoryIcon(cat.name, cat.icon), 32)}</span>
                      <span className="ccp-catbar__label">{tCategory(cat.name)}</span>
                    </button>
                  ))}
                </div>
                {/* Right side: search + list */}
                <div className="ccp-right">
                  <div className="ccp-search">
                    <input
                      className="ccp-search__input"
                      placeholder={t.search}
                      value={currencySearch}
                      onChange={(e) => setCurrencySearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      className="ccp-search__profit"
                      inputMode="numeric"
                      placeholder="%"
                      value={minPayoutFilter === 0 ? '' : String(minPayoutFilter)}
                      onChange={(e) => handleSetMinPayoutFilter(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      title={t.ccpMinPayout}
                    />
                    <button
                      className={`ccp-search__fav${selectedCat === 'favorites' ? ' ccp-search__fav--active' : ''}`}
                      onClick={() => handleSetCat(selectedCat === 'favorites' ? 'all' : 'favorites')}
                      title={t.favorites}
                    >★</button>
                  </div>
                  <div className="ccp-shortcuts" onClick={(e) => e.stopPropagation()}>
                    <div className="ccp-shortcuts__group">
                      <span className="ccp-shortcuts__label">{t.ccpPrevKey}</span>
                      <input
                        className="ccp-shortcuts__input"
                        type="text"
                        value={navBindings.prevKey}
                        readOnly
                        onKeyDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (e.key === 'Backspace' || e.key === 'Delete') {
                            handleSetNavBinding('prevKey', 'ArrowLeft');
                            return;
                          }
                          handleSetNavBinding('prevKey', e.key);
                        }}
                        title={t.ccpPrevKey}
                      />
                    </div>
                    <div className="ccp-shortcuts__group">
                      <span className="ccp-shortcuts__label">{t.ccpNextKey}</span>
                      <input
                        className="ccp-shortcuts__input"
                        type="text"
                        value={navBindings.nextKey}
                        readOnly
                        onKeyDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (e.key === 'Backspace' || e.key === 'Delete') {
                            handleSetNavBinding('nextKey', 'ArrowRight');
                            return;
                          }
                          handleSetNavBinding('nextKey', e.key);
                        }}
                        title={t.ccpNextKey}
                      />
                    </div>
                  </div>
                  {/* OTC / FOREX sub-filter — only for currency categories, below search */}
                  {showOtcTabs && (
                    <div className="ccp-otc-tabs">
                      {(['all', 'otc', 'forex'] as const).map((f) => (
                        <button
                          key={f}
                          className={`ccp-otc-tab${otcFilter === f ? ' ccp-otc-tab--active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleSetOtcFilter(f); }}
                        >
                          {f === 'all' ? t.all : f === 'otc' ? t.ccpOtc : t.ccpForex}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="ccp-list" ref={ccpListRef}>
                    {filteredCurrencies.length === 0 ? (
                      <div className="ccp-empty">{t.currenciesNotFound}</div>
                    ) : (
                      filteredCurrencies.map((c) => {
                        const isFav = favorites.includes(c.currency);
                        const isActive = c.currency === config.currency;
                        return (
                          <div
                            key={c.currency}
                            className={`ccp-item${isActive ? ' ccp-item--active' : ''}`}
                            onPointerUp={(e) => {
                              if (e.pointerType === 'mouse') return;
                              e.preventDefault();
                              handleCurrencySelect(c);
                            }}
                            onClick={() => {
                              if (isMobile) return;
                              handleCurrencySelect(c);
                            }}
                          >
                            <button
                              className={`ccp-item__fav${isFav ? ' ccp-item__fav--active' : ''}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); onToggleFavorite(c.currency); }}
                            >{isFav ? '★' : '☆'}</button>
                            <span className="ccp-item__icon">{renderIcon(getCurrencyDisplayIcon(c.category, c.icon, c.category_icon), 32)}</span>
                            <span className="ccp-item__name">{c.currency}</span>
                            {(() => {
                              const payout = getCurrencyPayout(c);
                              if (payout === undefined) return null;
                              return <span className="ccp-item__profit">+{payout.toFixed(0)}%</span>;
                            })()}
                            <button
                              className={`ccp-item__copy${copiedCurrency === c.currency ? ' ccp-item__copy--done' : ''}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Strip OTC/otc suffix only for currency categories
                                const isCurCat = CURRENCY_CATS.includes((c.category ?? '').toLowerCase());
                                const clean = isCurCat ? c.currency.replace(/\s*OTC$/i, '').trim() : c.currency;
                                navigator.clipboard.writeText(clean).catch(() => { });
                                setCopiedCurrency(c.currency);
                                setTimeout(() => setCopiedCurrency(null), 1500);
                              }}
                              title="Copy"
                            >{copiedCurrency === c.currency ? '✓' : '⎘'}</button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
          {/* {currencyCloseShield && createPortal(
          <div className="currency-close-shield" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} />,
          document.body
        )} */}

          {/* TF dropdown portal */}
          {showTfDropdown && createPortal(
            <div className="tf-dropdown-portal" onClick={() => setShowTfDropdown(false)}>
              <div
                className="chart-overlay__tf-dropdown"
                style={tfRect ? { position: 'fixed', top: tfRect.top, left: tfRect.left } : undefined}
                onClick={e => e.stopPropagation()}
              >
                {/* Mobile drag handle + close header */}
                <div className="portal-sheet__handle" />
                <div className="portal-sheet__close-header">
                  <span className="portal-sheet__close-title">{t.timeframe}</span>
                  <button className="portal-sheet__close-btn" onClick={() => setShowTfDropdown(false)}>✕</button>
                </div>
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    className={`chart-overlay__tf-option${config.timeframe === tf.value ? ' chart-overlay__tf-option--active' : ''}`}
                    onClick={() => { handleTimeframeChange(tf.value); setShowTfDropdown(false); }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )}

          {/* TV Indicators custom portal modal */}
          {tvIndicatorsOpen && createPortal(
            <div className="tv-studies-modal-backdrop" onClick={() => { setTvIndicatorsOpen(false); setTvStudySearch(''); }}>
              <div className="tv-studies-modal" onClick={e => e.stopPropagation()}>
                <div className="tv-studies-modal__header">
                  <span className="tv-studies-modal__title">{t.tvIndicators}</span>
                  <button className="tv-studies-modal__close" onClick={() => { setTvIndicatorsOpen(false); setTvStudySearch(''); }}>✕</button>
                </div>
                <div className="tv-studies-modal__search-wrap">
                  <input
                    className="tv-studies-modal__search"
                    type="text"
                    placeholder={t.searchIndicators}
                    value={tvStudySearch}
                    onChange={e => setTvStudySearch(e.target.value)}
                  />
                </div>
                {/* Active studies */}
                {(() => {
                  void tvForceKey; // dependency: re-render when studies change
                  const active = chartRef.current?.getActiveStudies() || [];
                  if (active.length === 0) return null;
                  return (
                    <div className="tv-studies-modal__section">
                      <div className="tv-studies-modal__section-title">{t.activeStudies}</div>
                      {active.map(s => (
                        <button key={s.id} className="tv-studies-modal__item tv-studies-modal__item--active" onClick={() => {
                          try { chartRef.current?.removeStudy(s.id); } catch { /* entity may already be removed */ }
                          setTimeout(() => setTvForceKey(k => k + 1), 100);
                        }}>
                          <span className="tv-studies-modal__item-name">{s.name}</span>
                          <span className="tv-studies-modal__item-remove">✕</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {/* All available studies */}
                <div className="tv-studies-modal__section">
                  <div className="tv-studies-modal__section-title">{t.allIndicators}</div>
                  <div className="tv-studies-modal__list">
                    {(() => {
                      const all: TVStudyInfo[] = chartRef.current?.getStudiesList() || [];
                      const q = tvStudySearch.toLowerCase();
                      const filtered = q ? all.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) : all;
                      if (filtered.length === 0) return <div className="tv-studies-modal__empty">{t.noResults}</div>;
                      return filtered.map(s => (
                        <button key={s.id} className="tv-studies-modal__item" onClick={() => {
                          chartRef.current?.addStudy(s.name);
                          setTimeout(() => setTvForceKey(k => k + 1), 100);
                        }}>
                          <span className="tv-studies-modal__item-name">{s.description || s.name}</span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* ─── Trading Panel (desktop: sidebar right, mobile: bottom overlay) ─── */}
        {showTradingPanel && (
          <TradingPanel
            asset={config.currency}
            apiName={config.currencyInfo?.api_name}
            account={betterAccount}
            isDemo={isBetDemo}
            payout={currentDisplayPayout}
            isMobile={isMobile}
            hideHistory={hideHistory}
            onBetsChange={setActiveBets}
            getCurrentPrice={getCurrentPrice}
            minTimeframe={poAsset?.min_timeframe}
            maxTimeframe={poAsset?.max_timeframe}
            assetNameMap={assetNameMap}
            onSelectAsset={(assetName) => {
              const cur = findCurrencyByAsset(currencies, assetName);
              console.debug('[ChartGrid:panel] onSelectAsset:', assetName, '→ found:', cur?.currency ?? 'NOT FOUND', 'api_name:', cur?.api_name, 'currencies.length:', currencies.length);
              if (cur) {
                handleCurrencySelect(cur);
              } else {
                console.warn('[ChartGrid:panel] currency not found for asset:', assetName);
              }
            }}
            onCycleAsset={cycleCurrency}
            onOpenCopyTrading={onOpenCopyTrading}
            onOpenAccountStats={onOpenAccountStats}
            onOpenTradingTop={onOpenTradingTop}
            onOpenWebApp={onOpenWebApp}
          />
        )}
      </div>{/* end chart-card__content-row */}
    </div>
  );
}
