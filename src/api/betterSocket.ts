/**
 * Better Service Socket.IO client
 * 
 * Connects to the Better (PocketOption trading) service
 * for placing bets, receiving results, and real-time balance monitoring.
 */

import { io, Socket } from 'socket.io-client';
import { authService } from '../services/auth';
import { isBetterAuthStatusPayload } from './better';
import type { PlaceBetParams, BetPlacedEvent, BetResultEvent, PoOrderOpenedEvent, PoOrderClosedEvent, BetErrorEvent, PoConnectionEvent, AccountInfo, BetterAuthStatusPayload, BetterAuthStatusDetails } from './better';

const BETTER_URL = import.meta.env.VITE_BETTER_URL || 'https://better.po-terminal.com';

interface BetResultUpdatePayload {
  bet_id?: string;
  trade_id?: string;
  asset?: string;
  amount?: number;
  direction?: 'call' | 'put';
  is_demo?: boolean;
  result: BetResultEvent['result'];
  profit?: number;
  balance_after?: number;
  resolved_at?: string;
  account_id?: string;
}

type BetPlacedCallback = (data: BetPlacedEvent) => void;
type BetResultCallback = (data: BetResultEvent) => void;
type PoOrderOpenedCallback = (data: PoOrderOpenedEvent) => void;
type PoOrderClosedCallback = (data: PoOrderClosedEvent) => void;
type BetErrorCallback = (data: BetErrorEvent) => void;
type ConnectionCallback = (connected: boolean) => void;
type PoConnectionCallback = (data: PoConnectionEvent) => void;
type AuthStatusCallback = (data: AuthStatusEvent) => void;
type SocketErrorCallback = (data: SocketErrorEvent) => void;

/* ─── Balance event types ─── */
export interface BalanceUpdateEvent {
  account_id: string;
  is_demo: boolean;
  balance: number;
  currency?: string;
  account_info?: AccountInfo;
  timestamp: string;
}

export interface BalanceChangedEvent {
  account_id: string;
  is_demo: boolean;
  balance: number;
  previous_balance: number | null;
  diff: number | null;
  currency?: string;
  reason?: string;
  bet_id?: string;
  timestamp: string;
}

export interface BalanceErrorEvent {
  account_id: string;
  is_demo: boolean;
  error: string;
  auth_status?: BetterAuthStatusPayload['auth_status'];
  requires_2fa?: boolean;
  two_factor_state?: BetterAuthStatusPayload['two_factor_state'];
  two_factor_enabled?: BetterAuthStatusPayload['two_factor_enabled'];
  error_code?: string;
  logout_required?: boolean;
  action?: string;
  challenge_id?: string | null;
  confirm_2fa_endpoint?: string | null;
  terminal_user_id?: string | null;
  auth_event_id?: string | null;
  error_source?: string | null;
  error_stage?: string | null;
  endpoint?: string | null;
  upstream_status?: number | null;
  upstream_response?: unknown;
  email?: string | null;
  po_user_id?: number | null;
  details?: BetterAuthStatusDetails | null;
  timestamp?: string;
}

export interface ConnectionsReadyEvent {
  message: string;
}

export interface ActiveAccountsUpdatedEvent {
  account_ids: string[];
}

export type AuthStatusEvent = BetterAuthStatusPayload & {
  account_id: string;
};

export type SocketErrorEvent = BetterAuthStatusPayload & {
  account_id?: string | null;
};

/* ─── PO Assets event types ─── */
export interface PoAsset {
  symbol: string;
  label: string;
  payout: number;
  max_payout: number;
  digits: number;
  min_timeframe: number;
  max_timeframe: number;
}

export interface PoAssetsEvent {
  assets: PoAsset[];
  total: number;
}

export interface PlaceBetEmitResult {
  ok: boolean;
  error?: string;
  request?: PlaceBetParams;
}

type BalanceUpdateCallback = (data: BalanceUpdateEvent) => void;
type BalanceChangedCallback = (data: BalanceChangedEvent) => void;
type BalanceErrorCallback = (data: BalanceErrorEvent) => void;
type ConnectionsReadyCallback = (data: ConnectionsReadyEvent) => void;
type PoAssetsCallback = (data: PoAssetsEvent) => void;
type ActiveAccountsUpdatedCallback = (data: ActiveAccountsUpdatedEvent) => void;

interface PendingPlaceBetRequest {
  params: PlaceBetParams;
  requestedAt: number;
}

export interface PendingPlaceBetSnapshot extends PlaceBetParams {
  requestedAt: number;
}

function hasOtcMarker(value: string | null | undefined): boolean {
  return /(?:\bOTC\b|_OTC$)/i.test(value ?? '');
}

function buildPoAssetLookupKeys(value: string | null | undefined): string[] {
  if (!value) return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  const upper = trimmed.toUpperCase();
  const hasOtc = hasOtcMarker(trimmed);
  const compact = upper
    .replace(/_OTC$/i, '')
    .replace(/\bOTC\b/gi, '')
    .replace(/[^A-Z0-9]/g, '');

  const keys = new Set<string>();
  keys.add(trimmed);
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

function extractBackendErrorDetails(raw: string): string | null {
  if (!raw) return null;

  const messageMatches = Array.from(raw.matchAll(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/gi));
  if (messageMatches.length > 0) {
    return messageMatches.map((match) => match[1]?.trim()).filter(Boolean).join('; ');
  }

  const cleaned = raw
    .replace(/^demo trade open failed:\s*/i, '')
    .replace(/^real trade open failed:\s*/i, '')
    .trim();

  return cleaned && cleaned !== raw ? cleaned : null;
}

function buildReadableBetError(raw: string, request?: PendingPlaceBetRequest): string {
  const backendDetails = extractBackendErrorDetails(raw);
  const params = request?.params;
  const tradeMode = params?.is_demo ? 'Демо' : 'Реал';
  const requestSummary = params
    ? `${tradeMode} сделка: ${params.asset}, ${params.direction === 'call' ? 'BUY' : 'SELL'}, ${params.amount}, ${params.duration} сек`
    : null;

  if (backendDetails && requestSummary) {
    return `${backendDetails}. ${requestSummary}.`;
  }
  if (backendDetails) {
    return backendDetails;
  }
  if (requestSummary) {
    return `${raw}. ${requestSummary}.`;
  }
  return raw;
}

/* ─── Account data updated event ─── */
export interface AccountDataUpdatedEvent {
  account_id: string;
  currencies?: { demo: string; real: string };
  account_info?: AccountInfo;
  currency_changed?: boolean;
}

class BetterSocketService {
  private socket: Socket | null = null;
  private _connected = false;
  private _connectionsReady = false;
  private serverTimeOffsetMs = 0;
  private hasServerTimeOffset = false;
  private lastServerTimeSkewWarnAt = 0;
  private betPlacedListeners = new Set<BetPlacedCallback>();
  private betResultListeners = new Set<BetResultCallback>();
  private poOrderOpenedListeners = new Set<PoOrderOpenedCallback>();
  private poOrderClosedListeners = new Set<PoOrderClosedCallback>();
  private betErrorListeners = new Set<BetErrorCallback>();
  private connectionListeners = new Set<ConnectionCallback>();
  private balanceUpdateListeners = new Set<BalanceUpdateCallback>();
  private balanceChangedListeners = new Set<BalanceChangedCallback>();
  private balanceErrorListeners = new Set<BalanceErrorCallback>();
  private authStatusListeners = new Set<AuthStatusCallback>();
  private socketErrorListeners = new Set<SocketErrorCallback>();
  private connectionsReadyListeners = new Set<ConnectionsReadyCallback>();
  private activeAccountsUpdatedListeners = new Set<ActiveAccountsUpdatedCallback>();
  private poConnectingListeners = new Set<PoConnectionCallback>();
  private poConnectedListeners = new Set<PoConnectionCallback>();
  private poConnectionErrorListeners = new Set<PoConnectionCallback>();
  private poAssetsListeners = new Set<PoAssetsCallback>();
  private accountDataUpdatedListeners = new Set<(data: AccountDataUpdatedEvent) => void>();
  private _poAssets = new Map<string, PoAsset>();
  private balanceSubRefCounts = new Map<string, number>(); // "accountId:isDemo" -> refs
  private activeAccountIds: string[] = []; // last set_active_accounts payload
  private lastEmittedActiveAccountsKey: string | null = null;
  /** Cache entry prices from ALL po_order_opened events (trade_id → openPrice). */
  private entryPriceCache = new Map<string, number>();
  private pendingPlaceBetRequests: PendingPlaceBetRequest[] = [];

  get isConnected(): boolean {
    return this._connected;
  }

  get isConnectionsReady(): boolean {
    return this._connectionsReady;
  }

  getServerTimeOffsetMs(): number {
    return this.serverTimeOffsetMs;
  }

  getServerNowMs(): number {
    return Date.now() + this.serverTimeOffsetMs;
  }

  private maybeWarnAboutServerTimeSkew(nowMs = Date.now()): void {
    if (!this.hasServerTimeOffset) return;

    const absOffsetMs = Math.abs(this.serverTimeOffsetMs);
    if (absOffsetMs < 1000) return;
    if (nowMs - this.lastServerTimeSkewWarnAt < 5000) return;

    this.lastServerTimeSkewWarnAt = nowMs;
    const seconds = absOffsetMs >= 10_000
      ? `${Math.round(absOffsetMs / 1000)}`
      : `${(absOffsetMs / 1000).toFixed(1)}`;
    const direction = this.serverTimeOffsetMs > 0 ? 'спешит' : 'отстает';

    console.warn(
      `[BetterSocket] Внимание: серверное время ${direction} относительно времени устройства на ${seconds}с (${this.serverTimeOffsetMs > 0 ? '+' : ''}${this.serverTimeOffsetMs} ms).`,
    );
  }

  private updateServerTimeOffset(serverTimestampMs: number, receivedAtMs = Date.now()): void {
    if (!Number.isFinite(serverTimestampMs) || serverTimestampMs <= 0) return;

    const sampleOffsetMs = Math.round(serverTimestampMs - receivedAtMs);
    if (!Number.isFinite(sampleOffsetMs) || Math.abs(sampleOffsetMs) > 86_400_000) return;

    if (!this.hasServerTimeOffset) {
      this.serverTimeOffsetMs = sampleOffsetMs;
      this.hasServerTimeOffset = true;
      this.maybeWarnAboutServerTimeSkew(receivedAtMs);
      return;
    }

    const deltaMs = sampleOffsetMs - this.serverTimeOffsetMs;
    if (Math.abs(deltaMs) > 10_000) {
      this.serverTimeOffsetMs = sampleOffsetMs;
      this.maybeWarnAboutServerTimeSkew(receivedAtMs);
      return;
    }

    this.serverTimeOffsetMs = Math.round(this.serverTimeOffsetMs + deltaMs * 0.2);
    this.maybeWarnAboutServerTimeSkew(receivedAtMs);
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
    if (!value) {
      this._connectionsReady = false;
      this.lastEmittedActiveAccountsKey = null;
    }
    this.connectionListeners.forEach((cb) => cb(value));
  }

  private normalizeActiveAccountIds(accountIds: string[]): string[] {
    return Array.from(new Set(accountIds.map((id) => id.trim()).filter(Boolean)));
  }

  private activeAccountsKey(accountIds: string[]): string {
    return this.normalizeActiveAccountIds(accountIds).join(',');
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Already connected — no-op
      if (this.socket?.connected) { resolve(); return; }
      // Socket exists but still connecting — wait for it instead of creating another
      if (this.socket) {
        this.socket.once('connect', () => resolve());
        this.socket.once('connect_error', (err: Error) => reject(err));
        return;
      }

      const token = authService.getToken();
      if (!token && !authService.isDevMode()) {
        reject(new Error('No auth token for Better socket'));
        return;
      }

      this.socket = io(BETTER_URL, {
        auth: { token: token || '' },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });

      const onConnect = () => {
        this.setConnected(true);
        this.flushPendingBalanceSubs();
        resolve();
      };

      const onError = (err: Error) => {
        this.socket?.off('connect', onConnect);
        reject(err);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);

      this.socket.on('connect', () => {
        this.setConnected(true);
        this.flushPendingBalanceSubs();
        this.flushActiveAccounts();
      });
      this.socket.on('disconnect', (reason: string) => {
        this.setConnected(false);
        // Socket.IO does NOT auto-reconnect after 'io server disconnect'.
        // Force reconnect so copy trading / bets resume after backend restart.
        if (reason === 'io server disconnect') {
          console.log('[BetterSocket] Server-initiated disconnect — forcing reconnect…');
          this.socket?.connect();
        }
      });

      /* ─── Bet events ─── */
      this.socket.on('bet_placed', (data: BetPlacedEvent) => {
        console.debug('[BetterSocket] bet_placed received:', data.asset, data.bet_id, 'is_demo:', data.is_demo, 'is_copy_trade:', data.is_copy_trade, 'account_id:', data.account_id, 'listeners:', this.betPlacedListeners.size);
        this.consumePendingPlaceBetRequest((request) => (
          request.params.is_demo === data.is_demo
          && request.params.asset === data.asset
          && request.params.direction === data.direction
          && (!data.account_id || request.params.account_id === data.account_id)
        ));
        this.betPlacedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('bet_result', (data: BetResultEvent) => {
        console.debug('[BetterSocket] bet_result received:', data.asset, data.bet_id, data.result, data.profit);
        this.betResultListeners.forEach((cb) => cb(data));
      });

      // Server may send bet_result_update instead of/alongside bet_result
      this.socket.on('bet_result_update', (data: BetResultUpdatePayload) => {
        console.debug('[BetterSocket] bet_result_update received:', data.asset, data.trade_id, data.result, data.profit);
        // Normalize to BetResultEvent shape (bet_result_update may lack bet_id, amount, direction, balance_after)
        const normalized: BetResultEvent = {
          bet_id: data.bet_id || '',
          trade_id: data.trade_id || '',
          asset: data.asset || '',
          amount: data.amount ?? 0,
          direction: data.direction ?? 'call',
          is_demo: data.is_demo ?? false,
          result: data.result,
          profit: data.profit ?? 0,
          balance_after: data.balance_after ?? 0,
          resolved_at: data.resolved_at || new Date().toISOString(),
          account_id: data.account_id || undefined,
        };
        this.betResultListeners.forEach((cb) => cb(normalized));
      });

      this.socket.on('po_order_opened', (data: PoOrderOpenedEvent) => {
        const receivedAtMs = Date.now();
        this.updateServerTimeOffsetFromIso(data.timestamp, receivedAtMs);
        console.debug('[BetterSocket] po_order_opened received:', data.account_id, 'asset:', data.po_data?.asset, 'is_demo:', data.is_demo, 'openPrice:', data.po_data?.openPrice);
        // Cache entry price from ALL po_order_opened events (any account) for later lookup
        if (data.po_data?.id && data.po_data.openPrice != null) {
          this.entryPriceCache.set(data.po_data.id, data.po_data.openPrice);
        }
        this.poOrderOpenedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('po_order_closed', (data: PoOrderClosedEvent) => {
        this.updateServerTimeOffsetFromIso(data.timestamp);
        console.debug('[BetterSocket] po_order_closed received:', data.trade_id, data.result, data.profit);
        this.poOrderClosedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('bet_error', (data: BetErrorEvent) => {
        const request = this.consumePendingPlaceBetRequest();
        const shouldPreserveAuthError = isBetterAuthStatusPayload(data as unknown);
        const enriched: BetErrorEvent = {
          ...data,
          original_error: data.error,
          error: shouldPreserveAuthError ? data.error : buildReadableBetError(data.error, request),
          request: request
            ? { ...request.params, requested_at: new Date(request.requestedAt).toISOString() }
            : undefined,
        };
        console.warn('[BetterSocket] bet_error received:', {
          bet_id: enriched.bet_id,
          original_error: enriched.original_error,
          request: enriched.request,
        });
        this.betErrorListeners.forEach((cb) => cb(enriched));
      });

      /* ─── Balance events ─── */
      this.socket.on('connections_ready', (data: ConnectionsReadyEvent) => {
        this._connectionsReady = true;
        this.connectionsReadyListeners.forEach((cb) => cb(data));
      });

      this.socket.on('balance_update', (data: BalanceUpdateEvent) => {
        this.updateServerTimeOffsetFromIso(data.timestamp);
        this.balanceUpdateListeners.forEach((cb) => cb(data));
      });

      this.socket.on('balance_changed', (data: BalanceChangedEvent) => {
        this.updateServerTimeOffsetFromIso(data.timestamp);
        this.balanceChangedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('balance_error', (data: BalanceErrorEvent) => {
        this.balanceErrorListeners.forEach((cb) => cb(data));
      });

      this.socket.on('po_auth_status', (data: AuthStatusEvent) => {
        this.authStatusListeners.forEach((cb) => cb({
          ...data,
          message: data.message ?? data.error,
          error: data.error ?? data.message,
        }));
      });

      this.socket.on('error', (data: unknown) => {
        const payload = (data && typeof data === 'object'
          ? data
          : { error: typeof data === 'string' ? data : 'Socket error' }) as SocketErrorEvent;
        this.socketErrorListeners.forEach((cb) => cb({
          ...payload,
          message: payload.message ?? payload.error,
          error: payload.error ?? payload.message,
        }));
      });

      this.socket.on('active_accounts_updated', (data: ActiveAccountsUpdatedEvent) => {
        this.activeAccountsUpdatedListeners.forEach((cb) => cb(data));
      });

      /* ─── PO connection events ─── */
      this.socket.on('po_connecting', (data: PoConnectionEvent) => {
        this.poConnectingListeners.forEach((cb) => cb(data));
      });

      this.socket.on('po_connected', (data: PoConnectionEvent) => {
        this.poConnectedListeners.forEach((cb) => cb(data));
      });

      this.socket.on('po_connection_error', (data: PoConnectionEvent) => {
        this.poConnectionErrorListeners.forEach((cb) => cb(data));
      });

      /* ─── PO Assets event ─── */
      this.socket.on('po_assets', (data: PoAssetsEvent) => {
        this._poAssets.clear();
        for (const a of data.assets) {
          this._poAssets.set(a.symbol, a);
        }
        this.poAssetsListeners.forEach((cb) => cb(data));
      });

      /* ─── Account data updated ─── */
      this.socket.on('account_data_updated', (data: AccountDataUpdatedEvent) => {
        this.accountDataUpdatedListeners.forEach((cb) => cb(data));
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.setConnected(false);
  }

  /* ─── Bet actions ─── */

  /** Place a bet via Socket.IO */
  placeBet(params: PlaceBetParams): PlaceBetEmitResult {
    if (!this.socket?.connected) {
      const engine = this.socket?.io.engine;
      console.error('[BetterSocket] placeBet: socket not connected', {
        socketExists: !!this.socket,
        connected: this.socket?.connected,
        readyState: engine?.readyState,
      });
      return { ok: false, error: 'Better socket not connected' };
    }

    if (!params.account_id) {
      console.error('[BetterSocket] Refusing to emit place_bet without account_id');
      return { ok: false, error: 'Account is required' };
    }

    if (!params.asset) {
      console.error('[BetterSocket] Refusing to emit place_bet without asset');
      return { ok: false, error: 'Asset is required' };
    }
    const amount = Number.isFinite(params.amount) ? Math.round(params.amount * 100) / 100 : NaN;
    const duration = Number.isFinite(params.duration) ? Math.round(params.duration) : NaN;

    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('[BetterSocket] Refusing to emit place_bet with invalid amount:', params.amount);
      return { ok: false, error: 'Invalid amount' };
    }

    if (!Number.isFinite(duration) || duration < 5) {
      console.error('[BetterSocket] Refusing to emit place_bet with invalid duration:', params.duration);
      return { ok: false, error: 'Invalid duration' };
    }

    const request: PlaceBetParams = {
      ...params,
      amount,
      duration,
    };

    this.pendingPlaceBetRequests.push({ params: request, requestedAt: this.getServerNowMs() });
    if (this.pendingPlaceBetRequests.length > 10) {
      this.pendingPlaceBetRequests.splice(0, this.pendingPlaceBetRequests.length - 10);
    }

    console.debug('[BetterSocket] emitting place_bet:', {
      account_id: request.account_id,
      asset: request.asset,
      amount: request.amount,
      direction: request.direction,
      duration: request.duration,
      is_demo: request.is_demo,
      timestamp: new Date().toISOString(),
    });

    this.socket.emit('place_bet', request);
    return { ok: true, request };
  }

  private consumePendingPlaceBetRequest(
    matcher?: (request: PendingPlaceBetRequest) => boolean,
  ): PendingPlaceBetRequest | undefined {
    const now = Date.now();
    for (let index = this.pendingPlaceBetRequests.length - 1; index >= 0; index -= 1) {
      const request = this.pendingPlaceBetRequests[index];
      if (now - request.requestedAt > 15000) {
        this.pendingPlaceBetRequests.splice(index, 1);
        continue;
      }
      if (!matcher || matcher(request)) {
        this.pendingPlaceBetRequests.splice(index, 1);
        return request;
      }
    }
    return undefined;
  }

  peekPendingPlaceBetRequest(
    matcher?: (request: PendingPlaceBetSnapshot) => boolean,
  ): PendingPlaceBetSnapshot | undefined {
    const now = Date.now();
    for (let index = this.pendingPlaceBetRequests.length - 1; index >= 0; index -= 1) {
      const request = this.pendingPlaceBetRequests[index];
      if (now - request.requestedAt > 15000) {
        continue;
      }
      const snapshot: PendingPlaceBetSnapshot = {
        ...request.params,
        requestedAt: request.requestedAt,
      };
      if (!matcher || matcher(snapshot)) {
        return snapshot;
      }
    }
    return undefined;
  }

  /* ─── Balance subscription ─── */

  /** Subscribe to real-time balance updates for an account */
  subscribeBalance(accountId: string, isDemo: boolean): void {
    const key = `${accountId}:${isDemo}`;
    const prev = this.balanceSubRefCounts.get(key) ?? 0;
    this.balanceSubRefCounts.set(key, prev + 1);
    if (prev > 0) return;
    if (!this.socket?.connected) return;
    this.socket.emit('subscribe_balance', { account_id: accountId, is_demo: isDemo });
  }

  /** Unsubscribe from balance updates */
  unsubscribeBalance(accountId: string, isDemo: boolean): void {
    const key = `${accountId}:${isDemo}`;
    const prev = this.balanceSubRefCounts.get(key) ?? 0;
    if (prev <= 1) this.balanceSubRefCounts.delete(key);
    else this.balanceSubRefCounts.set(key, prev - 1);
    if (prev > 1) return;
    if (!this.socket?.connected) return;
    this.socket.emit('unsubscribe_balance', { account_id: accountId, is_demo: isDemo });
  }

  /** Flush pending balance subscriptions after (re)connect */
  private flushPendingBalanceSubs(): void {
    if (!this.socket?.connected || this.balanceSubRefCounts.size === 0) return;
    for (const key of this.balanceSubRefCounts.keys()) {
      const [accountId, isDemoStr] = key.split(':');
      this.socket.emit('subscribe_balance', { account_id: accountId, is_demo: isDemoStr === 'true' });
    }
  }

  /** Re-emit set_active_accounts after (re)connect */
  private flushActiveAccounts(): void {
    if (!this.socket?.connected || this.activeAccountIds.length === 0) return;
    this.socket.emit('set_active_accounts', { account_ids: this.activeAccountIds });
    this.lastEmittedActiveAccountsKey = this.activeAccountsKey(this.activeAccountIds);
  }

  /** Tell the server which accounts this tab is using (filters bet/order events server-side) */
  setActiveAccounts(accountIds: string[]): void {
    const normalizedIds = this.normalizeActiveAccountIds(accountIds);
    const nextKey = this.activeAccountsKey(normalizedIds);
    const currentKey = this.activeAccountsKey(this.activeAccountIds);
    this.activeAccountIds = normalizedIds;
    if (!this.socket?.connected) return;
    if (nextKey === currentKey && nextKey === this.lastEmittedActiveAccountsKey) return;
    this.socket.emit('set_active_accounts', { account_ids: normalizedIds });
    this.lastEmittedActiveAccountsKey = nextKey;
    console.debug('[BetterSocket] set_active_accounts:', normalizedIds);
  }

  /** Get cached entry price by trade_id (from po_order_opened). */
  getCachedEntryPrice(tradeId: string): number | undefined {
    return this.entryPriceCache.get(tradeId);
  }

  /** Cache entry price for a trade_id (e.g. from bet_placed po_data). */
  cacheEntryPrice(tradeId: string, price: number): void {
    this.entryPriceCache.set(tradeId, price);
  }

  /* ─── Bet event listeners ─── */

  onBetPlaced(cb: BetPlacedCallback): () => void {
    this.betPlacedListeners.add(cb);
    return () => { this.betPlacedListeners.delete(cb); };
  }

  onBetResult(cb: BetResultCallback): () => void {
    this.betResultListeners.add(cb);
    return () => { this.betResultListeners.delete(cb); };
  }

  onPoOrderOpened(cb: PoOrderOpenedCallback): () => void {
    this.poOrderOpenedListeners.add(cb);
    return () => { this.poOrderOpenedListeners.delete(cb); };
  }

  onPoOrderClosed(cb: PoOrderClosedCallback): () => void {
    this.poOrderClosedListeners.add(cb);
    return () => { this.poOrderClosedListeners.delete(cb); };
  }

  onBetError(cb: BetErrorCallback): () => void {
    this.betErrorListeners.add(cb);
    return () => { this.betErrorListeners.delete(cb); };
  }

  onConnectionChange(cb: ConnectionCallback): () => void {
    this.connectionListeners.add(cb);
    cb(this._connected);
    return () => { this.connectionListeners.delete(cb); };
  }

  /* ─── Balance event listeners ─── */

  onBalanceUpdate(cb: BalanceUpdateCallback): () => void {
    this.balanceUpdateListeners.add(cb);
    return () => { this.balanceUpdateListeners.delete(cb); };
  }

  onBalanceChanged(cb: BalanceChangedCallback): () => void {
    this.balanceChangedListeners.add(cb);
    return () => { this.balanceChangedListeners.delete(cb); };
  }

  onBalanceError(cb: BalanceErrorCallback): () => void {
    this.balanceErrorListeners.add(cb);
    return () => { this.balanceErrorListeners.delete(cb); };
  }

  onAuthStatus(cb: AuthStatusCallback): () => void {
    this.authStatusListeners.add(cb);
    return () => { this.authStatusListeners.delete(cb); };
  }

  onSocketError(cb: SocketErrorCallback): () => void {
    this.socketErrorListeners.add(cb);
    return () => { this.socketErrorListeners.delete(cb); };
  }

  onConnectionsReady(cb: ConnectionsReadyCallback): () => void {
    this.connectionsReadyListeners.add(cb);
    if (this._connectionsReady) cb({ message: 'Already ready' });
    return () => { this.connectionsReadyListeners.delete(cb); };
  }

  onActiveAccountsUpdated(cb: ActiveAccountsUpdatedCallback): () => void {
    this.activeAccountsUpdatedListeners.add(cb);
    return () => { this.activeAccountsUpdatedListeners.delete(cb); };
  }

  /* ─── PO connection event listeners ─── */

  onPoConnecting(cb: PoConnectionCallback): () => void {
    this.poConnectingListeners.add(cb);
    return () => { this.poConnectingListeners.delete(cb); };
  }

  onPoConnected(cb: PoConnectionCallback): () => void {
    this.poConnectedListeners.add(cb);
    return () => { this.poConnectedListeners.delete(cb); };
  }

  onPoConnectionError(cb: PoConnectionCallback): () => void {
    this.poConnectionErrorListeners.add(cb);
    return () => { this.poConnectionErrorListeners.delete(cb); };
  }

  /* ─── PO Assets ─── */

  onPoAssets(cb: PoAssetsCallback): () => void {
    this.poAssetsListeners.add(cb);
    // If assets already loaded, fire immediately
    if (this._poAssets.size > 0) {
      cb({ assets: Array.from(this._poAssets.values()), total: this._poAssets.size });
    }
    return () => { this.poAssetsListeners.delete(cb); };
  }

  /** Get asset info by symbol (e.g. "EURUSD_otc") */
  getPoAsset(symbol: string): PoAsset | undefined {
    return this._poAssets.get(symbol);
  }

  /** Resolve the actual PO asset symbol from raw/UI candidates. */
  resolvePoAssetSymbol(candidates: Array<string | null | undefined>): string | undefined {
    const normalizedCandidates = Array.from(new Set(
      candidates
        .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
        .filter(Boolean),
    ));

    if (normalizedCandidates.length === 0 || this._poAssets.size === 0) return undefined;

    for (const candidate of normalizedCandidates) {
      const exact = Array.from(this._poAssets.keys()).find((symbol) => symbol.toUpperCase() === candidate.toUpperCase());
      if (exact) return exact;
    }

    const poAssetEntries = Array.from(this._poAssets.keys()).map((symbol) => ({
      symbol,
      hasOtc: hasOtcMarker(symbol),
      keys: new Set(buildPoAssetLookupKeys(symbol)),
    }));

    for (const candidate of normalizedCandidates) {
      const candidateHasOtc = hasOtcMarker(candidate);
      const candidateKeys = buildPoAssetLookupKeys(candidate);
      if (candidateKeys.length === 0) continue;

      for (const entry of poAssetEntries) {
        if (candidateHasOtc !== entry.hasOtc && (candidateHasOtc || entry.hasOtc)) {
          continue;
        }

        if (candidateKeys.some((key) => entry.keys.has(key))) {
          return entry.symbol;
        }
      }
    }

    return undefined;
  }

  /* ─── Account data updated ─── */

  onAccountDataUpdated(cb: (data: AccountDataUpdatedEvent) => void): () => void {
    this.accountDataUpdatedListeners.add(cb);
    return () => { this.accountDataUpdatedListeners.delete(cb); };
  }
}

export const betterSocket = new BetterSocketService();
