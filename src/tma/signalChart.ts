import type { TmaChatMessage } from './types';

export const SIGNAL_CHART_HISTORY_BARS = 100;

function isTruthyOtcFlag(value?: string): boolean {
  return ['true', '1', 'yes'].includes((value || '').trim().toLowerCase());
}

function normalizeSignalChartPair(value?: string, otc = false): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  const normalized = trimmed
    .replace(/_otc$/i, ' OTC')
    .replace(/\s+/g, ' ')
    .trim();

  if (otc && !/\botc\b/i.test(normalized)) {
    return `${normalized} OTC`;
  }

  return normalized;
}

function getSignalChartSymbol(data?: Record<string, string>): string {
  const otc = isTruthyOtcFlag(data?.otc);
  const candidates = [data?.full_symbol, data?.symbol, data?.api_symbol]
    .map((value) => normalizeSignalChartPair(value, otc))
    .filter(Boolean);
  return candidates[0] || '';
}

function getSignalChartSymbolFromText(text?: string, otc = false): string {
  const source = (text || '').replace(/<[^>]*>/g, ' ');
  if (!source) return '';

  const pairMatch = source.match(/([A-Z]{3,10}\s*\/\s*[A-Z]{3,10}(?:\s*OTC)?)/i);
  if (pairMatch?.[1]) {
    return normalizeSignalChartPair(pairMatch[1], otc);
  }

  const compactMatch = source.match(/\b([A-Z]{6})(?:\s*OTC)?\b/i);
  if (compactMatch?.[1]) {
    const pair = `${compactMatch[1].slice(0, 3)}/${compactMatch[1].slice(3)}`;
    return normalizeSignalChartPair(pair, otc);
  }

  return '';
}

function normalizeSignalChartTimeframe(value?: string): string {
  const normalized = (value || '').trim().toUpperCase();
  if (!normalized) return 'M1';
  if (/^[SMHD]\d+$/.test(normalized)) return normalized;
  if (normalized === '1D') return 'D1';
  if (/^\d+$/.test(normalized)) {
    return normalized === '60' ? 'H1' : `M${normalized}`;
  }
  const compact = normalized.match(/^(\d+)([SMHD])$/);
  if (!compact) return 'M1';
  const [, amount, unit] = compact;
  if (unit === 'D') return 'D1';
  if (unit === 'H') return `H${amount}`;
  if (unit === 'S') return `S${amount}`;
  return `M${amount}`;
}

function getSignalChartTimeframe(data?: Record<string, string>): string {
  const direct = [data?.timeframe, data?.tf, data?.interval, data?.duration_tf]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);

  if (direct) return normalizeSignalChartTimeframe(direct);

  const expiration = (data?.expiration || '').trim();
  if (/^\d+$/.test(expiration)) {
    return normalizeSignalChartTimeframe(expiration);
  }

  return 'M1';
}

function getSignalChartTimeframeFromText(text?: string): string {
  const source = (text || '').toLowerCase();
  if (!source) return 'M1';

  const minMatch = source.match(/(\d+)\s*мин/);
  if (minMatch?.[1]) return normalizeSignalChartTimeframe(minMatch[1]);

  const secMatch = source.match(/(\d+)\s*сек/);
  if (secMatch?.[1]) return normalizeSignalChartTimeframe(`S${secMatch[1]}`);

  return 'M1';
}

function parseSignalTimestampSec(value?: string): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized) && !/[zZ]$/.test(normalized)) {
    normalized += 'Z';
  }
  normalized = normalized.replace(/\.(\d{3})\d+Z$/, '.$1Z');

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
}

export interface SignalChartSnapshot {
  pairCode: string;
  timeframe: string;
  signalTime?: number;
  historyBars: number;
}

export function isSignalImageMessage(msg: TmaChatMessage): boolean {
  const type = msg.type_request || '';
  return type.startsWith('ready_signal') || type.startsWith('main_signal');
}

export function getSignalChartSnapshot(msg: TmaChatMessage): SignalChartSnapshot | null {
  if (!isSignalImageMessage(msg)) return null;

  const data = msg.data ?? {};
  const pairCode = getSignalChartSymbol(data) || getSignalChartSymbolFromText(msg.text, isTruthyOtcFlag(data?.otc));
  if (!pairCode) return null;

  const signalTime = [
    data.signal_time,
    data.time,
    data.created_at,
    msg.date,
    msg.created_at,
  ].map((value) => parseSignalTimestampSec(value)).find((value) => value != null) ?? undefined;

  const timeframe = getSignalChartTimeframe(data) || getSignalChartTimeframeFromText(msg.text);
  // Пропускаем дневной ТФ — недостаточно свечей в истории для корректного отображения
  if (timeframe === 'D1') return null;

  return {
    pairCode,
    timeframe,
    signalTime,
    historyBars: SIGNAL_CHART_HISTORY_BARS,
  };
}