/**
 * Terminal Auth API client.
 * Registration, login, password reset & change for PO Terminal users.
 */

import { API_BASE, TOKEN_KEY } from "../../config";
import routes from "../../../configs/routes";
import { authService } from "../../../services/auth";
import type {
  AuthResponse,
  LoginResult,
  TwoFactorChallenge,
  UserProfile,
} from "../types/auth";
import { isTwoFactorChallenge } from "../types/auth";

export type {
  AuthResponse,
  LoginResult,
  TwoFactorChallenge,
  UserProfile,
} from "../types/auth";
export { hasTwoFactorChallengeSignal, isTwoFactorChallenge } from "../types/auth";

/* ─── Token helpers ─── */

export interface BotLinksData {
  bot_username: string;
  ref_code: string | null;
  ru_link: string;
  others_link: string;
  telegram_link: string;
}

interface BotLinksApiResponse {
  status?: boolean;
  data?: Partial<BotLinksData>;
  error_message?: string;
}

interface BotLinksCacheEntry {
  ts: number;
  data: BotLinksData;
}

export const DEFAULT_BOT_USERNAME = "trader_start_bot";
export const BOT_REF_STORAGE_KEY = "site-bot-ref";
export const PENDING_POCKET_ID_KEY = "site-pending-pocket-id";
const BOT_LINKS_CACHE_PREFIX = "site-bot-links:";
const BOT_LINKS_CACHE_TTL_MS = 30 * 60_000;
const DEFAULT_POCKET_LINK = "https://pocket-option.com";
const DEFAULT_TELEGRAM_LINK = `https://t.me/${DEFAULT_BOT_USERNAME}`;

export const DEFAULT_BOT_LINKS: BotLinksData = {
  bot_username: DEFAULT_BOT_USERNAME,
  ref_code: null,
  ru_link: DEFAULT_POCKET_LINK,
  others_link: DEFAULT_POCKET_LINK,
  telegram_link: DEFAULT_TELEGRAM_LINK,
};

const botLinksMemoryCache = new Map<string, BotLinksCacheEntry>();
const botLinksInflight = new Map<string, Promise<BotLinksData>>();

function normalizeBotIdentifier(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function buildBotLinksCacheKey(bot: string): string {
  return `${BOT_LINKS_CACHE_PREFIX}${bot}`;
}

function normalizeBotLinks(data?: Partial<BotLinksData>): BotLinksData {
  const botUsername = normalizeBotIdentifier(data?.bot_username) || DEFAULT_BOT_USERNAME;
  const ruLink = typeof data?.ru_link === "string" && data.ru_link.trim()
    ? data.ru_link.trim()
    : DEFAULT_POCKET_LINK;
  const othersLink = typeof data?.others_link === "string" && data.others_link.trim()
    ? data.others_link.trim()
    : ruLink;

  return {
    bot_username: botUsername,
    ref_code: normalizeBotIdentifier(data?.ref_code) || null,
    ru_link: ruLink,
    others_link: othersLink,
    telegram_link: typeof data?.telegram_link === "string" && data.telegram_link.trim()
      ? data.telegram_link.trim()
      : `https://t.me/${botUsername}`,
  };
}

function readBotLinksCache(bot: string): BotLinksData | null {
  const normalizedBot = normalizeBotIdentifier(bot);
  if (!normalizedBot) return null;

  const memoryHit = botLinksMemoryCache.get(normalizedBot);
  if (memoryHit && Date.now() - memoryHit.ts < BOT_LINKS_CACHE_TTL_MS) {
    return memoryHit.data;
  }

  try {
    const raw = localStorage.getItem(buildBotLinksCacheKey(normalizedBot));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as BotLinksCacheEntry;
    if (!parsed || typeof parsed.ts !== "number" || !parsed.data) return null;
    if (Date.now() - parsed.ts >= BOT_LINKS_CACHE_TTL_MS) return null;

    const normalized = normalizeBotLinks(parsed.data);
    botLinksMemoryCache.set(normalizedBot, { ts: parsed.ts, data: normalized });
    return normalized;
  } catch {
    return null;
  }
}

function writeBotLinksCache(bot: string, data: BotLinksData): void {
  const normalizedBot = normalizeBotIdentifier(bot);
  if (!normalizedBot) return;

  const entry: BotLinksCacheEntry = { ts: Date.now(), data };
  botLinksMemoryCache.set(normalizedBot, entry);

  try {
    localStorage.setItem(buildBotLinksCacheKey(normalizedBot), JSON.stringify(entry));
  } catch {
    /* private mode */
  }
}

export function getStoredBotRef(): string | null {
  return normalizeBotIdentifier(getStoredAffiliateTracking().ref_code) || null;
}

export function setStoredBotRef(ref: string): void {
  const normalizedRef = normalizeBotIdentifier(ref);
  if (!normalizedRef) return;

  persistAffiliateTracking({
    ...getStoredAffiliateTracking(),
    ref_code: normalizedRef,
  });
}

export function captureBotRefFromSearch(search: string): string | null {
  return normalizeBotIdentifier(captureAffiliateTrackingFromSearch(search).ref_code) || null;
}

export function getPreferredBotIdentifier(search?: string): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : null;
  const fromSearch = normalizeBotIdentifier(params?.get("ref") ?? params?.get("ref_uid") ?? null);
  if (fromSearch) return fromSearch;
  return getStoredBotRef() || DEFAULT_BOT_USERNAME;
}

async function requestBotLinks(bot: string): Promise<BotLinksData> {
  const res = await fetch(`${API_BASE}/v1/get_bot_links_by_ref_code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot }),
  });

  const json = (await res.json().catch(() => ({}))) as BotLinksApiResponse;

  if (!res.ok) {
    const message = json.error_message ?? `Ошибка ${res.status}`;
    throw new ApiError(message, res.status);
  }

  if (!json.status || !json.data) {
    throw new ApiError(json.error_message ?? "Bot not found", res.status || 404);
  }

  const data = normalizeBotLinks(json.data);
  if (data.ref_code) setStoredBotRef(data.ref_code);
  writeBotLinksCache(bot, data);
  if (data.ref_code) writeBotLinksCache(data.ref_code, data);
  if (data.bot_username) writeBotLinksCache(data.bot_username, data);
  return data;
}

export async function getBotLinks(bot: string): Promise<BotLinksData> {
  const normalizedBot = normalizeBotIdentifier(bot) || DEFAULT_BOT_USERNAME;
  const cached = readBotLinksCache(normalizedBot);
  if (cached) return cached;

  const inflight = botLinksInflight.get(normalizedBot);
  if (inflight) return inflight;

  const request = requestBotLinks(normalizedBot).finally(() => {
    botLinksInflight.delete(normalizedBot);
  });
  botLinksInflight.set(normalizedBot, request);
  return request;
}

export async function getResolvedBotLinks(bot?: string): Promise<BotLinksData> {
  const preferredBot = normalizeBotIdentifier(bot) || DEFAULT_BOT_USERNAME;

  try {
    return await getBotLinks(preferredBot);
  } catch {
    if (preferredBot === DEFAULT_BOT_USERNAME) return DEFAULT_BOT_LINKS;
    try {
      return await getBotLinks(DEFAULT_BOT_USERNAME);
    } catch {
      return DEFAULT_BOT_LINKS;
    }
  }
}

export function getPocketOptionLink(links: BotLinksData): string {
  return links.ru_link || links.others_link || DEFAULT_BOT_LINKS.ru_link;
}

export function getTelegramBotLink(links: BotLinksData): string {
  return links.telegram_link || DEFAULT_BOT_LINKS.telegram_link;
}

export function getTerminalToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const AUTH_CHANGED_EVENT = "auth:changed";

function emitAuthChanged(): void {
  try {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  } catch {
    /* SSR / non-browser */
  }
}

export function setTerminalToken(token: string): void {
  authService.setToken(token);
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem("tc_auth_token", token);
  } catch {
    /* private mode */
  }
  emitAuthChanged();
}

export function clearTerminalToken(): void {
  authService.logout();
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("tc_auth_token");
    localStorage.removeItem(PENDING_POCKET_ID_KEY);
    localStorage.removeItem("site-pending-deposit-link");
  } catch {
    /* private mode */
  }
  emitAuthChanged();
}

function expireCookie(name: string, domain?: string): void {
  const encodedName = encodeURIComponent(name);
  const domainPart = domain ? `; domain=${domain}` : "";
  document.cookie = `${encodedName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}`;
}

function readCookie(name: string): string | null {
  const encodedName = `${encodeURIComponent(name)}=`;
  const chunk = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(encodedName));

  if (!chunk) return null;

  try {
    return decodeURIComponent(chunk.slice(encodedName.length));
  } catch {
    return chunk.slice(encodedName.length);
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function resetSiteSession(): void {
  clearTerminalToken();

  try {
    const removableKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (key.startsWith("tc_") || key.startsWith("site-") || key === "pocket_id") {
        removableKeys.push(key);
      }
    }
    removableKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* private mode */
  }

  try {
    sessionStorage.clear();
  } catch {
    /* private mode */
  }

  try {
    const cookieNames = document.cookie
      .split(";")
      .map((item) => item.trim().split("=")[0])
      .filter(Boolean)
      .map((name) => decodeURIComponent(name));
    const host = window.location.hostname;
    const domains = Array.from(new Set([
      undefined,
      host,
      host.startsWith(".") ? host : `.${host}`,
      ...host.split(".").slice(1).map((_, index, parts) => `.${parts.slice(index).join(".")}`),
    ]));

    cookieNames.forEach((name) => {
      domains.forEach((domain) => expireCookie(name, domain));
    });
  } catch {
    /* ignore cookie cleanup failures */
  }
}

export function resetSiteSessionAndRedirectToLogin(): void {
  resetSiteSession();
  window.location.assign(routes.Login);
}

export function getStoredPendingPocketId(): string | null {
  try {
    const value = localStorage.getItem(PENDING_POCKET_ID_KEY)?.trim() ?? "";
    return value || null;
  } catch {
    return null;
  }
}

export function setStoredPendingPocketId(pocketId: string): void {
  const normalized = pocketId.trim();
  if (!normalized) return;

  try {
    localStorage.setItem(PENDING_POCKET_ID_KEY, normalized);
  } catch {
    /* private mode */
  }
}

export function clearStoredPendingPocketId(): void {
  try {
    localStorage.removeItem(PENDING_POCKET_ID_KEY);
  } catch {
    /* private mode */
  }
}

/* ─── Pending deposit link (after v2 register / 403 deposit-required) ─── */

const PENDING_DEPOSIT_LINK_KEY = "site-pending-deposit-link";

export function getStoredDepositLink(): string | null {
  try {
    const value = localStorage.getItem(PENDING_DEPOSIT_LINK_KEY)?.trim() ?? "";
    return value || null;
  } catch {
    return null;
  }
}

export function setStoredDepositLink(link: string): void {
  const normalized = link.trim();
  if (!normalized) return;
  try {
    localStorage.setItem(PENDING_DEPOSIT_LINK_KEY, normalized);
  } catch {
    /* private mode */
  }
}

export function clearStoredDepositLink(): void {
  try {
    localStorage.removeItem(PENDING_DEPOSIT_LINK_KEY);
  } catch {
    /* private mode */
  }
}

export function hasPendingRegisterStep2Context(): boolean {
  return Boolean(getStoredPendingPocketId() || getStoredDepositLink());
}

/* ─── UTM capture (for v2 register) ─── */

const UTM_STORAGE_KEY = "site-utm";
const AFFILIATE_TRACKING_STORAGE_KEY = "site-affiliate-tracking";
const AFFILIATE_TRACKING_COOKIE_KEY = "site-affiliate-tracking";
const AFFILIATE_TRACKING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const AFFILIATE_VISITOR_ID_STORAGE_KEY = "site-affiliate-visitor-id";
const AFFILIATE_VISITOR_ID_COOKIE_KEY = "site-affiliate-visitor-id";
const AFFILIATE_VISITOR_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface UtmTags {
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface AffiliateTrackingOptions {
  ref_code?: string;
  bot?: string;
  al?: string;
  click_id?: string;
  site_id?: string;
  sub_id1?: string;
  sub_id2?: string;
  sub_id3?: string;
  sub_id4?: string;
  sub_id5?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
}

const UTM_KEYS: (keyof UtmTags)[] = [
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
];

const AFFILIATE_TRACKING_KEYS: (keyof AffiliateTrackingOptions)[] = [
  "ref_code",
  "bot",
  "al",
  "click_id",
  "site_id",
  "sub_id1",
  "sub_id2",
  "sub_id3",
  "sub_id4",
  "sub_id5",
  ...UTM_KEYS,
];

const AFFILIATE_QUERY_KEYS = [
  "ref",
  "ref_uid",
  "bot",
  "al",
  "click_id",
  "site_id",
  "sub_id1",
  "sub_id2",
  "sub_id3",
  "sub_id4",
  "sub_id5",
  ...UTM_KEYS,
] as const;

const AFFILIATE_VISIT_QUERY_KEYS = [
  "ref",
  "ref_uid",
  "al",
  "click_id",
  "site_id",
  "sub_id1",
  "sub_id2",
  "sub_id3",
  "sub_id4",
  "sub_id5",
] as const;

function normalizeTrackingValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function pickUtmTags(tracking: Partial<AffiliateTrackingOptions>): UtmTags {
  const utm: UtmTags = {};
  for (const key of UTM_KEYS) {
    const value = normalizeTrackingValue(tracking[key]);
    if (value) utm[key] = value;
  }
  return utm;
}

export function hasAffiliateTrackingContext(tracking: Partial<AffiliateTrackingOptions>): boolean {
  return Boolean(
    tracking.ref_code ||
    tracking.al ||
    tracking.click_id ||
    tracking.site_id ||
    tracking.sub_id1 ||
    tracking.sub_id2 ||
    tracking.sub_id3 ||
    tracking.sub_id4 ||
    tracking.sub_id5,
  );
}

function buildAffiliateVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `aff_${Date.now().toString(36)}_${randomPart}`;
}

export function persistAffiliateVisitorId(visitorId: string): string {
  const normalized = visitorId.trim();
  if (!normalized) return "";

  try {
    localStorage.setItem(AFFILIATE_VISITOR_ID_STORAGE_KEY, normalized);
  } catch {
    /* private mode */
  }

  try {
    writeCookie(AFFILIATE_VISITOR_ID_COOKIE_KEY, normalized, AFFILIATE_VISITOR_ID_COOKIE_MAX_AGE_SECONDS);
  } catch {
    /* cookie write errors */
  }

  return normalized;
}

export function getStoredAffiliateVisitorId(): string | null {
  try {
    const localValue = localStorage.getItem(AFFILIATE_VISITOR_ID_STORAGE_KEY)?.trim();
    if (localValue) return localValue;
  } catch {
    /* private mode */
  }

  try {
    const cookieValue = readCookie(AFFILIATE_VISITOR_ID_COOKIE_KEY)?.trim();
    if (cookieValue) return cookieValue;
  } catch {
    /* cookie read errors */
  }

  return null;
}

export function ensureAffiliateVisitorId(): string {
  const stored = getStoredAffiliateVisitorId();
  if (stored) return stored;
  return persistAffiliateVisitorId(buildAffiliateVisitorId());
}

export function hasAffiliateVisitSearchParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return AFFILIATE_VISIT_QUERY_KEYS.some((key) => Boolean(params.get(key)?.trim()));
}

function normalizeAffiliateTracking(tracking: Partial<AffiliateTrackingOptions>): AffiliateTrackingOptions {
  const normalized: AffiliateTrackingOptions = {};

  for (const key of AFFILIATE_TRACKING_KEYS) {
    const value = normalizeTrackingValue(tracking[key]);
    if (!value) continue;
    if (key === "ref_code" || key === "bot") {
      const identifier = normalizeBotIdentifier(value);
      if (identifier) normalized[key] = identifier;
      continue;
    }
    normalized[key] = value;
  }

  if (hasAffiliateTrackingContext(normalized)) {
    if (!normalized.utm_source) normalized.utm_source = "affiliate";
    if (!normalized.utm_medium) normalized.utm_medium = "sr";
    if (!normalized.utm_campaign && normalized.ref_code) {
      normalized.utm_campaign = normalized.ref_code;
    }
  }

  return normalized;
}

function readLegacyStoredBotRef(): string | null {
  try {
    return normalizeBotIdentifier(localStorage.getItem(BOT_REF_STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function readLegacyStoredUtm(): UtmTags {
  try {
    const raw = localStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const result: UtmTags = {};
    for (const key of UTM_KEYS) {
      const value = normalizeTrackingValue((parsed as Record<string, unknown>)[key]);
      if (value) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function readStoredAffiliateTrackingFromLocalStorage(): Partial<AffiliateTrackingOptions> {
  try {
    const raw = localStorage.getItem(AFFILIATE_TRACKING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<AffiliateTrackingOptions>;
  } catch {
    return {};
  }
}

function readStoredAffiliateTrackingFromCookie(): Partial<AffiliateTrackingOptions> {
  try {
    const raw = readCookie(AFFILIATE_TRACKING_COOKIE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<AffiliateTrackingOptions>;
  } catch {
    return {};
  }
}

function persistAffiliateTracking(tracking: Partial<AffiliateTrackingOptions>): AffiliateTrackingOptions {
  const normalized = normalizeAffiliateTracking(tracking);

  try {
    localStorage.setItem(AFFILIATE_TRACKING_STORAGE_KEY, JSON.stringify(normalized));
    if (normalized.ref_code) {
      localStorage.setItem(BOT_REF_STORAGE_KEY, normalized.ref_code);
    } else {
      localStorage.removeItem(BOT_REF_STORAGE_KEY);
    }

    const utm = pickUtmTags(normalized);
    if (Object.keys(utm).length > 0) {
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
    } else {
      localStorage.removeItem(UTM_STORAGE_KEY);
    }
  } catch {
    /* private mode */
  }

  try {
    writeCookie(AFFILIATE_TRACKING_COOKIE_KEY, JSON.stringify(normalized), AFFILIATE_TRACKING_COOKIE_MAX_AGE_SECONDS);
  } catch {
    /* cookie write errors */
  }

  return normalized;
}

export function getStoredAffiliateTracking(): AffiliateTrackingOptions {
  const cookieTracking = readStoredAffiliateTrackingFromCookie();
  const localTracking = readStoredAffiliateTrackingFromLocalStorage();

  return normalizeAffiliateTracking({
    ...cookieTracking,
    ...localTracking,
    ...readLegacyStoredUtm(),
    ref_code: localTracking.ref_code ?? readLegacyStoredBotRef() ?? cookieTracking.ref_code,
  });
}

export function captureAffiliateTrackingFromSearch(search: string): AffiliateTrackingOptions {
  const params = new URLSearchParams(search);
  const hasTrackedParams = AFFILIATE_QUERY_KEYS.some((key) => Boolean(params.get(key)?.trim()));

  if (!hasTrackedParams) return getStoredAffiliateTracking();

  return persistAffiliateTracking({
    ref_code: normalizeBotIdentifier(params.get("ref") ?? params.get("ref_uid")) || undefined,
    bot: normalizeBotIdentifier(params.get("bot")) || undefined,
    al: normalizeTrackingValue(params.get("al")),
    click_id: normalizeTrackingValue(params.get("click_id")),
    site_id: normalizeTrackingValue(params.get("site_id")),
    sub_id1: normalizeTrackingValue(params.get("sub_id1")),
    sub_id2: normalizeTrackingValue(params.get("sub_id2")),
    sub_id3: normalizeTrackingValue(params.get("sub_id3")),
    sub_id4: normalizeTrackingValue(params.get("sub_id4")),
    sub_id5: normalizeTrackingValue(params.get("sub_id5")),
    utm_source: normalizeTrackingValue(params.get("utm_source")),
    utm_campaign: normalizeTrackingValue(params.get("utm_campaign")),
    utm_medium: normalizeTrackingValue(params.get("utm_medium")),
    utm_content: normalizeTrackingValue(params.get("utm_content")),
    utm_term: normalizeTrackingValue(params.get("utm_term")),
  });
}

export function captureUtmFromSearch(search: string): UtmTags {
  return pickUtmTags(captureAffiliateTrackingFromSearch(search));
}

export function getStoredUtm(): UtmTags {
  return pickUtmTags(getStoredAffiliateTracking());
}

/* ─── Helpers ─── */

interface PostResult<T> {
  status: number;
  data: T;
}

async function postRaw<T>(
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<PostResult<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = json.message ?? json.error ?? json.detail ?? `Ошибка ${res.status}`;
    throw new ApiError(message, res.status, json);
  }

  return { status: res.status, data: json as T };
}

async function post<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const { data } = await postRaw<T>(path, body, token);
  return data;
}

export class ApiError extends Error {
  status: number;
  payload?: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

interface DepositRequiredPayload {
  error?: string;
  registered?: boolean;
  deposited?: boolean;
  deposit_link?: string;
  trader_id?: number | string | null;
  po_user_id?: number | string | null;
}

function getPendingPocketId(value: number | string | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }
  return null;
}

function syncAuthSession(data: AuthResponse): void {
  setTerminalToken(data.token);

  if (data.is_confirmed) {
    clearStoredDepositLink();
    clearStoredPendingPocketId();
    return;
  }

  const pocketId = getPendingPocketId(data.trader_id) ?? getPendingPocketId(data.po_user_id);
  if (pocketId) setStoredPendingPocketId(pocketId);
  if (data.deposit_link) setStoredDepositLink(data.deposit_link);
}

export function isDepositRequiredError(error: ApiError): boolean {
  if (error.status !== 403) return false;

  const payload = error.payload as DepositRequiredPayload | undefined;
  return Boolean(payload?.deposit_link) || (payload?.registered === true && payload.deposited === false);
}

export function persistDepositRequiredPayload(error: ApiError): void {
  const payload = error.payload as DepositRequiredPayload | undefined;

  if (payload?.deposit_link) setStoredDepositLink(payload.deposit_link);

  const pocketId = getPendingPocketId(payload?.trader_id) ?? getPendingPocketId(payload?.po_user_id);
  if (pocketId) setStoredPendingPocketId(pocketId);
}

/* ─── API calls (Terminal Auth V2) ─── */

export interface RegisterOptions {
  /** Bot ref code. If omitted, auto-loaded from affiliate tracking storage. */
  ref_code?: string | null;
  bot?: string | null;
  /** Affiliate label/tracking value. */
  al?: string | null;
  click_id?: string | null;
  site_id?: string | null;
  sub_id1?: string | null;
  sub_id2?: string | null;
  sub_id3?: string | null;
  sub_id4?: string | null;
  sub_id5?: string | null;
  /** Override stored UTM tags. */
  utm?: UtmTags;
  /** Optional client IP — typically set by the backend, accepted by API for completeness. */
  ip?: string;
}

export interface GoogleLoginOptions {
  ref_code?: string | null;
  bot?: string | null;
  ip?: string;
  al?: string | null;
  click_id?: string | null;
  site_id?: string | null;
  sub_id1?: string | null;
  sub_id2?: string | null;
  sub_id3?: string | null;
  sub_id4?: string | null;
  sub_id5?: string | null;
  utm?: UtmTags;
}

function resolveTrackingOverride(value: string | null | undefined, storedValue: string | undefined): string | undefined {
  if (value === null) return undefined;
  return normalizeTrackingValue(value) ?? storedValue;
}

function resolveAffiliateTracking(options: RegisterOptions | GoogleLoginOptions): AffiliateTrackingOptions {
  const storedTracking = getStoredAffiliateTracking();

  return normalizeAffiliateTracking({
    ref_code: resolveTrackingOverride(options.ref_code, storedTracking.ref_code),
    bot: resolveTrackingOverride(options.bot, storedTracking.bot),
    al: resolveTrackingOverride(options.al, storedTracking.al),
    click_id: resolveTrackingOverride(options.click_id, storedTracking.click_id),
    site_id: resolveTrackingOverride(options.site_id, storedTracking.site_id),
    sub_id1: resolveTrackingOverride(options.sub_id1, storedTracking.sub_id1),
    sub_id2: resolveTrackingOverride(options.sub_id2, storedTracking.sub_id2),
    sub_id3: resolveTrackingOverride(options.sub_id3, storedTracking.sub_id3),
    sub_id4: resolveTrackingOverride(options.sub_id4, storedTracking.sub_id4),
    sub_id5: resolveTrackingOverride(options.sub_id5, storedTracking.sub_id5),
    utm_source: normalizeTrackingValue(options.utm?.utm_source) ?? storedTracking.utm_source,
    utm_campaign: normalizeTrackingValue(options.utm?.utm_campaign) ?? storedTracking.utm_campaign,
    utm_medium: normalizeTrackingValue(options.utm?.utm_medium) ?? storedTracking.utm_medium,
    utm_content: normalizeTrackingValue(options.utm?.utm_content) ?? storedTracking.utm_content,
    utm_term: normalizeTrackingValue(options.utm?.utm_term) ?? storedTracking.utm_term,
  });
}

export async function registerUser(
  email: string,
  password: string,
  options: RegisterOptions = {},
): Promise<AuthResponse> {
  const tracking = resolveAffiliateTracking(options);

  const body: Record<string, unknown> = { email, password };
  if (tracking.ref_code) body.ref_code = tracking.ref_code;
  if (tracking.al) body.al = tracking.al;
  if (tracking.click_id) body.click_id = tracking.click_id;
  if (tracking.site_id) body.site_id = tracking.site_id;
  if (tracking.sub_id1) body.sub_id1 = tracking.sub_id1;
  if (tracking.sub_id2) body.sub_id2 = tracking.sub_id2;
  if (tracking.sub_id3) body.sub_id3 = tracking.sub_id3;
  if (tracking.sub_id4) body.sub_id4 = tracking.sub_id4;
  if (tracking.sub_id5) body.sub_id5 = tracking.sub_id5;
  if (options.ip) body.ip = options.ip;
  for (const [key, value] of Object.entries(pickUtmTags(tracking))) {
    if (value) body[key] = value;
  }

  const data = await post<AuthResponse>("/api/terminal/v2/register", body);
  syncAuthSession(data);
  return data;
}

/**
 * Logs in a user via PocketOption.
 *
 * Returns either a normal {@link AuthResponse} or a {@link TwoFactorChallenge}
 * (HTTP 202) that the caller must resolve via {@link confirmTwoFactor}.
 *
 * On HTTP 403 (deposit required) the call throws an {@link ApiError} whose
 * payload contains `deposit_link`; callers should redirect the user to step-2.
 */
export async function loginUser(email: string, password: string): Promise<LoginResult> {
  const { status, data } = await postRaw<AuthResponse | TwoFactorChallenge>(
    "/api/terminal/v2/login",
    { email, password },
  );

  if (status === 202 || isTwoFactorChallenge(data)) {
    if (!isTwoFactorChallenge(data)) {
      throw new ApiError('challenge_id is required for 2FA confirmation', status, data);
    }

    const challenge = data;

    return {
      ...challenge,
      requires_2fa: true,
      auth_status: challenge.auth_status ?? 'requires_2fa',
      two_factor_state: challenge.two_factor_state ?? 'required',
      two_factor_enabled: challenge.two_factor_enabled ?? true,
    };
  }

  const auth = data as AuthResponse;
  syncAuthSession(auth);
  return auth;
}

export async function confirmTwoFactor(challengeId: string, code: string): Promise<AuthResponse> {
  const data = await post<AuthResponse>("/api/terminal/v2/confirm-2fa", {
    challenge_id: challengeId,
    code,
  });
  syncAuthSession(data);
  return data;
}

export async function loginWithGoogle(
  idToken: string,
  options: GoogleLoginOptions = {},
): Promise<AuthResponse> {
  const tracking = resolveAffiliateTracking(options);

  const body: Record<string, unknown> = { id_token: idToken };
  if (tracking.ref_code) body.ref_code = tracking.ref_code;
  if (tracking.bot) body.bot = tracking.bot;
  if (options.ip) body.ip = options.ip;
  if (tracking.al) body.al = tracking.al;
  if (tracking.click_id) body.click_id = tracking.click_id;
  if (tracking.site_id) body.site_id = tracking.site_id;
  if (tracking.sub_id1) body.sub_id1 = tracking.sub_id1;
  if (tracking.sub_id2) body.sub_id2 = tracking.sub_id2;
  if (tracking.sub_id3) body.sub_id3 = tracking.sub_id3;
  if (tracking.sub_id4) body.sub_id4 = tracking.sub_id4;
  if (tracking.sub_id5) body.sub_id5 = tracking.sub_id5;
  for (const [key, value] of Object.entries(pickUtmTags(tracking))) {
    if (value) body[key] = value;
  }

  const data = await post<AuthResponse>("/api/terminal/v2/google-login", body);
  syncAuthSession(data);
  return data;
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return post("/api/terminal/v2/forgot-password", { email });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResponse> {
  const token = getTerminalToken();
  if (!token) throw new ApiError("Не авторизован", 401);
  return post(
    "/api/terminal/change-password",
    {
      current_password: currentPassword,
      new_password: newPassword,
    },
    token,
  );
}

export async function fetchProfile(): Promise<UserProfile> {
  const token = getTerminalToken();
  if (!token) throw new ApiError("Не авторизован", 401);

  const res = await fetch(`${API_BASE}/api/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json.message ?? `Ошибка ${res.status}`, res.status);
  }

  return res.json();
}
