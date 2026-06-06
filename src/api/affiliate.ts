import { apiFetch, getApiBaseUrl } from '../services/apiFetch';

export type AffiliatePeriod = 'day' | 'week' | 'month' | 'custom';
export type AffiliateTimelineBucket = 'hour' | 'day';

export interface AffiliateBotSummary {
  bot_username: string;
  ref_code: string | null;
  affiliate_email: string | null;
  affiliate_name: string | null;
  affiliate_access_enabled: boolean;
  partner_link_id: string | null;
  links_count: number;
}

export interface AffiliateMeResponse {
  affiliate: AffiliateBotSummary;
}

export interface AffiliateLink {
  id: string;
  name: string;
  sub_id1: string | null;
  al: string | null;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AffiliateLinkPayload {
  name: string;
  sub_id1?: string | null;
  al?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface AffiliateAnalyticsSummary {
  visits: number;
  unique_visitors: number;
  registrations: number;
  ftd: number;
  registration_rate: number;
  ftd_rate: number;
}

export interface AffiliateTimelinePoint {
  bucket: string;
  visits: number;
  unique_visitors: number;
  registrations: number;
  ftd: number;
}

export interface AffiliateTimelineResponse {
  items: AffiliateTimelinePoint[];
  period?: AffiliatePeriod;
  bucket?: AffiliateTimelineBucket;
  from?: string | null;
  to?: string | null;
}

export interface AffiliateLinkAnalyticsItem extends AffiliateAnalyticsSummary {
  link_id: string | null;
  name: string | null;
  sub_id1: string | null;
  al?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AffiliateLinkAnalyticsResponse {
  items: AffiliateLinkAnalyticsItem[];
}

export interface AffiliateEventItem {
  id?: string;
  event_type: 'visit' | 'registration' | 'ftd' | string;
  created_at: string;
  visitor_id?: string | null;
  trader_id?: number | null;
  registration_email?: string | null;
  link_id?: string | null;
  link_name?: string | null;
  sub_id1?: string | null;
  ref_code?: string | null;
  al?: string | null;
  click_id?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  bot_username?: string | null;
  country?: string | null;
  device_type?: string | null;
  payout?: string | number | null;
}

export interface AffiliateEventsResponse {
  items: AffiliateEventItem[];
}

export interface AffiliateVisitPayload {
  ref_code: string;
  al?: string | null;
  sub_id1?: string | null;
  sub_id2?: string | null;
  sub_id3?: string | null;
  sub_id4?: string | null;
  sub_id5?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  click_id?: string | null;
  site_id?: string | null;
  visitor_id?: string | null;
}

export interface AffiliateVisitResponse {
  success?: boolean;
  visitor_id?: string | null;
  ref_code?: string | null;
  bot_username?: string | null;
  [key: string]: unknown;
}

export interface AffiliateBotScopedParams {
  bot_username?: string;
}

export interface AffiliateAnalyticsParams extends AffiliateBotScopedParams {
  period?: AffiliatePeriod;
  from?: string;
  to?: string;
  link_id?: string;
  sub_id1?: string;
}

type QueryValue = string | number | boolean | null | undefined;

interface AffiliateLinkRaw {
  id?: string | null;
  link_id?: string | null;
  name?: string | null;
  sub_id1?: string | null;
  al?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AffiliateTrackingParamsRaw {
  bot_username?: string | null;
  ref_code?: string | null;
  al?: string | null;
  sub_id1?: string | null;
}

interface AffiliateLinkAnalyticsItemRaw {
  link_id?: string | null;
  name?: string | null;
  sub_id1?: string | null;
  al?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  tracking_params?: AffiliateTrackingParamsRaw | null;
  visits?: number | null;
  unique_visitors?: number | null;
  registrations?: number | null;
  ftd?: number | null;
  registration_rate?: number | null;
  ftd_rate?: number | null;
}

interface AffiliateEventItemRaw {
  id?: string | null;
  event_type?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
  visitor_id?: string | null;
  trader_id?: number | null;
  registration_email?: string | null;
  affiliate_link_id?: string | null;
  affiliate_link_name?: string | null;
  affiliate_sub_id1?: string | null;
  link_id?: string | null;
  sub_id1?: string | null;
  ref_code?: string | null;
  registered_al?: string | null;
  al?: string | null;
  click_id?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  bot_username?: string | null;
  country?: string | null;
  device_type?: string | null;
  payout?: string | number | null;
}

interface AffiliateTimelineResponseRaw {
  items?: AffiliateTimelinePoint[] | null;
  timeline?: AffiliateTimelinePoint[] | null;
  period?: AffiliatePeriod | null;
  bucket?: AffiliateTimelineBucket | null;
  from?: string | null;
  to?: string | null;
}

function normalizeRate(value: number | null | undefined, numerator: number, denominator: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!denominator) return 0;
  return numerator / denominator;
}

function normalizeAffiliateLink(raw: AffiliateLinkRaw): AffiliateLink {
  return {
    id: raw.id ?? raw.link_id ?? raw.sub_id1 ?? raw.name ?? crypto.randomUUID(),
    name: raw.name ?? raw.sub_id1 ?? raw.link_id ?? '—',
    sub_id1: raw.sub_id1 ?? null,
    al: raw.al ?? null,
    description: raw.description ?? null,
    is_active: raw.is_active ?? false,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
  };
}

function normalizeAffiliateLinkAnalyticsItem(raw: AffiliateLinkAnalyticsItemRaw): AffiliateLinkAnalyticsItem {
  const visits = raw.visits ?? 0;
  const registrations = raw.registrations ?? 0;
  const ftd = raw.ftd ?? 0;
  return {
    link_id: raw.link_id ?? raw.sub_id1 ?? raw.name ?? null,
    name: raw.name ?? raw.sub_id1 ?? raw.link_id ?? null,
    sub_id1: raw.sub_id1 ?? raw.tracking_params?.sub_id1 ?? null,
    al: raw.al ?? raw.tracking_params?.al ?? null,
    description: raw.description ?? null,
    is_active: raw.is_active ?? false,
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,
    visits,
    unique_visitors: raw.unique_visitors ?? 0,
    registrations,
    ftd,
    registration_rate: normalizeRate(raw.registration_rate, registrations, visits),
    ftd_rate: normalizeRate(raw.ftd_rate, ftd, registrations),
  };
}

function normalizeAffiliateEventItem(raw: AffiliateEventItemRaw): AffiliateEventItem {
  return {
    id: raw.id ?? undefined,
    event_type: raw.event_type ?? 'visit',
    created_at: raw.created_at ?? raw.timestamp ?? '',
    visitor_id: raw.visitor_id ?? null,
    trader_id: raw.trader_id ?? null,
    registration_email: raw.registration_email ?? null,
    link_id: raw.affiliate_link_id ?? raw.link_id ?? null,
    link_name: raw.affiliate_link_name ?? null,
    sub_id1: raw.affiliate_sub_id1 ?? raw.sub_id1 ?? null,
    ref_code: raw.ref_code ?? null,
    al: raw.registered_al ?? raw.al ?? null,
    click_id: raw.click_id ?? null,
    utm_source: raw.utm_source ?? null,
    utm_campaign: raw.utm_campaign ?? null,
    bot_username: raw.bot_username ?? null,
    country: raw.country ?? null,
    device_type: raw.device_type ?? null,
    payout: raw.payout ?? null,
  };
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function publicAffiliateFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      ...(init?.body && typeof init.body === 'string' && !(init?.headers as Record<string, string> | undefined)?.['Content-Type']
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getAffiliateMe(params?: AffiliateBotScopedParams): Promise<AffiliateMeResponse> {
  return apiFetch<AffiliateMeResponse>(`/affiliate/me${buildQuery(params ?? {})}`);
}

export async function getAffiliateLinks(params?: AffiliateBotScopedParams): Promise<AffiliateLink[]> {
  const response = await apiFetch<AffiliateLinkRaw[]>(`/affiliate/links${buildQuery(params ?? {})}`);
  return response.map(normalizeAffiliateLink);
}

export async function createAffiliateLink(payload: AffiliateLinkPayload, params?: AffiliateBotScopedParams): Promise<AffiliateLink> {
  const response = await apiFetch<AffiliateLinkRaw>(`/affiliate/links${buildQuery(params ?? {})}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeAffiliateLink(response);
}

export async function updateAffiliateLink(linkId: string, payload: AffiliateLinkPayload, params?: AffiliateBotScopedParams): Promise<AffiliateLink> {
  const response = await apiFetch<AffiliateLinkRaw>(`/affiliate/links/${encodeURIComponent(linkId)}${buildQuery(params ?? {})}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeAffiliateLink(response);
}

export async function deleteAffiliateLink(linkId: string, params?: AffiliateBotScopedParams): Promise<void> {
  await apiFetch(`/affiliate/links/${encodeURIComponent(linkId)}${buildQuery(params ?? {})}`, {
    method: 'DELETE',
  });
}

export async function getAffiliateAnalyticsSummary(params: AffiliateAnalyticsParams): Promise<AffiliateAnalyticsSummary> {
  return apiFetch<AffiliateAnalyticsSummary>(`/affiliate/analytics/summary${buildQuery(params)}`);
}

export async function getAffiliateAnalyticsTimeline(
  params: AffiliateAnalyticsParams & { bucket?: AffiliateTimelineBucket },
): Promise<AffiliateTimelineResponse> {
  const response = await apiFetch<AffiliateTimelineResponseRaw>(`/affiliate/analytics/timeline${buildQuery(params)}`);
  return {
    items: response.items ?? response.timeline ?? [],
    period: response.period ?? undefined,
    bucket: response.bucket ?? undefined,
    from: response.from ?? undefined,
    to: response.to ?? undefined,
  };
}

export async function getAffiliateAnalyticsLinks(params: AffiliateAnalyticsParams): Promise<AffiliateLinkAnalyticsResponse> {
  const response = await apiFetch<{ items: AffiliateLinkAnalyticsItemRaw[] }>(`/affiliate/analytics/links${buildQuery(params)}`);
  return {
    items: (response.items ?? []).map(normalizeAffiliateLinkAnalyticsItem),
  };
}

export async function getAffiliateAnalyticsEvents(params: AffiliateAnalyticsParams): Promise<AffiliateEventsResponse> {
  const response = await apiFetch<{ items: AffiliateEventItemRaw[] }>(`/affiliate/analytics/events${buildQuery(params)}`);
  return {
    items: (response.items ?? []).map(normalizeAffiliateEventItem),
  };
}

export async function createAffiliateVisit(payload: AffiliateVisitPayload): Promise<AffiliateVisitResponse> {
  return publicAffiliateFetch<AffiliateVisitResponse>('/affiliate/visit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAffiliateVisit(params: Partial<AffiliateVisitPayload>): Promise<AffiliateVisitResponse> {
  return publicAffiliateFetch<AffiliateVisitResponse>(`/affiliate/visit${buildQuery(params)}`);
}