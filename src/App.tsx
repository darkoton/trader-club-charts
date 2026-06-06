import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore, lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { ChartSettingsModal } from './components/ChartSettingsModal';
import { CurrencySelectModal } from './components/CurrencySelectModal';
import { FavoritesBar } from './components/FavoritesBar';
import { UserProfileMenu } from './components/UserProfileMenu';
import { AccountSwitcher } from './components/AccountSwitcher';
import { POLoginPopup } from './components/POLoginPopup';
import { BetterAuthStatusModal } from './components/BetterAuthStatusModal';
import { CopyTradingPanel } from './components/CopyTradingPanel';
import { AccountStatsModal } from './components/AccountStatsModal';
import { TradingTopModal } from './components/TradingTopModal';
const ChartGrid = lazy(() => import('./components/ChartGrid').then((m) => ({ default: m.ChartGrid })));
const WebAppFrame = lazy(() => import('./components/WebAppFrame').then((m) => ({ default: m.WebAppFrame })));
const WEBAPP_FRAME_STORAGE_KEY = 'tc_webapp_frame_state';
import type { ChartConfig, GridLayout } from './types/chart';
import {
  GRID_LAYOUTS,
  createDefaultIndicatorParams,
  createDefaultActiveIndicators,
  getGridCols,
  normalizeIndicatorParamsMap,
} from './types/chart';
import type { Currency } from './api/currencies';
import { getCurrencies, getCategories } from './api/currencies';
import { batchInit, batchTrading } from './api/batch';
import { prefetchCharts } from './datafeed/TVDatafeed';
import { socketService, type CurrenciesUpdatedPayload, type DisconnectInfo } from './api/socket';
import { betterSocket } from './api/betterSocket';
import type { AccountDataUpdatedEvent } from './api/betterSocket';
import {
  BETTER_AUTH_STATUS_EVENT,
  confirm2fa,
  emitBetterAuthRecovered,
  isBetterAuthStatusPayload,
  normalizeBetterAuthStatusPayload,
  pickPreferredBetterAccount,
  resolvePreferredBetterAccount,
  type BetterAccount,
  type BetterAuthStatusPayload,
} from './api/better';
import { autoMapCurrencies } from './api/admin';
import { authService } from './services/auth';
import { getMyProfile, persistUserAccess } from './api/user';
import { storageService, type StoredChartConfig } from './services/storage';
import { statusFromPayoutIncrease } from './types/accountStatus';
import { loadCustomIndicators } from './services/customIndicatorRegistry';
// import { preloadIcons, collectIconPaths } from './services/imageCache';
import { collectIconPaths, preloadIcons } from './services/imageCache';
import { useI18n, type Locale } from './i18n';
import routes from './configs/routes';
import { AUTH_CHANGED_EVENT, confirmTwoFactor, resetSiteSessionAndRedirectToLogin } from './pages/shared/api/terminalAuth';

/* ─── Mobile / tablet detection hook for compact terminal layout ─── */
const MOBILE_MAX_WIDTH = 600;
const TABLET_MAX_WIDTH = 1024;
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;
const TABLET_QUERY = `(max-width: ${TABLET_MAX_WIDTH}px)`;
const mobileWidthMediaQuery = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null;
const tabletWidthMediaQuery = typeof window !== 'undefined' ? window.matchMedia(TABLET_QUERY) : null;
const coarsePointerMediaQuery = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null;
const hoverNoneMediaQuery = typeof window !== 'undefined' ? window.matchMedia('(hover: none)') : null;

function addMediaQueryChangeListener(query: MediaQueryList | null, cb: () => void) {
  if (!query) return () => undefined;
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', cb);
    return () => query.removeEventListener('change', cb);
  }
  query.addListener(cb);
  return () => query.removeListener(cb);
}

function getViewportWidth(): number {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
  const visualViewportWidth = window.visualViewport?.width ?? Number.POSITIVE_INFINITY;
  const layoutViewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : Number.POSITIVE_INFINITY;
  const documentWidth = document.documentElement?.clientWidth ?? Number.POSITIVE_INFINITY;
  return Math.min(visualViewportWidth, layoutViewportWidth, documentWidth);
}

function isProbablyMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithUserAgentData = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (navigatorWithUserAgentData.userAgentData?.mobile === true) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

function isProbablyTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform ?? '';
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;

  if (/iPad/i.test(userAgent)) return true;
  if (platform === 'MacIntel' && maxTouchPoints > 1) return true;
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return true;
  return /Tablet/i.test(userAgent);
}

const getIsMobileSnapshot = () => {
  if (typeof window === 'undefined') return false;

  const viewportWidth = getViewportWidth();
  const isTouchLike = coarsePointerMediaQuery?.matches === true
    || hoverNoneMediaQuery?.matches === true
    || window.navigator.maxTouchPoints > 0;

  const narrowViewport = viewportWidth <= MOBILE_MAX_WIDTH || mobileWidthMediaQuery?.matches === true;
  if (narrowViewport && (isTouchLike || isProbablyMobileDevice())) {
    return true;
  }

  const tabletViewport = viewportWidth <= TABLET_MAX_WIDTH || tabletWidthMediaQuery?.matches === true;
  if (tabletViewport && isTouchLike && isProbablyTabletDevice()) {
    return true;
  }

  return false;
};

const subscribeIsMobile = (cb: () => void) => {
  if (typeof window === 'undefined') return () => undefined;

  const unsubs = [
    addMediaQueryChangeListener(mobileWidthMediaQuery, cb),
    addMediaQueryChangeListener(tabletWidthMediaQuery, cb),
    addMediaQueryChangeListener(coarsePointerMediaQuery, cb),
    addMediaQueryChangeListener(hoverNoneMediaQuery, cb),
  ];

  window.addEventListener('resize', cb, { passive: true });
  window.addEventListener('orientationchange', cb, { passive: true });
  window.visualViewport?.addEventListener('resize', cb, { passive: true });

  return () => {
    unsubs.forEach((unsub) => unsub());
    window.removeEventListener('resize', cb);
    window.removeEventListener('orientationchange', cb);
    window.visualViewport?.removeEventListener('resize', cb);
  };
};

function useIsMobile() {
  return useSyncExternalStore(subscribeIsMobile, getIsMobileSnapshot, () => false);
}

/** On mobile, only allow layouts with ≤ 2 columns */
function isMobileAllowed(layout: GridLayout): boolean {
  return getGridCols(layout) <= 2;
}

/** Default mobile layout */
const MOBILE_DEFAULT_LAYOUT = GRID_LAYOUTS.find((l) => l.id === '1')!;

/* ─── Pluralize "chart" for ru / uk / en ─── */
function pluralCharts(n: number, locale: string): string {
  if (locale === 'en') return n === 1 ? 'chart' : 'charts';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return locale === 'uk' ? 'графік' : 'график';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return locale === 'uk' ? 'графіки' : 'графика';
  return locale === 'uk' ? 'графіків' : 'графиков';
}

function createDefaultChart(overrides?: Partial<ChartConfig>): ChartConfig {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    timeframe: 'M1',
    activeIndicators: createDefaultActiveIndicators(),
    indicatorParams: createDefaultIndicatorParams(),
    ...overrides,
  };
}

/* ═══════════ ChartConfig ⇄ StoredChartConfig serialization ═══════════ */

function toStored(c: ChartConfig): StoredChartConfig {
  return {
    id: c.id,
    currency: c.currency,
    timeframe: c.timeframe,
    activeIndicators: c.activeIndicators,
    indicatorParams: normalizeIndicatorParamsMap(c.indicatorParams as Record<string, Record<string, unknown>>) as Record<string, Record<string, unknown>>,
  };
}

function fromStored(s: StoredChartConfig): ChartConfig {
  return {
    ...createDefaultChart(),
    ...s,
    indicatorParams: normalizeIndicatorParamsMap(s.indicatorParams as Record<string, Record<string, unknown>>),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const { t, locale, setLocale } = useI18n();
  const isMobile = useIsMobile();
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [layout, setLayout] = useState<GridLayout>(GRID_LAYOUTS.find((l) => l.id === '4-2x2')!); // 2x2 desktop default
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [appReady, setAppReady] = useState(false);
  const [appEntering, setAppEntering] = useState(false);
  const [allCurrenciesList, setAllCurrenciesList] = useState<Currency[]>([]);
  const [dragMode, setDragMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState<number>(() => {
    const stored = localStorage.getItem('chart-autoScroll');
    if (stored === null) return 50; // default: 50 candles
    const n = Number(stored);
    return Number.isFinite(n) ? n : 50;
  });
  const [socketConnected, setSocketConnected] = useState(true);
  const [disconnectInfo, setDisconnectInfo] = useState<DisconnectInfo | null>(null);
  const [betterConnected, setBetterConnected] = useState(true);
  /** Track if we ever had a successful connection (to distinguish initial load vs reconnect) */
  const hadConnectionRef = useRef(false);

  /** Always-fresh charts ref for socket/visibility handlers (avoids stale closure) */
  const chartsRef = useRef(charts);
  useEffect(() => { chartsRef.current = charts; }, [charts]);

  /* ─── Better (PocketOption Trading) state ─── */
  const [betterAccount, setBetterAccount] = useState<BetterAccount | null>(null);
  const [isBetDemo, setIsBetDemo] = useState(() => {
    const saved = localStorage.getItem('tc_better_demo');
    return saved === null ? true : saved !== 'false';
  });
  const [showPOLogin, setShowPOLogin] = useState(false);
  const [showCopyTrading, setShowCopyTrading] = useState(false);
  const [showAccountStats, setShowAccountStats] = useState(false);
  const [showTradingTop, setShowTradingTop] = useState(false);
  const [betterAuthStatus, setBetterAuthStatus] = useState<BetterAuthStatusPayload | null>(null);
  const [betterAuthSubmitting, setBetterAuthSubmitting] = useState(false);
  const [betterAuthError, setBetterAuthError] = useState<string | null>(null);
  const [lastStatsAccount, setLastStatsAccount] = useState<BetterAccount | null>(null);
  const [showWebApp, setShowWebApp] = useState(() => {
    try {
      const raw = localStorage.getItem(WEBAPP_FRAME_STORAGE_KEY);
      if (!raw) return false;
      return (JSON.parse(raw) as { open?: boolean }).open === true;
    } catch {
      return false;
    }
  });
  const [showBetting, setShowBetting] = useState(() => localStorage.getItem('tc_show_betting') !== '0');
  const handleAccountStatsVisibilityChange = useCallback((visible: boolean) => {
    setBetterAccount((prev) => {
      if (!prev || (prev.leaderboard_visible ?? true) === visible) return prev;
      return { ...prev, leaderboard_visible: visible };
    });
  }, []);
  const [balanceCurrency, setBalanceCurrency] = useState<string | undefined>(undefined);
  const betterRecoveryRef = useRef(false);
  const betterAccountPollingRevisionRef = useRef(0);
  const betterAccountMissingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (betterAccount) {
      setLastStatsAccount(betterAccount);
    }
  }, [betterAccount]);

  const captureBetterAuthStatus = useCallback((value: unknown): boolean => {
    if (!isBetterAuthStatusPayload(value)) return false;

    const next = normalizeBetterAuthStatusPayload(value);
    setBetterAuthError(null);
    setBetterAuthStatus((prev) => {
      if (!prev) return next;
      if (prev.auth_event_id && next.auth_event_id && prev.auth_event_id === next.auth_event_id) {
        return { ...prev, ...next };
      }
      return next;
    });
    return true;
  }, []);

  const statsAccount = betterAccount ?? lastStatsAccount;

  useEffect(() => {
    try {
      if (betterAccount?.id) localStorage.setItem('tc_better_account', betterAccount.id);
      else localStorage.removeItem('tc_better_account');
    } catch {
      // Ignore localStorage failures.
    }
  }, [betterAccount]);

  useEffect(() => {
    try {
      localStorage.setItem('tc_better_demo', String(isBetDemo));
    } catch {
      // Ignore localStorage failures.
    }
  }, [isBetDemo]);

  /* Guard: is user authorized (or dev mode)? */
  const isAuthorized = authService.isAuthenticated() || authService.isDevMode();

  useEffect(() => {
    const handleAuthChanged = () => {
      betterAccountPollingRevisionRef.current += 1;
      betterAccountMissingSinceRef.current = Date.now();
      setBetterAccount(null);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
  }, []);

  useEffect(() => {
    if (!isAuthorized || betterAccount || showPOLogin) return undefined;

    let cancelled = false;
    let attempts = 0;
    const pollingRevision = betterAccountPollingRevisionRef.current;

    const syncBetterAccount = async () => {
      if (cancelled || betterRecoveryRef.current) return;
      attempts += 1;

      try {
        const account = await resolvePreferredBetterAccount(localStorage.getItem('tc_better_account'));
        if (cancelled || betterAccountPollingRevisionRef.current !== pollingRevision) return;
        if (account) {
          setBetterAccount(account);
          try { localStorage.setItem('tc_better_account', account.id); } catch { /* ignore */ }
          cancelled = true;
        }
      } catch {
        // Keep polling for a short recovery window.
      }
    };

    void syncBetterAccount();

    const intervalId = window.setInterval(() => {
      if (cancelled || attempts >= 15) {
        window.clearInterval(intervalId);
        return;
      }
      void syncBetterAccount();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [betterAccount, isAuthorized, showPOLogin]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleBetterAuthStatus = (event: Event) => {
      captureBetterAuthStatus((event as CustomEvent<BetterAuthStatusPayload>).detail);
    };

    window.addEventListener(BETTER_AUTH_STATUS_EVENT, handleBetterAuthStatus as EventListener);
    return () => window.removeEventListener(BETTER_AUTH_STATUS_EVENT, handleBetterAuthStatus as EventListener);
  }, [captureBetterAuthStatus]);

  useEffect(() => {
    if (!isAuthorized) {
      betterAccountMissingSinceRef.current = null;
      return undefined;
    }

    if (betterAccount) {
      betterAccountMissingSinceRef.current = null;
      return undefined;
    }

    const startedAt = betterAccountMissingSinceRef.current ?? Date.now();
    betterAccountMissingSinceRef.current = startedAt;

    const remainingMs = Math.max(0, 60_000 - (Date.now() - startedAt));
    const timeoutId = window.setTimeout(() => {
      if (!betterAccount) {
        resetSiteSessionAndRedirectToLogin();
      }
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [betterAccount, isAuthorized]);

  // Ref to always have fresh isBetDemo inside socket handlers (avoids stale closure)
  const isBetDemoRef = useRef(isBetDemo);
  useEffect(() => { isBetDemoRef.current = isBetDemo; }, [isBetDemo]);

  /* ─── Capture balance currency from socket events (only for active mode) ─── */
  useEffect(() => {
    const unsubUpdate = betterSocket.onBalanceUpdate((data) => {
      if (data.currency && data.is_demo === isBetDemoRef.current) setBalanceCurrency(data.currency);
    });
    const unsubChanged = betterSocket.onBalanceChanged((data) => {
      if (data.currency && data.is_demo === isBetDemoRef.current) setBalanceCurrency(data.currency);
    });
    return () => { unsubUpdate(); unsubChanged(); };
  }, []);

  /* ─── Auto-set account status from account_data_updated socket event ─── */
  useEffect(() => {
    const unsub = betterSocket.onAccountDataUpdated((data: AccountDataUpdatedEvent) => {
      if (data.account_info?.payout_increase != null) {
        const status = statusFromPayoutIncrease(data.account_info.payout_increase);
        storageService.patchAccountStatus(status);
        window.dispatchEvent(new CustomEvent('accountStatusChanged', { detail: status }));
      }
    });
    return unsub;
  }, []);

  /* ─── Tell server which account this tab is using (filters events server-side) ─── */
  useEffect(() => {
    if (betterAccount) {
      betterSocket.setActiveAccounts([betterAccount.id]);
    }
  }, [betterAccount]);

  useEffect(() => {
    const shouldRecoverFromError = (message?: string) => {
      if (!message) return false;
      const normalized = message.toLowerCase();
      return normalized.includes('аккаунт не найден')
        || normalized.includes('account not found')
        || normalized.includes('po connection')
        || normalized.includes('not connected');
    };

    const recoverBetterAccount = async (failedAccountId?: string | null) => {
      const currentId = failedAccountId ?? betterAccount?.id ?? null;
      if (!currentId || betterRecoveryRef.current) return;

      betterRecoveryRef.current = true;
      try {
        const next = await resolvePreferredBetterAccount(localStorage.getItem('tc_better_account'), { excludeIds: [currentId] });
        if (!next || next.id === currentId) return;
        setBetterAccount(next);
      } catch (error) {
        console.warn('[App] Better account recovery failed:', error);
      } finally {
        betterRecoveryRef.current = false;
      }
    };

    const unsubBetError = betterSocket.onBetError((data) => {
      if (captureBetterAuthStatus(data)) return;
      if (!betterAccount?.id) return;
      if (!shouldRecoverFromError(data.error)) return;
      void recoverBetterAccount(betterAccount.id);
    });

    const unsubActiveAccountsUpdated = betterSocket.onActiveAccountsUpdated((data) => {
      if (!betterAccount?.id) return;
      const activeIds = data.account_ids ?? [];
      if (activeIds.length === 0 || !activeIds.includes(betterAccount.id)) {
        void recoverBetterAccount(betterAccount.id);
      }
    });

    const unsubPoError = betterSocket.onPoConnectionError((data) => {
      if (!betterAccount?.id || data.account_id !== betterAccount.id) return;
      if (captureBetterAuthStatus(data)) return;
      void recoverBetterAccount(data.account_id);
    });

    const unsubBalanceError = betterSocket.onBalanceError((data) => {
      if (!betterAccount?.id || data.account_id !== betterAccount.id) return;
      if (captureBetterAuthStatus(data)) return;
      void recoverBetterAccount(data.account_id);
    });

    const unsubAuthStatus = betterSocket.onAuthStatus((data) => {
      if (betterAccount?.id && data.account_id !== betterAccount.id) return;
      captureBetterAuthStatus(data);
    });

    const unsubSocketError = betterSocket.onSocketError((data) => {
      if (betterAccount?.id && data.account_id && data.account_id !== betterAccount.id) return;
      captureBetterAuthStatus(data);
    });

    return () => {
      unsubBetError();
      unsubActiveAccountsUpdated();
      unsubPoError();
      unsubBalanceError();
      unsubAuthStatus();
      unsubSocketError();
    };
  }, [betterAccount, captureBetterAuthStatus]);

  const handleBetterAuthConfirm = useCallback(async (code: string) => {
    if (!betterAuthStatus) return;

    const pendingAuthStatus = betterAuthStatus;
    setBetterAuthSubmitting(true);
    setBetterAuthError(null);
    try {
      const confirmEndpoint = pendingAuthStatus.confirm_2fa_endpoint ?? '';
      const isTerminalFlow = confirmEndpoint === '/api/terminal/v2/confirm-2fa'
        || !!pendingAuthStatus.terminal_user_id;

      if (isTerminalFlow) {
        if (!pendingAuthStatus.challenge_id) {
          throw new Error('challenge_id is required for terminal 2FA confirmation');
        }
        await confirmTwoFactor(pendingAuthStatus.challenge_id, code);
      } else {
        const accountId = pendingAuthStatus.account_id ?? betterAccount?.id;
        if (!accountId) {
          throw new Error('account_id is required for Better account 2FA confirmation');
        }
        await confirm2fa(accountId, code);
      }

      if (pendingAuthStatus.request) {
        const { requested_at: _requestedAt, ...retryRequest } = pendingAuthStatus.request;
        const retryResult = betterSocket.placeBet(retryRequest);
        if (!retryResult.ok) {
          console.warn('[App] Better auth retry failed:', retryResult.error);
        }
      }

      setBetterAuthStatus(null);
      emitBetterAuthRecovered(pendingAuthStatus);
      void betterSocket.connect().catch(() => undefined);
      const preferred = await resolvePreferredBetterAccount(localStorage.getItem('tc_better_account'));
      if (preferred) setBetterAccount(preferred);
    } catch (error) {
      setBetterAuthError(getErrorMessage(error));
    } finally {
      setBetterAuthSubmitting(false);
    }
  }, [betterAccount?.id, betterAuthStatus]);

  const handleBetterAuthLogout = useCallback(() => {
    setBetterAuthStatus(null);
    setBetterAuthError(null);
    resetSiteSessionAndRedirectToLogin();
  }, []);

  /* ─── Ctrl+Shift+F12: toggle admin mode ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F12') {
        e.preventDefault();
        try {
          const cur = localStorage.getItem('tc_is_admin') === '1';
          localStorage.setItem('tc_is_admin', cur ? '0' : '1');
        } catch {
          // Ignore localStorage failures.
        }
        window.location.reload();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ─── On mobile, force single chart layout when betting is on ─── */
  useEffect(() => {
    if (isMobile && isAuthorized && showBetting && layout.maxCharts > 1) {
      const single = GRID_LAYOUTS.find((l) => l.id === '1')!;
      setLayout(single);
    }
  }, [isAuthorized, isMobile, layout.maxCharts, showBetting]);

  /* Auto-switch layout when switching to mobile and current layout has too many columns */
  useEffect(() => {
    if (isMobile && !isMobileAllowed(layout)) {
      // Pick the best available: same chart count with fewer columns, or fallback
      const fallback = GRID_LAYOUTS.find(
        (l) => l.maxCharts === layout.maxCharts && isMobileAllowed(l)
      ) || MOBILE_DEFAULT_LAYOUT;
      setLayout(fallback);
    }
  }, [isMobile, layout]);

  /* Ref to skip the very first auto-save triggered by hydration */
  const hydratedRef = useRef(false);

  /* Icon paths to preload — populated during bootstrap, consumed after appReady */
  const pendingIconPathsRef = useRef<string[]>([]);

  // Удалён массовый preloadIcons: теперь иконки валют подгружаются только по факту отображения (renderIcon)

  /* ─── Bootstrap: load settings, init charts ─── */
  /* ─── Remove HTML boot preloader once React has mounted ─── */
  useEffect(() => {
    const el = document.getElementById('boot-preloader');
    if (el) {
      el.style.transition = 'opacity 0.4s ease-out';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    }
  }, []);

  /* ─── Bootstrap: load settings, init charts ─── */
  useEffect(() => {
    if (!isAuthorized) { setAppReady(true); return; }

    (async () => {
      const applyInitialBetterAccount = (preferred: BetterAccount | null) => {
        if (!preferred) return false;
        setBetterAccount((prev) => prev ?? preferred);
        return true;
      };

      // 1. Connect socket
      socketService.connect().catch((err) => console.warn('Socket.IO unavailable:', err.message));

      // 1b. Load custom indicators (non-blocking)
      loadCustomIndicators().catch((err) => console.warn('Custom indicators unavailable:', err));

      // 1c. Connect Better socket + load accounts (non-blocking)
      betterSocket.connect().catch((err) => console.warn('Better socket unavailable:', err.message));

      // 1d. Silent auto-map currencies (non-blocking, admin-only — fails silently for non-admins)
      autoMapCurrencies(false).catch(() => { });

      // 1f. Load bot_username from profile (non-blocking)
      getMyProfile()
        .then((profile) => {
          persistUserAccess(profile);
        })
        .catch(() => { });

      // 1e. Load accounts via batch trading endpoint (non-blocking)
      batchTrading().then((tradingData) => {
        const accs = tradingData.accounts || [];
        const savedId = localStorage.getItem('tc_better_account');
        const preferred = pickPreferredBetterAccount(accs, {
          savedId,
          balanceAccountIds: Object.keys(tradingData.balances || {}),
        });
        if (!applyInitialBetterAccount(preferred)) {
          resolvePreferredBetterAccount(savedId)
            .then((account) => {
              applyInitialBetterAccount(account);
            })
            .catch((fallbackErr) => console.warn('Better accounts fallback unavailable:', fallbackErr));
        }
        const savedMode = localStorage.getItem('tc_better_demo');
        if (savedMode !== null) setIsBetDemo(savedMode !== 'false');
      }).catch((err) => {
        console.warn('Better accounts unavailable:', err);
        resolvePreferredBetterAccount(localStorage.getItem('tc_better_account'))
          .then((account) => {
            applyInitialBetterAccount(account);
          })
          .catch((fallbackErr) => console.warn('Better accounts fallback unavailable:', fallbackErr));
      });

      // 2. Batch init: currencies + categories + settings in one request
      let settings = storageService.loadFromBatch(null); // start with local
      let allCurr: Currency[] = [];
      let catData: { name: string; icon: string | null }[] = [];
      try {
        const batch = await batchInit();
        // Hydrate settings from batch response
        settings = storageService.loadFromBatch(batch.settings);
        catData = batch.categories || [];

        // Merge category icons into currencies
        const catIconMap: Record<string, string> = {};
        for (const cat of catData) {
          if (cat.icon) catIconMap[cat.name] = cat.icon;
        }
        const rawCurr = (batch.currencies || []).filter((c) => c.is_active);
        allCurr = rawCurr.map((c) =>
          catIconMap[c.category] ? { ...c, category_icon: catIconMap[c.category] } : c,
        );
        setAllCurrenciesList(allCurr);
        // Прелоадим только топ-5 валютных иконок (по популярности или первым в списке)
        const topIcons = collectIconPaths(allCurr.slice(0, 5), catData);
        if (topIcons.length > 0) {
          preloadIcons(topIcons).catch((err) => console.warn('[App] Top icon preload failed:', err.message));
        }
        pendingIconPathsRef.current = collectIconPaths(allCurr, catData);
      } catch (err) {
        console.warn('Batch init failed, falling back to individual requests', err);
        // Fallback: individual requests
        settings = await storageService.load();
        try {
          const [rawCurr, rawCats] = await Promise.all([
            getCurrencies(undefined, true),
            getCategories().catch(() => []),
          ]);
          catData = rawCats;
          const catIconMap: Record<string, string> = {};
          for (const cat of rawCats) {
            if (cat.icon) catIconMap[cat.name] = cat.icon;
          }
          allCurr = rawCurr.map((c) =>
            catIconMap[c.category] ? { ...c, category_icon: catIconMap[c.category] } : c,
          );
          setAllCurrenciesList(allCurr);
          pendingIconPathsRef.current = collectIconPaths(allCurr, catData);
        } catch { /* non-critical */ }
      }

      // Apply saved layout
      const savedLayout = GRID_LAYOUTS.find((l) => l.id === settings.layoutId);
      if (savedLayout) setLayout(savedLayout);

      if (settings.charts.length > 0) {
        // Restore saved charts and enrich with currencyInfo from loaded currencies
        const currMap = new Map(allCurr.map((c) => [c.currency, c]));
        const restored = settings.charts.map(fromStored).map((chart) => {
          if (chart.currency && !chart.currencyInfo) {
            const cur = currMap.get(chart.currency);
            if (cur) {
              return {
                ...chart,
                currencyInfo: {
                  currency: cur.currency,
                  profit: cur.profit,
                  category: cur.category,
                  is_active: cur.is_active,
                  api_name: cur.api_name ?? null,
                },
              };
            }
          }
          return chart;
        });
        setCharts(restored);
        restored.forEach((c) => { if (c.currency) socketService.subscribeToCurrency(c.currency); });
        // Prefetch chart data in a single batch request (non-blocking)
        prefetchCharts(
          restored.filter((c) => c.currency).map((c) => ({ currency: c.currency!, timeframe: c.timeframe, limit: 300 })),
        ).catch((err) => console.warn('[App] Prefetch charts failed:', err.message));
      } else {
        // First visit: load first 10 active currencies and create charts
        try {
          const allCurrencies = await getCurrencies(undefined, true);
          const first10 = allCurrencies.slice(0, 10);
          const newCharts = first10.map((cur) =>
            createDefaultChart({
              currency: cur.currency,
              currencyInfo: { currency: cur.currency, profit: cur.profit, category: cur.category, is_active: cur.is_active, api_name: cur.api_name ?? null },
            }),
          );
          setCharts(newCharts);
          newCharts.forEach((c) => { if (c.currency) socketService.subscribeToCurrency(c.currency); });
          // Prefetch chart data in a single batch request (non-blocking)
          prefetchCharts(
            newCharts.filter((c) => c.currency).map((c) => ({ currency: c.currency!, timeframe: c.timeframe, limit: 300 })),
          ).catch((err) => console.warn('[App] Prefetch charts failed:', err.message));
          // Persist default charts
          await storageService.patchCharts(newCharts.map(toStored));
        } catch (err) {
          console.warn('Failed to load default currencies:', err);
        }
      }

      // Apply saved locale
      if (settings.locale && settings.locale !== locale) {
        setLocale(settings.locale as Locale);
      }

      // Load favorites
      setFavorites(settings.favorites || []);

      hydratedRef.current = true;
      // Small delay so the preloader doesn't flash
      await new Promise((r) => setTimeout(r, 800));
      setAppEntering(true);
      setAppReady(true);
      // Remove entering class after animation completes
      setTimeout(() => setAppEntering(false), 700);
    })();

    // Singletons: не отключаем при cleanup (React 19 StrictMode вызывает
    // cleanup между mount/remount, что уничтожает подписки TVDatafeed).
    // Socket.IO сохраняет авто-реконнект; при закрытии вкладки браузер
    // автоматически закрывает все WebSocket-соединения.
    return () => { /* singletons — no disconnect */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Page Visibility: reconnect socket & refresh data when tab becomes visible ─── */
  useEffect(() => {
    if (!isAuthorized) return;

    let lastVisibleTime = Date.now();
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Tab is hidden - record the time
        lastVisibleTime = Date.now();
        return;
      }

      // Tab is now visible
      const inactiveDuration = Date.now() - lastVisibleTime;
      const wasStale = inactiveDuration > STALE_THRESHOLD;

      // Check socket connection
      const isConnected = socketService.isConnected();

      if (!isConnected) {
        // Socket is dead — reconnect (don't disconnect first, just connect)
        console.log(`🔄 Tab restored after ${Math.round(inactiveDuration / 1000)}s, socket dead — reconnecting...`);
        try {
          await socketService.connect();
          // Re-subscribe to all active currencies
          chartsRef.current.forEach((chart) => {
            if (chart.currency) {
              socketService.subscribeToCurrency(chart.currency);
            }
          });
          console.log('✅ Reconnected successfully');
        } catch (err) {
          console.error('❌ Reconnection failed:', err);
        }
      } else if (wasStale) {
        // Socket alive but data is stale — just re-subscribe (TVChart handles chart reset)
        console.log(`🔄 Tab restored after ${Math.round(inactiveDuration / 1000)}s, re-subscribing currencies...`);
        chartsRef.current.forEach((chart) => {
          if (chart.currency) {
            socketService.subscribeToCurrency(chart.currency);
          }
        });
      }

      // Refresh currencies list if away for a very long time
      if (wasStale) {
        try {
          const allCurr = await getCurrencies(undefined, true);
          setAllCurrenciesList(allCurr);
        } catch (err) {
          console.warn('Failed to refresh currencies:', err);
        }
      }

      lastVisibleTime = Date.now();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthorized]);

  /* ─── Socket connection state → overlay + reconnect on drop ─── */
  useEffect(() => {
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    let wasDisconnected = false; // track real disconnect→connect transition
    let firstCall = true;        // skip the immediate fire from onConnectionChange
    const unsub = socketService.onConnectionChange((connected) => {
      if (firstCall) {
        // onConnectionChange fires immediately with current state — skip it
        firstCall = false;
        if (connected) hadConnectionRef.current = true;
        setSocketConnected(connected);
        return;
      }
      if (!connected) {
        wasDisconnected = true;
        if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
        setDisconnectInfo(socketService.disconnectInfo);
      }
      if (connected && wasDisconnected && hadConnectionRef.current) {
        // Genuine reconnection after a drop → re-subscribe all currencies
        wasDisconnected = false;
        console.log('🔄 Socket reconnected, re-subscribing currencies...');
        chartsRef.current.forEach((chart) => {
          if (chart.currency) {
            socketService.subscribeToCurrency(chart.currency);
          }
        });
      }
      if (connected) {
        hadConnectionRef.current = true;
      }
      setSocketConnected(connected);
    });
    return () => {
      unsub();
      if (reloadTimer) clearTimeout(reloadTimer);
    };
  }, []);

  /* ─── Better socket connection state → overlay ─── */
  useEffect(() => {
    let hadBetterConnection = false;
    const unsub = betterSocket.onConnectionChange((connected) => {
      if (connected) hadBetterConnection = true;
      // Only show overlay if we had a connection before and lost it
      if (hadBetterConnection) setBetterConnected(connected);
    });
    return unsub;
  }, []);

  /* ─── Socket: currencies_updated → update list without lag ─── */
  useEffect(() => {
    const unsub = socketService.onCurrenciesUpdated((data: CurrenciesUpdatedPayload) => {
      if (!data.currencies || !Array.isArray(data.currencies)) return;

      setAllCurrenciesList((prev) => {
        // Build a map from existing currencies for fast lookup
        const map = new Map(prev.map((c) => [c.currency, c]));

        // Upsert currencies from the event
        for (const incoming of data.currencies) {
          map.set(incoming.currency, {
            currency: incoming.currency,
            profit: incoming.profit,
            category: incoming.category,
            is_active: incoming.is_active,
            icon: incoming.icon ?? null,
            category_icon: incoming.category_icon ?? null,
            created_at: incoming.created_at,
            updated_at: incoming.updated_at,
          });
        }

        return Array.from(map.values());
      });

      // Also update currencyInfo on charts that reference updated currencies
      if (data.currencies.length > 0) {
        const updatedMap = new Map(data.currencies.map((c) => [c.currency, c]));
        setCharts((prev) =>
          prev.map((chart) => {
            if (!chart.currency) return chart;
            const updated = updatedMap.get(chart.currency);
            if (!updated) return chart;
            return {
              ...chart,
              currencyInfo: {
                currency: updated.currency,
                profit: updated.profit,
                category: updated.category,
                is_active: updated.is_active,
                api_name: updated.api_name ?? null,
              },
            };
          }),
        );
      }
    });
    return unsub;
  }, []);

  /* ─── Auto-save charts whenever they change ─── */
  useEffect(() => {
    if (!hydratedRef.current || charts.length === 0) return;
    storageService.patchCharts(charts.map(toStored));
  }, [charts]);

  /* ─── Auto-save layout ─── */
  useEffect(() => {
    if (!hydratedRef.current) return;
    storageService.patchLayout(layout.id);
  }, [layout]);

  /* ─── Auto-save locale ─── */
  useEffect(() => {
    if (!hydratedRef.current) return;
    storageService.patchLocale(locale);
  }, [locale]);

  /* ─── Layout change: auto-adjust chart count to match maxCharts ─── */
  const handleLayoutChange = useCallback((newLayout: GridLayout) => {
    setLayout(newLayout);
    const needed = newLayout.maxCharts;

    setCharts((prev) => {
      if (prev.length === needed) return prev;

      if (prev.length > needed) {
        // Trim excess charts (unsubscribe removed ones)
        const removed = prev.slice(needed);
        removed.forEach((c) => { if (c.currency) socketService.unsubscribeFromCurrency(c.currency); });
        return prev.slice(0, needed);
      }

      // Need more charts — pick random currencies not already in use
      const usedCurrencies = new Set(prev.map((c) => c.currency).filter(Boolean));
      const available = allCurrenciesList.filter((c) => c.is_active && !usedCurrencies.has(c.currency));

      // Shuffle available and pick what we need
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      const toAdd = needed - prev.length;
      const newCharts: ChartConfig[] = [];

      for (let i = 0; i < toAdd; i++) {
        const cur = shuffled[i];
        if (cur) {
          const chart = createDefaultChart({
            currency: cur.currency,
            currencyInfo: { currency: cur.currency, profit: cur.profit, category: cur.category, is_active: cur.is_active, api_name: cur.api_name ?? null },
          });
          socketService.subscribeToCurrency(cur.currency);
          newCharts.push(chart);
        } else {
          // Not enough unique currencies — create chart without currency
          newCharts.push(createDefaultChart());
        }
      }

      return [...prev, ...newCharts];
    });
  }, [allCurrenciesList]);

  const handleCurrencySelect = useCallback((currency: Currency) => {
    const newChart = createDefaultChart({
      currency: currency.currency,
      currencyInfo: {
        currency: currency.currency,
        profit: currency.profit,
        category: currency.category,
        is_active: currency.is_active,
        api_name: currency.api_name ?? null,
      },
    });
    setCharts((prev) => [...prev, newChart]);
    socketService.subscribeToCurrency(currency.currency);
  }, []);

  const removeChart = useCallback((id: string) => {
    setCharts((prev) => {
      if (prev.length <= 1) return prev;
      const chart = prev.find((c) => c.id === id);
      if (chart?.currency) socketService.unsubscribeFromCurrency(chart.currency);
      const next = prev.filter((c) => c.id !== id);

      // Auto-adjust layout to match new chart count
      setLayout((curLayout) => {
        if (curLayout.maxCharts <= next.length) return curLayout;
        // Find a layout that fits the new count
        const bestLayout = GRID_LAYOUTS
          .filter((l) => l.maxCharts === next.length && (!isMobile || isMobileAllowed(l)))
          .sort((a, b) => a.id.localeCompare(b.id))[0];
        return bestLayout || curLayout;
      });

      return next;
    });
  }, [isMobile]);

  const updateChart = useCallback((updated: ChartConfig) => {
    setCharts((prev) => {
      const old = prev.find((c) => c.id === updated.id);
      // Handle socket subscription changes when currency changes
      if (old && old.currency !== updated.currency) {
        if (old.currency) socketService.unsubscribeFromCurrency(old.currency);
        if (updated.currency) socketService.subscribeToCurrency(updated.currency);
      }
      return prev.map((c) => (c.id === updated.id ? updated : c));
    });
  }, []);

  const swapCharts = useCallback((fromIdx: number, toIdx: number) => {
    setCharts((prev) => {
      const next = [...prev];
      const a = next[fromIdx];
      const b = next[toIdx];
      if (!a || !b) return prev;

      // Swap chart data but keep IDs in place so React doesn't remount TradingView widgets
      next[fromIdx] = { ...b, id: a.id };
      next[toIdx] = { ...a, id: b.id };
      return next;
    });
  }, []);

  /* ─── Favorites ─── */
  const handleToggleFavorite = useCallback(async (currency: string) => {
    const updated = await storageService.toggleFavorite(currency);
    setFavorites(updated);
  }, []);

  const handleFavoriteSelect = useCallback((currency: string) => {
    setCharts((prev) => {
      if (prev.length === 0) return prev;

      // If the first chart already shows this currency — nothing to do
      if (prev[0].currency === currency) return prev;

      // Check if a chart with this currency already exists somewhere else
      const existingIdx = prev.findIndex((c) => c.currency === currency);

      if (existingIdx > 0) {
        // Swap the existing chart with the first one
        const next = [...prev];
        [next[0], next[existingIdx]] = [next[existingIdx], next[0]];
        return next;
      }

      // Otherwise replace the first chart's currency
      const oldCurrency = prev[0].currency;
      if (oldCurrency) socketService.unsubscribeFromCurrency(oldCurrency);
      socketService.subscribeToCurrency(currency);

      // Look up full currency info from loaded list
      const found = allCurrenciesList.find((c) => c.currency === currency);
      const updated: ChartConfig = {
        ...prev[0],
        currency,
        currencyInfo: found
          ? { currency: found.currency, profit: found.profit, category: found.category, is_active: found.is_active, api_name: found.api_name ?? null }
          : { currency, profit: 0, category: '', is_active: true },
      };
      return [updated, ...prev.slice(1)];
    });
  }, [allCurrenciesList]);

  const selectedChart = charts.find((c) => c.id === selectedChartId);

  /* ─── Auth guard: show stub ─── */
  if (!isAuthorized) {
    return <Navigate to={routes.Login} replace />;
  }

  /* ─── Loading state ─── */
  if (!appReady) {
    return (
      <div className="preloader">
        <div className="preloader__content">
          <div className="preloader__chart">
            <svg viewBox="0 0 200 80" className="preloader__svg">
              <line x1="0" y1="20" x2="200" y2="20" className="preloader__grid" />
              <line x1="0" y1="40" x2="200" y2="40" className="preloader__grid" />
              <line x1="0" y1="60" x2="200" y2="60" className="preloader__grid" />
              <g className="preloader__candles">
                <line x1="20" y1="18" x2="20" y2="55" stroke="#2ebd85" strokeWidth="1" />
                <rect x="16" y="25" width="8" height="20" fill="#2ebd85" rx="1" />
                <line x1="44" y1="22" x2="44" y2="62" stroke="#f6465d" strokeWidth="1" />
                <rect x="40" y="30" width="8" height="22" fill="#f6465d" rx="1" />
                <line x1="68" y1="15" x2="68" y2="50" stroke="#2ebd85" strokeWidth="1" />
                <rect x="64" y="20" width="8" height="18" fill="#2ebd85" rx="1" />
                <line x1="92" y1="10" x2="92" y2="48" stroke="#2ebd85" strokeWidth="1" />
                <rect x="88" y="15" width="8" height="22" fill="#2ebd85" rx="1" />
                <line x1="116" y1="20" x2="116" y2="58" stroke="#f6465d" strokeWidth="1" />
                <rect x="112" y="28" width="8" height="20" fill="#f6465d" rx="1" />
                <line x1="140" y1="25" x2="140" y2="65" stroke="#f6465d" strokeWidth="1" />
                <rect x="136" y="35" width="8" height="22" fill="#f6465d" rx="1" />
                <line x1="164" y1="12" x2="164" y2="52" stroke="#2ebd85" strokeWidth="1" />
                <rect x="160" y="18" width="8" height="24" fill="#2ebd85" rx="1" />
                <line x1="188" y1="8" x2="188" y2="45" stroke="#2ebd85" strokeWidth="1" />
                <rect x="184" y="12" width="8" height="20" fill="#2ebd85" rx="1" />
              </g>
              <polyline
                points="16,35 40,40 64,28 88,25 112,38 136,45 160,30 184,22"
                className="preloader__priceline"
              />
              <rect x="0" y="0" width="40" height="80" className="preloader__beam" />
            </svg>
          </div>
          <div className="preloader__brand">
            <div className="preloader__logo">
              <div className="pulse-icon"></div>
            </div>
            <span className="preloader__name">Po Terminal</span>
          </div>
          <div className="preloader__bar-wrap">
            <div className="preloader__bar" />
          </div>
          <p className="preloader__text">{t.initializing}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app${appEntering ? ' app--entering' : ''}`}>
      {/* ─── Socket disconnection overlay ─── */}
      {!socketConnected && (
        <div className="reconnect-overlay">
          <div className="reconnect-overlay__content">
            <div className="reconnect-overlay__spinner" />
            <div className="reconnect-overlay__title">{t.connectionLost}</div>
            <div className="reconnect-overlay__text">{t.reconnecting}</div>
            {disconnectInfo && (
              <div className="reconnect-overlay__details">
                <div className="reconnect-overlay__detail-row">
                  <span className="reconnect-overlay__detail-label">{t.disconnReason}:</span>
                  <span className="reconnect-overlay__detail-value">{disconnectInfo.reason}</span>
                </div>
                <div className="reconnect-overlay__detail-row">
                  <span className="reconnect-overlay__detail-label">{t.disconnDetails}:</span>
                  <span className="reconnect-overlay__detail-value">{disconnectInfo.details}</span>
                </div>
                {disconnectInfo.lastError && (
                  <div className="reconnect-overlay__detail-row">
                    <span className="reconnect-overlay__detail-label">{t.disconnError}:</span>
                    <span className="reconnect-overlay__detail-value reconnect-overlay__detail-value--error">{disconnectInfo.lastError}</span>
                  </div>
                )}
                <div className="reconnect-overlay__detail-row">
                  <span className="reconnect-overlay__detail-label">{t.disconnTime}:</span>
                  <span className="reconnect-overlay__detail-value">{disconnectInfo.timestamp}</span>
                </div>
                <div className="reconnect-overlay__detail-row">
                  <span className="reconnect-overlay__detail-label">{t.disconnAttempts}:</span>
                  <span className="reconnect-overlay__detail-value">{disconnectInfo.reconnectAttempts}</span>
                </div>
                <div className="reconnect-overlay__detail-row">
                  <span className="reconnect-overlay__detail-label">{t.disconnTransport}:</span>
                  <span className="reconnect-overlay__detail-value">{disconnectInfo.transport}</span>
                </div>
                <div className="reconnect-overlay__detail-row">
                  <span className="reconnect-overlay__detail-label">{t.disconnUrl}:</span>
                  <span className="reconnect-overlay__detail-value">{disconnectInfo.socketUrl}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Better (trading) socket disconnection banner ─── */}
      {!betterConnected && socketConnected && (
        <div className="reconnect-banner">
          <div className="reconnect-banner__spinner" />
          <span className="reconnect-banner__text">{t.betterDisconnected}</span>
        </div>
      )}

      {/* ─── Header ─── */}
      <header className="header">
        <a className="header__logo" href={routes.Home} aria-label="Go to landing page">
          <div className="header__logo-icon">
            <div className="pulse-icon"></div>
          </div>
          Po Terminal
        </a>

        {/* Layout selector (big icon, no label) */}
        <HeaderLayoutPicker
          layout={layout}
          onLayoutChange={handleLayoutChange}
          isMobile={isMobile}
          autoScrollCandles={autoScroll}
          onAutoScrollChange={(v) => { setAutoScroll(v); localStorage.setItem('chart-autoScroll', String(v)); }}
        />

        {/* Drag mode toggle */}
        <button
          className={`header__drag-toggle${dragMode ? ' header__drag-toggle--active' : ''}`}
          onClick={() => setDragMode((v) => !v)}
          title={t.dragMode}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" />
            <polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" />
            <line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
          </svg>
        </button>

        {/* Desktop: favorites inside header */}
        {!isMobile && (
          <FavoritesBar
            favorites={favorites}
            onSelectCurrency={handleFavoriteSelect}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        <div className="header__actions">
          <AccountSwitcher
            selectedAccount={betterAccount}
            isDemo={isBetDemo}
            onSelectAccount={(acc) => {
              setBetterAccount(acc);
              if (acc) localStorage.setItem('tc_better_account', acc.id);
              else localStorage.removeItem('tc_better_account');
            }}
            onToggleDemo={(demo) => {
              setIsBetDemo(demo);
              localStorage.setItem('tc_better_demo', String(demo));
            }}
            onOpenLogin={() => setShowPOLogin(true)}
          />
          <UserProfileMenu
            onOpenCopyTrading={() => setShowCopyTrading(true)}
            onOpenAccountStats={statsAccount ? () => setShowAccountStats(true) : undefined}
            onOpenTradingTop={() => setShowTradingTop(true)}
            showBetting={showBetting}
            onToggleBetting={(v) => { setShowBetting(v); localStorage.setItem('tc_show_betting', v ? '1' : '0'); }}
          />
        </div>
      </header>

      {/* Mobile: favorites as separate bar below header */}
      {isMobile && (
        <FavoritesBar
          favorites={favorites}
          onSelectCurrency={handleFavoriteSelect}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* Toolbar hidden — controls moved to header & chart overlay */}

      {/* ─── Chart Grid ─── */}
      <Suspense fallback={null}>
        <ChartGrid
          charts={(isMobile && showBetting) ? charts.slice(0, 1) : charts}
          layout={(isMobile && showBetting) ? GRID_LAYOUTS.find((l) => l.id === '1')! : layout}
          showBetting={showBetting}
          onOpenSettings={setSelectedChartId}
          onRemoveChart={removeChart}
          onUpdateChart={updateChart}
          onSwapCharts={swapCharts}
          currencies={allCurrenciesList}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          dragEnabled={dragMode}
          autoScroll={autoScroll}
          betterAccount={betterAccount}
          isBetDemo={isBetDemo}
          balanceCurrency={balanceCurrency}
          isMobile={isMobile}
          onOpenCopyTrading={() => setShowCopyTrading(true)}
          onOpenAccountStats={statsAccount ? () => setShowAccountStats(true) : undefined}
          onOpenTradingTop={() => setShowTradingTop(true)}
          onOpenWebApp={() => setShowWebApp(true)}
        />
      </Suspense>

      {/* ─── Modals ─── */}
      <CurrencySelectModal
        isOpen={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
        onSelect={handleCurrencySelect}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        autoCloseOnSelect={!isMobile}
      />

      {selectedChart && (
        <ChartSettingsModal
          chart={selectedChart}
          onClose={() => setSelectedChartId(null)}
          onSave={updateChart}
        />
      )}

      <POLoginPopup
        isOpen={showPOLogin}
        onClose={() => setShowPOLogin(false)}
        onAccountAdded={(acc) => {
          setBetterAccount(acc);
          localStorage.setItem('tc_better_account', acc.id);
        }}
      />

      <BetterAuthStatusModal
        authStatus={betterAuthStatus}
        loading={betterAuthSubmitting}
        error={betterAuthError}
        onClose={() => {
          if (betterAuthSubmitting) return;
          setBetterAuthStatus(null);
          setBetterAuthError(null);
        }}
        onConfirmTwoFactor={handleBetterAuthConfirm}
        onLogout={handleBetterAuthLogout}
      />

      <CopyTradingPanel
        open={showCopyTrading}
        onClose={() => setShowCopyTrading(false)}
        isMobile={isMobile}
        account={betterAccount}
      />

      <AccountStatsModal
        open={showAccountStats}
        account={statsAccount}
        onVisibilityChange={handleAccountStatsVisibilityChange}
        onClose={() => setShowAccountStats(false)}
      />

      <TradingTopModal
        open={showTradingTop}
        onClose={() => setShowTradingTop(false)}
      />

      <Suspense fallback={null}>
        <WebAppFrame
          open={showWebApp}
          onClose={() => setShowWebApp(false)}
        />
      </Suspense>
    </div>
  );
}

/* ═══════════════════════════════════════
   Header Layout Picker (big icon, dropdown panel)
   ═══════════════════════════════════════ */
interface HeaderLayoutPickerProps {
  layout: GridLayout;
  onLayoutChange: (l: GridLayout) => void;
  isMobile: boolean;
  autoScrollCandles: number;
  onAutoScrollChange: (v: number) => void;
}

const AUTO_SCROLL_OPTIONS = [0, 8, 15, 30, 50, 100] as const;

function HeaderLayoutPicker({ layout, onLayoutChange, isMobile, autoScrollCandles, onAutoScrollChange }: HeaderLayoutPickerProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const layoutGroups = useMemo(() => {
    const available = isMobile ? GRID_LAYOUTS.filter(isMobileAllowed) : GRID_LAYOUTS;
    const map = new Map<number, GridLayout[]>();
    for (const l of available) {
      const arr = map.get(l.maxCharts) || [];
      arr.push(l);
      map.set(l.maxCharts, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [isMobile]);

  return (
    <div className="header__layout" ref={ref}>
      <button
        className="header__layout-btn"
        onClick={() => setOpen(!open)}
        title={`${layout.maxCharts} ${pluralCharts(layout.maxCharts, locale)}`}
      >
        <LayoutIcon icon={layout.icon} />
      </button>
      {open && (
        <div className="header__layout-panel">
          {layoutGroups.map(([count, layouts]) => (
            <div key={count} className="layout-group">
              <span className="layout-group__label">
                {count} {pluralCharts(count, locale)}
              </span>
              <div className="layout-group__options">
                {layouts.map((l) => {
                  const isActive = layout.id === l.id;
                  return (
                    <button
                      key={l.id}
                      className={`layout-group__btn${isActive ? ' layout-group__btn--active' : ''}`}
                      onClick={() => { onLayoutChange(l); setOpen(false); }}
                    >
                      <LayoutIcon icon={l.icon} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="layout-panel__autoscroll">
            <span className="layout-panel__autoscroll-label">{t.autoScroll}</span>
            <div className="layout-panel__autoscroll-options">
              {AUTO_SCROLL_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`layout-panel__autoscroll-btn${autoScrollCandles === n ? ' layout-panel__autoscroll-btn--active' : ''}`}
                  onClick={() => onAutoScrollChange(n)}
                >
                  {n === 0 ? t.autoScrollOff : n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Dynamic border-radius for merged cells in layout icons
function getAreaBounds(icon: number[][], value: number) {
  const rows = icon.length;
  const cols = icon[0].length;

  let minX = cols, maxX = -1, minY = rows, maxY = -1;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (icon[y][x] === value) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

function getAreaRadius(icon: number[][], value: number, r = 4) {
  const { minX, maxX, minY, maxY } = getAreaBounds(icon, value);

  const rows = icon.length;
  const cols = icon[0].length;

  return {
    borderTopLeftRadius:
      minY === 0 && minX === 0 ? r : 0,

    borderTopRightRadius:
      minY === 0 && maxX === cols - 1 ? r : 0,

    borderBottomLeftRadius:
      maxY === rows - 1 && minX === 0 ? r : 0,

    borderBottomRightRadius:
      maxY === rows - 1 && maxX === cols - 1 ? r : 0,
  };
}

/* \u2500\u2500\u2500 Layout icon mini-component \u2500\u2500\u2500 */
function LayoutIcon({ icon }: { icon: number[][] }) {
  const rows = icon.length;
  const cols = icon[0]?.length ?? 1;

  // Build grid-template-areas from number grid (same number = merged cell)
  const areaLetters = 'abcdefghijklmnop';
  const areasStr = icon
    .map((row) =>
      `"${row.map((n) => areaLetters[n - 1] || 'z').join(' ')}"`
    )
    .join(' ');

  // Collect unique slot numbers to render one div per slot
  const uniqueSlots = [...new Set(icon.flat())].sort((a, b) => a - b);

  return (
    <div
      className="layout-icon"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateAreas: areasStr,
      }}
    >
      {uniqueSlots.map((n) => (
        <div
          key={n}
          className="layout-icon__cell"
          style={{
            gridArea: areaLetters[n - 1],
            ...getAreaRadius(icon, n),
          }}
        />
      ))}

      {/* {icon.map((row, y) =>
        row.map((_, x) => (
          <div
            key={`${y}-${x}`}
            className="layout-icon__cell"
            style={getCellRadius(icon, y, x)}
          />
        ))
      )} */}
    </div>
  );
}

export default App;
