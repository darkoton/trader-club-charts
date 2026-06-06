/**
 * Socket.IO клиент для получения котировок в реальном времени
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8080';

export interface PriceUpdate {
  currency: string;
  price: number;
  timestamp: string;
  volume?: number;
}

export interface CandleClosed {
  currency: string;
  timeframe: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  is_closed: boolean;
}

export interface CurrenciesUpdatedPayload {
  currencies: Array<{
    currency: string;
    profit: number;
    category: string;
    is_active: boolean;
    api_name?: string | null;
    icon?: string;
    category_icon?: string;
    created_at?: string;
    updated_at?: string;
  }>;
  categories: Array<{
    name: string;
    icon: string | null;
  }>;
}

type PriceUpdateCallback = (data: PriceUpdate) => void;
type CandleClosedCallback = (data: CandleClosed) => void;
type ConnectionStateCallback = (connected: boolean) => void;
type CurrenciesUpdatedCallback = (data: CurrenciesUpdatedPayload) => void;
type ServerTimeOffsetCallback = (offsetMs: number) => void;

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

function buildSubscriptionVariants(value: string | null | undefined): string[] {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];

  const upper = raw.toUpperCase();
  const hasOtc = hasOtcMarker(raw);
  const compact = upper
    .replace(/_OTC$/i, '')
    .replace(/\bOTC\b/gi, '')
    .replace(/[^A-Z0-9]/g, '');

  const variants = new Set<string>([raw, upper, ...buildAssetLookupKeys(raw)]);

  if (/^[A-Z]{6}$/.test(compact)) {
    const slash = `${compact.slice(0, 3)}/${compact.slice(3)}`;
    variants.add(slash);
    variants.add(`${compact.slice(0, 3)} ${compact.slice(3)}`);
    if (hasOtc) {
      variants.add(`${slash} OTC`);
      variants.add(`${compact}_OTC`);
      variants.add(`${compact} OTC`);
    }
  }

  if (hasOtc && compact) {
    variants.add(`${compact}_OTC`);
    variants.add(`${compact} OTC`);
    if (/^[A-Z]{6}$/.test(compact)) {
      variants.add(`${compact.slice(0, 3)}/${compact.slice(3)} OTC`);
    }
  }

  return Array.from(variants).filter(Boolean);
}

export interface DisconnectInfo {
  reason: string;
  details: string;
  timestamp: string;
  reconnectAttempts: number;
  transport: string;
  socketUrl: string;
  lastError: string | null;
}

class SocketService {
  private socket: Socket | null = null;
  private subscribedCurrencies: Set<string> = new Set();
  private pendingSubscriptions: Set<string> = new Set();
  private subscribeCounts: Map<string, number> = new Map();
  private variantSubscribeCounts: Map<string, number> = new Map();
  private requestedSubscriptionVariants: Map<string, string[]> = new Map();
  private priceCallbacks: Map<string, Set<PriceUpdateCallback>> = new Map();
  private candleCallbacks: Map<string, Set<CandleClosedCallback>> = new Map();
  private connectionListeners: Set<ConnectionStateCallback> = new Set();
  private currenciesUpdatedListeners: Set<CurrenciesUpdatedCallback> = new Set();
  private serverTimeOffsetListeners: Set<ServerTimeOffsetCallback> = new Set();
  private _connected = false;
  private _disconnectInfo: DisconnectInfo | null = null;
  private _reconnectAttempts = 0;
  private _lastError: string | null = null;
  /** true after the very first successful connect; used to detect reconnects */
  private _everConnected = false;
  /** true after a disconnect event — means next connect is a reconnect */
  private _wasDisconnected = false;
  private _serverTimeOffsetMs = 0;
  private _hasServerTimeOffset = false;

  /** Get last disconnect info for debugging */
  get disconnectInfo(): DisconnectInfo | null { return this._disconnectInfo; }

  /** Subscribe to connection state changes. Returns unsubscribe function. */
  onConnectionChange(cb: ConnectionStateCallback): () => void {
    this.connectionListeners.add(cb);
    // Fire immediately with current state
    cb(this._connected);
    return () => { this.connectionListeners.delete(cb); };
  }

  hasServerTimeOffset(): boolean {
    return this._hasServerTimeOffset;
  }

  getServerTimeOffsetMs(): number {
    return this._serverTimeOffsetMs;
  }

  getServerNowMs(): number {
    return Date.now() + this._serverTimeOffsetMs;
  }

  onServerTimeOffsetChange(cb: ServerTimeOffsetCallback): () => void {
    this.serverTimeOffsetListeners.add(cb);
    if (this._hasServerTimeOffset) cb(this._serverTimeOffsetMs);
    return () => { this.serverTimeOffsetListeners.delete(cb); };
  }

  private updateServerTimeOffset(serverTimestampMs: number, receivedAtMs = Date.now()): void {
    if (!Number.isFinite(serverTimestampMs) || serverTimestampMs <= 0) return;

    const sampleOffsetMs = Math.round(serverTimestampMs - receivedAtMs);
    if (!Number.isFinite(sampleOffsetMs) || Math.abs(sampleOffsetMs) > 300_000) return;

    let nextOffsetMs = sampleOffsetMs;
    if (this._hasServerTimeOffset) {
      const deltaMs = sampleOffsetMs - this._serverTimeOffsetMs;
      nextOffsetMs = Math.abs(deltaMs) > 5000
        ? sampleOffsetMs
        : Math.round(this._serverTimeOffsetMs + deltaMs * 0.15);
    }

    if (this._hasServerTimeOffset && Math.abs(nextOffsetMs - this._serverTimeOffsetMs) < 50) {
      return;
    }

    this._serverTimeOffsetMs = nextOffsetMs;
    this._hasServerTimeOffset = true;
    this.serverTimeOffsetListeners.forEach((cb) => cb(this._serverTimeOffsetMs));
  }

  private updateServerTimeOffsetFromIso(isoTimestamp?: string | null, receivedAtMs = Date.now()): void {
    if (!isoTimestamp) return;
    const parsedMs = Date.parse(isoTimestamp);
    if (!Number.isFinite(parsedMs)) return;
    this.updateServerTimeOffset(parsedMs, receivedAtMs);
  }

  private setConnected(value: boolean) {
    if (this._connected === value) return;
    this._connected = value;
    if (value) this._reconnectAttempts = 0;
    this.connectionListeners.forEach((cb) => cb(value));
  }

  private getMatchingCallbackKeys(targetCurrency: string, callbackMap: Map<string, Set<unknown>>): string[] {
    const targetKeys = new Set(buildAssetLookupKeys(targetCurrency));
    const targetHasOtc = hasOtcMarker(targetCurrency);
    const matches: string[] = [];

    callbackMap.forEach((_, registeredCurrency) => {
      const registeredHasOtc = hasOtcMarker(registeredCurrency);
      if (registeredHasOtc !== targetHasOtc && (registeredHasOtc || targetHasOtc)) {
        return;
      }

      const registeredKeys = buildAssetLookupKeys(registeredCurrency);
      if (registeredKeys.some((key) => targetKeys.has(key))) {
        matches.push(registeredCurrency);
      }
    });

    return matches;
  }

  private activateVariantSubscription(currency: string): void {
    if (this.subscribedCurrencies.has(currency)) return;

    if (!this.socket?.connected) {
      this.pendingSubscriptions.add(currency);
      return;
    }

    this.socket.emit('subscribe_currency', { currency });
    this.subscribedCurrencies.add(currency);
    this.pendingSubscriptions.delete(currency);
    console.log(`📊 Subscribed to ${currency}`);
  }

  private deactivateVariantSubscription(currency: string): void {
    if (!this.socket?.connected) {
      this.pendingSubscriptions.delete(currency);
      return;
    }

    if (!this.subscribedCurrencies.has(currency)) return;

    this.socket.emit('unsubscribe_currency', { currency });
    this.subscribedCurrencies.delete(currency);
    console.log(`📊 Unsubscribed from ${currency}`);
  }

  /**
   * Подключиться к серверу Socket.IO
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      // Socket exists but still connecting — wait for it instead of creating another
      if (this.socket) {
        this.socket.once('connected', () => resolve());
        this.socket.once('connect_error', (err: Error) => reject(err));
        return;
      }

      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      });

      this.socket.on('connected', (data) => {
        console.log('✅ Connected to Socket.IO server:', data);
        this._everConnected = true;
        this.setConnected(true);
        this.flushPendingSubscriptions();
        resolve();
      });

      this.socket.on('connect', () => {
        if (this._everConnected && this._wasDisconnected) {
          // Reconnect after a real disconnect — stale candle data can't be recovered cleanly;
          // reload the page so charts start fresh with correct price history.
          console.log('🔄 Socket reconnected — reloading page to clear stale candle data');
          window.location.reload();
          return;
        }
        this.setConnected(true);
        this.flushPendingSubscriptions();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket.IO connection error:', error);
        this._lastError = error.message || String(error);
        this._reconnectAttempts++;
        this._disconnectInfo = {
          reason: 'connect_error',
          details: this.describeReason('connect_error', error.message),
          timestamp: new Date().toLocaleTimeString(),
          reconnectAttempts: this._reconnectAttempts,
          transport: this.socket?.io?.engine?.transport?.name || 'unknown',
          socketUrl: SOCKET_URL,
          lastError: error.message || String(error),
        };
        this.setConnected(false);
        reject(error);
      });

      this.socket.on('error', (error) => {
        console.error('❌ Socket.IO error:', error);
        this._lastError = typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message : String(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from Socket.IO server, reason:', reason);
        if (this._everConnected) this._wasDisconnected = true;
        this._disconnectInfo = {
          reason,
          details: this.describeReason(reason),
          timestamp: new Date().toLocaleTimeString(),
          reconnectAttempts: this._reconnectAttempts,
          transport: this.socket?.io?.engine?.transport?.name || 'unknown',
          socketUrl: SOCKET_URL,
          lastError: this._lastError,
        };
        this.setConnected(false);
        // Move active subscriptions to pending so they are re-sent on reconnect
        for (const currency of this.subscribedCurrencies) {
          this.pendingSubscriptions.add(currency);
        }
        this.subscribedCurrencies.clear();

        // Socket.IO does NOT auto-reconnect after 'io server disconnect'.
        // Force reconnect so charts resume after backend restart.
        if (reason === 'io server disconnect') {
          console.log('🔄 Server-initiated disconnect — forcing reconnect…');
          this.socket?.connect();
        }
      });

      // Глобальный обработчик обновлений цен
      this.socket.on('price_update', (data: PriceUpdate) => {
        this.updateServerTimeOffsetFromIso(data.timestamp);
        this.getMatchingCallbackKeys(data.currency, this.priceCallbacks as Map<string, Set<unknown>>)
          .forEach((currencyKey) => {
            const callbacks = this.priceCallbacks.get(currencyKey);
            callbacks?.forEach((callback) => callback(data));
          });
      });

      // Глобальный обработчик закрытых свечей
      this.socket.on('candle_closed', (data: CandleClosed) => {
        this.updateServerTimeOffsetFromIso(data.close_time || data.open_time);
        this.getMatchingCallbackKeys(data.currency, this.candleCallbacks as Map<string, Set<unknown>>)
          .forEach((currencyKey) => {
            const callbacks = this.candleCallbacks.get(currencyKey);
            callbacks?.forEach((callback) => callback(data));
          });
      });

      // Глобальный обработчик обновления валют
      this.socket.on('currencies_updated', (data: CurrenciesUpdatedPayload) => {
        this.currenciesUpdatedListeners.forEach(cb => cb(data));
      });
    });
  }

  /** Human-readable explanation of disconnect reason */
  private describeReason(reason: string, errorMsg?: string): string {
    const descriptions: Record<string, string> = {
      'io server disconnect': 'Server forcefully closed connection (possible restart or expired token)',
      'io client disconnect': 'Client closed connection (disconnect() called)',
      'ping timeout': 'Server did not respond to ping — no network or server overloaded',
      'transport close': 'Transport closed — network issues, VPN, proxy or firewall',
      'transport error': 'Transport error — unstable connection or proxy dropped WebSocket',
      'connect_error': `Failed to connect: ${errorMsg || 'server unavailable, wrong URL, or CORS/firewall'}`,
      'parse error': 'Data parse error from server — possibly incompatible versions',
    };
    return descriptions[reason] || `Unknown reason: "${reason}"`;
  }

  /**
   * Отключиться от сервера.
   * Сохраняет callback-подписки (priceCallbacks, candleCallbacks) —
   * они принадлежат компонентам (TVDatafeed и др.) и должны пережить реконнект.
   * subscribedCurrencies переносятся в pendingSubscriptions для повторной подписки.
   */
  disconnect(): void {
    if (this.socket) {
      // Move active subs to pending so they re-subscribe on next connect
      for (const currency of this.subscribedCurrencies) {
        this.pendingSubscriptions.add(currency);
      }
      this.subscribedCurrencies.clear();
      this.socket.disconnect();
      this.socket = null;
      this._reconnectAttempts = 0;
      this._disconnectInfo = null;
      this._lastError = null;
      // NOTE: priceCallbacks / candleCallbacks intentionally NOT cleared —
      // they are registrations from TVDatafeed.subscribeBars() that must
      // survive across reconnections.
    }
  }

  /**
   * Полное уничтожение сервиса — очищает все подписки и коллбэки.
   * Вызывать только при полном завершении приложения.
   */
  destroy(): void {
    this.disconnect();
    this.priceCallbacks.clear();
    this.candleCallbacks.clear();
    this.connectionListeners.clear();
    this.currenciesUpdatedListeners.clear();
    this.pendingSubscriptions.clear();
    this.subscribeCounts.clear();
    this.variantSubscribeCounts.clear();
    this.requestedSubscriptionVariants.clear();
  }

  /**
   * Подписаться на обновления валюты.
   * Если сокет ещё не подключён — подписка встаёт в очередь и отправится при connect.
   */
  subscribeToCurrency(currency: string): void {
    const requestKey = currency.trim();
    if (!requestKey) return;

    // Reference counting: track how many callers need this currency
    const count = this.subscribeCounts.get(requestKey) || 0;
    this.subscribeCounts.set(requestKey, count + 1);
    if (count > 0) return;

    const variants = buildSubscriptionVariants(requestKey);
    this.requestedSubscriptionVariants.set(requestKey, variants);

    variants.forEach((variant) => {
      const variantCount = this.variantSubscribeCounts.get(variant) || 0;
      this.variantSubscribeCounts.set(variant, variantCount + 1);
      if (variantCount === 0) {
        this.activateVariantSubscription(variant);
      }
    });
  }

  /** Отправить все отложенные подписки после подключения */
  private flushPendingSubscriptions(): void {
    if (this.pendingSubscriptions.size === 0) return;
    for (const currency of Array.from(this.pendingSubscriptions)) {
      if (this.subscribedCurrencies.has(currency)) {
        this.pendingSubscriptions.delete(currency);
        continue;
      }
      this.socket?.emit('subscribe_currency', { currency });
      this.subscribedCurrencies.add(currency);
      this.pendingSubscriptions.delete(currency);
      console.log(`📊 Subscribed to ${currency}`);
    }
  }

  /**
   * Отписаться от обновлений валюты
   */
  unsubscribeFromCurrency(currency: string): void {
    const requestKey = currency.trim();
    if (!requestKey) return;

    // Decrement reference count; only truly unsubscribe when no callers remain
    const count = this.subscribeCounts.get(requestKey) || 0;
    if (count > 1) {
      this.subscribeCounts.set(requestKey, count - 1);
      return;
    }
    this.subscribeCounts.delete(requestKey);

    const variants = this.requestedSubscriptionVariants.get(requestKey) ?? buildSubscriptionVariants(requestKey);
    this.requestedSubscriptionVariants.delete(requestKey);

    variants.forEach((variant) => {
      const variantCount = this.variantSubscribeCounts.get(variant) || 0;
      if (variantCount > 1) {
        this.variantSubscribeCounts.set(variant, variantCount - 1);
        return;
      }
      this.variantSubscribeCounts.delete(variant);
      this.deactivateVariantSubscription(variant);
    });
    // NOTE: callbacks are NOT deleted here — they are cleaned up independently
    // via the unsubscribe functions returned by onPriceUpdate / onCandleClosed.
  }

  /**
   * Добавить обработчик обновлений цены
   */
  onPriceUpdate(currency: string, callback: PriceUpdateCallback): () => void {
    if (!this.priceCallbacks.has(currency)) {
      this.priceCallbacks.set(currency, new Set());
    }

    this.priceCallbacks.get(currency)!.add(callback);

    // Возвращаем функцию для отписки
    return () => {
      const callbacks = this.priceCallbacks.get(currency);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.priceCallbacks.delete(currency);
        }
      }
    };
  }

  /**
   * Добавить обработчик закрытых свечей
   */
  onCandleClosed(currency: string, callback: CandleClosedCallback): () => void {
    if (!this.candleCallbacks.has(currency)) {
      this.candleCallbacks.set(currency, new Set());
    }

    this.candleCallbacks.get(currency)!.add(callback);

    // Возвращаем функцию для отписки
    return () => {
      const callbacks = this.candleCallbacks.get(currency);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.candleCallbacks.delete(currency);
        }
      }
    };
  }

  /**
   * Получить текущие свечи
   */
  getCurrentCandles(currency: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('get_current_candles', { currency });

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for current candles'));
      }, 5000);

      this.socket.once('current_candles', (data) => {
        clearTimeout(timeout);
        if (data.currency === currency) {
          resolve(data.candles);
        }
      });
    });
  }

  /**
   * Подписаться на обновления списка валют.
   * Возвращает функцию отписки.
   */
  onCurrenciesUpdated(callback: CurrenciesUpdatedCallback): () => void {
    this.currenciesUpdatedListeners.add(callback);
    return () => {
      this.currenciesUpdatedListeners.delete(callback);
    };
  }

  /**
   * Проверить подключение
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Экспортируем singleton
export const socketService = new SocketService();
