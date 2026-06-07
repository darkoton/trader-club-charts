/**
 * TradingPanel — PocketOption-style call/put trading panel.
 *
 * Desktop: vertical sidebar to the right of each chart.
 * Mobile: compact horizontal bar at the bottom of the chart overlay.
 *
 * Duration picker: HH:MM:SS spinners + quick preset buttons (PO style).
 * Amount picker: numpad + ×/÷ multiplier (PO style).
 *
 * Hides completely if account is not connected / not selected / not active / error.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { betterSocket } from '../api/betterSocket';
import type { BalanceUpdateEvent, BalanceChangedEvent } from '../api/betterSocket';
import type { BetterAccount, BetPlacedEvent, BetResultEvent, PoOrderOpenedEvent, PoOrderClosedEvent, BetErrorEvent, BetRecord, AccountInfo } from '../api/better';
import { BETTER_AUTH_RECOVERED_EVENT, getBalance, getAccountHistory, resolvePreferredBetterAccount, type AccountBalances } from '../api/better';
import { getLatestPrice } from '../api/currencies';
import { socketService } from '../api/socket';
import { useI18n } from '../i18n';
import { CopyTradingIcon } from '../utils/icons';

import MultiplyIcon from '../assets/icons/multiply.svg?react';
import DivideIcon from '../assets/icons/divide.svg?react';
import DeleteIcon from '../assets/icons/delete.svg?react';
import ArrowUpIcon from '../assets/icons/arrow-up.svg?react';
import ArrowDownIcon from '../assets/icons/arrow-down.svg?react';
import RefreshIcon from '../assets/icons/refresh.svg?react';

/** Map ISO currency code to its symbol. Fallback: code + space. */
function currencySymbol(code?: string): string {
  if (!code) return '$';
  const map: Record<string, string> = {
    USD: '$', CAD: 'CA$', MXN: 'MX$', BRL: 'R$', ARS: 'AR$', CLP: 'CL$', COP: 'CO$',
    EUR: '€', GBP: '£', CHF: 'Fr ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ',
    PLN: 'zł ', CZK: 'Kč ', HUF: 'Ft ', RON: 'lei ', BGN: 'лв ', HRK: 'kn ',
    RUB: '₽', UAH: '₴', KZT: '₸', BYN: 'Br ', GEL: '₾', AMD: '֏', AZN: '₼',
    TRY: '₺', MDL: 'L ',
    JPY: '¥', CNY: '¥', HKD: 'HK$', SGD: 'S$', KRW: '₩', INR: '₹', IDR: 'Rp ',
    THB: '฿', MYR: 'RM ', PHP: '₱', TWD: 'NT$', PKR: '₨', BDT: '৳', VND: '₫',
    AED: 'د.إ ', SAR: '﷼ ', ILS: '₪', EGP: 'E£ ', ZAR: 'R ', NGN: '₦', KES: 'KSh ',
    USDT: '$', USDC: '$',
  };
  return map[code.toUpperCase()] ?? `${code} `;
}

/** Format a monetary value with thousand separators and up to 2 decimals */
function fmtMoney(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ─── Duration quick presets ─── */
const DURATION_QUICK = [
  { value: 5, label: '5s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
] as const;

const FLAG_QUICK = [
  { value: 30, label: '+S30' },
  { value: 60, label: '+M1' },
  { value: 120, label: '+M2' },
  { value: 180, label: '+M3' },
  { value: 300, label: '+M5' },
  { value: 1800, label: '+M30' },
] as const;

const EXPIRATION_PREFS_KEY = 'tp_expiration_prefs_v1';

type ExpirationMode = 'duration' | 'time';

interface ExpirationPrefs {
  mode?: ExpirationMode;
  duration?: number;
  targetTimestamp?: number;
  autoTimeOffset?: boolean;
  autoShiftStep?: number;
}

/* ─── Amount presets ─── */
const AMOUNT_PRESETS = [1, 5, 10, 25, 50, 100] as const;

interface TradingPanelProps {
  /** Asset display name, e.g. "EUR/USD OTC" */
  asset?: string;
  /** PocketOption API asset name, e.g. "EURUSD_otc" */
  apiName?: string | null;
  /** Current active account */
  account: BetterAccount | null;
  /** Is demo mode */
  isDemo: boolean;
  /** Payout % from currency info */
  payout?: number;
  /** Is mobile layout */
  isMobile?: boolean;
  /** Hide history section (when history is shown externally, e.g. sidebar) */
  hideHistory?: boolean;
  /** Callback when active bets change (for chart visualization) */
  onBetsChange?: (bets: ActiveBet[]) => void;
  /** Get current market price from chart (for entry price capture) */
  getCurrentPrice?: () => number | null;
  /** Select a different asset from the history (navigates chart to that asset) */
  onSelectAsset?: (asset: string) => void;
  /** Cycle through assets in the current chart context */
  onCycleAsset?: (direction: 'prev' | 'next') => void;
  /** Min allowed duration in seconds (from po_assets) */
  minTimeframe?: number;
  /** Max allowed duration in seconds (from po_assets) */
  maxTimeframe?: number;
  /** Open copy trading panel */
  onOpenCopyTrading?: () => void;
  /** Open account stats */
  onOpenAccountStats?: () => void;
  /** Open trading top 100 */
  onOpenTradingTop?: () => void;
  /** Open web app frame */
  onOpenWebApp?: () => void;
  /** Map api_name → human-readable display name */
  assetNameMap?: Map<string, string>;
}

export interface ActiveBet {
  bet_id: string;
  trade_id?: string;
  asset: string;
  amount: number;
  direction: 'call' | 'put';
  duration: number;
  placedAt: number;
  /** Absolute expiry time (ms). Derived from po_data.closeTimestamp when available. */
  expiresAt: number;
  entryPrice?: number;
  result?: 'win' | 'loss' | 'draw';
  profit?: number;
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

/* ─── Helpers: decompose seconds ↔ hh:mm:ss ─── */
function secsToHMS(total: number): [number, number, number] {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s];
}
function hmsToSecs(h: number, m: number, s: number): number {
  return Math.max(1, h * 3600 + m * 60 + s);
}
function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Parse server timestamp as UTC (server may omit 'Z' suffix) */
function parseUTC(ts: string): Date {
  if (!ts) return new Date();
  // If no timezone info, append Z to parse as UTC
  if (!ts.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + 'Z');
  }
  return new Date(ts);
}

function resolveBetExpiryMs(placedAtMs: number, durationSeconds: number, closeTimestampSeconds?: number | null): number {
  const normalizedPlacedAtMs = Number.isFinite(placedAtMs) ? placedAtMs : Date.now();
  const normalizedDurationSeconds = Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds)) : 1;
  const nominalExpiryMs = normalizedPlacedAtMs + normalizedDurationSeconds * 1000;

  if (!(typeof closeTimestampSeconds === 'number' && Number.isFinite(closeTimestampSeconds))) {
    return nominalExpiryMs;
  }

  const serverExpiryMs = Math.round(closeTimestampSeconds) * 1000;
  return Math.abs(serverExpiryMs - nominalExpiryMs) <= 5000
    ? serverExpiryMs
    : nominalExpiryMs;
}

function resolveActiveBetTiming(
  current: Pick<ActiveBet, 'placedAt' | 'duration'> | null | undefined,
  incoming: { placedAt: number; duration: number; closeTimestampSeconds?: number | null },
): Pick<ActiveBet, 'placedAt' | 'duration' | 'expiresAt'> {
  const normalizedIncomingPlacedAt = Number.isFinite(incoming.placedAt)
    ? Math.round(incoming.placedAt)
    : Date.now();
  const normalizedIncomingDuration = Number.isFinite(incoming.duration)
    ? Math.max(1, Math.round(incoming.duration))
    : 1;

  if (!current) {
    return {
      placedAt: normalizedIncomingPlacedAt,
      duration: normalizedIncomingDuration,
      expiresAt: resolveBetExpiryMs(
        normalizedIncomingPlacedAt,
        normalizedIncomingDuration,
        incoming.closeTimestampSeconds,
      ),
    };
  }

  const duration = Math.abs(normalizedIncomingDuration - current.duration) <= 5
    ? normalizedIncomingDuration
    : current.duration;
  const placedAt = Math.abs(normalizedIncomingPlacedAt - current.placedAt) <= 5000
    ? normalizedIncomingPlacedAt
    : current.placedAt;

  return {
    placedAt,
    duration,
    expiresAt: resolveBetExpiryMs(placedAt, duration, incoming.closeTimestampSeconds),
  };
}

function getBetCloseTimestampMs(bet: Pick<BetRecord, 'placed_at' | 'duration' | 'close_timestamp'>): number {
  return resolveBetExpiryMs(parseUTC(bet.placed_at).getTime(), bet.duration, bet.close_timestamp);
}

const OPEN_BET_RESOLUTION_GRACE_MS = 5 * 60_000;

function isOpenBetStillRelevant(bet: Pick<BetRecord, 'result' | 'placed_at' | 'duration' | 'close_timestamp'>, graceMs = OPEN_BET_RESOLUTION_GRACE_MS): boolean {
  if (bet.result) return false;
  return betterSocket.getServerNowMs() - getBetCloseTimestampMs(bet) <= graceMs;
}

/* ─── Short label for display ─── */
function formatDurationShort(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    if (m === 0 && s === 0) return `${h}h`;
    if (s === 0) return `${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function formatClockSkewShort(seconds: number, locale: string): string {
  const normalizedSeconds = Math.max(1, Math.round(seconds));
  const h = Math.floor(normalizedSeconds / 3600);
  const m = Math.floor((normalizedSeconds % 3600) / 60);
  const s = normalizedSeconds % 60;

  const units = locale === 'en'
    ? { h: 'h', m: 'm', s: 's' }
    : locale === 'uk'
      ? { h: 'год', m: 'хв', s: 'с' }
      : { h: 'ч', m: 'м', s: 'с' };

  if (h > 0) {
    if (m === 0 && s === 0) return `${h}${units.h}`;
    if (s === 0) return `${h}${units.h} ${m}${units.m}`;
    return `${h}${units.h} ${m}${units.m} ${s}${units.s}`;
  }
  if (m > 0) {
    if (s === 0) return `${m}${units.m}`;
    return `${m}${units.m} ${s}${units.s}`;
  }
  return `${s}${units.s}`;
}

function getDurationBounds(minDuration?: number, maxDuration?: number): [number, number] {
  const min = Number.isFinite(minDuration) ? Math.max(5, Math.round(minDuration as number)) : 5;
  const rawMax = Number.isFinite(maxDuration) ? Math.round(maxDuration as number) : 86400;
  return [min, Math.max(min, rawMax)];
}

function clampDurationValue(value: number, minDuration?: number, maxDuration?: number): number {
  const [min, max] = getDurationBounds(minDuration, maxDuration);
  const normalized = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function getTargetTimestampBounds(nowMs: number, minDuration?: number, maxDuration?: number): [number, number] {
  const [min, max] = getDurationBounds(minDuration, maxDuration);
  const minTimestamp = Math.ceil((nowMs + min * 1000) / 1000) * 1000;
  const maxTimestamp = Math.floor((nowMs + max * 1000) / 1000) * 1000;
  return [minTimestamp, Math.max(minTimestamp, maxTimestamp)];
}

function clampTargetTimestampValue(timestamp: number, nowMs: number, minDuration?: number, maxDuration?: number): number {
  const [minTimestamp, maxTimestamp] = getTargetTimestampBounds(nowMs, minDuration, maxDuration);
  const normalized = Number.isFinite(timestamp) ? Math.round(timestamp / 1000) * 1000 : minTimestamp;
  return Math.max(minTimestamp, Math.min(maxTimestamp, normalized));
}

function clampTradeAmountValue(value: number, minAmount = 1, maxAmount?: number | null): number {
  const safeMin = Number.isFinite(minAmount) ? Math.max(1, minAmount) : 1;
  const normalized = Number.isFinite(value) ? Math.round(value * 100) / 100 : safeMin;
  let next = Math.max(safeMin, normalized);
  if (typeof maxAmount === 'number' && Number.isFinite(maxAmount)) {
    next = Math.min(maxAmount, next);
  }
  return Number.isFinite(next) ? next : safeMin;
}

function formatClockTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function getUtcOffsetLabel(date = new Date()): string {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${pad2(minutes)}`;
}

function buildAssetMatchKeys(value: string | null | undefined): string[] {
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
    keys.add(`${compact}${hasOtc ? '_OTC' : ''}`);
    keys.add(`${compact}${hasOtc ? ' OTC' : ''}`.trim());
  }
  if (hasOtc && compact) {
    keys.add(`${compact}_OTC`);
    keys.add(`${compact} OTC`);
  }

  return Array.from(keys).filter(Boolean);
}

function matchesAnyAssetVariant(eventAsset: string, candidates: Array<string | null | undefined>): boolean {
  const eventKeys = new Set(buildAssetMatchKeys(eventAsset));
  if (eventKeys.size === 0) return false;

  const eventHasOtcMarker = /(?:\bOTC\b|_OTC$)/i.test(eventAsset);

  return candidates.some((candidate) => {
    const candidateHasOtcMarker = /(?:\bOTC\b|_OTC$)/i.test(candidate ?? '');
    // Do not mix OTC and non-OTC streams across panels.
    if (eventHasOtcMarker !== candidateHasOtcMarker && (eventHasOtcMarker || candidateHasOtcMarker)) {
      return false;
    }

    const candidateKeys = buildAssetMatchKeys(candidate);
    return candidateKeys.some((key) => eventKeys.has(key));
  });
}

function getBetAssetKey(bet: Pick<BetRecord, 'asset' | 'asset_po'>): string {
  const poAsset = typeof bet.asset_po === 'string' ? bet.asset_po.trim() : '';
  return poAsset || bet.asset;
}

function getBetPriceCandidates(
  bet: Pick<BetRecord, 'asset' | 'asset_po'>,
  assetNameMap?: Map<string, string>,
): string[] {
  const poSymbol = betterSocket.resolvePoAssetSymbol([bet.asset, bet.asset_po]);
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
  push(assetNameMap?.get(bet.asset));
  if (bet.asset_po) push(assetNameMap?.get(bet.asset_po));

  Array.from(candidates).forEach((candidate) => {
    buildAssetMatchKeys(candidate).forEach((variant) => candidates.add(variant));
  });

  return Array.from(candidates);
}

function assignCurrentPrice(next: Map<string, number>, price: number, ...values: Array<string | null | undefined>): void {
  values.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return;
    next.set(trimmed, price);
    buildAssetMatchKeys(trimmed).forEach((variant) => next.set(variant, price));
  });
}

function assignCurrentPriceTimestamp(next: Map<string, number>, timestampMs: number, ...values: Array<string | null | undefined>): void {
  values.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return;
    next.set(trimmed, timestampMs);
    buildAssetMatchKeys(trimmed).forEach((variant) => next.set(variant, timestampMs));
  });
}

function getDisplayPricePrecision(...values: Array<number | null | undefined>): number {
  const finiteValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maxAbs = finiteValues.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (maxAbs >= 1000) return 2;
  if (maxAbs >= 1) return 4;
  return 5;
}

function normalizePriceForComparison(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeBetKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function findHistoryBetIndex(history: BetRecord[], keys: { betId?: string | null; tradeId?: string | null }): number {
  const betId = normalizeBetKey(keys.betId);
  const tradeId = normalizeBetKey(keys.tradeId);

  if (betId) {
    const byId = history.findIndex((bet) => normalizeBetKey(bet.id) === betId);
    if (byId >= 0) return byId;
  }

  if (tradeId) {
    return history.findIndex((bet) => normalizeBetKey(bet.trade_id) === tradeId);
  }

  return -1;
}

function updateSingleHistoryBet(
  history: BetRecord[],
  keys: { betId?: string | null; tradeId?: string | null },
  updater: (bet: BetRecord) => BetRecord,
): BetRecord[] {
  const index = findHistoryBetIndex(history, keys);
  if (index < 0) return history;

  const current = history[index];
  const updated = updater(current);
  if (isSameHistoryBet(current, updated)) return history;

  const next = [...history];
  next[index] = updated;
  return next;
}

function findActiveBetIndex(bets: ActiveBet[], keys: { betId?: string | null; tradeId?: string | null }): number {
  const betId = normalizeBetKey(keys.betId);
  const tradeId = normalizeBetKey(keys.tradeId);

  if (betId) {
    const byId = bets.findIndex((bet) => normalizeBetKey(bet.bet_id) === betId);
    if (byId >= 0) return byId;
  }

  if (tradeId) {
    return bets.findIndex((bet) => normalizeBetKey(bet.trade_id) === tradeId);
  }

  return -1;
}

function updateSingleActiveBet(
  bets: ActiveBet[],
  keys: { betId?: string | null; tradeId?: string | null },
  updater: (bet: ActiveBet) => ActiveBet,
): ActiveBet[] {
  const index = findActiveBetIndex(bets, keys);
  if (index < 0) return bets;

  const next = [...bets];
  next[index] = updater(next[index]);
  return next;
}

function removeSingleActiveBet(
  bets: ActiveBet[],
  keys: { betId?: string | null; tradeId?: string | null },
): ActiveBet[] {
  const index = findActiveBetIndex(bets, keys);
  if (index < 0) return bets;

  return bets.filter((_, betIndex) => betIndex !== index);
}

function mergeHistoryBet(existing: BetRecord | undefined, incoming: BetRecord): BetRecord {
  const openPrice = parsePriceValue(incoming.open_price)
    ?? parsePriceValue(incoming.price_open)
    ?? parsePriceValue(existing?.open_price)
    ?? parsePriceValue(existing?.price_open);
  const closePrice = parsePriceValue(incoming.close_price)
    ?? parsePriceValue(incoming.price_close)
    ?? parsePriceValue(existing?.close_price)
    ?? parsePriceValue(existing?.price_close);

  return {
    ...(existing ?? incoming),
    ...incoming,
    asset_po: incoming.asset_po ?? existing?.asset_po,
    source: incoming.source ?? existing?.source,
    currency: incoming.currency ?? existing?.currency,
    is_copy_trade: incoming.is_copy_trade ?? existing?.is_copy_trade,
    payout: incoming.payout ?? existing?.payout,
    placed_at: incoming.placed_at || existing?.placed_at || new Date().toISOString(),
    resolved_at: incoming.resolved_at ?? existing?.resolved_at ?? null,
    open_price: openPrice ?? null,
    price_open: openPrice ?? null,
    close_price: closePrice ?? null,
    price_close: closePrice ?? null,
    open_timestamp: incoming.open_timestamp ?? existing?.open_timestamp ?? null,
    close_timestamp: incoming.close_timestamp ?? existing?.close_timestamp ?? null,
  };
}

function isSameHistoryBet(left: BetRecord, right: BetRecord): boolean {
  return left.id === right.id
    && left.account_id === right.account_id
    && left.user_id === right.user_id
    && left.asset === right.asset
    && left.asset_po === right.asset_po
    && left.amount === right.amount
    && left.direction === right.direction
    && left.duration === right.duration
    && left.is_demo === right.is_demo
    && left.trade_id === right.trade_id
    && left.result === right.result
    && left.profit === right.profit
    && left.balance_after === right.balance_after
    && left.placed_at === right.placed_at
    && left.resolved_at === right.resolved_at
    && left.source === right.source
    && left.currency === right.currency
    && left.is_copy_trade === right.is_copy_trade
    && left.payout === right.payout
    && left.open_price === right.open_price
    && left.price_open === right.price_open
    && left.close_price === right.close_price
    && left.price_close === right.price_close
    && left.open_timestamp === right.open_timestamp
    && left.close_timestamp === right.close_timestamp;
}

function mergeHistorySnapshot(prev: BetRecord[], incoming: BetRecord[]): BetRecord[] {
  const prevById = new Map(prev.filter((bet) => bet.id).map((bet) => [bet.id, bet]));
  const prevByTradeId = new Map(prev.filter((bet) => bet.trade_id).map((bet) => [bet.trade_id, bet]));
  const matchedIds = new Set<string>();
  const matchedTradeIds = new Set<string>();

  const next = incoming.map((bet) => {
    const existing = (bet.id ? prevById.get(bet.id) : undefined)
      ?? (bet.trade_id ? prevByTradeId.get(bet.trade_id) : undefined);
    if (bet.id) matchedIds.add(bet.id);
    if (bet.trade_id) matchedTradeIds.add(bet.trade_id);
    const merged = mergeHistoryBet(existing, bet);
    return existing && isSameHistoryBet(existing, merged) ? existing : merged;
  });

  prev.forEach((bet) => {
    const matched = (bet.id && matchedIds.has(bet.id)) || (bet.trade_id && matchedTradeIds.has(bet.trade_id));
    if (matched) return;
    if (isOpenBetStillRelevant(bet)) {
      next.push(bet);
    }
  });

  if (next.length === prev.length && next.every((bet, index) => bet === prev[index])) {
    return prev;
  }

  next.sort((left, right) => parseUTC(right.placed_at).getTime() - parseUTC(left.placed_at).getTime());
  return next;
}

function getBetPrimaryPriceCandidate(
  bet: Pick<BetRecord, 'asset' | 'asset_po'>,
): string | undefined {
  return betterSocket.resolvePoAssetSymbol([bet.asset, bet.asset_po])
    || (typeof bet.asset_po === 'string' && bet.asset_po.trim())
    || (typeof bet.asset === 'string' && bet.asset.trim())
    || undefined;
}

function getQuickTargetTimestamp(
  nowMs: number,
  offsetSeconds: number,
  autoOffset: boolean,
  minDuration?: number,
  maxDuration?: number,
  currentTargetTimestamp?: number,
): number {
  const [minTimestamp] = getTargetTimestampBounds(nowMs, minDuration, maxDuration);
  const normalizedCurrent = Number.isFinite(currentTargetTimestamp)
    ? Math.round((currentTargetTimestamp as number) / 1000) * 1000
    : minTimestamp;
  const baseTimestamp = autoOffset ? Math.max(normalizedCurrent, minTimestamp) : nowMs;
  const next = baseTimestamp + offsetSeconds * 1000;
  return clampTargetTimestampValue(next, nowMs, minDuration, maxDuration);
}

function getAlignedAutoShiftTimestamp(
  nowMs: number,
  stepSeconds: number,
  minDuration?: number,
  maxDuration?: number,
  currentTargetTimestamp?: number,
): number {
  const stepMs = Math.max(1000, Math.round(stepSeconds) * 1000);
  const [minTimestamp] = getTargetTimestampBounds(nowMs, minDuration, maxDuration);
  const normalizedCurrent = Number.isFinite(currentTargetTimestamp)
    ? Math.round((currentTargetTimestamp as number) / 1000) * 1000
    : minTimestamp;
  const stepsNeeded = Math.max(1, Math.ceil((minTimestamp - normalizedCurrent) / stepMs));
  const next = normalizedCurrent + stepsNeeded * stepMs;
  return clampTargetTimestampValue(next, nowMs, minDuration, maxDuration);
}

function buildTargetTimestampFromParts(hours: number, minutes: number, seconds: number, nowMs: number, minDuration?: number, maxDuration?: number): number {
  const next = new Date(nowMs);
  next.setHours(
    Math.max(0, Math.min(23, hours)),
    Math.max(0, Math.min(59, minutes)),
    Math.max(0, Math.min(59, seconds)),
    0,
  );
  return clampTargetTimestampValue(next.getTime(), nowMs, minDuration, maxDuration);
}

function readExpirationPrefs(): ExpirationPrefs {
  try {
    const raw = localStorage.getItem(EXPIRATION_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExpirationPrefs;
    return {
      mode: parsed.mode === 'time' ? 'time' : 'duration',
      duration: typeof parsed.duration === 'number' ? parsed.duration : undefined,
      targetTimestamp: typeof parsed.targetTimestamp === 'number' ? parsed.targetTimestamp : undefined,
      autoTimeOffset: typeof parsed.autoTimeOffset === 'boolean' ? parsed.autoTimeOffset : undefined,
      autoShiftStep: typeof parsed.autoShiftStep === 'number' ? parsed.autoShiftStep : undefined,
    };
  } catch {
    return {};
  }
}

function getInitialTargetTimestamp(savedTargetTimestamp: number | undefined, minDuration?: number, maxDuration?: number, fallbackDuration = 60): number {
  const nowMs = Date.now();
  const fallback = clampTargetTimestampValue(nowMs + clampDurationValue(fallbackDuration, minDuration, maxDuration) * 1000, nowMs, minDuration, maxDuration);
  if (!Number.isFinite(savedTargetTimestamp)) return fallback;
  const deltaSeconds = Math.round(((savedTargetTimestamp as number) - nowMs) / 1000);
  const [min, max] = getDurationBounds(minDuration, maxDuration);
  if (deltaSeconds < min || deltaSeconds > max) return fallback;
  return clampTargetTimestampValue(savedTargetTimestamp as number, nowMs, minDuration, maxDuration);
}

/* ═══════════════════════════════════════
   DurationPicker — free-form HH:MM:SS picker within min/max range
   ═══════════════════════════════════════ */
function DurationPicker({
  duration, onChange, onClose, minDuration, maxDuration
}: { duration: number; onChange: (d: number) => void; onClose: () => void; minDuration?: number; maxDuration?: number }) {
  const minD = Math.max(5, minDuration ?? 5);
  const maxD = maxDuration ?? 86400;
  const allowedQuick = useMemo(() => DURATION_QUICK.filter(p => p.value >= minD && p.value <= maxD), [minD, maxD]);
  const [h, m, s] = useMemo(() => secsToHMS(duration), [duration]);
  const [editingPart, setEditingPart] = useState<'h' | 'm' | 's' | null>(null);
  const [editVal, setEditVal] = useState('');

  const clamp = useCallback((v: number) => Math.max(minD, Math.min(maxD, v)), [minD, maxD]);

  const setHMS = useCallback((nh: number, nm: number, ns: number) => {
    const raw = hmsToSecs(
      Math.max(0, Math.min(23, nh)),
      Math.max(0, Math.min(59, nm)),
      Math.max(0, Math.min(59, ns)),
    );
    onChange(clamp(raw));
  }, [onChange, clamp]);

  const commitEdit = useCallback((part: 'h' | 'm' | 's', val: string) => {
    const num = parseInt(val, 10) || 0;
    if (part === 'h') setHMS(num, m, s);
    else if (part === 'm') setHMS(h, num, s);
    else setHMS(h, m, num);
    setEditingPart(null);
  }, [h, m, s, setHMS]);

  const stepPart = useCallback((part: 'h' | 'm' | 's', delta: number) => {
    const raw = hmsToSecs(
      part === 'h' ? h + delta : h,
      part === 'm' ? m + delta : m,
      part === 's' ? s + delta : s,
    );
    onChange(clamp(raw));
  }, [h, m, s, onChange, clamp]);

  /** Smart step size based on current duration */
  const smartStep = useCallback((dir: 1 | -1) => {
    let step: number;
    if (duration < 60) step = 5;
    else if (duration < 300) step = 15;
    else if (duration < 3600) step = 60;
    else step = 300;
    onChange(clamp(duration + step * dir));
  }, [duration, onChange, clamp]);

  const renderCol = (part: 'h' | 'm' | 's', value: number) => (
    <div className="tp-picker__col">
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, 1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5l4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </button>
      <input className="tp-picker__input" type="text" inputMode="numeric" maxLength={2}
        value={editingPart === part ? editVal : pad2(value)}
        onFocus={() => { setEditingPart(part); setEditVal(''); }}
        onBlur={() => commitEdit(part, editVal)}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
          setEditVal(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commitEdit(part, editVal); (e.target as HTMLInputElement).blur(); }
        }}
      />
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, -1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </button>
    </div>
  );

  return (
    <div className="tp-picker tp-picker--dur">
      <div className="tp-picker__spinners">
        {/* Global increment button */}
        <button type="button" className="tp-picker__spin-btn tp-picker__spin-btn--wide" onPointerDown={() => smartStep(1)}>
          <svg width="15" height="14" viewBox="0 0 15 14" fill="none"><path d="M8.667 6H11.667C11.932 6 12.186 6.105 12.374 6.293C12.561 6.48 12.667 6.735 12.667 7C12.667 7.265 12.561 7.52 12.374 7.707C12.186 7.895 11.932 8 11.667 8H8.667V11C8.667 11.265 8.561 11.52 8.374 11.707C8.186 11.895 7.932 12 7.667 12C7.402 12 7.147 11.895 6.96 11.707C6.772 11.52 6.667 11.265 6.667 11V8H3.667C3.402 8 3.147 7.895 2.96 7.707C2.772 7.52 2.667 7.265 2.667 7C2.667 6.735 2.772 6.48 2.96 6.293C3.147 6.105 3.402 6 3.667 6H6.667V3C6.667 2.735 6.772 2.48 6.96 2.293C7.147 2.105 7.402 2 7.667 2C7.932 2 8.186 2.105 8.374 2.293C8.561 2.48 8.667 2.735 8.667 3V6Z" fill="currentColor"/></svg>
        </button>
        {/* HH : MM : SS display with per-unit +/- buttons and clear-on-focus */}
        <div className="tp-picker__hms-row">
          {renderCol('h', h)}
          <span className="tp-picker__sep">:</span>
          {renderCol('m', m)}
          <span className="tp-picker__sep">:</span>
          {renderCol('s', s)}
        </div>
        {/* Global decrement button */}
        <button type="button" className="tp-picker__spin-btn tp-picker__spin-btn--wide" onPointerDown={() => smartStep(-1)}>
          <svg width="15" height="14" viewBox="0 0 15 14" fill="none"><path d="M3.667 6H11.667C11.932 6 12.186 6.105 12.374 6.293C12.561 6.48 12.667 6.735 12.667 7C12.667 7.265 12.561 7.52 12.374 7.707C12.186 7.895 11.932 8 11.667 8H3.667C3.402 8 3.147 7.895 2.96 7.707C2.772 7.52 2.667 7.265 2.667 7C2.667 6.735 2.772 6.48 2.96 6.293C3.147 6.105 3.402 6 3.667 6Z" fill="currentColor"/></svg>
        </button>
      </div>
      {/* Quick presets */}
      <div className="tp-picker__presets">
        {allowedQuick.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`tp-picker__preset${duration === p.value ? ' tp-picker__preset--active' : ''}`}
            onClick={() => { onChange(p.value); onClose(); }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeFlagPicker({
  targetTimestamp,
  onTargetTimestampChange,
  onClose,
  maxDuration,
  autoTimeOffset,
  onAutoTimeOffsetChange,
  autoShiftStep,
  onAutoShiftStepChange,
  labels,
}: {
  targetTimestamp: number;
  onTargetTimestampChange: (timestamp: number) => void;
  onClose: () => void;
  maxDuration?: number;
  autoTimeOffset: boolean;
  onAutoTimeOffsetChange: (value: boolean) => void;
  autoShiftStep: number | null;
  onAutoShiftStepChange: (step: number) => void;
  labels: {
    currentTime: string;
    autoTimeOffset: string;
  };
}) {
  // In time/flag mode the minimum is just 3 seconds (not minDuration which is the candle timeframe).
  // This lets the user pick e.g. 23:46:00 while it is 23:45:40 — within the current candle.
  const TIME_MIN = 3;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editingPart, setEditingPart] = useState<'h' | 'm' | 's' | null>(null);
  const [editVal, setEditVal] = useState('');
  const [targetH, targetM, targetS] = useMemo(() => {
    const target = new Date(targetTimestamp);
    return [target.getHours(), target.getMinutes(), target.getSeconds()] as const;
  }, [targetTimestamp]);
  // Show all quick-buttons up to maxDuration; TIME_MIN replaces minDuration here.
  const allowedQuick = useMemo(
    () => FLAG_QUICK.filter((item) => item.value >= TIME_MIN && item.value <= (maxDuration ?? 86400)),
    [maxDuration],
  );

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // When auto-shift is OFF: keep a fixed clock time — don't auto-advance.
  // (Auto-advance when ON is handled in TradingPanel so it works even when the picker is closed.)
  const applyParts = useCallback((hours: number, minutes: number, seconds: number) => {
    onTargetTimestampChange(buildTargetTimestampFromParts(hours, minutes, seconds, nowMs, TIME_MIN, maxDuration));
  }, [maxDuration, nowMs, onTargetTimestampChange]);

  const commitEdit = useCallback((part: 'h' | 'm' | 's', value: string) => {
    const num = parseInt(value, 10) || 0;
    if (part === 'h') applyParts(num, targetM, targetS);
    else if (part === 'm') applyParts(targetH, num, targetS);
    else applyParts(targetH, targetM, num);
    setEditingPart(null);
  }, [applyParts, targetH, targetM, targetS]);

  const stepPart = useCallback((part: 'h' | 'm' | 's', delta: number) => {
    const nextHours = part === 'h' ? targetH + delta : targetH;
    const nextMinutes = part === 'm' ? targetM + delta : targetM;
    const nextSeconds = part === 's' ? targetS + delta : targetS;
    applyParts(nextHours, nextMinutes, nextSeconds);
  }, [applyParts, targetH, targetM, targetS]);

  const renderCol = (part: 'h' | 'm' | 's', value: number) => (
    <div className="tp-picker__col">
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, 1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5l4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </button>
      <input
        className="tp-picker__input"
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={editingPart === part ? editVal : pad2(value)}
        onFocus={() => { setEditingPart(part); setEditVal(''); }}
        onBlur={() => commitEdit(part, editVal)}
        onChange={(e) => setEditVal(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commitEdit(part, editVal); (e.target as HTMLInputElement).blur(); }
        }}
      />
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, -1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </button>
    </div>
  );

  return (
    <div className="tp-picker tp-picker--time">
      <div className="tp-time-flag__clock">
        <div className="tp-time-flag__clock-label">{labels.currentTime} {getUtcOffsetLabel(new Date(nowMs))}</div>
        <div className="tp-time-flag__clock-value">{formatClockTime(nowMs)}</div>
      </div>

      <div className="tp-picker__spinners tp-picker__spinners--time">
        <div className="tp-picker__hms-row">
          {renderCol('h', targetH)}
          <span className="tp-picker__sep">:</span>
          {renderCol('m', targetM)}
          <span className="tp-picker__sep">:</span>
          {renderCol('s', targetS)}
        </div>
      </div>

      <div className="tp-time-flag__auto-row">
        <span className="tp-time-flag__auto-label">{labels.autoTimeOffset}</span>
        <button
          type="button"
          className={`tp-time-flag__toggle${autoTimeOffset ? ' tp-time-flag__toggle--active' : ''}`}
          onClick={() => onAutoTimeOffsetChange(!autoTimeOffset)}
          aria-pressed={autoTimeOffset}
        >
          <span className="tp-time-flag__toggle-thumb" />
        </button>
      </div>

      <div className="tp-time-flag__quick-grid">
        {allowedQuick.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`tp-time-flag__quick-btn${autoTimeOffset && autoShiftStep === item.value ? ' tp-time-flag__quick-btn--active' : ''}`}
            onClick={() => {
              if (autoTimeOffset) {
                onAutoShiftStepChange(item.value);
              } else {
                onTargetTimestampChange(
                  getQuickTargetTimestamp(Date.now(), item.value, autoTimeOffset, TIME_MIN, maxDuration, targetTimestamp)
                );
              }
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExpirationPicker({
  mode,
  onModeChange,
  duration,
  onDurationChange,
  targetTimestamp,
  onTargetTimestampChange,
  onClose,
  minDuration,
  maxDuration,
  autoTimeOffset,
  onAutoTimeOffsetChange,
  autoShiftStep,
  onAutoShiftStepChange,
  labels,
}: {
  mode: ExpirationMode;
  onModeChange: (mode: ExpirationMode) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  targetTimestamp: number;
  onTargetTimestampChange: (timestamp: number) => void;
  onClose: () => void;
  minDuration?: number;
  maxDuration?: number;
  autoTimeOffset: boolean;
  onAutoTimeOffsetChange: (value: boolean) => void;
  autoShiftStep: number | null;
  onAutoShiftStepChange: (step: number) => void;
  labels: {
    fixedDuration: string;
    byTime: string;
    currentTime: string;
    autoTimeOffset: string;
  };
}) {
  return (
    <div className="tp-exp-picker">
      <div className="tp-exp-picker__tabs">
        <button
          type="button"
          className={`tp-exp-picker__tab${mode === 'duration' ? ' tp-exp-picker__tab--active' : ''}`}
          onClick={() => onModeChange('duration')}
        >
          {labels.fixedDuration}
        </button>
        <button
          type="button"
          className={`tp-exp-picker__tab${mode === 'time' ? ' tp-exp-picker__tab--active' : ''}`}
          onClick={() => onModeChange('time')}
        >
          {labels.byTime}
        </button>
      </div>

      {mode === 'duration' ? (
        <DurationPicker
          duration={duration}
          onChange={onDurationChange}
          onClose={onClose}
          minDuration={minDuration}
          maxDuration={maxDuration}
        />
      ) : (
        <TimeFlagPicker
          targetTimestamp={targetTimestamp}
          onTargetTimestampChange={onTargetTimestampChange}
          onClose={onClose}
          maxDuration={maxDuration}
          autoTimeOffset={autoTimeOffset}
          onAutoTimeOffsetChange={onAutoTimeOffsetChange}
          autoShiftStep={autoShiftStep}
          onAutoShiftStepChange={onAutoShiftStepChange}
          labels={{ currentTime: labels.currentTime, autoTimeOffset: labels.autoTimeOffset }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   AmountPicker — amount field + ×/÷ + numpad + presets
   ═══════════════════════════════════════ */
function AmountPicker({
  amount, maxAmount, minAmount, onChange, onClose, quickMults, onQuickMultsChange, currSign,
}: { amount: number; maxAmount: number | null; minAmount?: number; onChange: (a: number) => void; onClose: () => void; quickMults: [number, number, number]; onQuickMultsChange: (v: [number, number, number]) => void; currSign?: string }) {
  const [inputStr, setInputStr] = useState(String(amount));
  const [multiplier, setMultiplier] = useState(() => {
    const v = parseFloat(localStorage.getItem('amt_multiplier') ?? '2');
    return isNaN(v) || v < 1.1 ? 2 : v;
  });
  const [multStr, setMultStr] = useState(() => {
    const v = parseFloat(localStorage.getItem('amt_multiplier') ?? '2');
    return String(isNaN(v) || v < 1.1 ? 2 : v);
  });
  const [editingQuickIdx, setEditingQuickIdx] = useState<number | null>(null);
  const [editingQuickVal, setEditingQuickVal] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Sync when parent amount changes externally (only if not editing) */
  useEffect(() => { if (!isEditing) setInputStr(String(amount)); }, [amount, isEditing]);

  const handleNumpad = useCallback((key: string) => {
    setInputStr((prev) => {
      let next: string;
      if (key === '⌫') {
        next = prev.length > 1 ? prev.slice(0, -1) : '0';
      } else if (key === '.') {
        next = prev.includes('.') ? prev : prev + '.';
      } else {
        next = prev === '0' ? key : prev + key;
      }
      // Live-commit valid values
      const parsed = parseFloat(next);
      if (!isNaN(parsed) && parsed >= (minAmount ?? 1)) {
        if (maxAmount !== null && parsed > maxAmount) {
          onChange(maxAmount);
          return String(maxAmount);
        }
        onChange(Math.round(parsed * 100) / 100);
      }
      return next;
    });
  }, [onChange, minAmount, maxAmount]);

  const clamp = useCallback((val: number) => {
    let v = Math.max(minAmount ?? 1, val);
    if (maxAmount !== null) v = Math.min(maxAmount, v);
    return v;
  }, [minAmount, maxAmount]);

  const handleMultiply = useCallback(() => {
    const val = clamp(Math.round(amount * multiplier * 100) / 100);
    onChange(val);
    setInputStr(String(val));
  }, [amount, multiplier, clamp, onChange]);

  const handleDivide = useCallback(() => {
    const val = clamp(Math.round(amount / multiplier * 100) / 100);
    onChange(val);
    setInputStr(String(val));
  }, [amount, multiplier, clamp, onChange]);

  const handlePreset = useCallback((val: number) => {
    onChange(val);
    setInputStr(String(val));
    onClose();
  }, [onChange, onClose]);

  const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'] as const;

  return (
    <div className="tp-picker tp-picker--amt">
      {/* Amount field + multiply controls */}
      <div className="tp-picker__amt-top">
        <div className="tp-picker__amt-field">
          <span className="tp-picker__amt-dollar">{currSign ?? '$'}</span>
          <input
            ref={inputRef}
            className="tp-picker__amt-input"
            type="text"
            inputMode="decimal"
            value={isEditing ? inputStr : String(amount)}
            onFocus={() => {
              setIsEditing(true);
              setInputStr('');
            }}
            onBlur={() => {
              setIsEditing(false);
              const parsed = parseFloat(inputStr);
              if (!isNaN(parsed) && parsed > 0) {
                const snapped = clamp(Math.round(parsed * 100) / 100);
                onChange(snapped);
                setInputStr(String(snapped));
              } else {
                setInputStr(String(amount));
              }
            }}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, '');
              setInputStr(val);
              const parsed = parseFloat(val);
              if (!isNaN(parsed) && parsed >= (minAmount ?? 1) && (maxAmount === null || parsed <= maxAmount)) {
                onChange(Math.round(parsed * 100) / 100);
              }
            }}
          />
        </div>
        <div className="tp-picker__multiply">
          <div className="tp-picker__multiply-btns">
            <button type="button" className="tp-picker__multiply-btn" onClick={handleMultiply} title="×">
              <MultiplyIcon />
            </button>
            <button type="button" className="tp-picker__multiply-btn" onClick={handleDivide} title="÷">
              <DivideIcon />
            </button>
          </div>
          <input
            className="tp-picker__multiply-input"
            type="text"
            inputMode="decimal"
            value={multStr}
            onChange={(e) => {
              // Accept both dot and comma as decimal separator
              const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
              setMultStr(e.target.value.replace(/[^0-9.,]/g, ''));
              const v = parseFloat(raw);
              if (!isNaN(v) && v >= 1.1) {
                const rounded = Math.round(v * 100) / 100;
                setMultiplier(rounded);
                localStorage.setItem('amt_multiplier', String(rounded));
              }
            }}
            onBlur={(e) => {
              const raw = e.target.value.replace(',', '.');
              const v = parseFloat(raw);
              const rounded = (!isNaN(v) && v >= 1.1) ? Math.round(v * 100) / 100 : multiplier;
              setMultiplier(rounded);
              setMultStr(String(rounded));
              localStorage.setItem('amt_multiplier', String(rounded));
            }}
          />
        </div>
      </div>

      {/* Virtual numpad */}
      <div className="tp-picker__numpad">
        {NUMPAD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`tp-picker__key${key === '⌫' ? ' tp-picker__key--back' : ''}`}
            onClick={() => handleNumpad(key)}
          >
            {key === '⌫' ? (
              <DeleteIcon />
            ) : key}
          </button>
        ))}
      </div>

      {/* Quick amount presets */}
      <div className="tp-picker__amt-presets">
        {minAmount != null && minAmount > 1 && (
          <button type="button" className="tp-picker__amt-preset tp-picker__amt-preset--minmax" onClick={() => handlePreset(Math.ceil(minAmount))}>
            MIN
          </button>
        )}
        {AMOUNT_PRESETS.map((a) => (
          <button
            key={a}
            type="button"
            className={`tp-picker__amt-preset${amount === a ? ' tp-picker__amt-preset--active' : ''}`}
            onClick={() => handlePreset(a)}
          >
            {currSign ?? '$'}{a}
          </button>
        ))}
        {maxAmount !== null && (
          <button type="button" className="tp-picker__amt-preset tp-picker__amt-preset--minmax" onClick={() => handlePreset(Math.floor(maxAmount))}>
            MAX
          </button>
        )}
      </div>

      {/* Quick multiplier values (editable inputs only) */}
      <div className="tp-picker__quick-mults">
        {quickMults.map((mult, idx) => (
          <div key={idx} className="tp-picker__quick-mult-edit">
            <span className="tp-picker__quick-mult-label">x</span>
            <input
              className="tp-picker__quick-mult-input"
              type="text"
              inputMode="decimal"
              value={editingQuickIdx === idx ? editingQuickVal : String(mult)}
              onFocus={() => { setEditingQuickIdx(idx); setEditingQuickVal(String(mult)); }}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.,]/g, '');
                setEditingQuickVal(raw);
                const v = parseFloat(raw.replace(',', '.'));
                if (!isNaN(v) && v >= 1.1) {
                  const next = [...quickMults] as [number, number, number];
                  next[idx] = Math.round(v * 100) / 100;
                  onQuickMultsChange(next);
                }
              }}
              onBlur={() => {
                const v = parseFloat(editingQuickVal.replace(',', '.'));
                if (!isNaN(v) && v >= 1.1) {
                  const rounded = Math.round(v * 100) / 100;
                  setEditingQuickVal(String(rounded));
                  const next = [...quickMults] as [number, number, number];
                  next[idx] = rounded;
                  onQuickMultsChange(next);
                } else {
                  // Revert to previous valid value
                  setEditingQuickVal(String(mult));
                }
                setEditingQuickIdx(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DesktopPickerPortal — floating popup anchored to a ref, escapes overflow
   ═══════════════════════════════════════ */
function DesktopPickerPortal({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    const calc = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const popW = 240;
      // Position to the left of the anchor
      let left = rect.left - popW - 8;
      if (left < 8) left = rect.right + 8; // fallback: right side
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - 350));
      const maxHeight = window.innerHeight - top - 12;
      setPos({ top, left, maxHeight });
    };
    // Throttle scroll/resize-driven repositioning to one rAF per frame to
    // avoid layout thrashing (getBoundingClientRect + setState on every event).
    const scheduleCalc = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        calc();
      });
    };
    calc();
    window.addEventListener('resize', scheduleCalc, { passive: true });
    window.addEventListener('scroll', scheduleCalc, { capture: true, passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleCalc);
      window.removeEventListener('scroll', scheduleCalc, true);
    };
  }, [anchorRef]);

  if (!pos) return null;

  return (
    <div className="tp-desk-popup__backdrop" onMouseDown={onClose}>
      <div
        ref={popupRef}
        className="tp-desk-popup"
        style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TradingPanel (main)
   ═══════════════════════════════════════ */

export function TradingPanel({ asset, apiName, account, isDemo, payout = 0, isMobile = false, hideHistory = false, onBetsChange, getCurrentPrice, onSelectAsset, onCycleAsset, minTimeframe, maxTimeframe, assetNameMap }: TradingPanelProps) {
  const { t, locale } = useI18n();
  const savedExpirationPrefsRef = useRef<ExpirationPrefs | null>(null);
  if (savedExpirationPrefsRef.current === null) {
    savedExpirationPrefsRef.current = readExpirationPrefs();
  }
  const savedExpirationPrefs = savedExpirationPrefsRef.current;
  /**
   * Derive the PO api_name to use for placing bets and matching events.
   * When the DB api_name is null (currency not mapped), we normalize the
   * display name: "EUR/USD" → "EURUSD", "EUR/USD OTC" → "EURUSD_otc".
   */
  const derivedApiName = useMemo(() => {
    if (apiName) return apiName;
    const isOtc = /\botc\b/i.test(asset || '');
    const base = (asset || '')
      .replace(/\botc\b/ig, '')
      .replace(/[\s/\\.-]/g, '');
    return isOtc ? `${base}_otc` : base;
  }, [apiName, asset]);

  const assetMatchCandidates = useMemo(() => {
    return Array.from(new Set([
      asset,
      apiName,
      derivedApiName,
      assetNameMap?.get(apiName ?? ''),
      assetNameMap?.get(derivedApiName),
    ].filter((value): value is string => Boolean(value && value.trim()))));
  }, [apiName, asset, assetNameMap, derivedApiName]);

  const tradeAssetSymbol = useMemo(() => {
    return betterSocket.resolvePoAssetSymbol(assetMatchCandidates)
      || derivedApiName;
  }, [assetMatchCandidates, derivedApiName]);

  /** Check if incoming event asset matches this panel */
  const isMyAsset = useCallback((eventAsset: string) => {
    return matchesAnyAssetVariant(eventAsset, assetMatchCandidates);
  }, [assetMatchCandidates]);
  // Keep stable ref to getCurrentPrice so socket handlers always have the latest
  const getCurrentPriceRef = useRef(getCurrentPrice);
  getCurrentPriceRef.current = getCurrentPrice;
  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(() => clampDurationValue(savedExpirationPrefs.duration ?? 60, minTimeframe, maxTimeframe));
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>(savedExpirationPrefs.mode === 'time' ? 'time' : 'duration');
  const [targetTimestamp, setTargetTimestamp] = useState(() => getInitialTargetTimestamp(savedExpirationPrefs.targetTimestamp, minTimeframe, maxTimeframe, savedExpirationPrefs.duration ?? 60));
  const [autoTimeOffset, setAutoTimeOffset] = useState(savedExpirationPrefs.autoTimeOffset ?? true);
  const [autoShiftStep, setAutoShiftStep] = useState<number | null>(savedExpirationPrefs.autoShiftStep ?? null);
  const safeDuration = clampDurationValue(duration, minTimeframe, maxTimeframe);
  const [placing, setPlacing] = useState(false);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState<string | undefined>(undefined);
  const [fallbackAccount, setFallbackAccount] = useState<BetterAccount | null>(null);
  const effectiveAccount = account ?? fallbackAccount;

  useEffect(() => {
    if (account) {
      setFallbackAccount(null);
      return;
    }

    let cancelled = false;
    resolvePreferredBetterAccount(localStorage.getItem('tc_better_account'))
      .then((firstAccount) => {
        if (cancelled) return;
        setFallbackAccount(firstAccount);
        if (firstAccount?.id) {
          try { localStorage.setItem('tc_better_account', firstAccount.id); } catch { /* ignore */ }
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn('[TradingPanel] Fallback account load failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [account]);

  useEffect(() => {
    if (!effectiveAccount?.id) return;
    betterSocket.setActiveAccounts([effectiveAccount.id]);
  }, [effectiveAccount]);

  /* Clamp amount when account limits change */
  useEffect(() => {
    if (!accountInfo) return;
    setAmount((prev) => clampTradeAmountValue(prev, accountInfo.min_trade_amount, accountInfo.max_trade_amount));
  }, [accountInfo]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPIRATION_PREFS_KEY, JSON.stringify({
        mode: expirationMode,
        duration: safeDuration,
        targetTimestamp,
        autoTimeOffset,
        autoShiftStep,
      }));
    } catch {
      // Ignore localStorage write failures
    }
  }, [autoShiftStep, autoTimeOffset, expirationMode, safeDuration, targetTimestamp]);

  /* Clamp duration when asset timeframe limits change */
  useEffect(() => {
    setDuration((prev) => clampDurationValue(prev, minTimeframe, maxTimeframe));
  }, [minTimeframe, maxTimeframe]);

  useEffect(() => {
    setTargetTimestamp((prev) => getInitialTargetTimestamp(prev, minTimeframe, maxTimeframe, safeDuration));
  }, [minTimeframe, maxTimeframe, safeDuration]);

  const placingRef = useRef(false);
  const [connectionsReady, setConnectionsReady] = useState(() => betterSocket.isConnectionsReady);
  const [toast, setToast] = useState<string | null>(null);
  const [betterReconnectCount, setBetterReconnectCount] = useState(0);

  /** Duration change handler that clamps to asset limits */
  const handleDurationChange = useCallback((d: number) => {
    setDuration(clampDurationValue(d, minTimeframe, maxTimeframe));
  }, [minTimeframe, maxTimeframe]);

  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(() => betterSocket.getServerTimeOffsetMs());
  const [lastResult, setLastResult] = useState<ActiveBet | null>(null);
  const [balance, setBalance] = useState<AccountBalances | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showAmountPicker, setShowAmountPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(!isMobile);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [historyTab, setHistoryTab] = useState<'opened' | 'closed'>('closed');
  const [history, setHistory] = useState<BetRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Map<string, number>>(new Map());
  const [currentPriceUpdatedAt, setCurrentPriceUpdatedAt] = useState<Map<string, number>>(new Map());
  const historyReloadTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loadHistoryRef = useRef<(() => Promise<void>) | null>(null);
  const durationRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLDivElement>(null);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, setTick] = useState(0); // force re-render for countdown timers

  const clearScheduledHistoryReloads = useCallback(() => {
    historyReloadTimersRef.current.forEach((timer) => clearTimeout(timer));
    historyReloadTimersRef.current = [];
  }, []);

  const scheduleHistoryReload = useCallback((delay: number) => {
    const timer = setTimeout(() => {
      historyReloadTimersRef.current = historyReloadTimersRef.current.filter((item) => item !== timer);
      void loadHistoryRef.current?.();
    }, delay);
    historyReloadTimersRef.current.push(timer);
  }, []);

  /* Quick inline amount editing (clear-on-focus pattern) */
  const [amtEditing, setAmtEditing] = useState(false);
  const [amtInputStr, setAmtInputStr] = useState('');

  /* Copy bet data (admin) */
  const [copiedBetId, setCopiedBetId] = useState<string | null>(null);

  /* Quick multiplier presets (persisted in localStorage) */
  const [quickMults, setQuickMults] = useState<[number, number, number]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('amt_quick_mults') ?? 'null');
      if (Array.isArray(saved) && saved.length === 3 && saved.every((v: unknown) => typeof v === 'number' && v >= 1.1)) {
        return saved as [number, number, number];
      }
    } catch { /* ignore */ }
    return [2.3, 2.5, 2.7];
  });
  const handleQuickMultsChange = useCallback((next: [number, number, number]) => {
    setQuickMults(next);
    localStorage.setItem('amt_quick_mults', JSON.stringify(next));
  }, []);
  const currentBalance = balance ? (isDemo ? balance.balances.demo : balance.balances.real) : null;
  const minTradeAmount = accountInfo?.min_trade_amount ?? 1;
  const maxTradeAmount = accountInfo?.max_trade_amount ?? null;
  const pickerMaxAmount = (currentBalance !== null && maxTradeAmount !== null)
    ? Math.min(currentBalance, maxTradeAmount)
    : (maxTradeAmount ?? currentBalance);
  const safeAmount = clampTradeAmountValue(amount, minTradeAmount, pickerMaxAmount);
  const targetDuration = Math.round((targetTimestamp - currentTimeMs) / 1000);
  const durationDisplayValue = expirationMode === 'time' ? formatClockTime(targetTimestamp) : formatDurationShort(safeDuration);
  const timeSkewWarning = useMemo(() => {
    const absOffsetMs = Math.abs(serverTimeOffsetMs);
    if (!betterSocket.isConnected || absOffsetMs < 5000) return null;
    const prefix = serverTimeOffsetMs > 0 ? t.betClockBehind : t.betClockAhead;
    return `${prefix} ${formatClockSkewShort(absOffsetMs / 1000, locale)}`;
  }, [locale, serverTimeOffsetMs, t.betClockAhead, t.betClockBehind]);

  useEffect(() => {
    if (Number.isFinite(amount) && amount > 0 && amount === safeAmount) return;
    setAmount(safeAmount);
  }, [amount, safeAmount]);

  useEffect(() => {
    setServerTimeOffsetMs(betterSocket.getServerTimeOffsetMs());
    const timer = setInterval(() => {
      const next = betterSocket.getServerTimeOffsetMs();
      setServerTimeOffsetMs((prev) => (prev === next ? prev : next));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Auto-shift: when time mode is active, autoTimeOffset is ON and a step is selected —
  // advance targetTimestamp by autoShiftStep when < 3 seconds remain.
  // Runs in TradingPanel (not inside picker) so it works even when the picker is closed.
  useEffect(() => {
    if (expirationMode !== 'time') return;
    if (!autoTimeOffset || !autoShiftStep) return;
    if (targetDuration > 3) return;
    setTargetTimestamp(getAlignedAutoShiftTimestamp(Date.now(), autoShiftStep, 3, maxTimeframe, targetTimestamp));
  }, [autoShiftStep, autoTimeOffset, expirationMode, maxTimeframe, targetDuration, targetTimestamp]);

  useEffect(() => {
    if (expirationMode !== 'time' && !showDurationPicker) return;
    setCurrentTimeMs(Date.now());
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expirationMode, showDurationPicker]);

  const handleQuickMultClick = useCallback((mult: number) => {
    setAmount((prev) => {
      const base = clampTradeAmountValue(prev, minTradeAmount, pickerMaxAmount);
      return clampTradeAmountValue(base * mult, minTradeAmount, pickerMaxAmount);
    });
  }, [minTradeAmount, pickerMaxAmount]);

  const toggleExpirationMode = useCallback(() => {
    setExpirationMode((prev) => {
      const next = prev === 'duration' ? 'time' : 'duration';
      if (next === 'time') {
        setTargetTimestamp((current) => getInitialTargetTimestamp(current, minTimeframe, maxTimeframe, safeDuration));
      }
      return next;
    });
  }, [maxTimeframe, minTimeframe, safeDuration]);

  /* ─── Notify parent about bet changes (for chart visualization) ─── */
  useEffect(() => {
    console.debug('[TP] activeBets changed:', activeBets.length, 'bets, asset=', asset, 'apiName=', apiName, activeBets.map(b => ({ id: b.bet_id, asset: b.asset, dir: b.direction })));
    onBetsChange?.(activeBets);
  }, [activeBets]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Load active bets from API on mount ─── */
  useEffect(() => {
    if (!effectiveAccount) return;
    // Clear active bets when switching account/demo/asset
    setActiveBets([]);
    let cancelled = false;
    (async () => {
      try {
        const data = await getAccountHistory(effectiveAccount.id, 50, 0, isDemo);
        if (cancelled) return;
        const pending = data.bets
          .filter((b) => !b.result)
          .filter((b) => isMyAsset(b.asset))
          .filter((b) => isOpenBetStillRelevant(b))
          .map((b): ActiveBet => {
            const placedAt = parseUTC(b.placed_at).getTime();
            return {
              bet_id: b.id,
              trade_id: b.trade_id,
              asset: b.asset,
              amount: b.amount,
              direction: b.direction,
              duration: b.duration,
              placedAt,
              expiresAt: placedAt + b.duration * 1000,
              entryPrice: getBetOpenPrice(b),
            };
          });
        if (pending.length > 0) {
          setActiveBets((prev) => {
            // Merge: keep existing (from socket), add API ones that aren't duplicates
            const existingIds = new Set(prev.map((b) => b.bet_id));
            const newBets = pending.filter((b) => !existingIds.has(b.bet_id));
            return newBets.length > 0 ? [...prev, ...newBets] : prev;
          });
        }
      } catch {
        // Ignore — socket events will provide active bets
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveAccount, isDemo, asset, apiName]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Countdown tick for opened bets (re-render every second) ─── */
  /* Also auto-remove stale bets that expired and never got a server result */
  useEffect(() => {
    if (activeBets.length === 0) return;
    const iv = setInterval(() => {
      setTick((t) => t + 1);

      // Auto-remove bets that have been expired for > 30 seconds without result
      const now = betterSocket.getServerNowMs();
      setActiveBets((prev) => {
        const filtered = prev.filter((b) => {
          if (b.result) return true; // has result — kept by normal flow
          const expiryMs = b.expiresAt;
          const overdue = now - expiryMs;
          // Keep unresolved bets visible until backend reconciliation has a fair chance to arrive.
          if (overdue > OPEN_BET_RESOLUTION_GRACE_MS) {
            console.debug('[TP] Auto-removing stale bet:', b.bet_id.slice(0, 16), 'overdue:', Math.round(overdue / 1000), 's');
            return false;
          }

          return true;
        });
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [activeBets.length]);

  /* ─── Load balance via REST (initial) + subscribe via Socket (real-time) ─── */
  useEffect(() => {
    if (!effectiveAccount) { setBalance(null); return; }
    let cancelled = false;

    // Initial REST fetch — also extract currency + account_info to avoid flicker
    getBalance(effectiveAccount.id).then((b) => {
      if (cancelled) return;
      setBalance(b);
      const cur = b.currencies?.[isDemo ? 'demo' : 'real'];
      if (cur) setBalanceCurrency(cur);
      if (b.account_info) setAccountInfo(b.account_info);
    }).catch((err) => console.warn('[TradingPanel] Balance load failed:', err.message));

    // Subscribe to real-time balance via socket
    betterSocket.subscribeBalance(effectiveAccount.id, isDemo);

    const applyBalance = (accountId: string, isDemoEvt: boolean, bal: number, currency?: string, info?: AccountInfo) => {
      if (cancelled || accountId !== effectiveAccount.id) return;
      setBalance((prev) => {
        if (!prev) return prev;
        const next = { ...prev, balances: { ...prev.balances } };
        if (isDemoEvt) next.balances.demo = bal;
        else next.balances.real = bal;
        return next;
      });
      // Only update currency & account info when the event matches the active mode
      if (isDemoEvt === isDemo) {
        if (currency) setBalanceCurrency(currency);
        if (info) setAccountInfo(info);
      }
    };

    const unsubUpdate = betterSocket.onBalanceUpdate((data: BalanceUpdateEvent) => {
      applyBalance(data.account_id, data.is_demo, data.balance, data.currency, data.account_info);
    });

    const unsubChanged = betterSocket.onBalanceChanged((data: BalanceChangedEvent) => {
      applyBalance(data.account_id, data.is_demo, data.balance, data.currency);
    });

    return () => {
      cancelled = true;
      betterSocket.unsubscribeBalance(effectiveAccount.id, isDemo);
      unsubUpdate();
      unsubChanged();
    };
  }, [effectiveAccount, isDemo]);

  useEffect(() => {
    if (!effectiveAccount || typeof window === 'undefined') return undefined;

    const handleBetterAuthRecovered = () => {
      getBalance(effectiveAccount.id)
        .then((b) => {
          setBalance(b);
          const cur = b.currencies?.[isDemo ? 'demo' : 'real'];
          if (cur) setBalanceCurrency(cur);
          if (b.account_info) setAccountInfo(b.account_info);
        })
        .catch(() => undefined);
    };

    window.addEventListener(BETTER_AUTH_RECOVERED_EVENT, handleBetterAuthRecovered as EventListener);
    return () => window.removeEventListener(BETTER_AUTH_RECOVERED_EVENT, handleBetterAuthRecovered as EventListener);
  }, [effectiveAccount, isDemo]);

  /* ─── Track connections_ready ─── */
  useEffect(() => {
    const unsubReady = betterSocket.onConnectionsReady(() => {
      setConnectionsReady(true);
      setToast(t.betConnected ?? '✅ PocketOption connected');
      setTimeout(() => setToast(null), 4000);
    });
    let wasDisconnected = false;
    const unsubConn = betterSocket.onConnectionChange((connected) => {
      if (!connected) {
        setConnectionsReady(false);
        wasDisconnected = true;
      } else if (wasDisconnected) {
        wasDisconnected = false;
        // After reconnect, bump counter so the history-refresh effect picks it up
        console.log('[TP] BetterSocket reconnected — will refresh history');
        setBetterReconnectCount((c) => c + 1);
      }
    });
    return () => { unsubReady(); unsubConn(); };
  }, [t.betConnected]);

  /* ─── Subscribe to bet events ─── */
  useEffect(() => {
    // Filter events by asset — each TradingPanel only handles its own asset's bets
    const unsubPlaced = betterSocket.onBetPlaced((data: BetPlacedEvent) => {
      console.debug('[TP] onBetPlaced:', data.asset, data.bet_id, data.direction, data.amount, 'myAsset=', apiName, '/', asset, 'isMyAsset=', isMyAsset(data.asset), 'is_demo match=', data.is_demo === isDemo, 'account_id:', data.account_id, 'myAccount:', effectiveAccount?.id, 'is_copy_trade=', (data as any).is_copy_trade);
      // Only process events for the current account
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) {
        console.debug('[TP] SKIP bet_placed: account_id mismatch. event=', data.account_id, 'panel=', effectiveAccount.id);
        return;
      }
      // Only process if this panel's asset and mode matches the event
      if (!isMyAsset(data.asset)) {
        console.debug('[TP] SKIP bet_placed: asset mismatch. event=', data.asset, 'panel_asset=', asset, 'panel_apiName=', apiName);
        return;
      }
      if (data.is_demo !== isDemo) {
        console.debug('[TP] SKIP bet_placed: is_demo mismatch. event=', data.is_demo, 'panel=', isDemo);
        return;
      }
      setPlacing(false);
      placingRef.current = false;
      // Create ActiveBet from server-confirmed data
      const nowMs = betterSocket.getServerNowMs();
      const placedAt = nowMs;
      const expiresAt = resolveBetExpiryMs(placedAt, data.duration, data.po_data?.closeTimestamp ?? null);
      const bet: ActiveBet = {
        bet_id: data.bet_id,
        trade_id: data.trade_id,
        asset: data.asset,
        amount: data.amount,
        direction: data.direction,
        duration: data.duration,
        placedAt,
        expiresAt,
        // Prefer server-confirmed openPrice from po_data; fall back to cached price from po_order_opened; then current price
        entryPrice: (data.po_data?.openPrice as number | undefined)
          ?? (data.trade_id ? betterSocket.getCachedEntryPrice(data.trade_id) : undefined)
          ?? getCurrentPriceRef.current?.()
          ?? undefined,
      };
      setActiveBets((prev) => {
        // Avoid duplicates: check both bet_id and trade_id
        // (po_order_opened may have already added this bet by trade_id)
        if (prev.some((b) => b.bet_id === data.bet_id && data.bet_id)) {
          return prev.map((b) => (
            b.bet_id === data.bet_id
              ? {
                  ...b,
                  trade_id: data.trade_id || b.trade_id,
                  asset: data.asset || b.asset,
                  amount: data.amount ?? b.amount,
                  direction: data.direction ?? b.direction,
                  duration: data.duration ?? b.duration,
                  expiresAt,
                  entryPrice: bet.entryPrice ?? b.entryPrice,
                }
              : b
          ));
        }
        if (prev.some((b) => b.trade_id === data.trade_id && data.trade_id)) {
          // Update the existing entry (from po_order_opened) with the real bet_id
          console.debug('[TP] onBetPlaced: merging bet_id into existing trade_id entry', data.trade_id, '->', data.bet_id);
          return prev.map((b) => b.trade_id === data.trade_id ? {
            ...b,
            bet_id: data.bet_id,
            asset: data.asset || b.asset,
            amount: data.amount ?? b.amount,
            direction: data.direction ?? b.direction,
            duration: data.duration ?? b.duration,
            expiresAt,
            entryPrice: bet.entryPrice ?? b.entryPrice,
          } : b);
        }
        console.debug('[TP] onBetPlaced: adding bet', data.bet_id);
        return [...prev, bet];
      });
    });

    const unsubResult = betterSocket.onBetResult((data: BetResultEvent) => {
      console.debug('[TP] onBetResult:', data.asset, data.bet_id, data.trade_id, data.result, data.profit, 'myAsset=', apiName, '/', asset, 'account_id:', data.account_id, 'myAccount:', effectiveAccount?.id);
      // Only process if this panel's asset and mode matches the event
      if (!isMyAsset(data.asset)) return;
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      const matchKeys = { betId: data.bet_id, tradeId: data.trade_id };
      // Show error to user when trade fails at PO level
      if (data.result === 'error') {
        console.debug('[TP] onBetResult: error result, removing bet', data.bet_id);
        setError(t.betTradeError || 'Trade failed');
        setTimeout(() => setError(null), 4000);
        setActiveBets((prev) => removeSingleActiveBet(prev, matchKeys));
        scheduleHistoryReload(2000);
        return;
      }
      setActiveBets((prev) => {
        const matchIndex = findActiveBetIndex(prev, matchKeys);
        if (matchIndex < 0) return prev;
        const existing = prev[matchIndex];
        // Dedup: already resolved by po_order_closed or bet_result_update
        if (existing.result) return prev;
        const updated = updateSingleActiveBet(
          prev,
          matchKeys,
          (bet) => ({ ...bet, result: data.result as ActiveBet['result'], profit: data.profit }),
        );
        const resolved = updated[matchIndex];
        if (resolved) {
          setLastResult(resolved);
          if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = setTimeout(() => setLastResult(null), 4000);
        }
        setTimeout(() => {
          setActiveBets((curr) => removeSingleActiveBet(curr, matchKeys));
        }, 4500);
        scheduleHistoryReload(5000);
        return updated;
      });
    });

    const unsubError = betterSocket.onBetError((data: BetErrorEvent) => {
      console.warn('[TP] onBetError:', {
        bet_id: data.bet_id,
        error: data.error,
        placing: placingRef.current,
        account: effectiveAccount?.id,
        asset,
        isDemo,
        timestamp: new Date().toISOString(),
      });
      // Always show error & reset placing state for this panel
      if (placingRef.current) {
        setPlacing(false);
        placingRef.current = false;
      }
      setError(data.error);
      setTimeout(() => setError(null), 4000);
      // Remove bet by server bet_id (if it was already added via bet_placed)
      if (data.bet_id) {
        setActiveBets((prev) => prev.filter((b) => b.bet_id !== data.bet_id));
        // Mark history entry as error so it doesn't stay in "opened"
        setHistory((prev) => prev.map((b) =>
          b.id === data.bet_id ? { ...b, result: 'error' as BetRecord['result'] } : b
        ));
      }
    });

    const unsubPoOrderOpened = betterSocket.onPoOrderOpened((data: PoOrderOpenedEvent) => {
      const pd = data.po_data;
      console.debug('[TP] onPoOrderOpened:', pd.asset, pd.id, 'command:', pd.command, 'is_demo:', data.is_demo, 'account_id:', data.account_id, 'myAccount:', effectiveAccount?.id, 'myAsset=', apiName, '/', asset, 'isMyAsset=', isMyAsset(pd.asset));
      // Only process events for the current account
      if (effectiveAccount && data.account_id !== effectiveAccount.id) {
        console.debug('[TP] SKIP po_order_opened: account_id mismatch. event=', data.account_id, 'panel=', effectiveAccount.id);
        return;
      }
      if (!isMyAsset(pd.asset)) {
        console.debug('[TP] SKIP po_order_opened: asset mismatch. event=', pd.asset, 'panel_asset=', asset, 'panel_apiName=', apiName);
        return;
      }
      if (data.is_demo !== isDemo) {
        console.debug('[TP] SKIP po_order_opened: is_demo mismatch. event=', data.is_demo, 'panel=', isDemo);
        return;
      }
      const direction: 'call' | 'put' = pd.command === 0 ? 'call' : 'put';
      const pendingRequest = betterSocket.peekPendingPlaceBetRequest((request) => (
        request.account_id === data.account_id
        && request.is_demo === data.is_demo
        && request.asset === pd.asset
        && request.direction === direction
        && Math.abs(request.amount - pd.amount) < 0.0001
      ));
      const placedAt = pendingRequest?.requestedAt ?? betterSocket.getServerNowMs();
      const duration = pendingRequest?.duration ?? (pd.closeTimestamp - pd.openTimestamp);
      const expiresAt = resolveBetExpiryMs(placedAt, duration, pd.closeTimestamp);
      const bet: ActiveBet = {
        bet_id: '',          // not known yet — will be filled by bet_placed
        trade_id: pd.id,
        asset: pd.asset,
        amount: pd.amount,
        direction,
        duration,
        placedAt,
        expiresAt,
        entryPrice: pd.openPrice ?? getCurrentPriceRef.current?.() ?? undefined,
      };
      setActiveBets((prev) => {
        // Dedup: already added via bet_placed (same trade_id) or po_order_opened replay
        if (prev.some((b) => b.trade_id === pd.id)) return prev;
        console.debug('[TP] onPoOrderOpened: adding bet', pd.id, pd.asset, direction);
        return [...prev, bet];
      });
    });

    const unsubPoOrderClosed = betterSocket.onPoOrderClosed((data: PoOrderClosedEvent) => {
      const tradeId = data.trade_id;
      const result = data.result;
      const profit = data.profit;
      console.debug('[TP] onPoOrderClosed:', tradeId, result, profit, 'account_id:', data.account_id, 'myAccount:', effectiveAccount?.id);
      // Only process events for the current account
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      const matchKeys = { tradeId };
      setActiveBets((prev) => {
        const matchIndex = findActiveBetIndex(prev, matchKeys);
        if (matchIndex < 0) return prev;
        const bet = prev[matchIndex];
        // Dedup: already resolved by bet_result
        if (bet.result) return prev;
        if (result === 'loss' || result === 'win' || result === 'draw') {
          const updated = updateSingleActiveBet(
            prev,
            matchKeys,
            (activeBet) => ({ ...activeBet, result, profit }),
          );
          const resolved = updated[matchIndex];
          if (resolved) {
            setLastResult(resolved);
            if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
            resultTimeoutRef.current = setTimeout(() => setLastResult(null), 4000);
          }
          setTimeout(() => {
            setActiveBets((curr) => removeSingleActiveBet(curr, matchKeys));
          }, 4500);
          scheduleHistoryReload(5000);
          return updated;
        }
        return prev;
      });
    });

    return () => { unsubPlaced(); unsubResult(); unsubPoOrderOpened(); unsubPoOrderClosed(); unsubError(); };
  }, [effectiveAccount, asset, apiName, isMyAsset, isDemo, scheduleHistoryReload]);

  /* ─── Close pickers on outside click ─── */
  useEffect(() => {
    if (!showDurationPicker && !showAmountPicker) return;
    const handler = (e: MouseEvent) => {
      if (showDurationPicker) {
        if (durationRef.current && !durationRef.current.contains(e.target as Node)) {
          const portal = document.querySelector('.tp-dur-portal');
          if (portal && portal.contains(e.target as Node)) return;
          setShowDurationPicker(false);
        }
      }
      if (showAmountPicker) {
        if (amountRef.current && !amountRef.current.contains(e.target as Node)) {
          const portal = document.querySelector('.tp-amt-portal');
          if (portal && portal.contains(e.target as Node)) return;
          setShowAmountPicker(false);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDurationPicker, showAmountPicker]);

  /* ─── Load history ─── */
  const historyLoadedRef = useRef(false);
  const loadHistory = useCallback(async () => {
    if (!effectiveAccount) { console.warn('[TP:hist] loadHistory: no account'); return; }
    // Only show loading spinner on first load — subsequent refreshes are seamless
    if (!historyLoadedRef.current) setHistoryLoading(true);
    try {
      const data = await getAccountHistory(effectiveAccount.id, 50, 0, isDemo);
      console.debug('[TP:hist] loadHistory got', data.bets.length, 'bets, isDemo=', isDemo, 'closed=', data.bets.filter(b => !!b.result).length);
      setHistory((prev) => mergeHistorySnapshot(prev, data.bets));
      historyLoadedRef.current = true;
    } catch (e) {
      console.warn('[TP:hist] loadHistory error:', e);
      if (!historyLoadedRef.current) setHistory([]);
    }
    setHistoryLoading(false);
  }, [effectiveAccount, isDemo]);

  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  useEffect(() => clearScheduledHistoryReloads, [clearScheduledHistoryReloads]);

  useEffect(() => {
    clearScheduledHistoryReloads();
    setHistory([]);
    historyLoadedRef.current = false;
  }, [effectiveAccount?.id, isDemo, clearScheduledHistoryReloads]);

  /* Auto-load history on desktop (always open) or when isDemo changes */
  useEffect(() => {
    historyLoadedRef.current = false;
    if (!isMobile && effectiveAccount) {
      // Defer history load so it doesn't compete with chart data on page load
      const timer = setTimeout(() => {
        void loadHistoryRef.current?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [effectiveAccount, isDemo, loadHistory]);

  useEffect(() => {
    if (!effectiveAccount) return;
    const timer = setInterval(() => {
      void loadHistoryRef.current?.();
    }, 5000);
    return () => clearInterval(timer);
  }, [effectiveAccount?.id, isDemo]);

  /* ─── Refresh history after betterSocket reconnects (catch missed events) ─── */
  useEffect(() => {
    if (betterReconnectCount === 0) return; // skip initial mount
    const timer = setTimeout(() => {
      void loadHistoryRef.current?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [betterReconnectCount, loadHistory]);

  useEffect(() => {
    if (history.length === 0) return;
    setActiveBets((prev) => {
      if (prev.length === 0) return prev;

      let changed = false;
      const next: ActiveBet[] = [];

      prev.forEach((bet) => {
        const match = history.find((item) => (item.id && item.id === bet.bet_id) || (item.trade_id && item.trade_id === bet.trade_id));
        if (match?.result) {
          changed = true;
          return;
        }

        if (!match) {
          next.push(bet);
          return;
        }

        const timing = resolveActiveBetTiming(bet, {
          placedAt: parseUTC(match.placed_at).getTime(),
          duration: match.duration ?? bet.duration,
          closeTimestampSeconds: match.close_timestamp,
        });

        const updated: ActiveBet = {
          ...bet,
          bet_id: match.id || bet.bet_id,
          trade_id: match.trade_id || bet.trade_id,
          asset: match.asset || bet.asset,
          amount: match.amount ?? bet.amount,
          direction: match.direction ?? bet.direction,
          duration: timing.duration,
          placedAt: timing.placedAt,
          expiresAt: timing.expiresAt,
          entryPrice: getBetOpenPrice(match) ?? bet.entryPrice,
        };

        if (
          updated.bet_id !== bet.bet_id
          || updated.trade_id !== bet.trade_id
          || updated.asset !== bet.asset
          || updated.amount !== bet.amount
          || updated.direction !== bet.direction
          || updated.duration !== bet.duration
          || updated.placedAt !== bet.placedAt
          || updated.expiresAt !== bet.expiresAt
          || updated.entryPrice !== bet.entryPrice
        ) {
          changed = true;
          next.push(updated);
          return;
        }

        next.push(bet);
      });

      return changed ? next : prev;
    });
  }, [history]);

  /* ─── Instantly add to history from realtime events (all assets, not just current) ─── */
  useEffect(() => {
    const unsubPo = betterSocket.onPoOrderOpened((data: PoOrderOpenedEvent) => {
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id !== effectiveAccount.id) return;
      const pd = data.po_data;
      const direction: 'call' | 'put' = pd.command === 0 ? 'call' : 'put';
      const pendingRequest = betterSocket.peekPendingPlaceBetRequest((request) => (
        request.account_id === data.account_id
        && request.is_demo === data.is_demo
        && request.asset === pd.asset
        && request.direction === direction
        && Math.abs(request.amount - pd.amount) < 0.0001
      ));
      const placedAtMs = pendingRequest?.requestedAt
        ?? (pd.openTimestamp * 1000 + (((pd.openMs as number | undefined) ?? 0)));
      const duration = pendingRequest?.duration ?? (pd.closeTimestamp - pd.openTimestamp);
      const newBet: BetRecord = {
        id: pd.id,
        account_id: data.account_id,
        user_id: 0,
        asset: pd.asset,
        amount: pd.amount,
        direction,
        duration,
        is_demo: data.is_demo,
        trade_id: pd.id,
        currency: pd.currency,
        result: null,
        profit: null,
        balance_after: null,
        placed_at: new Date(placedAtMs).toISOString(),
        resolved_at: null,
        payout: pd.payout ?? undefined,
        open_price: pd.openPrice ?? null,
        price_open: pd.openPrice ?? null,
        close_price: parsePriceValue(pd.closePrice as number | string | null | undefined) ?? null,
        price_close: parsePriceValue(pd.closePrice as number | string | null | undefined) ?? null,
        open_timestamp: pd.openTimestamp,
        close_timestamp: pd.closeTimestamp,
      };
      setHistory((prev) => {
        const existing = prev.find((b) => b.trade_id === pd.id || b.id === pd.id);
        if (existing) {
          const merged = mergeHistoryBet(existing, newBet);
          return prev.map((b) => ((b.trade_id === pd.id || b.id === pd.id) ? (isSameHistoryBet(b, merged) ? b : merged) : b));
        }
        return [newBet, ...prev];
      });
    });
    const unsubBp = betterSocket.onBetPlaced((data: BetPlacedEvent) => {
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      const placedAtMs = data.po_data?.openTimestamp
        ? data.po_data.openTimestamp * 1000 + (((data.po_data.openMs as number | undefined) ?? 0))
        : betterSocket.getServerNowMs();
      const newBet: BetRecord = {
        id: data.bet_id,
        account_id: data.account_id ?? effectiveAccount?.id ?? '',
        user_id: 0,
        asset: data.asset,
        amount: data.amount,
        direction: data.direction,
        duration: Number.isFinite(data.duration)
          ? Math.max(1, Math.round(data.duration))
          : data.po_data?.openTimestamp && data.po_data?.closeTimestamp
            ? data.po_data.closeTimestamp - data.po_data.openTimestamp
            : 1,
        is_demo: data.is_demo,
        trade_id: data.trade_id || '',
        result: null,
        profit: null,
        balance_after: null,
        placed_at: new Date(placedAtMs).toISOString(),
        resolved_at: null,
        currency: data.currency ?? (typeof data.po_data?.currency === 'string' ? data.po_data.currency : undefined),
        is_copy_trade: data.is_copy_trade ?? undefined,
        payout: data.po_data?.payout ?? undefined,
        open_price: (data.po_data?.openPrice as number | undefined) ?? null,
        price_open: (data.po_data?.openPrice as number | undefined) ?? null,
        close_price: (data.po_data?.closePrice as number | undefined) ?? null,
        price_close: (data.po_data?.closePrice as number | undefined) ?? null,
        open_timestamp: data.po_data?.openTimestamp ?? null,
        close_timestamp: data.po_data?.closeTimestamp ?? null,
      };
      setHistory((prev) => {
        if (prev.some((b) => b.id === data.bet_id)) {
          return prev.map((b) => {
            if (b.id !== data.bet_id) return b;
            const merged = mergeHistoryBet(b, newBet);
            return isSameHistoryBet(b, merged) ? b : merged;
          });
        }
        const byTradeId = prev.findIndex((b) => b.trade_id === data.trade_id && data.trade_id);
        if (byTradeId >= 0) {
          const updated = [...prev];
          const merged = mergeHistoryBet(updated[byTradeId], newBet);
          updated[byTradeId] = isSameHistoryBet(updated[byTradeId], merged) ? updated[byTradeId] : merged;
          return updated;
        }
        return [newBet, ...prev];
      });
    });
    const unsubRes = betterSocket.onBetResult((data: BetResultEvent) => {
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
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
      scheduleHistoryReload(3000);
    });
    const unsubPoClosed = betterSocket.onPoOrderClosed((data: PoOrderClosedEvent) => {
      if (data.is_demo !== isDemo) return;
      if (effectiveAccount && data.account_id && data.account_id !== effectiveAccount.id) return;
      const result = data.result as BetRecord['result'];
      setHistory((prev) => updateSingleHistoryBet(
        prev,
        { tradeId: data.trade_id },
        (bet) => ({
          ...bet,
          result,
          profit: data.profit,
          resolved_at: bet.resolved_at ?? new Date().toISOString(),
        }),
      ));
      scheduleHistoryReload(3000);
    });
    const unsubErr = betterSocket.onBetError((data: BetErrorEvent) => {
      if (data.bet_id) {
        // Mark history entry as error so it doesn't linger in "opened"
        setHistory((prev) => prev.map((b) =>
          b.id === data.bet_id ? { ...b, result: 'error' as BetRecord['result'] } : b
        ));
      }
    });
    return () => { unsubPo(); unsubBp(); unsubRes(); unsubPoClosed(); unsubErr(); };
  }, [effectiveAccount, isDemo, scheduleHistoryReload]);

  const toggleHistory = useCallback(() => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) loadHistory();
  }, [showHistory, loadHistory]);

  useEffect(() => {
    if (!isMobile || !showHistory) return;

    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevHtmlTouchAction = documentElement.style.touchAction;

    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.touchAction = 'none';

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
      documentElement.style.overflow = prevHtmlOverflow;
      documentElement.style.touchAction = prevHtmlTouchAction;
    };
  }, [isMobile, showHistory]);

  /* ─── Place bet ─── */
  const placeBet = useCallback((direction: 'call' | 'put') => {
    console.debug('[TP] placeBet called:', direction, { account: !!effectiveAccount, asset, placing, apiName });
    if (!effectiveAccount || !asset || placing) {
      console.debug('[TP] placeBet BLOCKED:', { noAccount: !effectiveAccount, noAsset: !asset, placing });
      return;
    }
    const errorSym = currencySymbol(balanceCurrency);
    const normalizedAmount = clampTradeAmountValue(amount, minTradeAmount, pickerMaxAmount);
    const requestedDuration = expirationMode === 'time'
      ? Math.round((targetTimestamp - Date.now()) / 1000)
      : duration;
    const normalizedDuration = clampDurationValue(requestedDuration, minTimeframe, maxTimeframe);
    const [minDuration, maxDuration] = getDurationBounds(minTimeframe, maxTimeframe);

    if (!Number.isFinite(amount) || amount <= 0) {
      setAmount(normalizedAmount);
      setError(`Некорректная сумма. Установлено: ${errorSym}${fmtMoney(normalizedAmount)}`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (expirationMode === 'time' && requestedDuration <= 0) {
      setError(t.tpExpiryPassed);
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (requestedDuration !== normalizedDuration) {
      if (expirationMode === 'duration') setDuration(normalizedDuration);
      setError(requestedDuration > maxDuration
        ? `Макс. экспирация: ${formatDurationShort(maxDuration)}`
        : `Мин. экспирация: ${formatDurationShort(minDuration)}`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Validate amount against account limits
    if (accountInfo) {
      if (normalizedAmount < accountInfo.min_trade_amount) {
        setAmount(clampTradeAmountValue(accountInfo.min_trade_amount, minTradeAmount, pickerMaxAmount));
        setError(`Мин. сумма: ${errorSym}${accountInfo.min_trade_amount}`);
        setTimeout(() => setError(null), 3000);
        return;
      }
      if (normalizedAmount > accountInfo.max_trade_amount) {
        setAmount(clampTradeAmountValue(accountInfo.max_trade_amount, minTradeAmount, pickerMaxAmount));
        setError(`Макс. сумма: ${errorSym}${accountInfo.max_trade_amount}`);
        setTimeout(() => setError(null), 3000);
        return;
      }
    }
    setPlacing(true);
    placingRef.current = true;
    setError(null);

    console.debug('[TP] placeBet sending:', { direction, asset, tradeAssetSymbol, amount: normalizedAmount, duration: normalizedDuration, expirationMode, targetTimestamp });

    const emitResult = betterSocket.placeBet({
      account_id: effectiveAccount.id,
      asset: tradeAssetSymbol,
      amount: normalizedAmount,
      direction,
      duration: normalizedDuration,
      is_demo: isDemo,
    });

    if (!emitResult.ok) {
      setPlacing(false);
      placingRef.current = false;
      setError(emitResult.error === 'Better socket not connected'
        ? t.betterDisconnected
        : emitResult.error || t.betTradeError);
      setTimeout(() => setError(null), 4000);
      return;
    }

    setTimeout(() => { setPlacing(false); placingRef.current = false; }, 10000);
  }, [effectiveAccount, accountInfo, amount, apiName, asset, balanceCurrency, derivedApiName, duration, expirationMode, isDemo, maxTimeframe, minTimeframe, minTradeAmount, pickerMaxAmount, placing, t.betTradeError, t.betterDisconnected, t.tpExpiryPassed, targetTimestamp, tradeAssetSymbol]);

  const effectivePayout = payout;
  const potentialPayout = effectivePayout > 0 ? safeAmount * (1 + effectivePayout / 100) : safeAmount;
  const sym = currencySymbol(balanceCurrency);
  const disabled = !effectiveAccount || !asset || !betterSocket.isConnected || !connectionsReady;
  const assetCycleDisabled = !onCycleAsset;

  /* ─── Filtered + grouped history (merge activeBets into "opened") ─── */
  const filteredHistory = useMemo(() => {
    if (!effectiveAccount) return [];
    if (historyTab === 'opened') {
      // Convert activeBets to BetRecord-like for display
      const liveBets: BetRecord[] = activeBets
        .filter((b) => !b.result)
        .map((b) => {
          // Pull payout from the parallel history entry (added by po_order_opened / bet_placed realtime handler)
          const histEntry = history.find((h) => (h.trade_id && h.trade_id === b.trade_id) || (h.id && h.id === b.bet_id));
          const liveOpenPrice = b.entryPrice ?? getBetOpenPrice(histEntry ?? { open_price: null, price_open: null });
          return {
            id: b.bet_id,
            account_id: effectiveAccount.id,
            user_id: 0,
            asset: b.asset,
            asset_po: histEntry?.asset_po,
            amount: b.amount,
            direction: b.direction,
            duration: b.duration,
            is_demo: isDemo,
            trade_id: b.trade_id || '',
            result: null,
            profit: null,
            balance_after: null,
            placed_at: new Date(b.placedAt).toISOString(),
            resolved_at: null,
            currency: histEntry?.currency,
            payout: histEntry?.payout,
            open_price: liveOpenPrice ?? null,
            price_open: liveOpenPrice ?? null,
            open_timestamp: Math.round(b.placedAt / 1000),
            close_timestamp: Math.round(b.expiresAt / 1000),
          };
        });
      // Merge: live bets first, then API/realtime bets (deduplicate by id and trade_id)
      const liveIds = new Set(liveBets.map((b) => b.id).filter(Boolean));
      const liveTradeIds = new Set(liveBets.map((b) => b.trade_id).filter(Boolean));
      const apiBets = history.filter((b) => !b.result && b.result !== 'error' && b.is_demo === isDemo && !liveIds.has(b.id) && !liveTradeIds.has(b.trade_id) && isOpenBetStillRelevant(b));
      const merged = [...liveBets, ...apiBets];
      merged.sort((a, b) => parseUTC(b.placed_at).getTime() - parseUTC(a.placed_at).getTime());
      return merged;
    }
    const closed = history.filter((b) => !!b.result && b.result !== 'error' && b.is_demo === isDemo);
    console.debug('[TP:hist] filteredHistory closed: history.length=', history.length, 'isDemo=', isDemo, 'closed=', closed.length, 'hideHistory=', hideHistory);
    closed.sort((a, b) => parseUTC(b.placed_at).getTime() - parseUTC(a.placed_at).getTime());
    return closed;
  }, [history, historyTab, activeBets, effectiveAccount, isDemo]);

  const openTrackedBets = useMemo(() => {
    const liveBets: Array<Pick<BetRecord, 'asset' | 'asset_po' | 'id' | 'trade_id' | 'result'>> = activeBets
      .filter((bet) => !bet.result)
      .map((bet) => {
        const histEntry = history.find((item) => (item.trade_id && item.trade_id === bet.trade_id) || (item.id && item.id === bet.bet_id));
        return {
          id: bet.bet_id,
          trade_id: bet.trade_id || '',
          asset: bet.asset,
          asset_po: histEntry?.asset_po,
          result: null,
        };
      });

    const liveIds = new Set(liveBets.map((bet) => bet.id).filter(Boolean));
    const liveTradeIds = new Set(liveBets.map((bet) => bet.trade_id).filter(Boolean));
    const apiBets = history.filter((bet) => !bet.result && bet.result !== 'error' && bet.is_demo === isDemo && !liveIds.has(bet.id) && !liveTradeIds.has(bet.trade_id));

    return [...liveBets, ...apiBets];
  }, [activeBets, history, isDemo]);

  const openBetPriceCandidates = useMemo(
    () => [...new Set(openTrackedBets.flatMap((bet) => getBetPriceCandidates(bet, assetNameMap)).filter(Boolean))],
    [assetNameMap, openTrackedBets],
  );

  useEffect(() => {
    if (openBetPriceCandidates.length === 0) return;
    openBetPriceCandidates.forEach((assetName) => socketService.subscribeToCurrency(assetName));
    const unsubs = openBetPriceCandidates.map((assetName) => socketService.onPriceUpdate(assetName, (data) => {
      const parsedTimestampMs = Date.parse(data.timestamp);
      const timestampMs = Number.isFinite(parsedTimestampMs) ? parsedTimestampMs : Date.now();
      setCurrentPrices((prev) => {
        const next = new Map(prev);
        assignCurrentPrice(next, data.price, assetName, data.currency);
        return next;
      });
      setCurrentPriceUpdatedAt((prev) => {
        const next = new Map(prev);
        assignCurrentPriceTimestamp(next, timestampMs, assetName, data.currency);
        return next;
      });
    }));

    return () => {
      unsubs.forEach((unsub) => unsub());
      openBetPriceCandidates.forEach((assetName) => socketService.unsubscribeFromCurrency(assetName));
    };
  }, [openBetPriceCandidates]);

  useEffect(() => {
    if (openTrackedBets.length === 0) return;

    let cancelled = false;
    const candidateGroups = new Map<string, string[]>();

    openTrackedBets.forEach((bet) => {
      const primary = getBetPrimaryPriceCandidate(bet);
      if (!primary) return;
      const existing = candidateGroups.get(primary) ?? [];
      const merged = new Set([...existing, ...getBetPriceCandidates(bet, assetNameMap)]);
      candidateGroups.set(primary, Array.from(merged));
    });

    candidateGroups.forEach((aliases, primary) => {
      void getLatestPrice(primary)
        .then((payload) => {
          if (cancelled || !Number.isFinite(payload.price)) return;
          const parsedTimestampMs = Date.parse(payload.timestamp);
          const timestampMs = Number.isFinite(parsedTimestampMs) ? parsedTimestampMs : Date.now();
          setCurrentPrices((prev) => {
            const next = new Map(prev);
            aliases.forEach((alias) => assignCurrentPrice(next, payload.price, alias));
            assignCurrentPrice(next, payload.price, primary, payload.currency);
            return next;
          });
          setCurrentPriceUpdatedAt((prev) => {
            const next = new Map(prev);
            aliases.forEach((alias) => assignCurrentPriceTimestamp(next, timestampMs, alias));
            assignCurrentPriceTimestamp(next, timestampMs, primary, payload.currency);
            return next;
          });
        })
        .catch(() => {
          // Ignore: socket updates remain the primary live source.
        });
    });

    return () => {
      cancelled = true;
    };
  }, [assetNameMap, openTrackedBets]);

  useEffect(() => {
    setCurrentPrices(new Map());
    setCurrentPriceUpdatedAt(new Map());
  }, [effectiveAccount?.id, isDemo]);

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

  /* ─── HIDE if no valid account (after all hooks) ─── */
  const accountReady = effectiveAccount && effectiveAccount.is_active && effectiveAccount.has_tokens;
  const isAdmin = useMemo(() => {
    try { return localStorage.getItem('tc_is_admin') === '1'; } catch { return false; }
  }, []);
  if (!accountReady) return null;

  const copyBetData = (bet: BetRecord) => {
    const betAssetKey = getBetAssetKey(bet);
    const activeBet = activeBets.find((item) => item.bet_id === bet.id || (item.trade_id && item.trade_id === bet.trade_id));
    const priceCandidates = getBetPriceCandidates(bet, assetNameMap);
    const currentPrice = priceCandidates
      .map((candidate) => currentPrices.get(candidate))
      .find((price): price is number => typeof price === 'number' && Number.isFinite(price));
    const currentPriceUpdatedAtMs = priceCandidates
      .map((candidate) => currentPriceUpdatedAt.get(candidate))
      .find((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const currentPriceAgeSeconds = currentPriceUpdatedAtMs != null
      ? Math.max(0, Math.floor((Date.now() - currentPriceUpdatedAtMs) / 1000))
      : undefined;
    const lines = [
      `ID: ${bet.id}`,
      `Trade ID: ${bet.trade_id}`,
      `Account ID: ${bet.account_id}`,
      `User ID: ${bet.user_id}`,
      `Asset: ${betAssetKey}`,
      `Direction: ${bet.direction}`,
      `Amount: $${bet.amount}`,
      `Duration: ${bet.duration}s`,
      `Is Demo: ${bet.is_demo}`,
      `Result: ${bet.result ?? 'pending'}`,
      `Profit: ${bet.profit != null ? '$' + bet.profit.toFixed(2) : '—'}`,
      `Balance After: ${bet.balance_after != null ? '$' + bet.balance_after.toFixed(2) : '—'}`,
      `Placed At: ${bet.placed_at}`,
      `Resolved At: ${bet.resolved_at ?? '—'}`,
      `Entry Price: ${activeBet?.entryPrice ?? getBetOpenPrice(bet) ?? (bet.trade_id ? betterSocket.getCachedEntryPrice(bet.trade_id) : undefined) ?? '—'}`,
      `Current Price: ${currentPrice ?? '—'}`,
      `Current Price Update Seconds Ago: ${currentPriceAgeSeconds ?? '—'}`,
    ];
    const text = lines.join('\n');

    // Try clipboard API first, fallback to execCommand
    const doCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback: create a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedBetId(bet.id);
      setTimeout(() => setCopiedBetId(null), 1500);
    };
    doCopy();
  };

  /* ─── History item renderer (PO-style) ─── */
  const renderHistoryItem = (bet: BetRecord) => {
    const assetKey = getBetAssetKey(bet);
    const isWin = bet.result === 'win';
    const isLoss = bet.result === 'loss';
    const date = parseUTC(bet.placed_at);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const expiryMs = getBetCloseTimestampMs(bet);
    const remaining = Math.ceil((expiryMs - betterSocket.getServerNowMs()) / 1000);
    // const resultAmt = isWin ? (bet.amount + (bet.profit ?? 0)) : 0;
    const profitAmt = isWin ? (bet.profit ?? 0) : 0;
    // Use bet's own currency when available, fallback to current balance currency
    const bsym = currencySymbol(bet.currency ?? balanceCurrency);

    // For open bets: compute potential payout with color
    const openBetPayout = (() => {
      if (bet.result) return null;
      if (remaining <= 0) {
        return { text: '⏳', color: '#f5a623' };
      }
      const activeBet = activeBets.find(b => b.bet_id === bet.id || (b.trade_id && b.trade_id === bet.trade_id));
      const entryPrice = activeBet?.entryPrice
        ?? getBetOpenPrice(bet)
        ?? (bet.trade_id ? betterSocket.getCachedEntryPrice(bet.trade_id) : undefined);
      const curPrice = getBetPriceCandidates(bet, assetNameMap)
        .map((candidate) => currentPrices.get(candidate))
        .find((price): price is number => typeof price === 'number' && Number.isFinite(price))
        ?? null;
      const betPayoutPct = (typeof bet.payout === 'number' && Number.isFinite(bet.payout))
        ? bet.payout
        : effectivePayout > 0 ? effectivePayout : payout;
      const betPayout = betPayoutPct > 0 ? bet.amount * (1 + betPayoutPct / 100) : bet.amount;

      if (entryPrice == null || curPrice == null) {
        return { text: `${bsym}${fmtMoney(bet.amount)}`, color: '#f5a623' };
      }
      const comparisonPrecision = getDisplayPricePrecision(entryPrice, curPrice);
      const normalizedEntryPrice = normalizePriceForComparison(entryPrice, comparisonPrecision);
      const normalizedCurrentPrice = normalizePriceForComparison(curPrice, comparisonPrecision);
      const isCall = bet.direction === 'call';
      const isWinning = isCall ? normalizedCurrentPrice > normalizedEntryPrice : normalizedCurrentPrice < normalizedEntryPrice;
      const isNeutral = normalizedCurrentPrice === normalizedEntryPrice;

      if (isNeutral) return { text: `${bsym}${fmtMoney(bet.amount)}`, color: '#f5a623' };
      if (isWinning) return { text: `${bsym}${fmtMoney(betPayout)}`, color: '#2ebd85' };
      return { text: `${bsym}0`, color: '#f6465d' };
    })();

    return (
      <div
        key={bet.id}
        className={`tp-hist__item${isWin ? ' tp-hist__item--win' : isLoss ? ' tp-hist__item--loss' : ''}${isAdmin ? ' tp-hist__item--admin' : ''}`}
        onClick={isAdmin ? () => copyBetData(bet) : undefined}
        title={isAdmin ? `ID: ${bet.id}\nClick to copy` : undefined}
      >
        {copiedBetId === bet.id && (
          <div className="tp-hist__copied">✓ Copied</div>
        )}
        <div className="tp-hist__row1">
          <div className="tp-hist__row1-left">
            {bet.is_copy_trade && <CopyTradingIcon className="tp-hist__copy-icon" />}
            <button
              type="button"
              className={`tp-hist__asset${onSelectAsset ? ' tp-hist__asset--link' : ''}`}
              onClick={onSelectAsset ? (e) => { e.stopPropagation(); onSelectAsset(assetKey); } : undefined}
              title={onSelectAsset ? assetKey : undefined}
            >{assetNameMap?.get(assetKey) ?? bet.asset_po ?? bet.asset}</button>
          </div>
          <div className="tp-hist__row1-right">
            {bet.payout != null && <span className="tp-hist__pct">+{bet.payout}%</span>}
            <span className="tp-hist__time">{time}</span>
          </div>
        </div>
        <div className="tp-hist__row2">
          <div className="tp-hist__row2-left">
            <span className={`tp-hist__dir${bet.direction === 'call' ? ' tp-hist__dir--up' : ' tp-hist__dir--down'}`}>
              {bet.direction === 'call' ? <ArrowUpIcon /> : <ArrowDownIcon />}
            </span>
            <span className="tp-hist__amount">{bsym}{fmtMoney(bet.amount)}</span>
          </div>
          <div className="tp-hist__row2-center">
             {/* {isWin && <span className="tp-hist__result tp-hist__result--win">{bsym}{resultAmt.toFixed(2)}</span>} */}
            {/* {isLoss && <span className="tp-hist__result">{bsym}0</span>} */}
            {/* {bet.result === 'draw' && <span className="tp-hist__result">{bsym}0</span>} */}
            {!bet.result && (() => {
              if (remaining <= -60) {
                return <span className="tp-hist__result">✕</span>;
              }
              if (remaining <= 0) {
                return <span className="tp-hist__result tp-hist__result--pending">⏳ 0s</span>;
              }
              const hh = Math.floor(remaining / 3600);
              const mm = Math.floor((remaining % 3600) / 60);
              const ss = remaining % 60;
              const timeStr = hh > 0
                ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
                : mm > 0
                  ? `${mm}:${String(ss).padStart(2, '0')}`
                  : `${ss}s`;
              return <span className="tp-hist__result tp-hist__result--pending">⏳ {timeStr}</span>;
            })()} 
          </div>
          <div className="tp-hist__row2-right">
            {isWin && <span className="tp-hist__profit tp-hist__profit--win">+{bsym}{fmtMoney(profitAmt)}</span>}
            {isLoss && <span className="tp-hist__profit tp-hist__profit--loss">{bsym}0</span>}
            {bet.result === 'draw' && <span className="tp-hist__profit">{bsym}0</span>}
            {!bet.result && openBetPayout && (
              <span className="tp-hist__profit" style={{ color: openBetPayout.color, fontWeight: 700 }}>
                {openBetPayout.text}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ─── History panel (shared between desktop inline & mobile portal) ─── */
  const renderHistoryPanel = (isInline: boolean) => (
    <div className={`tp-hist${isInline ? ' tp-hist--inline' : ''}`}>
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
          <div className="tp-hist__group" key={g.date}>
            <div className="tp-hist__date-label">{g.date}</div>
            {g.bets.map(renderHistoryItem)}
          </div>
        ))}
      </div>
    </div>
  );

  /* ─── Result / Error / Active bets (shared) ─── */
  const renderMessages = () => (
    <>
      {error && <div className="tp__msg tp__msg--error">{error}</div>}
      {lastResult && (
        <div className={`tp__msg tp__msg--${lastResult.result}`}>
          {lastResult.result === 'win' ? '✓' : lastResult.result === 'loss' ? '✗' : '—'}{' '}
          {lastResult.result === 'win' && `+${sym}${fmtMoney(lastResult.profit ?? 0)}`}
          {lastResult.result === 'loss' && `-${sym}${fmtMoney(lastResult.amount)}`}
          {lastResult.result === 'draw' && `${sym}0.00`}
        </div>
      )}
      {activeBets.length > 0 && !lastResult && (
        <div className="tp__msg tp__msg--active">
          <span className="tp__active-dot" />
          {activeBets.length} {t.betActive}
        </div>
      )}
      {timeSkewWarning && (
        <div className="tp__hint tp__hint--clock">{timeSkewWarning}</div>
      )}
    </>
  );

  /* ─── Toast portal (shared by mobile & desktop) ─── */
  const toastPortal = toast
    ? createPortal(
        <div className="tp__toast">{toast}</div>,
        document.body
      )
    : null;

  /* ═══════════════════════════════════════
     MOBILE LAYOUT
     ═══════════════════════════════════════ */
  if (isMobile) {
    return (
      <div className="tp tp--mobile">
        {toastPortal}
        {/* Row 1: Time + Amount blocks side by side */}
        <div className="tp__m-blocks">
          {/* Time block — entire area clickable */}
          <div
            className="tp__m-block tp__m-block--clickable"
            ref={durationRef}
            onClick={() => { setShowDurationPicker((v) => !v); setShowAmountPicker(false); }}
          >
            <span className="tp__m-block-label">{t.betTime}</span>
            <div className="tp__m-time-row">
              <span className="tp__m-block-value">{durationDisplayValue}</span>
              <button
                type="button"
                className={`tp__time-toggle-btn${expirationMode === 'time' ? ' tp__time-toggle-btn--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpirationMode();
                }}
                title={expirationMode === 'time' ? t.tpFixedDuration : t.tpByTime}
                aria-label={expirationMode === 'time' ? t.tpFixedDuration : t.tpByTime}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 3v18" />
                  <path d="M7 4h10l-2.5 4 2.5 4H7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Amount block — entire area clickable */}
          <div
            className="tp__m-block tp__m-block--clickable"
            ref={amountRef}
            onClick={() => { setShowAmountPicker((v) => !v); setShowDurationPicker(false); }}
          >
            <span className="tp__m-block-label">{t.betAmount}</span>
            <span className="tp__m-block-value">{sym}{safeAmount}</span>
          </div>
        </div>

        {/* Quick multiplier buttons */}
        <div className="tp__quick-mults">
          {quickMults.map((mult, idx) => (
            <button
              key={idx}
              type="button"
              className="tp__quick-mult-btn"
              onClick={() => handleQuickMultClick(mult)}
            >
              ×{mult}
            </button>
          ))}
        </div>

        {/* Row 2: Payout info bar */}
        {effectivePayout > 0 && (
          <div className="tp__m-info">
            <span className="tp__m-info-item">{t.betPayout}</span>
            <span className="tp__m-info-pct">+{effectivePayout.toFixed(0)}%</span>
            <span className="tp__m-info-item">{t.betProfit}: <b>{sym}{fmtMoney(potentialPayout)}</b></span>
          </div>
        )}

        {/* Row 3: Buy / Sell buttons + history toggle */}
        <div className="tp__m-btns">
          <button
            type="button"
            className="tp__m-nav-btn"
            onClick={() => onCycleAsset?.('prev')}
            disabled={assetCycleDisabled}
            title={t.betPrevAsset}
            aria-label={t.betPrevAsset}
          >
            <span className="tp__m-nav-btn-icon">▲</span>
          </button>
          <button
            type="button"
            className="tp__m-btn tp__m-btn--call"
            onClick={() => placeBet('call')}
            disabled={disabled || placing}
          >
            <span className="tp__m-btn-arrow">↑</span>
            <span className="tp__m-btn-label">{t.betBuy}</span>
          </button>
          <button
            type="button"
            className="tp__m-btn tp__m-btn--put"
            onClick={() => placeBet('put')}
            disabled={disabled || placing}
          >
            <span className="tp__m-btn-arrow">↓</span>
            <span className="tp__m-btn-label">{t.betSell}</span>
          </button>
          <button
            type="button"
            className="tp__m-nav-btn"
            onClick={() => onCycleAsset?.('next')}
            disabled={assetCycleDisabled}
            title={t.betNextAsset}
            aria-label={t.betNextAsset}
          >
            <span className="tp__m-nav-btn-icon">▼</span>
          </button>
          <button type="button" className="tp__hist-toggle" onClick={toggleHistory} title={t.betHistory}>
            📋
          </button>
        </div>

        {renderMessages()}

        {/* Duration picker portal (bottom sheet) */}
        {showDurationPicker && createPortal(
          <div className="tp-dur-portal" onClick={() => setShowDurationPicker(false)}>
            <div className="tp-dur-portal__sheet" onClick={(e) => e.stopPropagation()}>
              <div className="portal-sheet__handle" />
              <div className="tp-dur-portal__title">{t.betTime}</div>
              <ExpirationPicker
                mode={expirationMode}
                onModeChange={setExpirationMode}
                duration={safeDuration}
                onDurationChange={handleDurationChange}
                targetTimestamp={targetTimestamp}
                onTargetTimestampChange={setTargetTimestamp}
                onClose={() => setShowDurationPicker(false)}
                minDuration={minTimeframe}
                maxDuration={maxTimeframe}
                autoTimeOffset={autoTimeOffset}
                onAutoTimeOffsetChange={setAutoTimeOffset}
                autoShiftStep={autoShiftStep}
                onAutoShiftStepChange={setAutoShiftStep}
                labels={{
                  fixedDuration: t.tpFixedDuration,
                  byTime: t.tpByTime,
                  currentTime: t.tpCurrentTime,
                  autoTimeOffset: t.tpAutoTimeOffset,
                }}
              />
            </div>
          </div>,
          document.body
        )}

        {/* Amount picker portal (bottom sheet) */}
        {showAmountPicker && createPortal(
          <div className="tp-amt-portal" onClick={() => setShowAmountPicker(false)}>
            <div className="tp-amt-portal__sheet" onClick={(e) => e.stopPropagation()}>
              <div className="portal-sheet__handle" />
              <div className="tp-amt-portal__head">
               <div className="tp-amt-portal__title">{t.betAmount}</div>
               <button className="tp-amt-portal__close-btn" onClick={() => setShowAmountPicker(false)}>✕</button>
              </div>
         
              <AmountPicker
                amount={safeAmount}
                maxAmount={pickerMaxAmount}
                minAmount={minTradeAmount}
                onChange={(next) => setAmount(clampTradeAmountValue(next, minTradeAmount, pickerMaxAmount))}
                onClose={() => setShowAmountPicker(false)}
                quickMults={quickMults}
                onQuickMultsChange={handleQuickMultsChange}
                currSign={sym}
              />
            </div>
          </div>,
          document.body
        )}

        {/* History portal */}
        {showHistory && createPortal(
          <div className="tp-hist-portal" onClick={() => setShowHistory(false)}>
            <div className="tp-hist-portal__sheet" onClick={(e) => e.stopPropagation()}>
              <div className="portal-sheet__handle" />
              <div className="tp-hist-portal__header">
                <span className="tp-hist-portal__title">{t.betHistory}</span>
                <button type="button" className="tp-hist-portal__close" onClick={() => setShowHistory(false)}>✕</button>
              </div>
              {renderHistoryPanel(false)}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════
     DESKTOP LAYOUT
     ═══════════════════════════════════════ */
  return (
    <div className="tp tp--desktop">
      {toastPortal}
      {/* Balance */}
      {/* {currentBalance !== null && (
        <div className="tp__d-balance">
          <span className="tp__d-balance-mode">{isDemo ? 'Demo' : 'Real'}</span>
          <span className="tp__d-balance-value">${currentBalance.toFixed(2)}</span>
        </div>
      )} */}

      {/* Duration */}
      <div className="tp__d-block" ref={durationRef}>
        <div className="tp__d-label">{t.betTime}</div>
        <div className="tp__d-time-row">
          <button
            type="button"
            className="tp__d-value-btn tp__d-value-btn--time"
            onClick={() => { setShowDurationPicker((v) => !v); setShowAmountPicker(false); }}
          >
            {durationDisplayValue}
          </button>
          <button
            type="button"
            className={`tp__time-toggle-btn tp__time-toggle-btn--desktop${expirationMode === 'time' ? ' tp__time-toggle-btn--active' : ''}`}
            onClick={toggleExpirationMode}
            title={expirationMode === 'time' ? t.tpFixedDuration : t.tpByTime}
            aria-label={expirationMode === 'time' ? t.tpFixedDuration : t.tpByTime}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3v18" />
              <path d="M7 4h10l-2.5 4 2.5 4H7" />
            </svg>
          </button>
        </div>
      </div>
      {showDurationPicker && createPortal(
        <DesktopPickerPortal anchorRef={durationRef} onClose={() => setShowDurationPicker(false)}>
          <div className="tp-desk-popup__title">{t.betTime}</div>
          <ExpirationPicker
            mode={expirationMode}
            onModeChange={setExpirationMode}
            duration={safeDuration}
            onDurationChange={handleDurationChange}
            targetTimestamp={targetTimestamp}
            onTargetTimestampChange={setTargetTimestamp}
            onClose={() => setShowDurationPicker(false)}
            minDuration={minTimeframe}
            maxDuration={maxTimeframe}
            autoTimeOffset={autoTimeOffset}
            onAutoTimeOffsetChange={setAutoTimeOffset}
            autoShiftStep={autoShiftStep}
            onAutoShiftStepChange={setAutoShiftStep}
            labels={{
              fixedDuration: t.tpFixedDuration,
              byTime: t.tpByTime,
              currentTime: t.tpCurrentTime,
              autoTimeOffset: t.tpAutoTimeOffset,
            }}
          />
        </DesktopPickerPortal>,
        document.body
      )}

      {/* Amount */}
      <div className="tp__d-block" ref={amountRef}>
        <div className="tp__d-label">{t.betAmount}</div>
        <div className="tp__d-amt-row">
          <span className="tp__d-amt-dollar">{sym}</span>
          <input
            type="text"
            inputMode="decimal"
            className="tp__d-amt-inline"
            value={amtEditing ? amtInputStr : String(safeAmount)}
            onFocus={() => { setAmtEditing(true); setAmtInputStr(''); }}
            onBlur={() => {
              setAmtEditing(false);
              const parsed = parseFloat(amtInputStr);
              if (!isNaN(parsed) && parsed > 0) {
                setAmount(clampTradeAmountValue(parsed, minTradeAmount, pickerMaxAmount));
              } else {
                setAmtInputStr(String(safeAmount));
              }
            }}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              setAmtInputStr(v);
              const parsed = parseFloat(v);
              if (!isNaN(parsed) && parsed >= minTradeAmount && (pickerMaxAmount === null || parsed <= pickerMaxAmount)) {
                setAmount(clampTradeAmountValue(parsed, minTradeAmount, pickerMaxAmount));
              }
            }}
          />
          <button
            type="button"
            className="tp__d-amt-calc-btn"
            onClick={() => { setShowAmountPicker((v) => !v); setShowDurationPicker(false); }}
            title="🧮"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
          </button>
        </div>
      </div>
      {showAmountPicker && createPortal(
        <DesktopPickerPortal anchorRef={amountRef} onClose={() => setShowAmountPicker(false)}>
          <div className="tp-desk-popup__title">{t.betAmount}</div>
          <AmountPicker
            amount={safeAmount}
            maxAmount={pickerMaxAmount}
            minAmount={minTradeAmount}
            onChange={(next) => setAmount(clampTradeAmountValue(next, minTradeAmount, pickerMaxAmount))}
            onClose={() => setShowAmountPicker(false)}
            quickMults={quickMults}
            onQuickMultsChange={handleQuickMultsChange}
            currSign={sym}
          />
        </DesktopPickerPortal>,
        document.body
      )}

      {/* Quick multiplier buttons */}
      <div className="tp__quick-mults">
        {quickMults.map((mult, idx) => (
          <button
            key={idx}
            type="button"
            className="tp__quick-mult-btn"
            onClick={() => handleQuickMultClick(mult)}
          >
            ×{mult}
          </button>
        ))}
      </div>

      {/* Payout */}
      {effectivePayout > 0 && (
        <div className="tp__d-block">
          <div className="tp__d-label">{t.betPayout}</div>
          <div className="tp__d-payout-box">
            <span className="tp__d-payout-pct">+{effectivePayout.toFixed(0)}%</span>
            <span className="tp__d-payout-amt">+{sym}{fmtMoney(potentialPayout)}</span>
          </div>
        </div>
      )}

      {/* Buy / Sell */}
      <div className="tp__d-btns">
        <button
          type="button"
          className="tp__d-btn tp__d-btn--call"
          onClick={() => placeBet('call')}
          disabled={disabled || placing}
        >
          <span className="tp__d-btn-arrow">↑</span> {t.betBuy}
        </button>
        <button
          type="button"
          className="tp__d-btn tp__d-btn--put"
          onClick={() => placeBet('put')}
          disabled={disabled || placing}
        >
          <span className="tp__d-btn-arrow">↓</span> {t.betSell}
        </button>
      </div>

      {renderMessages()}

      {/* History — visible on desktop unless hidden (sidebar mode) */}
      {!hideHistory && (
        <div className="tp__d-hist-section">
          <div className="tp__d-hist-header">
            <span className="tp__d-hist-title">{t.betTrades}</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>

              <button type="button" className="tp__d-hist-refresh" onClick={loadHistory} title="↻">
                <RefreshIcon/>
              </button>
            </div>
          </div>
          {renderHistoryPanel(true)}
        </div>
      )}
    </div>
  );
}
