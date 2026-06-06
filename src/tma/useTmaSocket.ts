/**
 * TMA socket hook — connects to the robot WebSocket for real-time trade events.
 *
 * Auth flow (per API docs):
 *   1. Connect without credentials
 *   2. Emit `authenticate` with { token } after `connect` event
 *   3. Server responds with `authenticated` or `auth_error`
 *
 * Transports: websocket with polling fallback.
 * Reconnect: exponential backoff 2 s → 30 s (matches sar_analyzer config).
 */
import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { authService } from '../services/auth';
import { getTmaApiDomain } from './api';
import type { TmaTrade, TmaChatMessage } from './types';

export interface TmaSocketCallbacks {
  /** Fired when a new chat message arrives via socket. */
  onNewMessage?: (data: { chat_id: string | number; message: TmaChatMessage }) => void;
  onBetPlaced?: (data: TmaTrade) => void;
  onBetResult?: (data: TmaTrade) => void;
  onVirtualTradeResult?: (data: TmaTrade) => void;
  /** Fired when a virtual trade is placed (pending result). */
  onVirtualTradePending?: (data: TmaTrade) => void;
}

function getSocketUrl(): string {
  const apiBase = getTmaApiDomain();
  // Convert https:// → wss://, http:// → ws://
  return apiBase.replace(/^http/, 'ws').replace(/\/+$/, '');
}

/**
 * Normalise the `new_message` socket payload into the canonical
 * `{ chat_id, message }` shape the app expects.
 *
 * New API format:  { chat_id, type_request, data, date, photo_path }
 * Legacy format:   { chat_id, message: TmaChatMessage }
 * Legacy array:    ['new_message', { chat_id, message }]
 */
function normaliseNewMessage(
  raw: unknown,
): { chat_id: string | number; message: TmaChatMessage } | null {
  let payload = raw;

  // Unwrap legacy array format
  if (Array.isArray(payload)) {
    const [event, eventData] = payload as [unknown, unknown];
    if (event !== 'new_message' || !eventData) return null;
    payload = eventData;
  }

  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  // Legacy wrapped format: { chat_id, message: TmaChatMessage }
  if (p.message && typeof p.message === 'object') {
    return {
      chat_id: p.chat_id as string | number,
      message: p.message as TmaChatMessage,
    };
  }

  // New flat format: { chat_id, type_request, data, date, photo_path }
  if (p.type_request) {
    return {
      chat_id: p.chat_id as string | number,
      message: {
        id: String(p.date ?? Date.now()),
        chat_id: p.chat_id as string | number,
        type_request: p.type_request as string,
        data: (p.data ?? {}) as Record<string, string>,
        photo_path: p.photo_path as string | undefined,
        date: p.date as string,
        created_at: p.created_at as string | undefined,
      },
    };
  }

  return null;
}

export function useTmaSocket(callbacks: TmaSocketCallbacks) {
  const socketRef = useRef<Socket | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const token = authService.getToken();
    if (!token) return;

    const socket = io(getSocketUrl(), {
      // websocket first, polling as fallback (matches server config)
      transports: ['websocket', 'polling'],
      // No auth in options — authenticate via event after connect (see below)
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });

    socketRef.current = socket;

    // ── Auth flow ──────────────────────────────────────────
    socket.on('connect', () => {
      socket.emit('authenticate', { token });
    });

    socket.on('authenticated', (res: { message?: string; trader_id?: number }) => {
      if (res?.trader_id) {
        // Store trader_id for join_virtual_trading if not already known
        try { localStorage.setItem('tma_socket_trader_id', String(res.trader_id)); } catch {}
      }
    });

    socket.on('auth_error', (res: { message?: string }) => {
      console.warn('[TmaSocket] auth_error:', res?.message);
    });

    // ── Chat messages ──────────────────────────────────────
    socket.on('new_message', (payload: unknown) => {
      const normalised = normaliseNewMessage(payload);
      if (normalised) cbRef.current.onNewMessage?.(normalised);
    });

    // ── Trading events ─────────────────────────────────────
    socket.on('bet_placed', (data: unknown) => {
      cbRef.current.onBetPlaced?.(data as TmaTrade);
    });

    socket.on('bet_result', (data: unknown) => {
      cbRef.current.onBetResult?.(data as TmaTrade);
    });

    socket.on('virtual_trade_result', (data: unknown) => {
      cbRef.current.onVirtualTradeResult?.(data as TmaTrade);
    });

    socket.on('virtual_trade_pending', (data: unknown) => {
      cbRef.current.onVirtualTradePending?.(data as TmaTrade);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinVirtualTrading = useCallback((traderId: number) => {
    socketRef.current?.emit('join_virtual_trading', { trader_id: traderId });
  }, []);

  const leaveVirtualTrading = useCallback((traderId: number) => {
    socketRef.current?.emit('leave_virtual_trading', { trader_id: traderId });
  }, []);

  return { joinVirtualTrading, leaveVirtualTrading };
}
