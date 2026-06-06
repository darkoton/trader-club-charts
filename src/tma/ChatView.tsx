/**
 * ChatView — single chat messages view with cursor-based pagination.
 * Messages are fetched from GET /v1/chats/{chatId}/messages and rendered
 * via server-provided templates (GET /v1/message_templates).
 */
import { useState, useCallback, useMemo, useRef, useEffect, type MutableRefObject, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../i18n';
import { betterSocket } from '../api/betterSocket';
import { resolvePreferredBetterAccount } from '../api/better';
import type { BetErrorEvent, BetPlacedEvent, BetResultEvent, PlaceBetParams } from '../api/better';
import { useAccountBonus } from '../hooks/useAccountBonus';
import { resolveDisplayPayout } from '../utils/payout';
import {
  fetchChats,
  fetchChatMessages,
  fetchMessageTemplates,
  renderTmaMessage,
  readChatMessages,
  resolveTmaMediaUrl,
} from './api';
import type { TmaChatMessage } from './types';
import { SignalChartPreview } from './SignalChartPreview';
import { getSignalChartSnapshot } from './signalChart';

const PAGE_SIZE = 30;
const AUTO_LOAD_OLDER_SCROLL_TOP = 160;
const MAX_SIGNAL_PREVIEWS = 6;

type SocketMsgCallback = (data: { chat_id: string | number; message: TmaChatMessage }) => void;

function getMessageKey(message: Pick<TmaChatMessage, 'id' | 'chat_id' | 'date' | 'created_at' | 'type_request'>): string {
  const chatPart = message.chat_id == null ? 'global' : String(message.chat_id);
  const idPart = message.id == null ? '' : String(message.id);
  const datePart = message.date || message.created_at || '';
  const typePart = message.type_request || '';
  return `${chatPart}:${idPart}:${datePart}:${typePart}`;
}

interface Props {
  chatId: string | number;
  onBack: () => void;
  socketMsgRef?: MutableRefObject<SocketMsgCallback | null>;
  hideBackButton?: boolean;
  showNotificationToggle?: boolean;
  allowSignalAmountEditor?: boolean;
  isAnalyticsMode?: boolean;
}

function formatTime(dateStr?: string, withSeconds = false): string {
  if (!dateStr) return '';
  try {
    let normalized = dateStr;
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr) && !/[zZ]$/.test(dateStr)) {
      normalized += 'Z';
    }
    normalized = normalized.replace(/\.(\d{3})\d+Z$/, '.$1Z');
    const d = new Date(normalized);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: false,
    });
  } catch {
    return '';
  }
}

function formatRendered(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatRenderedWithCopy(text: string, assets: string[], copyAsset?: string): string {
  if (!assets.length) return formatRendered(text);

  return text.split('\n').map((line) => {
    const matchedAsset = assets.find((asset) => line.lastIndexOf(asset) !== -1);
    if (!matchedAsset) return formatRendered(line);

    const assetIndex = line.lastIndexOf(matchedAsset);
    if (assetIndex === -1) return formatRendered(line);

    const prefix = line.slice(0, assetIndex);
    const suffix = line.slice(assetIndex + matchedAsset.length);
    if (!prefix.includes(':')) return formatRendered(line);

    const assetToCopy = (matchedAsset || copyAsset || '').trim();
    return `${formatRendered(prefix)}<button type="button" class="tma-copy-asset" data-copy-asset="${escapeHtmlAttr(assetToCopy)}" title="Копировать актив">${formatRendered(matchedAsset)}</button>${formatRendered(suffix)}`;
  }).join('<br>');
}

function getMessageAssets(msg: TmaChatMessage): { renderAssets: string[]; copyAsset: string } {
  const data = msg.data ?? {};
  const renderAssets = [
    data.symbol,
    data.full_symbol,
    data.display_symbol,
    data.asset_name,
    data.asset,
    data.name,
    data.pair,
    data.currency_name,
    data.api_name,
    data.api_symbol,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  const copyAsset = (
    data.display_symbol
    || data.asset_name
    || data.asset
    || data.name
    || data.currency_name
    || data.pair
    || data.symbol
    || data.full_symbol
    || data.api_name
    || data.api_symbol
    || ''
  ).trim();
  return {
    renderAssets: Array.from(new Set(renderAssets)).sort((left, right) => right.length - left.length),
    copyAsset,
  };
}

function getTradeAssetCandidates(data?: Record<string, string>): string[] {
  const otcEnabled = ['true', '1', 'yes'].includes(data?.otc?.toLowerCase?.() || '');
  const rawValues = [data?.api_name, data?.api_symbol, data?.symbol, data?.full_symbol, data?.display_symbol, data?.asset_name, data?.asset, data?.name, data?.pair, data?.currency_name]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  const candidates = new Set<string>();
  rawValues.forEach((value) => {
    candidates.add(value);

    const upper = value.toUpperCase();
    const hasOtc = otcEnabled || /(?:\bOTC\b|_OTC$)/i.test(value);
    const compact = upper
      .replace(/_OTC$/i, '')
      .replace(/\bOTC\b/gi, '')
      .replace(/[^A-Z0-9]/g, '');

    if (!compact) return;

    candidates.add(compact);
    candidates.add(hasOtc ? `${compact}_otc` : compact);
    candidates.add(hasOtc ? `${compact}_OTC` : compact);
    candidates.add(hasOtc ? `${compact} OTC` : compact);
  });

  return Array.from(candidates).filter(Boolean);
}

function getSignalPayoutCandidates(data?: Record<string, string>): { apiName?: string; currency?: string } {
  const otcEnabled = ['true', '1', 'yes'].includes(data?.otc?.toLowerCase?.() || '');
  const rawApiName = [data?.api_name, data?.api_symbol, data?.symbol, data?.full_symbol]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);
  const rawCurrency = [data?.display_symbol, data?.asset_name, data?.asset, data?.name, data?.pair, data?.currency_name, data?.symbol, data?.full_symbol]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);

  const normalizedBase = (rawApiName || rawCurrency || '')
    .toUpperCase()
    .replace(/_OTC$/i, '')
    .replace(/\bOTC\b/gi, '')
    .replace(/[^A-Z0-9]/g, '');

  const apiName = rawApiName
    ?? (normalizedBase ? `${normalizedBase}${otcEnabled ? '_otc' : ''}` : undefined);
  const currency = rawCurrency
    ? (otcEnabled && !/\botc\b/i.test(rawCurrency) ? `${rawCurrency} OTC` : rawCurrency)
    : (normalizedBase ? `${normalizedBase}${otcEnabled ? ' OTC' : ''}`.trim() : undefined);

  return { apiName, currency };
}

function overrideRenderedPayout(rendered: string, payout: number): string {
  const formattedPayout = `${payout.toFixed(0)}%`;
  return rendered.replace(/((?:💸\s*)?(?:Выплата|Виплата|Payout)\s*)(\d+(?:[.,]\d+)?)%/gi, `$1${formattedPayout}`);
}

function matchesTradeAsset(eventAsset: string, candidates: string[]): boolean {
  const normalizedAsset = eventAsset.trim().toUpperCase();
  return candidates.some((candidate) => candidate.trim().toUpperCase() === normalizedAsset);
}

async function resolveSignalBetAccountId(): Promise<string | null> {
  const storedAccountId = localStorage.getItem('tc_better_account')?.trim() || '';
  // Fast path: use stored ID immediately — avoids API round-trips (getAccounts + getBalance)
  // that can take 20-30 s when accounts time out. If the stored ID turns out to be stale
  // the server will return a bet_error and the user sees an error message right away.
  if (storedAccountId) return storedAccountId;

  // Slow path: no stored ID yet — resolve from API on first-time setup
  const fallbackAccount = await resolvePreferredBetterAccount('');
  if (!fallbackAccount) return null;

  localStorage.setItem('tc_better_account', fallbackAccount.id);
  return fallbackAccount.id;
}

/** Refresh stored account ID in background so it stays valid for future bets. */
function prefetchSignalBetAccountId(): void {
  const storedAccountId = localStorage.getItem('tc_better_account')?.trim() || '';
  resolvePreferredBetterAccount(storedAccountId)
    .then((account) => {
      if (account) localStorage.setItem('tc_better_account', account.id);
    })
    .catch(() => { /* ignore */ });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════
   ReadySignalCountdown — 12-second ticker for ready_signal* messages
   ═══════════════════════════════════════ */

const READY_SIGNAL_DURATION = 12;

function parseMessageDate(dateStr: string): number {
  if (!dateStr) return Date.now();
  let s = dateStr;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]$/.test(s)) s += 'Z';
  s = s.replace(/\.(\d{3})\d+Z$/, '.$1Z');
  const t = new Date(s).getTime();
  return isNaN(t) ? Date.now() : t;
}

function ReadySignalCountdown({ date }: { date: string }) {
  const [secs, setSecs] = useState(() => {
    const elapsed = Math.floor((Date.now() - parseMessageDate(date)) / 1000);
    return Math.max(0, READY_SIGNAL_DURATION - elapsed);
  });

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => {
      setSecs((prev) => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (secs <= 0) return null;
  return <span className="tma-ready-countdown">Ожидаем сигнал через ({secs}с)</span>;
}

function getSignalSlot(typeRequest?: string): string | null {
  if (!typeRequest) return null;
  if (typeRequest === 'ready_signal' || typeRequest === 'main_signal') return '0';
  if (typeRequest.startsWith('ready_signal_')) return typeRequest.slice('ready_signal_'.length) || '0';
  if (typeRequest.startsWith('main_signal_')) return typeRequest.slice('main_signal_'.length) || '0';
  return null;
}

/* ═══════════════════════════════════════
   SignalCard — for main_signal / main_signal_1 / main_signal_2 messages
   ═══════════════════════════════════════ */

const SIGNAL_AMOUNT_KEY = 'tma_signal_amount';
const SIGNAL_AMOUNT_MIGRATION_KEY = 'tma_signal_amount_default_v2';
const SIGNAL_MULTS_KEY  = 'tma_signal_mults';
const SIGNAL_PRESETS    = [1, 5, 10, 25, 50, 100] as const;
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

function readSignalAmount(): number {
  try {
    const migrated = localStorage.getItem(SIGNAL_AMOUNT_MIGRATION_KEY) === '1';
    const raw = localStorage.getItem(SIGNAL_AMOUNT_KEY);

    if (!migrated) {
      if (raw == null || raw.trim() === '' || raw === '10') {
        localStorage.setItem(SIGNAL_AMOUNT_KEY, '1');
      }
      localStorage.setItem(SIGNAL_AMOUNT_MIGRATION_KEY, '1');
    }

    return Math.max(1, parseFloat(localStorage.getItem(SIGNAL_AMOUNT_KEY) || '1') || 1);
  } catch {
    return 1;
  }
}

function secsToHMS(total: number): [number, number, number] {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s];
}

function hmsToSecs(h: number, m: number, s: number): number {
  return Math.max(1, h * 3600 + m * 60 + s);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

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
  return clampTargetTimestampValue(baseTimestamp + offsetSeconds * 1000, nowMs, minDuration, maxDuration);
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

function getSignalPortalRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('.tma-app') ?? document.body;
}

const LIGHTBOX_MIN_SCALE = 1;
const LIGHTBOX_MAX_SCALE = 4;
const LIGHTBOX_SCALE_STEP = 0.25;
const LIGHTBOX_TOGGLE_SCALE = 2;

type LightboxOffset = { x: number; y: number };

type LightboxPointer = { x: number; y: number };

function clampLightboxScale(nextScale: number): number {
  return Math.min(LIGHTBOX_MAX_SCALE, Math.max(LIGHTBOX_MIN_SCALE, Math.round(nextScale * 100) / 100));
}

function clampLightboxOffset(
  offset: LightboxOffset,
  scale: number,
  viewportSize: { width: number; height: number },
  imageSize: { width: number; height: number },
): LightboxOffset {
  if (scale <= LIGHTBOX_MIN_SCALE) return { x: 0, y: 0 };

  const maxOffsetX = Math.max(0, (imageSize.width * scale - viewportSize.width) / 2);
  const maxOffsetY = Math.max(0, (imageSize.height * scale - viewportSize.height) / 2);

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, offset.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, offset.y)),
  };
}

function getLightboxPointerDistance(first: LightboxPointer, second: LightboxPointer): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function LightboxOverlay({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(LIGHTBOX_MIN_SCALE);
  const [offset, setOffset] = useState<LightboxOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originOffset: LightboxOffset;
  } | null>(null);
  const activePointersRef = useRef(new Map<number, LightboxPointer>());
  const pinchRef = useRef<{
    pointerIds: [number, number];
    startDistance: number;
    startScale: number;
    startOffset: LightboxOffset;
    startCenter: LightboxOffset;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const markGesture = useCallback(() => {
    suppressClickRef.current = true;
  }, []);

  const getClampedOffset = useCallback((nextOffset: LightboxOffset, nextScale = scale): LightboxOffset => {
    const viewport = viewportRef.current;
    const image = imageRef.current;

    if (!viewport || !image) {
      return nextScale <= LIGHTBOX_MIN_SCALE ? { x: 0, y: 0 } : nextOffset;
    }

    return clampLightboxOffset(
      nextOffset,
      nextScale,
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { width: image.offsetWidth || viewport.clientWidth, height: image.offsetHeight || viewport.clientHeight },
    );
  }, [scale]);

  const applyScale = useCallback((nextScale: number) => {
    const safeScale = clampLightboxScale(nextScale);
    setScale(safeScale);
    setOffset((prev) => getClampedOffset(prev, safeScale));
  }, [getClampedOffset]);

  const getViewportPoint = useCallback((clientX: number, clientY: number): LightboxOffset => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };

    const rect = viewport.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }, []);

  const resetView = useCallback(() => {
    setScale(LIGHTBOX_MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    dragRef.current = null;
    pinchRef.current = null;
    activePointersRef.current.clear();
  }, []);

  const stopDragging = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const resetInteraction = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
    activePointersRef.current.clear();
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (scale <= LIGHTBOX_MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
      resetInteraction();
    }
  }, [resetInteraction, scale]);

  useEffect(() => {
    const handleWindowPointerUp = () => resetInteraction();
    const handleWindowBlur = () => resetInteraction();
    const handleVisibility = () => {
      if (document.hidden) resetInteraction();
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resetInteraction]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    applyScale(scale + direction * LIGHTBOX_SCALE_STEP);
  }, [applyScale, scale]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.tma-lightbox__controls')) {
      return;
    }

    suppressClickRef.current = false;
    event.preventDefault();

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const activePointers = Array.from(activePointersRef.current.entries());

    if (activePointers.length >= 2) {
      markGesture();
      const [[firstId, firstPointer], [secondId, secondPointer]] = activePointers;
      const centerClientX = (firstPointer.x + secondPointer.x) / 2;
      const centerClientY = (firstPointer.y + secondPointer.y) / 2;
      pinchRef.current = {
        pointerIds: [firstId, secondId],
        startDistance: Math.max(1, getLightboxPointerDistance(firstPointer, secondPointer)),
        startScale: scale,
        startOffset: offset,
        startCenter: getViewportPoint(centerClientX, centerClientY),
      };
      stopDragging();
    } else if (scale > LIGHTBOX_MIN_SCALE) {
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originOffset: offset,
      };
      setIsDragging(true);
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore environments where pointer capture is not available.
    }
  }, [getViewportPoint, offset, scale, stopDragging]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    const pinch = pinchRef.current;
    if (pinch) {
      const [firstId, secondId] = pinch.pointerIds;
      const firstPointer = activePointersRef.current.get(firstId);
      const secondPointer = activePointersRef.current.get(secondId);

      if (firstPointer && secondPointer) {
        event.preventDefault();
        markGesture();

        const nextScale = clampLightboxScale(
          pinch.startScale * (getLightboxPointerDistance(firstPointer, secondPointer) / pinch.startDistance),
        );
        const currentCenter = getViewportPoint(
          (firstPointer.x + secondPointer.x) / 2,
          (firstPointer.y + secondPointer.y) / 2,
        );
        const scaleRatio = nextScale / pinch.startScale;
        const nextOffset = getClampedOffset({
          x: currentCenter.x - (pinch.startCenter.x - pinch.startOffset.x) * scaleRatio,
          y: currentCenter.y - (pinch.startCenter.y - pinch.startOffset.y) * scaleRatio,
        }, nextScale);

        setScale(nextScale);
        setOffset(nextOffset);
      }

      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();

    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      markGesture();
    }

    const nextOffset = getClampedOffset({
      x: drag.originOffset.x + event.clientX - drag.startX,
      y: drag.originOffset.y + event.clientY - drag.startY,
    });

    setOffset(nextOffset);
  }, [getClampedOffset, getViewportPoint, markGesture]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    if (pinchRef.current?.pointerIds.includes(event.pointerId)) {
      pinchRef.current = null;
      stopDragging();
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore environments where pointer capture is not available.
    }

    if (dragRef.current?.pointerId !== event.pointerId) return;
    stopDragging();
  }, [stopDragging]);

  const handleToggleZoom = useCallback(() => {
    if (scale > LIGHTBOX_MIN_SCALE) {
      resetView();
      return;
    }
    applyScale(LIGHTBOX_TOGGLE_SCALE);
  }, [applyScale, resetView, scale]);

  const handleViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (scale > LIGHTBOX_MIN_SCALE) {
      return;
    }

    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose, scale]);

  return createPortal(
    <div className="tma-lightbox" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={viewportRef}
        className={`tma-lightbox__viewport${scale > LIGHTBOX_MIN_SCALE ? ' tma-lightbox__viewport--zoomed' : ''}${isDragging ? ' tma-lightbox__viewport--dragging' : ''}`}
        onClick={handleViewportClick}
        onDoubleClick={handleToggleZoom}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        <img
          ref={imageRef}
          className="tma-lightbox__img"
          src={src}
          alt=""
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onLoad={() => setOffset((prev) => getClampedOffset(prev, scale))}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        />
      </div>
    </div>,
    getSignalPortalRoot(),
  );
}

function DurationPicker({
  duration,
  onChange,
  onClose,
  minDuration,
  maxDuration,
}: {
  duration: number;
  onChange: (d: number) => void;
  onClose: () => void;
  minDuration?: number;
  maxDuration?: number;
}) {
  const minD = Math.max(5, minDuration ?? 5);
  const maxD = maxDuration ?? 86400;
  const allowedQuick = useMemo(() => DURATION_QUICK.filter((item) => item.value >= minD && item.value <= maxD), [minD, maxD]);
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
  }, [clamp, onChange]);

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
  }, [clamp, h, m, onChange, s]);

  const smartStep = useCallback((dir: 1 | -1) => {
    let step: number;
    if (duration < 60) step = 5;
    else if (duration < 300) step = 15;
    else if (duration < 3600) step = 60;
    else step = 300;
    onChange(clamp(duration + step * dir));
  }, [clamp, duration, onChange]);

  const renderCol = (part: 'h' | 'm' | 's', value: number) => (
    <div className="tp-picker__col">
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, 1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5l4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
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
          if (e.key === 'Enter') {
            commitEdit(part, editVal);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, -1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
    </div>
  );

  return (
    <div className="tp-picker tp-picker--dur">
      <div className="tp-picker__spinners">
        <button type="button" className="tp-picker__spin-btn tp-picker__spin-btn--wide" onPointerDown={() => smartStep(1)}>
          <svg width="15" height="14" viewBox="0 0 15 14" fill="none"><path d="M8.667 6H11.667C11.932 6 12.186 6.105 12.374 6.293C12.561 6.48 12.667 6.735 12.667 7C12.667 7.265 12.561 7.52 12.374 7.707C12.186 7.895 11.932 8 11.667 8H8.667V11C8.667 11.265 8.561 11.52 8.374 11.707C8.186 11.895 7.932 12 7.667 12C7.402 12 7.147 11.895 6.96 11.707C6.772 11.52 6.667 11.265 6.667 11V8H3.667C3.402 8 3.147 7.895 2.96 7.707C2.772 7.52 2.667 7.265 2.667 7C2.667 6.735 2.772 6.48 2.96 6.293C3.147 6.105 3.402 6 3.667 6H6.667V3C6.667 2.735 6.772 2.48 6.96 2.293C7.147 2.105 7.402 2 7.667 2C7.932 2 8.186 2.105 8.374 2.293C8.561 2.48 8.667 2.735 8.667 3V6Z" fill="currentColor" /></svg>
        </button>
        <div className="tp-picker__hms-row">
          {renderCol('h', h)}
          <span className="tp-picker__sep">:</span>
          {renderCol('m', m)}
          <span className="tp-picker__sep">:</span>
          {renderCol('s', s)}
        </div>
        <button type="button" className="tp-picker__spin-btn tp-picker__spin-btn--wide" onPointerDown={() => smartStep(-1)}>
          <svg width="15" height="14" viewBox="0 0 15 14" fill="none"><path d="M3.667 6H11.667C11.932 6 12.186 6.105 12.374 6.293C12.561 6.48 12.667 6.735 12.667 7C12.667 7.265 12.561 7.52 12.374 7.707C12.186 7.895 11.932 8 11.667 8H3.667C3.402 8 3.147 7.895 2.96 7.707C2.772 7.52 2.667 7.265 2.667 7C2.667 6.735 2.772 6.48 2.96 6.293C3.147 6.105 3.402 6 3.667 6Z" fill="currentColor" /></svg>
        </button>
      </div>
      <div className="tp-picker__presets">
        {allowedQuick.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`tp-picker__preset${duration === item.value ? ' tp-picker__preset--active' : ''}`}
            onClick={() => { onChange(item.value); onClose(); }}
          >
            {item.label}
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
  const TIME_MIN = 3;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editingPart, setEditingPart] = useState<'h' | 'm' | 's' | null>(null);
  const [editVal, setEditVal] = useState('');
  const [targetH, targetM, targetS] = useMemo(() => {
    const target = new Date(targetTimestamp);
    return [target.getHours(), target.getMinutes(), target.getSeconds()] as const;
  }, [targetTimestamp]);
  const allowedQuick = useMemo(
    () => FLAG_QUICK.filter((item) => item.value >= TIME_MIN && item.value <= (maxDuration ?? 86400)),
    [maxDuration],
  );

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    applyParts(
      part === 'h' ? targetH + delta : targetH,
      part === 'm' ? targetM + delta : targetM,
      part === 's' ? targetS + delta : targetS,
    );
  }, [applyParts, targetH, targetM, targetS]);

  const renderCol = (part: 'h' | 'm' | 's', value: number) => (
    <div className="tp-picker__col">
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, 1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5l4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
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
          if (e.key === 'Enter') {
            commitEdit(part, editVal);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button type="button" className="tp-picker__spin-btn" onPointerDown={() => stepPart(part, -1)}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
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
                onTargetTimestampChange(getQuickTargetTimestamp(Date.now(), item.value, autoTimeOffset, TIME_MIN, maxDuration, targetTimestamp));
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

/* ─── Inline AmountPicker for SignalCard ─── */
function SignalAmountPicker({
  amount, sym, onClose, onChange,
}: {
  amount: number;
  sym: string;
  onClose: () => void;
  onChange: (v: number) => void;
}) {
  const [inputStr, setInputStr] = useState(String(amount));
  const [multiplier, setMultiplier] = useState(() => {
    const v = parseFloat(localStorage.getItem('amt_multiplier') ?? '2');
    return isNaN(v) || v < 1.1 ? 2 : v;
  });
  const [multStr, setMultStr] = useState(() => {
    const v = parseFloat(localStorage.getItem('amt_multiplier') ?? '2');
    return String(isNaN(v) || v < 1.1 ? 2 : v);
  });
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!isEditing) setInputStr(String(amount)); }, [amount, isEditing]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const clamp = (v: number) => Math.max(1, Math.round(v * 100) / 100);

  const handleNumpad = (key: string) => {
    setInputStr((prev) => {
      let next: string;
      if (key === '⌫') {
        next = prev.length > 1 ? prev.slice(0, -1) : '0';
      } else if (key === '.') {
        next = prev.includes('.') ? prev : prev + '.';
      } else {
        next = prev === '0' ? key : prev + key;
      }
      const parsed = parseFloat(next);
      if (!isNaN(parsed) && parsed >= 1) onChange(clamp(parsed));
      return next;
    });
  };

  const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'] as const;

  return createPortal(
    <div className="tp-amt-portal" onClick={onClose}>
      <div className="tp-amt-portal__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="portal-sheet__handle" />
        <div className="tp-amt-portal__title">Сумма сделки</div>
        <div className="tp-picker tp-picker--amt">
          {/* Amount field + ×÷ controls */}
          <div className="tp-picker__amt-top">
            <div className="tp-picker__amt-field">
              <span className="tp-picker__amt-dollar">{sym}</span>
              <input
                ref={inputRef}
                className="tp-picker__amt-input"
                type="text"
                inputMode="decimal"
                value={isEditing ? inputStr : String(amount)}
                onFocus={() => { setIsEditing(true); setInputStr(''); }}
                onBlur={() => {
                  setIsEditing(false);
                  const parsed = parseFloat(inputStr);
                  if (!isNaN(parsed) && parsed >= 1) { onChange(clamp(parsed)); setInputStr(String(clamp(parsed))); }
                  else setInputStr(String(amount));
                }}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '');
                  setInputStr(v);
                  const parsed = parseFloat(v);
                  if (!isNaN(parsed) && parsed >= 1) onChange(clamp(parsed));
                }}
              />
            </div>
            <div className="tp-picker__multiply">
              <div className="tp-picker__multiply-btns">
                <button type="button" className="tp-picker__multiply-btn"
                  onClick={() => { const v = clamp(amount * multiplier); onChange(v); setInputStr(String(v)); }}
                  title="×">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M4.975 0C5.497 0 5.906.449 5.858.968L5.545 4.363 8.741 3.396C9.258 3.24 9.794 3.581 9.87 4.116C9.941 4.611 9.588 5.066 9.09 5.119L6 5.451 7.991 8.204C8.307 8.641 8.174 9.255 7.706 9.522 7.252 9.781 6.673 9.603 6.443 9.133L4.952 6.088 3.603 9.092C3.384 9.581 2.794 9.779 2.324 9.52 1.842 9.255 1.7 8.629 2.021 8.182L3.979 5.451.919 5.121C.418 5.067.064 4.606.141 4.108.223 3.576.758 3.241 1.273 3.399L4.413 4.363 4.092.97C4.043.45 4.452 0 4.975 0Z" fill="currentColor"/></svg>
                </button>
                <button type="button" className="tp-picker__multiply-btn"
                  onClick={() => { const v = clamp(amount / multiplier); onChange(v); setInputStr(String(v)); }}
                  title="÷">
                  <svg width="10" height="11" viewBox="0 0 10 11" fill="none"><path d="M6 1.5C6 2.052 5.552 2.5 5 2.5 4.448 2.5 4 2.052 4 1.5 4 .948 4.448.5 5 .5 5.552.5 6 .948 6 1.5Z" fill="currentColor"/><path d="M6 9.5C6 10.052 5.552 10.5 5 10.5 4.448 10.5 4 10.052 4 9.5 4 8.948 4.448 8.5 5 8.5 5.552 8.5 6 8.948 6 9.5Z" fill="currentColor"/><path d="M0 5.5C0 4.948.448 4.5 1 4.5H9C9.552 4.5 10 4.948 10 5.5 10 6.052 9.552 6.5 9 6.5H1C.448 6.5 0 6.052 0 5.5Z" fill="currentColor"/></svg>
                </button>
              </div>
              <input
                className="tp-picker__multiply-input"
                type="text"
                inputMode="decimal"
                value={multStr}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                  setMultStr(e.target.value.replace(/[^0-9.,]/g, ''));
                  const v = parseFloat(raw);
                  if (!isNaN(v) && v >= 1.1) { const r = Math.round(v * 100) / 100; setMultiplier(r); localStorage.setItem('amt_multiplier', String(r)); }
                }}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value.replace(',', '.'));
                  const r = (!isNaN(v) && v >= 1.1) ? Math.round(v * 100) / 100 : multiplier;
                  setMultiplier(r); setMultStr(String(r)); localStorage.setItem('amt_multiplier', String(r));
                }}
              />
            </div>
          </div>

          {/* Numpad */}
          <div className="tp-picker__numpad">
            {NUMPAD_KEYS.map((key) => (
              <button key={key} type="button"
                className={`tp-picker__key${key === '⌫' ? ' tp-picker__key--back' : ''}`}
                onClick={() => handleNumpad(key)}>
                {key === '⌫'
                  ? <svg width="18" height="13" viewBox="0 0 20 14" fill="none"><path d="M17.71 13.28H6.59C5.98 13.28 5.39 13.03 4.96 12.6L.66 8.25C-.22 7.36-.22 5.92.66 5.03L4.96.68C5.39.25 5.98 0 6.59 0H17.71C18.97 0 20 1.03 20 2.29V10.99C20 12.25 18.97 13.28 17.71 13.28ZM6.59 1.09C6.27 1.09 5.96 1.22 5.74 1.45L1.43 5.8C.97 6.27.97 7.02 1.43 7.49L5.74 11.84C5.96 12.07 6.28 12.2 6.59 12.2H17.71C18.37 12.2 18.91 11.66 18.91 11V2.29C18.91 1.63 18.37 1.09 17.71 1.09H6.59Z" fill="currentColor"/><path d="M10.45 9.21C10.31 9.21 10.17 9.16 10.07 9.05 9.86 8.83 9.86 8.49 10.07 8.28L14.12 4.23C14.33 4.01 14.68 4.01 14.89 4.23 15.11 4.44 15.11 4.78 14.89 5L10.84 9.05C10.73 9.16 10.59 9.21 10.45 9.21Z" fill="currentColor"/><path d="M14.5 9.21C14.36 9.21 14.22 9.16 14.12 9.05L10.07 5C9.86 4.78 9.86 4.44 10.07 4.23 10.28 4.01 10.63 4.01 10.84 4.23L14.89 8.28C15.11 8.49 15.11 8.83 14.89 9.05 14.78 9.16 14.64 9.21 14.5 9.21Z" fill="currentColor"/></svg>
                  : key}
              </button>
            ))}
          </div>

          {/* Presets */}
          <div className="tp-picker__amt-presets">
            {SIGNAL_PRESETS.map((a) => (
              <button key={a} type="button"
                className={`tp-picker__amt-preset${amount === a ? ' tp-picker__amt-preset--active' : ''}`}
                onClick={() => { onChange(a); setInputStr(String(a)); onClose(); }}>
                {sym}{a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    getSignalPortalRoot(),
  );
}

function signalCurrencySymbol(code?: string): string {
  if (!code) return '$';
  const map: Record<string, string> = {
    USD: '$', CAD: 'CA$', MXN: 'MX$', BRL: 'R$', EUR: '€', GBP: '£', CHF: 'Fr ',
    RUB: '₽', UAH: '₴', KZT: '₸', TRY: '₺', JPY: '¥', CNY: '¥',
    HKD: 'HK$', SGD: 'S$', KRW: '₩', INR: '₹', USDT: '$', USDC: '$',
  };
  return map[code.toUpperCase()] ?? `${code} `;
}

function signalFmtMoney(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ─── ReadySignalCard: сумма и множители до прихода main_signal ─── */
function SignalAmountControls() {
  const { t } = useI18n();
  const [amount, setAmount] = useState<number>(() => readSignalAmount());
  const [amtEditing, setAmtEditing] = useState(false);
  const [amtInputStr, setAmtInputStr] = useState('');
  const [mults] = useState<[number, number, number]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SIGNAL_MULTS_KEY) ?? 'null');
      if (Array.isArray(s) && s.length === 3 && s.every((v: unknown) => typeof v === 'number' && v >= 1.1)) return s as [number, number, number];
    } catch {}
    return [2, 2.5, 3];
  });
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const isDemo = localStorage.getItem('tc_better_demo') !== 'false';
    const accountId = localStorage.getItem('tc_better_account');
    const handle = (d: { account_id: string; is_demo: boolean; currency?: string }) => {
      if (d.currency && d.account_id === accountId && d.is_demo === isDemo) setCurrency(d.currency);
    };
    const u1 = betterSocket.onBalanceUpdate(handle);
    const u2 = betterSocket.onBalanceChanged(handle);
    return () => { u1(); u2(); };
  }, []);

  const sym = signalCurrencySymbol(currency);
  const safeAmount = Math.max(1, amount);

  const commitAmount = (v: string) => {
    const parsed = parseFloat(v);
    if (Number.isFinite(parsed) && parsed >= 1) {
      setAmount(parsed);
      try { localStorage.setItem(SIGNAL_AMOUNT_KEY, String(parsed)); } catch {}
    }
  };

  const handleMultClick = (mult: number) => {
    setAmount((prev) => {
      const next = Math.max(1, Math.round(prev * mult * 100) / 100);
      try { localStorage.setItem(SIGNAL_AMOUNT_KEY, String(next)); } catch {}
      return next;
    });
  };

  return (
    <>
      <div className="tma-signal-card__label">{t.betAmount ?? 'Сумма'}</div>
      <div className="tp__d-amt-row" style={{ marginBottom: 6 }}>
        <span className="tp__d-amt-dollar">{sym}</span>
        <input
          type="text"
          inputMode="decimal"
          className="tp__d-amt-inline"
          value={amtEditing ? amtInputStr : signalFmtMoney(safeAmount)}
          onFocus={() => { setAmtEditing(true); setAmtInputStr(''); }}
          onBlur={() => { setAmtEditing(false); commitAmount(amtInputStr); }}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '');
            setAmtInputStr(v);
            const parsed = parseFloat(v);
            if (Number.isFinite(parsed) && parsed >= 1) {
              setAmount(parsed);
              try { localStorage.setItem(SIGNAL_AMOUNT_KEY, String(parsed)); } catch {}
            }
          }}
        />
        <button type="button" className="tp__d-amt-calc-btn" title="Пикер суммы" onClick={() => setShowPicker((v) => !v)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        </button>
      </div>

      <div className="tp__quick-mults">
        {mults.map((m, i) => (
          <button key={i} type="button" className="tp__quick-mult-btn" onClick={() => handleMultClick(m)}>×{m}</button>
        ))}
      </div>

      {showPicker && (
        <SignalAmountPicker
          amount={safeAmount}
          sym={sym}
          onClose={() => setShowPicker(false)}
          onChange={(val) => { setAmount(val); try { localStorage.setItem(SIGNAL_AMOUNT_KEY, String(val)); } catch {} }}
        />
      )}
    </>
  );
}

function ReadySignalCard() {
  return (
    <div className="tma-signal-card">
      <div className="tma-signal-card__body">
        <SignalAmountControls />
      </div>
    </div>
  );
}

/* ─── MainSignalCard: только кнопки UP / DOWN ─── */
function MainSignalCard({ msg, allowAmountEditor = false, showAdminApiName = false }: { msg: TmaChatMessage; allowAmountEditor?: boolean; showAdminApiName?: boolean }) {
  const { t } = useI18n();
  const data = msg.data || {};
  const signalApiName = typeof data.api_name === 'string' ? data.api_name.trim() : '';
  const assetCandidates = useMemo(() => getTradeAssetCandidates(data), [data]);
  const apiName = useMemo(() => {
    return signalApiName || betterSocket.resolvePoAssetSymbol(assetCandidates) || assetCandidates[0] || '';
  }, [assetCandidates, signalApiName]);
  const adminApiName = signalApiName || apiName;
  const signalDuration = Math.max(5, parseInt(data.expiration || '1', 10) * 60);
  const savedExpirationPrefsRef = useRef<ExpirationPrefs | null>(null);
  if (savedExpirationPrefsRef.current === null) {
    savedExpirationPrefsRef.current = readExpirationPrefs();
  }
  const savedExpirationPrefs = savedExpirationPrefsRef.current;

  const [placing, setPlacing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'ok' | 'err'>('idle');
  const [lastDir, setLastDir] = useState<'call' | 'put' | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [duration, setDuration] = useState(() => clampDurationValue(savedExpirationPrefs.duration ?? signalDuration));
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>(savedExpirationPrefs.mode === 'time' ? 'time' : 'duration');
  const [targetTimestamp, setTargetTimestamp] = useState(() => getInitialTargetTimestamp(savedExpirationPrefs.targetTimestamp, undefined, undefined, savedExpirationPrefs.duration ?? signalDuration));
  const [autoTimeOffset, setAutoTimeOffset] = useState(savedExpirationPrefs.autoTimeOffset ?? true);
  const [autoShiftStep, setAutoShiftStep] = useState<number | null>(savedExpirationPrefs.autoShiftStep ?? null);
  const resetTimerRef = useRef<number | null>(null);
  const pendingRequestRef = useRef<{
    accountId: string;
    isDemo: boolean;
    direction: 'call' | 'put';
    assetCandidates: string[];
  } | null>(null);

  // Prefetch account on mount so stored ID stays fresh and first click is instant
  useEffect(() => { prefetchSignalBetAccountId(); }, []);

  const safeDuration = clampDurationValue(duration);
  const targetDuration = Math.round((targetTimestamp - currentTimeMs) / 1000);
  const durationDisplayValue = expirationMode === 'time' ? formatClockTime(targetTimestamp) : formatDurationShort(safeDuration);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const resetBetStatus = useCallback(() => {
    clearResetTimer();
    pendingRequestRef.current = null;
    setPlacing(false);
    setStatus('idle');
    setLastDir(null);
    setStatusText(null);
  }, [clearResetTimer]);

  const scheduleReset = useCallback((delay = 4000) => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      resetBetStatus();
    }, delay);
  }, [clearResetTimer, resetBetStatus]);

  const schedulePendingTimeout = useCallback((delay = 12000) => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      pendingRequestRef.current = null;
      setPlacing(false);
      setStatus('err');
      setStatusText(t.betRequestTimeout ?? t.betTradeError);
      scheduleReset(5000);
    }, delay);
  }, [clearResetTimer, scheduleReset, t.betRequestTimeout, t.betTradeError]);

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
      // Ignore localStorage failures.
    }
  }, [autoShiftStep, autoTimeOffset, expirationMode, safeDuration, targetTimestamp]);

  useEffect(() => {
    if (expirationMode !== 'time') return;
    if (!autoTimeOffset || !autoShiftStep) return;
    if (targetDuration > 3) return;
    setTargetTimestamp(getAlignedAutoShiftTimestamp(Date.now(), autoShiftStep, 3, undefined, targetTimestamp));
  }, [autoShiftStep, autoTimeOffset, expirationMode, targetDuration, targetTimestamp]);

  useEffect(() => {
    if (expirationMode !== 'time' && !showDurationPicker) return;
    setCurrentTimeMs(Date.now());
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expirationMode, showDurationPicker]);

  useEffect(() => {
    const handlePlaced = (event: BetPlacedEvent) => {
      const pending = pendingRequestRef.current;
      if (!pending) return;
      if (event.is_demo !== pending.isDemo) return;
      if (event.account_id && event.account_id !== pending.accountId) return;
      if (!matchesTradeAsset(event.asset, pending.assetCandidates)) return;
      if (event.direction !== pending.direction) return;

      pendingRequestRef.current = null;
      setPlacing(false);
      setStatus('ok');
      setStatusText(t.betRequestAccepted ?? 'Ставка принята');
      scheduleReset(4000);
    };

    const handleError = (event: BetErrorEvent) => {
      const pending = pendingRequestRef.current;
      if (!pending) return;

      console.warn('[CV] onBetError:', {
        bet_id: event.bet_id,
        error: event.error,
        pending: {
          accountId: pending.accountId,
          direction: pending.direction,
          isDemo: pending.isDemo,
        },
        timestamp: new Date().toISOString(),
      });

      pendingRequestRef.current = null;
      setPlacing(false);
      setStatus('err');
      setStatusText(event.error || t.betTradeError);
      scheduleReset(5000);
    };

    const handleResult = (event: BetResultEvent) => {
      const pending = pendingRequestRef.current;
      if (!pending) return;
      if (event.result !== 'error') return;
      if (event.is_demo !== pending.isDemo) return;
      if (event.account_id && event.account_id !== pending.accountId) return;
      if (!matchesTradeAsset(event.asset, pending.assetCandidates)) return;

      pendingRequestRef.current = null;
      setPlacing(false);
      setStatus('err');
      setStatusText(t.betTradeError);
      scheduleReset(5000);
    };

    const unsubPlaced = betterSocket.onBetPlaced(handlePlaced);
    const unsubError = betterSocket.onBetError(handleError);
    const unsubResult = betterSocket.onBetResult(handleResult);
    return () => {
      unsubPlaced();
      unsubError();
      unsubResult();
      clearResetTimer();
    };
  }, [clearResetTimer, scheduleReset, t.betRequestAccepted, t.betTradeError]);

  const toggleExpirationMode = useCallback(() => {
    setExpirationMode((prev) => {
      const next = prev === 'duration' ? 'time' : 'duration';
      if (next === 'time') {
        setTargetTimestamp((current) => getInitialTargetTimestamp(current, undefined, undefined, safeDuration));
      }
      return next;
    });
  }, [safeDuration]);

  const handleBet = async (direction: 'call' | 'put') => {
    if (placing) return;
    if (!apiName) {
      setLastDir(direction);
      setStatus('err');
      setStatusText(t.betTradeError);
      scheduleReset(4000);
      return;
    }

    const requestedDuration = expirationMode === 'time'
      ? Math.round((targetTimestamp - Date.now()) / 1000)
      : safeDuration;
    const normalizedDuration = clampDurationValue(requestedDuration);
    if (expirationMode === 'time' && requestedDuration <= 0) {
      setLastDir(direction);
      setStatus('err');
      setStatusText(t.tpExpiryPassed ?? 'Время экспирации уже прошло');
      scheduleReset(3000);
      return;
    }

    if (requestedDuration !== normalizedDuration) {
      setLastDir(direction);
      setStatus('err');
      setStatusText(t.tpMinDuration ?? 'Мин. время сделки: 5 сек');
      scheduleReset(3000);
      return;
    }

    let accountId: string | null = null;
    try {
      accountId = await resolveSignalBetAccountId();
    } catch (error) {
      console.warn('[CV] resolveSignalBetAccountId failed:', error);
    }

    if (!accountId || !betterSocket.isConnected) {
      setLastDir(direction);
      setStatus('err');
      setStatusText(!accountId ? (t.betNoAccount ?? 'Нет аккаунта') : (t.betterDisconnected ?? 'Торговый сервер отключён'));
      scheduleReset(3000);
      return;
    }

    betterSocket.setActiveAccounts([accountId]);

    const isDemo = localStorage.getItem('tc_better_demo') !== 'false';
    const amt = readSignalAmount();
    const tradeAsset = signalApiName || betterSocket.resolvePoAssetSymbol(assetCandidates) || apiName;
    
    console.debug('[CV] placeBet sending:', {
      account_id: accountId,
      asset: tradeAsset,
      amount: amt,
      direction,
      duration: normalizedDuration,
      is_demo: isDemo,
      expirationMode,
      timestamp: new Date().toISOString(),
    });
    
    const emitResult = betterSocket.placeBet({ account_id: accountId, asset: tradeAsset, amount: amt, direction, duration: normalizedDuration, is_demo: isDemo } as PlaceBetParams);

    if (!emitResult.ok) {
      setLastDir(direction);
      setStatus('err');
      setStatusText(emitResult.error === 'Better socket not connected'
        ? (t.betterDisconnected ?? 'Торговый сервер отключён')
        : emitResult.error || t.betTradeError);
      scheduleReset(4000);
      return;
    }

    pendingRequestRef.current = {
      accountId,
      isDemo,
      direction,
      assetCandidates,
    };
    setLastDir(direction);
    setPlacing(true);
    setStatus('pending');
    setStatusText(t.betRequestPending ?? t.tmaWaitingForBet ?? 'Ожидание сделки');
    schedulePendingTimeout(12000);
  };

  return (
    <div className="tma-signal-card tma-signal-card--main">
      {showAdminApiName && adminApiName && (
        <div className="tma-signal-card__admin-api-name">API: {adminApiName}</div>
      )}
      <div className="tma-signal-card__trade-meta">
        {allowAmountEditor && (
          <div className="tma-signal-card__amount-group">
            <SignalAmountControls />
          </div>
        )}
        <div className="tma-signal-card__time-group">
          <div className="tma-signal-card__label">{t.betTime ?? 'Время'}</div>
          <div className="tp__d-time-row">
            <button
              type="button"
              className="tp__d-value-btn tp__d-value-btn--time"
              onClick={() => setShowDurationPicker((prev) => !prev)}
            >
              {durationDisplayValue}
            </button>
            <button
              type="button"
              className={`tp__time-toggle-btn tp__time-toggle-btn--desktop${expirationMode === 'time' ? ' tp__time-toggle-btn--active' : ''}`}
              onClick={toggleExpirationMode}
              title={expirationMode === 'time' ? (t.tpFixedDuration ?? 'Фиксированная экспирация') : (t.tpByTime ?? 'По времени')}
              aria-label={expirationMode === 'time' ? (t.tpFixedDuration ?? 'Фиксированная экспирация') : (t.tpByTime ?? 'По времени')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3v18" />
                <path d="M7 4h10l-2.5 4 2.5 4H7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="tp__d-btns">
        <button
          className={`tp__d-btn tp__d-btn--call${status === 'ok' && lastDir === 'call' ? ' tma-signal-card__bet-btn--ok' : ''}${status === 'err' && lastDir === 'call' ? ' tma-signal-card__bet-btn--err' : ''}`}
          onClick={() => handleBet('call')}
          disabled={placing}
        >
          <span className="tp__d-btn-arrow">▲</span> UP
        </button>
        <button
          className={`tp__d-btn tp__d-btn--put${status === 'ok' && lastDir === 'put' ? ' tma-signal-card__bet-btn--ok' : ''}${status === 'err' && lastDir === 'put' ? ' tma-signal-card__bet-btn--err' : ''}`}
          onClick={() => handleBet('put')}
          disabled={placing}
        >
          <span className="tp__d-btn-arrow">▼</span> DOWN
        </button>
      </div>

      {statusText && (
        <div className={`tma-signal-card__status tp__msg${status === 'pending' ? ' tp__msg--active' : status === 'ok' ? ' tp__msg--win' : ' tp__msg--error'}`}>
          {status === 'pending' && <span className="tp__active-dot" />}
          <span>{statusText}</span>
        </div>
      )}

      {showDurationPicker && createPortal(
        <div className="tp-dur-portal" onClick={() => setShowDurationPicker(false)}>
          <div className="tp-dur-portal__sheet" onClick={(e) => e.stopPropagation()}>
            <div className="portal-sheet__handle" />
            <div className="tp-dur-portal__title">{t.betTime ?? 'Время сделки'}</div>
            <ExpirationPicker
              mode={expirationMode}
              onModeChange={setExpirationMode}
              duration={safeDuration}
              onDurationChange={(next) => setDuration(clampDurationValue(next))}
              targetTimestamp={targetTimestamp}
              onTargetTimestampChange={setTargetTimestamp}
              onClose={() => setShowDurationPicker(false)}
              autoTimeOffset={autoTimeOffset}
              onAutoTimeOffsetChange={setAutoTimeOffset}
              autoShiftStep={autoShiftStep}
              onAutoShiftStepChange={setAutoShiftStep}
              labels={{
                fixedDuration: t.tpFixedDuration ?? 'Фиксированная экспирация',
                byTime: t.tpByTime ?? 'По времени',
                currentTime: t.tpCurrentTime ?? 'Текущее время',
                autoTimeOffset: t.tpAutoTimeOffset ?? 'Прибавлять к текущему времени',
              }}
            />
          </div>
        </div>,
        getSignalPortalRoot(),
      )}
    </div>
  );
}

export function ChatView({
  chatId,
  onBack,
  socketMsgRef,
  hideBackButton = false,
  allowSignalAmountEditor = false,
  isAnalyticsMode = false,
}: Props) {
  const { t, locale } = useI18n();
  const { applyBonus } = useAccountBonus();
  const queryClient = useQueryClient();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, setPoAssetsVersion] = useState(0);
  const [olderCursor, setOlderCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [messages, setMessages] = useState<TmaChatMessage[]>([]);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const pendingInitialScrollRef = useRef(false);
  const initialAutoScrollUntilRef = useRef(0);
  const bottomSnapTimersRef = useRef<number[]>([]);
  const toastTimeoutRef = useRef<number | null>(null);
  const newestDateRef = useRef<string | undefined>(undefined);
  const isNearBottomRef = useRef(true);
  const preserveScrollAfterOlderLoadRef = useRef<{ top: number; height: number } | null>(null);
  const showSignalTradeCards = typeof window === 'undefined'
    ? true
    : !window.location.pathname.startsWith('/tma');

  const clearBottomSnapTimers = useCallback(() => {
    bottomSnapTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    bottomSnapTimersRef.current = [];
  }, []);

  const recalcNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom <= 120;
  }, []);

  const syncNearBottom = useCallback((forceStopAutoSnap = false) => {
    const next = recalcNearBottom();
    isNearBottomRef.current = next;
    setIsNearBottom(next);

    if (forceStopAutoSnap && !next) {
      initialAutoScrollUntilRef.current = 0;
      clearBottomSnapTimers();
    }
  }, [clearBottomSnapTimers, recalcNearBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior });
          return;
        }
        messagesEndRef.current?.scrollIntoView({ behavior });
      });
    });
  }, []);

  const scheduleBottomSnap = useCallback((behavior: ScrollBehavior = 'auto') => {
    clearBottomSnapTimers();
    [0, 80, 180, 360, 720, 1200].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        if (Date.now() <= initialAutoScrollUntilRef.current) {
          scrollToBottom(behavior);
        }
      }, delay);
      bottomSnapTimersRef.current.push(timerId);
    });
  }, [clearBottomSnapTimers, scrollToBottom]);

  /* ── Templates (cached forever) ── */
  const { data: templates } = useQuery({
    queryKey: ['tma-message-templates'],
    queryFn: fetchMessageTemplates,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  /* ── Chat metadata from chat list ── */
  const { data: chats = [] } = useQuery({
    queryKey: ['tma-chats'],
    queryFn: fetchChats,
    staleTime: 5 * 60_000, // 5 min — socket keeps data fresh
    refetchOnWindowFocus: false,
  });
  const chat = useMemo(() => chats.find((c) => String(c.id) === String(chatId)), [chats, chatId]);
  const analyticsChatIds = useMemo(() => new Set(
    chats
      .filter((item) => (item.category ?? '').trim().toLowerCase() === 'analytics')
      .map((item) => String(item.id)),
  ), [chats]);
  const chatDisplayTitle = useMemo(() => {
    if (!chat) return String(chatId);
    if (chat.titles) {
      return chat.titles[locale] || chat.titles['ru'] || chat.titles['en'] || chat.title || String(chatId);
    }
    return chat.title || String(chatId);
  }, [chat, chatId, locale]);

  /* ── Initial load ── */
  useEffect(() => {
    clearBottomSnapTimers();
    setMessages([]);
    setOlderCursor(undefined);
    setHasMore(false);
    pendingInitialScrollRef.current = true;
    initialAutoScrollUntilRef.current = Date.now() + 2500;
    newestDateRef.current = undefined;

    fetchChatMessages(chatId, { limit: PAGE_SIZE })
      .then(({ messages: msgs, has_more }) => {
        setMessages(msgs);
        setHasMore(has_more);
        if (msgs.length > 0) {
          setOlderCursor(msgs[0].date);
          newestDateRef.current = msgs[msgs.length - 1].date || msgs[msgs.length - 1].created_at;
          initialAutoScrollUntilRef.current = Date.now() + 2500;
        }
      })
      .catch(() => {});

    readChatMessages(chatId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['tma-chats'] }))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, clearBottomSnapTimers]);

  /* ── Open chat at the newest message ── */
  useEffect(() => {
    if (!pendingInitialScrollRef.current || messages.length === 0) return;
    pendingInitialScrollRef.current = false;
    scrollToBottom('auto');
    scheduleBottomSnap('auto');
    syncNearBottom();
  }, [messages.length, scheduleBottomSnap, scrollToBottom, syncNearBottom]);

  /* ── Receive new messages from socket (no HTTP polling) ── */
  useEffect(() => {
    if (!socketMsgRef) return;
    socketMsgRef.current = ({ chat_id, message }) => {
      const normalizedMessage = message.chat_id == null ? { ...message, chat_id } : message;
      const isTargetChat = isAnalyticsMode
        ? analyticsChatIds.has(String(chat_id))
        : String(chat_id) === String(chatId);
      if (!isTargetChat) return;
      const shouldStickToBottom = isNearBottomRef.current;
      setMessages((prev) => {
        const nextKey = getMessageKey(normalizedMessage);
        if (prev.some((item) => getMessageKey(item) === nextKey)) return prev;
        return [...prev, normalizedMessage];
      });
      newestDateRef.current = normalizedMessage.date || normalizedMessage.created_at;
      if (shouldStickToBottom) {
        scrollToBottom('smooth');
      }
    };
    return () => {
      if (socketMsgRef.current) socketMsgRef.current = null;
    };
  }, [analyticsChatIds, chatId, isAnalyticsMode, scrollToBottom, socketMsgRef]);

  useEffect(() => {
    syncNearBottom();
  }, [messages.length, syncNearBottom]);

  /* ── Load older messages ── */
  const loadOlder = useCallback(() => {
    if (loadingOlderRef.current || !olderCursor || !hasMore) return;
    const container = messagesContainerRef.current;
    if (container) {
      preserveScrollAfterOlderLoadRef.current = {
        top: container.scrollTop,
        height: container.scrollHeight,
      };
    }
    loadingOlderRef.current = true;
    fetchChatMessages(chatId, { limit: PAGE_SIZE, before: olderCursor })
      .then(({ messages: older, has_more }) => {
        setMessages((prev) => {
          const existingKeys = new Set(prev.map((m) => getMessageKey(m)));
          const fresh = older.filter((m) => !existingKeys.has(getMessageKey(m)));
          return [...fresh, ...prev];
        });
        setHasMore(has_more);
        if (older.length > 0) setOlderCursor(older[0].date);
        else setHasMore(false);
      })
      .catch(() => {})
      .finally(() => { loadingOlderRef.current = false; });
  }, [chatId, hasMore, olderCursor]);

  useEffect(() => {
    const preserved = preserveScrollAfterOlderLoadRef.current;
    if (!preserved) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    preserveScrollAfterOlderLoadRef.current = null;
    requestAnimationFrame(() => {
      const nextHeight = container.scrollHeight;
      const delta = nextHeight - preserved.height;
      if (delta > 0) {
        container.scrollTop = preserved.top + delta;
      }
    });
  }, [messages]);

  const handleMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    syncNearBottom(true);
    if (event.currentTarget.scrollTop <= AUTO_LOAD_OLDER_SCROLL_TOP) {
      loadOlder();
    }
  }, [loadOlder, syncNearBottom]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      clearBottomSnapTimers();
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    };
  }, [clearBottomSnapTimers]);

  useEffect(() => betterSocket.onPoAssets(() => {
    setPoAssetsVersion((prev) => prev + 1);
  }), []);

  const handleMessageImageLoad = useCallback(() => {
    if (Date.now() <= initialAutoScrollUntilRef.current) {
      scrollToBottom('auto');
      scheduleBottomSnap('auto');
      syncNearBottom();
    }
  }, [scheduleBottomSnap, scrollToBottom, syncNearBottom]);

  const handleMessageImageClick = useCallback((msg: TmaChatMessage) => {
    if (msg.photo_path) {
      setLightboxSrc(resolveTmaMediaUrl(msg.photo_path));
    }
  }, []);

  const handleMessageTextClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const copyButton = target.closest<HTMLElement>('.tma-copy-asset');
    if (!copyButton) return;

    event.preventDefault();
    const asset = copyButton.dataset.copyAsset?.trim();
    if (!asset) return;

    const copied = await copyTextToClipboard(asset);
    showToast(copied ? `Скопировано: ${asset}` : 'Не удалось скопировать актив');
  }, [showToast]);

  /* ── Render a single message text ── */
  const renderMsg = useCallback((msg: TmaChatMessage): string => {
    const { renderAssets, copyAsset } = getMessageAssets(msg);
    if (msg.type_request && templates) {
      const renderData = { ...(msg.data || {}) };
      const { apiName, currency } = getSignalPayoutCandidates(renderData);
      const payout = resolveDisplayPayout({ apiName, currency });
      let overridePayoutValue: number | undefined;

      if (payout !== undefined) {
        const displayPayout = applyBonus(payout);
        renderData.profit = String(displayPayout.toFixed(0));
        renderData.payout = String(displayPayout.toFixed(0));
        overridePayoutValue = displayPayout;
      }

      const renderedRaw = renderTmaMessage(msg.type_request, renderData, templates, locale);
      const rendered = overridePayoutValue === undefined ? renderedRaw : overrideRenderedPayout(renderedRaw, overridePayoutValue);
      if (rendered) return formatRenderedWithCopy(rendered, renderAssets, copyAsset);
    }
    // legacy plain text
    if (msg.text) {
      return formatRenderedWithCopy(
        msg.text
          .replace(/<code>(.*?)<\/code>/g, '$1')
          .replace(/<b>(.*?)<\/b>/g, '$1'),
        renderAssets,
        copyAsset,
      );
    }
    return '';
  }, [applyBonus, locale, templates]);

  const messageNodes = useMemo(() => {
    const READY_TYPES = ['ready_signal', 'ready_signal_1', 'ready_signal_2'];
    const MAIN_TYPES = ['main_signal', 'main_signal_1', 'main_signal_2'];
    const lastReadyIdx = messages.reduce((acc, m, i) => READY_TYPES.includes(m.type_request || '') ? i : acc, -1);
    const lastMainIdx = messages.reduce((acc, m, i) => MAIN_TYPES.includes(m.type_request || '') ? i : acc, -1);
    const lastResultIdx = messages.reduce((acc, m, i) => m.type_request === 'result_signal' ? i : acc, -1);
    const signalChartsByIndex = new Map<number, NonNullable<ReturnType<typeof getSignalChartSnapshot>>>();
    const readySignalSnapshotBySlot = new Map<string, NonNullable<ReturnType<typeof getSignalChartSnapshot>>>();
    const latestSignalChartIndices = messages.reduce<number[]>((acc, msg, index) => {
      const msgType = msg.type_request || '';
      const slot = getSignalSlot(msgType) || '0';
      const baseSnapshot = getSignalChartSnapshot(msg);

      if (READY_TYPES.includes(msgType) && baseSnapshot) {
        readySignalSnapshotBySlot.set(slot, baseSnapshot);
      }

      if (READY_TYPES.includes(msgType)) {
        return acc;
      }

      const snapshot = baseSnapshot
        ? { ...baseSnapshot }
        : (() => {
            if (!MAIN_TYPES.includes(msgType)) return null;
            const readySeed = readySignalSnapshotBySlot.get(slot);
            if (!readySeed) return null;
            return {
              ...readySeed,
              signalTime: Math.floor(parseMessageDate(msg.date || msg.created_at || '') / 1000),
            };
          })();

      if (!snapshot) return acc;

      if (MAIN_TYPES.includes(msgType)) {
        snapshot.signalTime = Math.floor(parseMessageDate(msg.date || msg.created_at || '') / 1000);
      }

      signalChartsByIndex.set(index, snapshot);
      acc.push(index);
      return acc;
    }, []).slice(-MAX_SIGNAL_PREVIEWS);
    const latestSignalChartSet = new Set(latestSignalChartIndices);
    const recentMainSignalMap = new Map<string, number>();

    return messages.map((msg, msgIdx) => {
      const isSignal = MAIN_TYPES.includes(msg.type_request || '');
      const isReadySignal = READY_TYPES.includes(msg.type_request || '');
      const isResultSignal = msg.type_request === 'result_signal';

      if (isSignal) {
        const d = msg.data ?? {};
        const slot = getSignalSlot(msg.type_request || '') || '0';
        const symbol = (d.full_symbol || d.symbol || d.api_symbol || d.asset || d.name || '').toLowerCase();
        const timeframe = (d.timeframe || d.tf || d.interval || d.duration_tf || '').toLowerCase();
        const direction = (d.direction || '').toLowerCase();
        const signalTimeKey = (d.signal_time || d.time || d.created_at || '').toLowerCase();
        const entryKey = (d.open || d.open_price || d.entry || d.entry_price || '').toLowerCase();
        const expiryKey = (d.expiration || d.duration || '').toLowerCase();
        const dupKey = [slot, symbol, timeframe, direction, signalTimeKey, entryKey, expiryKey].join('|');
        const msgTs = parseMessageDate(msg.date || msg.created_at || '');
        const prevTs = recentMainSignalMap.get(dupKey);
        if (prevTs && Math.abs(msgTs - prevTs) <= 30_000) {
          return null;
        }
        recentMainSignalMap.set(dupKey, msgTs);
      }

      const showReadyCard = showSignalTradeCards && isReadySignal && msgIdx === lastReadyIdx && lastReadyIdx > lastResultIdx;
      const showMainCard = showSignalTradeCards && isSignal && msgIdx === lastMainIdx && lastMainIdx > lastResultIdx;
      const signalChartSnapshot = !isReadySignal && latestSignalChartSet.has(msgIdx)
        ? signalChartsByIndex.get(msgIdx) ?? null
        : null;
      const signalChartPriority = signalChartSnapshot
        ? latestSignalChartIndices.length - 1 - latestSignalChartIndices.indexOf(msgIdx)
        : -1;
      const hideLegacySignalMedia = isSignal || isReadySignal || (signalChartsByIndex.has(msgIdx) && !latestSignalChartSet.has(msgIdx));
      const html = renderMsg(msg);
      const resultDot = isResultSignal ? (() => {
        const r = ((msg.data as Record<string, string>)?.result || '').toLowerCase();
        if (r === 'plus' || r === 'win') return 'plus';
        if (r === 'minus' || r === 'loss' || r === 'lose') return 'minus';
        if (r === 'martingale') return 'martingale';
        return null;
      })() : null;
      if (!isSignal && !isReadySignal && !isResultSignal && !html && !msg.photo_path) return null;
      return (
        <div key={String(msg.id)} className="tma-chat-msg tg-chat-msg">
          <div className="tma-chat-msg__channel tg-chat-msg-channel">{chatDisplayTitle}</div>
          {signalChartSnapshot ? (
            <SignalChartPreview
              snapshot={signalChartSnapshot}
              onMount={handleMessageImageLoad}
              rootRef={messagesContainerRef}
              priority={signalChartPriority}
              hidePriceScale={false}
              showAdminMeta={isAnalyticsMode}
            />
          ) : msg.photo_path && !hideLegacySignalMedia ? (
            <div className="tma-chat-msg__img-container tg-chat-msg-img-container">
              <img
                className="tma-chat-msg__img tg-chat-msg-img"
                src={resolveTmaMediaUrl(msg.photo_path)}
                alt=""
                loading="lazy"
                onLoad={handleMessageImageLoad}
                onClick={() => handleMessageImageClick(msg)}
              />
            </div>
          ) : null}
          {html && (
            <div className="tma-chat-msg__text-wrap" onClick={handleMessageTextClick}>
              <div
                className="tma-chat-msg__text tg-chat-msg-text"
                dangerouslySetInnerHTML={{ __html: html }}
              />
              {!isAnalyticsMode && isReadySignal && <ReadySignalCountdown date={msg.date || msg.created_at || ''} />}
            </div>
          )}
          {isResultSignal && resultDot && !html && (
            <div className="tma-chat-msg__text-wrap">
              <span className={`tma-chat-result-dot tma-chat-result-dot--${resultDot}`} aria-label={resultDot} />
            </div>
          )}
          {showMainCard && <MainSignalCard msg={msg} allowAmountEditor={allowSignalAmountEditor} showAdminApiName={isAnalyticsMode} />}
          {showReadyCard && <ReadySignalCard />}
          <div className="tma-chat-msg__date tg-chat-msg-date">{formatTime(msg.date || msg.created_at, isAnalyticsMode)}</div>
        </div>
      );
    });
  }, [
    allowSignalAmountEditor,
    chatDisplayTitle,
    handleMessageImageClick,
    handleMessageImageLoad,
    handleMessageTextClick,
    isAnalyticsMode,
    messages,
    renderMsg,
    showSignalTradeCards,
  ]);

  return (
    <div className="tma-chat-view tg-chat-view">
      {/* Top bar */}
      <div className="tma-chat-topbar tg-chat-topbar">
        <div className="tma-chat-topbar__left">
          {hideBackButton ? (
            <span style={{ width: 24, height: 24, display: 'inline-block' }} aria-hidden="true" />
          ) : (
            <button className="tma-chat-back tg-chat-back" onClick={onBack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {chat?.photo && (
            <img src={resolveTmaMediaUrl(chat.photo)} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />
          )}
          <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chatDisplayTitle}
          </span>
        </div>

      </div>

        {allowSignalAmountEditor && !showSignalTradeCards && (
        <div className="tma-chat-controls tma-chat-controls--analytics">
          <ReadySignalCard />
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="tma-chat-messages tg-chat-messages"
        onScroll={handleMessagesScroll}
        onWheel={() => syncNearBottom(true)}
        onTouchMove={() => syncNearBottom(true)}
      >
        {messageNodes}
        <div ref={messagesEndRef} />
      </div>

      {!isNearBottom && (
        <button
          type="button"
          className="tma-chat-scroll-down"
          onClick={() => {
            scrollToBottom('smooth');
            syncNearBottom();
          }}
          aria-label={t.tmaLoadMore ? 'Прокрутить вниз' : 'Scroll down'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Lightbox */}
      {lightboxSrc && <LightboxOverlay src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {toast && <div className="tma-toast">{toast}</div>}
    </div>
  );
}


