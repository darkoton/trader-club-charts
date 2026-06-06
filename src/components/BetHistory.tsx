import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useI18n } from '../i18n';
import type { BetterAccount, BetRecord } from '../api/better';
import { BETTER_AUTH_RECOVERED_EVENT, getAccountHistory, resolvePreferredBetterAccount } from '../api/better';
import { betterSocket } from '../api/betterSocket';
import type { BetResultEvent, BetPlacedEvent, PoOrderOpenedEvent, PoOrderClosedEvent } from '../api/better';
import type { Currency } from '../api/currencies';
import { useAccountBonus } from '../hooks/useAccountBonus';
import { socketService } from '../api/socket';
import { CopyTradingIcon } from '../utils/icons';

function currencySymbol(code: string | undefined): string {
  if (!code) return '$';
  const map: Record<string, string> = {
    USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', CHF:'Fr', CAD:'CA$',
    AUD:'A$', NZD:'NZ$', HKD:'HK$', SGD:'S$', TWD:'NT$', KRW:'₩',
    INR:'₹', THB:'฿', MYR:'RM', IDR:'Rp', PHP:'₱', VND:'₫', PKR:'Rs',
    BDT:'৳', LKR:'Rs', NPR:'Rs', RUB:'₽', UAH:'₴', PLN:'zł', CZK:'Kč',
    HUF:'Ft', RON:'lei', BGN:'лв', HRK:'kn', SEK:'kr', NOK:'kr', DKK:'kr',
    TRY:'₺', BRL:'R$', MXN:'MX$', ARS:'$', CLP:'CL$', COP:'$', PEN:'S/',
    ZAR:'R', NGN:'₦', KES:'KSh', EGP:'E£', MAD:'MAD ', SAR:'﷼',
    AED:'د.إ', QAR:'﷼', KWD:'KD', BHD:'BD', OMR:'﷼', ILS:'₪',
    KZT:'₸', UZS:'so\'m ', GEL:'₾', AMD:'֏', AZN:'₼', BTC:'₿', ETH:'Ξ', USDT:'₮',
  };
  return map[code.toUpperCase()] ?? (code + ' ');
}

/** Format a monetary value with thousand separators and up to 2 decimals */
function fmtMoney(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Parse server timestamp as UTC (server may omit 'Z' suffix) */
function parseUTC(ts: string): Date {
  if (!ts) return new Date();
  if (!ts.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + 'Z');
  }
  return new Date(ts);
}

function normalizeBetKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function updateSingleHistoryBet(
  history: BetRecord[],
  keys: { betId?: string | null; tradeId?: string | null },
  updater: (bet: BetRecord) => BetRecord,
): BetRecord[] {
  const betId = normalizeBetKey(keys.betId);
  const tradeId = normalizeBetKey(keys.tradeId);

  if (!betId && !tradeId) return history;

  let matchIndex = -1;

  if (betId) {
    matchIndex = history.findIndex((bet) => normalizeBetKey(bet.id) === betId);
  }

  if (matchIndex === -1 && tradeId) {
    matchIndex = history.findIndex((bet) => normalizeBetKey(bet.trade_id) === tradeId);
  }

  if (matchIndex === -1) return history;

  const next = [...history];
  next[matchIndex] = updater(next[matchIndex]);
  return next;
}

function hasOtcMarker(value: string | null | undefined): boolean {
  return /(?:\bOTC\b|_OTC$)/i.test(value ?? '');
}

function buildAssetLookupKeys(value: string | null | undefined): string[] {
  if (!value) return [];
  const raw = value.trim();
  if (!raw) return [];

  const upper = raw.toUpperCase();
  const hasOtc = hasOtcMarker(raw);
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

function resolveBetCurrency(
  bet: Pick<BetRecord, 'asset' | 'asset_po'>,
  currencies: Currency[],
): Currency | undefined {
  const candidates = [
    { value: typeof bet.asset === 'string' ? bet.asset.trim() : '', priority: 2 },
    { value: typeof bet.asset_po === 'string' ? bet.asset_po.trim() : '', priority: 1 },
  ].filter((candidate) => candidate.value);

  let bestMatch: { currency: Currency; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateHasOtc = hasOtcMarker(candidate.value);
    const candidateKeys = new Set(buildAssetLookupKeys(candidate.value));
    if (candidateKeys.size === 0) continue;

    for (const currency of currencies) {
      const currencyApiName = (currency.api_name ?? '').trim();
      const currencyName = (currency.currency ?? '').trim();
      const currencyHasOtc = hasOtcMarker(`${currencyApiName} ${currencyName}`);

      if (candidateHasOtc !== currencyHasOtc && (candidateHasOtc || currencyHasOtc)) {
        continue;
      }

      let score = -1;
      if (currencyApiName && currencyApiName.toUpperCase() === candidate.value.toUpperCase()) {
        score = 100 + candidate.priority;
      } else if (currencyName && currencyName.toUpperCase() === candidate.value.toUpperCase()) {
        score = 90 + candidate.priority;
      } else {
        const currencyKeys = [
          ...buildAssetLookupKeys(currencyName),
          ...buildAssetLookupKeys(currencyApiName),
        ];
        if (currencyKeys.some((key) => candidateKeys.has(key))) {
          score = 70 + candidate.priority;
        }
      }

      if (score > (bestMatch?.score ?? -1)) {
        bestMatch = { currency, score };
      }
    }
  }

  return bestMatch?.currency;
}

function resolveBetPoSymbol(
  bet: Pick<BetRecord, 'asset' | 'asset_po'>,
  currencies: Currency[],
): string | undefined {
  const matchedCurrency = resolveBetCurrency(bet, currencies);
  return betterSocket.resolvePoAssetSymbol([
    bet.asset,
    bet.asset_po,
    matchedCurrency?.api_name,
    matchedCurrency?.currency,
  ]);
}

function getBetAssetDisplay(
  bet: Pick<BetRecord, 'asset' | 'asset_po'>,
  currencies: Currency[],
): { assetKey: string; label: string } {
  const matchedCurrency = resolveBetCurrency(bet, currencies);
  const poSymbol = resolveBetPoSymbol(bet, currencies);
  const poAsset = poSymbol ? betterSocket.getPoAsset(poSymbol) : undefined;
  if (matchedCurrency) {
    return {
      assetKey: matchedCurrency.api_name?.trim() || matchedCurrency.currency,
      label: matchedCurrency.currency,
    };
  }

  const poAssetLabel = typeof bet.asset_po === 'string' ? bet.asset_po.trim() : '';
  const asset = typeof bet.asset === 'string' ? bet.asset.trim() : '';
  return {
    assetKey: poAssetLabel || asset || poSymbol || '',
    label: poAsset?.label || poAssetLabel || asset,
  };
}

function getBetPriceCandidates(
  bet: Pick<BetRecord, 'asset' | 'asset_po'>,
  currencies: Currency[],
): string[] {
  const matchedCurrency = resolveBetCurrency(bet, currencies);
  const poSymbol = resolveBetPoSymbol(bet, currencies);
  const poAsset = poSymbol ? betterSocket.getPoAsset(poSymbol) : undefined;
  const candidates = new Set<string>();

  const push = (value: string | null | undefined) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) candidates.add(trimmed);
  };

  push(bet.asset);
  push(bet.asset_po);
  push(poSymbol);
  push(poAsset?.label);
  push(matchedCurrency?.api_name ?? undefined);
  push(matchedCurrency?.currency ?? undefined);

  Array.from(candidates).forEach((candidate) => {
    buildAssetLookupKeys(candidate).forEach((variant) => candidates.add(variant));
  });

  return Array.from(candidates);
}

function parsePriceValue(value: number | string | null | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function getBetOpenPrice(bet: Pick<BetRecord, 'open_price' | 'price_open'>): number | undefined {
  return parsePriceValue(bet.open_price) ?? parsePriceValue(bet.price_open);
}

function assignCurrentPrice(next: Map<string, number>, price: number, ...values: Array<string | null | undefined>): void {
  values.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return;
    next.set(trimmed, price);
    buildAssetLookupKeys(trimmed).forEach((variant) => next.set(variant, price));
  });
}

interface BetHistoryProps {
  account: BetterAccount | null;
  isDemo: boolean;
  currencies?: Currency[];
  balanceCurrency?: string;
  onSelectAsset?: (asset: string) => void;
  onOpenCopyTrading?: () => void;
  onOpenAccountStats?: () => void;
  onOpenTradingTop?: () => void;
  onOpenWebApp?: () => void;
}

export function BetHistory({ account, isDemo, currencies = [], balanceCurrency, onSelectAsset }: BetHistoryProps) {
  const { t } = useI18n();
  const { applyBonus } = useAccountBonus();
  const [fallbackAccount, setFallbackAccount] = useState<BetterAccount | null>(null);
  const [poAssetsRevision, setPoAssetsRevision] = useState(0);
  const [historyTab, setHistoryTab] = useState<'opened' | 'closed'>('closed');
  const [history, setHistory] = useState<BetRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [, setTick] = useState(0);
  const historyReloadTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const effectiveAccount = account ?? fallbackAccount;

  // Per-bet entry prices (from bet_placed po_data.openPrice)
  const entryPricesRef = useRef<Map<string, number>>(new Map());
  // Current prices per asset (from socketService price_update)
  const [currentPrices, setCurrentPrices] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (account) {
      setFallbackAccount(null);
      return;
    }

    let cancelled = false;
    resolvePreferredBetterAccount(localStorage.getItem('tc_better_account'))
      .then((nextAccount) => {
        if (!cancelled) setFallbackAccount(nextAccount);
      })
      .catch(() => {
        if (!cancelled) setFallbackAccount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [account]);

  useEffect(() => {
    return betterSocket.onPoAssets(() => {
      setPoAssetsRevision((value) => value + 1);
    });
  }, []);

  /* ─── Load history ─── */
  const loadHistoryRef = useRef<(() => Promise<void>) | null>(null);
  const clearScheduledHistoryReloads = useCallback(() => {
    historyReloadTimersRef.current.forEach((timer) => clearTimeout(timer));
    historyReloadTimersRef.current = [];
  }, []);
  const loadHistory = useCallback(async () => {
    if (!effectiveAccount) { console.warn('[BetHistory] loadHistory: no account'); return; }
    setHistoryLoading(true);
    try {
      const data = await getAccountHistory(effectiveAccount.id, 50, 0, isDemo);
      console.debug('[BetHistory] loadHistory: got', data.bets.length, 'bets, isDemo=', isDemo, 'closed=', data.bets.filter(b => !!b.result).length);
      entryPricesRef.current = new Map(
        data.bets.flatMap((bet) => {
          const openPrice = getBetOpenPrice(bet);
          if (openPrice == null) return [] as Array<[string, number]>;

          const nextEntries: Array<[string, number]> = [[bet.id, openPrice]];
          if (bet.trade_id) nextEntries.push([bet.trade_id, openPrice]);
          return nextEntries;
        }),
      );
      setHistory(data.bets);
      const detectedCurrency = data.bets.find((b) => b.currency)?.currency;
      if (detectedCurrency) {
        // Do something with detectedCurrency if needed
      }
    } catch (e) {
      console.warn('[BetHistory] loadHistory error:', e);
      setHistory([]);
    }
    setHistoryLoading(false);
  }, [effectiveAccount, isDemo]);

  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  const scheduleHistoryReload = useCallback((delay: number) => {
    const timer = setTimeout(() => {
      historyReloadTimersRef.current = historyReloadTimersRef.current.filter((item) => item !== timer);
      void loadHistoryRef.current?.();
    }, delay);
    historyReloadTimersRef.current.push(timer);
  }, []);

  useEffect(() => clearScheduledHistoryReloads, [clearScheduledHistoryReloads]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleBetterAuthRecovered = () => {
      void loadHistoryRef.current?.();
    };

    window.addEventListener(BETTER_AUTH_RECOVERED_EVENT, handleBetterAuthRecovered as EventListener);
    return () => window.removeEventListener(BETTER_AUTH_RECOVERED_EVENT, handleBetterAuthRecovered as EventListener);
  }, []);

  useEffect(() => {
    clearScheduledHistoryReloads();
    setHistory([]);
  }, [effectiveAccount?.id, isDemo, clearScheduledHistoryReloads]);

  /* Auto-load on mount and account/mode change */
  useEffect(() => {
    if (effectiveAccount) void loadHistory();
  }, [effectiveAccount, isDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Refresh when any bet result comes in — instant local update + deferred full reload */
  useEffect(() => {
    const unsub = betterSocket.onBetResult((data: BetResultEvent) => {
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      // Instantly patch local state so bet moves to "closed"
      setHistory((prev) => updateSingleHistoryBet(
        prev,
        { betId: data.bet_id, tradeId: data.trade_id },
        (bet) => ({
          ...bet,
          result: data.result as BetRecord['result'],
          profit: data.profit,
          balance_after: data.balance_after,
          resolved_at: data.resolved_at,
        }),
      ));
      // Full reload for accurate server data
      scheduleHistoryReload(3000);
    });
    return unsub;
  }, [effectiveAccount, isDemo, scheduleHistoryReload]);

  /* Instantly add new bet to "Opened" when po_order_opened fires (copy-trade / direct PO order) */
  useEffect(() => {
    const unsub = betterSocket.onPoOrderOpened((data: PoOrderOpenedEvent) => {
      if (data.is_demo !== isDemo) return;
      // Only process events for the current account
      if (effectiveAccount && data.account_id !== effectiveAccount.id) return;
      const pd = data.po_data;
      const direction: 'call' | 'put' = pd.command === 0 ? 'call' : 'put';
      // Capture entry price
      if (pd.openPrice != null) {
        entryPricesRef.current.set(pd.id, pd.openPrice);
      }
      const newBet: BetRecord = {
        id: pd.id,
        account_id: data.account_id,
        user_id: 0,
        asset: pd.asset,
        amount: pd.amount,
        direction,
        duration: pd.closeTimestamp - pd.openTimestamp,
        is_demo: data.is_demo,
        trade_id: pd.id,
        currency: pd.currency,
        result: null,
        profit: null,
        balance_after: null,
        placed_at: new Date(pd.openTimestamp * 1000).toISOString(),
        resolved_at: null,
        payout: pd.payout ?? undefined,
      };
      setHistory((prev) => {
        if (prev.some((b) => b.trade_id === pd.id || b.id === pd.id)) return prev;
        return [newBet, ...prev];
      });
    });
    return unsub;
  }, [isDemo, effectiveAccount]);

  /* Instantly add new bet to "Opened" when placed */
  useEffect(() => {
    const unsub = betterSocket.onBetPlaced((data: BetPlacedEvent) => {
      if (data.is_demo !== isDemo) return;
      // Only process events for the current account
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      // Capture entry price from po_data, or from global po_order_opened cache
      const openPrice = (data.po_data?.openPrice as number | undefined)
        ?? (data.trade_id ? betterSocket.getCachedEntryPrice(data.trade_id) : undefined);
      if (openPrice != null) {
        entryPricesRef.current.set(data.bet_id, openPrice);
        if (data.trade_id) entryPricesRef.current.set(data.trade_id, openPrice);
      }
      const newBet: BetRecord = {
        id: data.bet_id,
        account_id: data.account_id ?? effectiveAccount?.id ?? '',
        user_id: 0,
        asset: data.asset,
        amount: data.amount,
        direction: data.direction,
        duration: data.duration,
        is_demo: data.is_demo,
        trade_id: data.trade_id || '',
        result: null,
        profit: null,
        balance_after: null,
        placed_at: new Date().toISOString(),
        resolved_at: null,
        is_copy_trade: data.is_copy_trade ?? undefined,
        payout: data.po_data?.payout ?? undefined,
      };
      setHistory((prev) => {
        // Dedup: po_order_opened may have already added this bet (same trade_id)
        // If found by trade_id, merge real bet_id in
        if (prev.some((b) => b.id === data.bet_id)) return prev;
        const byTradeId = prev.findIndex((b) => b.trade_id === data.trade_id && data.trade_id);
        if (byTradeId >= 0) {
          const updated = [...prev];
          updated[byTradeId] = {
            ...updated[byTradeId],
            id: data.bet_id,
            is_copy_trade: data.is_copy_trade ?? updated[byTradeId].is_copy_trade,
            payout: data.po_data?.payout ?? updated[byTradeId].payout,
          };
          return updated;
        }
        return [newBet, ...prev];
      });
    });
    return unsub;
  }, [isDemo, effectiveAccount]);

  /* Refresh on po_order_closed for immediate result update */
  useEffect(() => {
    const unsub = betterSocket.onPoOrderClosed((data: PoOrderClosedEvent) => {
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      // Instantly patch local state
      if (data.result === 'win' || data.result === 'loss' || data.result === 'draw') {
        setHistory((prev) => updateSingleHistoryBet(
          prev,
          { tradeId: data.trade_id },
          (bet) => ({
            ...bet,
            result: data.result as BetRecord['result'],
            profit: data.profit ?? null,
            resolved_at: data.timestamp || bet.resolved_at,
          }),
        ));
      }
      scheduleHistoryReload(2000);
    });
    return unsub;
  }, [effectiveAccount, isDemo, scheduleHistoryReload]);

  /* Countdown tick for opened bets */
  useEffect(() => {
    if (historyTab !== 'opened') return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [historyTab]);

  /* Subscribe to price updates for assets of open bets */
  const openBets = useMemo(() => history.filter((b) => !b.result && b.is_demo === isDemo), [history, isDemo]);
  const openBetPriceCandidates = useMemo(
    () => [...new Set(openBets.flatMap((bet) => getBetPriceCandidates(bet, currencies)).filter(Boolean))],
    [currencies, openBets, poAssetsRevision],
  );

  useEffect(() => {
    if (openBetPriceCandidates.length === 0) return;
    openBetPriceCandidates.forEach((asset) => socketService.subscribeToCurrency(asset));
    const unsubs = openBetPriceCandidates.map((asset) =>
      socketService.onPriceUpdate(asset, (data) => {
        setCurrentPrices((prev) => {
          const next = new Map(prev);
          assignCurrentPrice(next, data.price, asset, data.currency);
          return next;
        });
      })
    );
    return () => {
      unsubs.forEach((u) => u());
      openBetPriceCandidates.forEach((asset) => socketService.unsubscribeFromCurrency(asset));
    };
  }, [openBetPriceCandidates]);

  useEffect(() => {
    setCurrentPrices(new Map());
  }, [effectiveAccount?.id, isDemo]);

  /* ─── Filter & group ─── */
  const filteredHistory = useMemo(() => {
    if (historyTab === 'opened') {
      const opened = history.filter((b) => !b.result && b.is_demo === isDemo);
      opened.sort((a, b) => parseUTC(b.placed_at).getTime() - parseUTC(a.placed_at).getTime());
      console.debug('[BetHistory] filteredHistory OPENED:', opened.length, 'total history:', history.length, 'isDemo:', isDemo);
      return opened;
    }
    const closed = history.filter((b) => !!b.result && b.is_demo === isDemo);
    closed.sort((a, b) => parseUTC(b.placed_at).getTime() - parseUTC(a.placed_at).getTime());
    console.debug('[BetHistory] filteredHistory CLOSED:', closed.length, 'total history:', history.length, 'isDemo:', isDemo);
    return closed;
  }, [history, historyTab, isDemo]);

  const groupedHistory = useMemo(() => {
    const groups: { date: string; bets: BetRecord[] }[] = [];
    for (const bet of filteredHistory) {
      const d = parseUTC(bet.placed_at);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const last = groups[groups.length - 1];
      if (last && last.date === dateKey) {
        last.bets.push(bet);
      } else {
        groups.push({ date: dateKey, bets: [bet] });
      }
    }
    return groups;
  }, [filteredHistory]);

  /* ─── Asset → payout% map (for potential profit calculation) ─── */
  const payoutMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of currencies) {
      // Map by api_name (used in bet.asset) and by display name
      if (c.api_name) m.set(c.api_name, applyBonus(c.profit));
      m.set(c.currency, applyBonus(c.profit));
    }
    return m;
  }, [currencies, applyBonus]);

  /* ─── api_name → readable display name ─── */
  const assetNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of currencies) {
      if (c.api_name) m.set(c.api_name, c.currency);
    }
    return m;
  }, [currencies]);

  /* ─── History item renderer ─── */
  const renderHistoryItem = (bet: BetRecord) => {
    const { assetKey, label } = getBetAssetDisplay(bet, currencies);
    const priceCandidates = getBetPriceCandidates(bet, currencies);
    const isWin = bet.result === 'win';
    const isLoss = bet.result === 'loss';
    const date = parseUTC(bet.placed_at);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    // const resultAmt = isWin ? (bet.amount + (bet.profit ?? 0)) : 0;
    const profitAmt = isWin ? (bet.profit ?? 0) : 0;
    // const betPayout = payoutMap.get(bet.asset) ?? 0;
    // const potentialPayout = betPayout > 0 ? bet.amount * (1 + betPayout / 100) : bet.amount;
    const sym = currencySymbol(bet.currency ?? balanceCurrency);
    const placedMs = parseUTC(bet.placed_at).getTime();
    const expiryMs = placedMs + bet.duration * 1000;
    const remaining = Math.ceil((expiryMs - Date.now()) / 1000);
    const hh = Math.floor(remaining / 3600);
    const mm = Math.floor((remaining % 3600) / 60);
    const ss = Math.max(0, remaining % 60);
    const timeStr = hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : mm > 0
        ? `${mm}:${String(ss).padStart(2, '0')}`
        : `${Math.max(remaining, 0)}s`;
    const betPay = payoutMap.get(assetKey) ?? bet.payout ?? 0;
    const potential = betPay > 0 ? bet.amount * (1 + betPay / 100) : bet.amount;
    const entryPrice = entryPricesRef.current.get(bet.id)
      ?? getBetOpenPrice(bet)
      ?? (bet.trade_id ? entryPricesRef.current.get(bet.trade_id) : undefined)
      ?? (bet.trade_id ? betterSocket.getCachedEntryPrice(bet.trade_id) : undefined);
    const curPrice = priceCandidates
      .map((candidate) => currentPrices.get(candidate))
      .find((price): price is number => typeof price === 'number' && Number.isFinite(price));
    const livePosition = !bet.result && entryPrice != null && curPrice != null
      ? (() => {
          const isCall = bet.direction === 'call';
          const isWinning = isCall ? curPrice > entryPrice : curPrice < entryPrice;
          const isNeutral = curPrice === entryPrice;
          if (isNeutral) {
            return {
              marker: '=',
              resultClassName: 'tp-hist__result',
              resultStyle: { color: '#f5a623' },
              payoutText: `${sym}${fmtMoney(bet.amount)}`,
              payoutStyle: { color: '#f5a623', fontWeight: 700 },
            };
          }
          if (isWinning) {
            return {
              marker: '+',
              resultClassName: 'tp-hist__result tp-hist__result--win',
              resultStyle: undefined,
              payoutText: `+${sym}${fmtMoney(potential)}`,
              payoutStyle: { color: '#2ebd85', fontWeight: 700 },
            };
          }
          return {
            marker: '-',
            resultClassName: 'tp-hist__result',
            resultStyle: { color: '#f6465d' },
            payoutText: `-${sym}0`,
            payoutStyle: { color: '#f6465d', fontWeight: 700 },
          };
        })()
      : null;
    return (
      <div key={bet.id} className={`tp-hist__item${isWin ? ' tp-hist__item--win' : isLoss ? ' tp-hist__item--loss' : ''}`}>
        <div className="tp-hist__row1">
          <div className="tp-hist__row1-left">
            {bet.is_copy_trade && <CopyTradingIcon className="tp-hist__copy-icon" />}
            <span
              className={`tp-hist__asset${onSelectAsset ? ' tp-hist__asset--link' : ''}`}
              onClick={onSelectAsset ? (e) => { e.stopPropagation(); onSelectAsset(assetKey); } : undefined}
              title={onSelectAsset ? assetKey : undefined}
            >{assetNameMap.get(assetKey) ?? label}</span>
          </div>
          <div className="tp-hist__row1-right">
            {bet.payout != null && <span className="tp-hist__pct">+{bet.payout}%</span>}
            <span className="tp-hist__time">{time}</span>
          </div>
        </div>
        <div className="tp-hist__row2">
          <div className="tp-hist__row2-left">
            <span className={`tp-hist__dir${bet.direction === 'call' ? ' tp-hist__dir--up' : ' tp-hist__dir--down'}`}>
              {bet.direction === 'call' ? '↑' : '↓'}
            </span>
            <span className="tp-hist__amount">{sym}{fmtMoney(bet.amount)}</span>
          </div>
          <div className="tp-hist__row2-center">
            {/* {isWin && <span className="tp-hist__result tp-hist__result--win">{sym}{resultAmt.toFixed(2)}</span>} */}
            {/* {isLoss && <span className="tp-hist__result">{sym}0</span>} */}
            {/* {bet.result === 'draw' && <span className="tp-hist__result">{sym}0</span>} */}
            {!bet.result && (() => {
              if (remaining <= -60) return <span className="tp-hist__result">✕</span>;
              if (remaining <= 0) return <span className="tp-hist__result tp-hist__result--pending">⏳ 0s</span>;
              if (livePosition) {
                return (
                  <span className={livePosition.resultClassName} style={livePosition.resultStyle}>
                    {livePosition.marker} {timeStr}
                  </span>
                );
              }
              return <span className="tp-hist__result tp-hist__result--pending">⏳ {timeStr}</span>;
            })()}
          </div>
          <div className="tp-hist__row2-right">
            {isWin && <span className="tp-hist__profit tp-hist__profit--win">+{sym}{fmtMoney(profitAmt)}</span>}
            {isLoss && <span className="tp-hist__profit tp-hist__profit--loss">{sym}0</span>}
            {bet.result === 'draw' && <span className="tp-hist__profit">{sym}0</span>}
            {!bet.result && (() => {
              // Expired but no result yet — pending
              if (remaining <= 0) {
                return <span className="tp-hist__profit" style={{ color: '#f5a623', fontWeight: 700 }}>⏳</span>;
              }

              if (livePosition) {
                return <span className="tp-hist__profit" style={livePosition.payoutStyle}>{livePosition.payoutText}</span>;
              }

              // No price data — show neutral
              return (
                <span className="tp-hist__profit" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                  {sym}{fmtMoney(potential)}
                </span>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tp-hist tp-hist--inline tp-hist--sidebar">
      {(() => { console.debug('[BetHistory] RENDER: historyTab=', historyTab, 'filtered=', filteredHistory.length, 'grouped=', groupedHistory.length, 'loading=', historyLoading, 'account=', effectiveAccount?.id); return null; })()}
      <div className="tp-hist__header-row">
        <span className="tp__d-hist-title">{t.betTrades}</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button type="button" className="tp__d-hist-refresh" onClick={loadHistory} title="↻">↻</button>
        </div>
      </div>
      <div className="tp-hist__tabs">
        <button
          type="button"
          className={`tp-hist__tab${historyTab === 'opened' ? ' tp-hist__tab--active' : ''}`}
          onClick={() => setHistoryTab('opened')}
        >
          {t.betOpened}
        </button>
        <button
          type="button"
          className={`tp-hist__tab${historyTab === 'closed' ? ' tp-hist__tab--active' : ''}`}
          onClick={() => setHistoryTab('closed')}
        >
          {t.betClosed}
        </button>
      </div>
      <div className="tp-hist__body">
        {historyLoading && <div className="tp-hist__loading">{t.betHistoryLoading}</div>}
        {!historyLoading && filteredHistory.length === 0 && <div className="tp-hist__empty">{t.betHistoryEmpty}</div>}
        {!historyLoading && groupedHistory.map((g) => (
          <div key={g.date}>
            <div className="tp-hist__date-label">{g.date}</div>
            {g.bets.map(renderHistoryItem)}
          </div>
        ))}
      </div>
    </div>
  );
}
