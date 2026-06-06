import { authService } from '../services/auth';
import { getTmaApiDomain } from '../tma/api';
import type { Locale } from '../i18n';

export type BlogArticleStatus = 'published' | 'draft';
export type AdminBlogImageKind = 'thumbnail' | 'banner' | 'content';
export const BLOG_TRANSLATION_LOCALES: Locale[] = ['ru', 'uk', 'en'];

export const ADMIN_BLOG_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.avif,.svg';
export const ADMIN_BLOG_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
export const ADMIN_BLOG_IMAGE_ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
];
export const ADMIN_BLOG_IMAGE_ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'];

export interface BlogSection {
  id?: string;
  title: string;
  content: string;
  order: number;
}

export interface AdminBlogArticleTranslation {
  title: string;
  description: string;
  sections: BlogSection[];
}

export type AdminBlogArticleTranslations = Partial<Record<Locale, AdminBlogArticleTranslation>>;

export interface AdminBlogArticle {
  _id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail: string | null;
  banner: string | null;
  tags: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  sections: BlogSection[];
  translations: AdminBlogArticleTranslations;
}

export interface AdminBlogArticlesListParams {
  page?: number;
  limit?: number;
  status?: BlogArticleStatus | '';
}

export interface AdminBlogArticlesListResult {
  articles: AdminBlogArticle[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AdminBlogArticlePayload {
  title?: string;
  slug?: string;
  description?: string;
  thumbnail?: string | null;
  banner?: string | null;
  tags?: string[];
  is_published?: boolean;
  sections?: BlogSection[];
  translations?: AdminBlogArticleTranslations;
}

export interface AdminBlogImageUploadResult {
  url: string;
  path: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  original_name: string | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractEnvelope(value: unknown): UnknownRecord {
  if (!isRecord(value)) return {};
  if (isRecord(value.data)) return value.data;
  return value;
}

function normalizeSection(value: unknown, index: number): BlogSection {
  const record = isRecord(value) ? value : {};
  return {
    id: asString(record.id) ?? undefined,
    title: asString(record.title) ?? '',
    content: asString(record.content) ?? '',
    order: asNumber(record.order) ?? index,
  };
}

function normalizeTranslation(value: unknown): AdminBlogArticleTranslation {
  const record = isRecord(value) ? value : {};
  const rawSections = Array.isArray(record.sections) ? record.sections : [];

  return {
    title: asString(record.title) ?? '',
    description: asString(record.description) ?? '',
    sections: rawSections
      .map((section, index) => normalizeSection(section, index))
      .sort((left, right) => left.order - right.order),
  };
}

function normalizeTranslations(value: unknown): AdminBlogArticleTranslations {
  const record = isRecord(value) ? value : {};
  const translations: AdminBlogArticleTranslations = {};

  for (const locale of BLOG_TRANSLATION_LOCALES) {
    if (!isRecord(record[locale])) continue;
    translations[locale] = normalizeTranslation(record[locale]);
  }

  return translations;
}

function normalizeArticle(value: unknown): AdminBlogArticle {
  const record = extractEnvelope(value);
  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  const sections = rawSections
    .map((section, index) => normalizeSection(section, index))
    .sort((left, right) => left.order - right.order);
  const translations = normalizeTranslations(record.translations);

  if (!translations.ru && (asString(record.title) ?? asString(record.description) ?? sections.length > 0)) {
    translations.ru = {
      title: asString(record.title) ?? '',
      description: asString(record.description) ?? '',
      sections,
    };
  }

  return {
    _id: asString(record._id) ?? asString(record.id) ?? '',
    title: asString(record.title) ?? '',
    slug: asString(record.slug) ?? '',
    description: asString(record.description) ?? '',
    thumbnail: asString(record.thumbnail),
    banner: asString(record.banner),
    tags: Array.isArray(record.tags)
      ? record.tags.map((tag) => asString(tag)).filter((tag): tag is string => Boolean(tag))
      : [],
    is_published: asBoolean(record.is_published),
    published_at: asString(record.published_at),
    created_at: asString(record.created_at),
    updated_at: asString(record.updated_at),
    sections,
    translations,
  };
}

function normalizeImageUpload(value: unknown): AdminBlogImageUploadResult {
  const envelope = extractEnvelope(value);
  const image = isRecord(envelope.image)
    ? envelope.image
    : isRecord(envelope.file)
      ? envelope.file
      : envelope;

  const path = asString(image.path);
  return {
    url: asString(image.url)
      ?? asString(image.file_url)
      ?? asString(image.public_url)
      ?? asString(image.src)
      ?? path
      ?? '',
    path,
    mime_type: asString(image.mime_type) ?? asString(image.content_type),
    size: asNumber(image.size),
    width: asNumber(image.width),
    height: asNumber(image.height),
    original_name: asString(image.original_name) ?? asString(image.filename) ?? asString(image.name),
  };
}

function extractErrorMessage(statusText: string, payload: unknown, rawText: string): string {
  if (isRecord(payload)) {
    const maybeError = asString(payload.error) ?? asString(payload.message) ?? asString(payload.detail);
    if (maybeError) return maybeError;
  }
  if (rawText.trim()) return rawText.trim();
  return statusText || 'Request failed';
}

function buildRequestHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };
  const token = authService.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function adminBlogFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getTmaApiDomain()}${path}`, {
    ...init,
    headers: buildRequestHeaders(init),
  });

  const rawText = response.status === 204 ? '' : await response.text();
  const contentType = response.headers.get('content-type') || '';
  const parsed = rawText && contentType.includes('application/json')
    ? JSON.parse(rawText) as unknown
    : undefined;

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.statusText, parsed, rawText));
  }

  if (!rawText) return undefined as T;
  if (parsed !== undefined) return parsed as T;
  return rawText as T;
}

export async function listAdminBlogArticles(
  params: AdminBlogArticlesListParams = {},
): Promise<AdminBlogArticlesListResult> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(Math.min(100, Math.max(1, params.limit ?? 20))));
  if (params.status) searchParams.set('status', params.status);

  const payload = await adminBlogFetch<unknown>(`/admin/blog/articles?${searchParams.toString()}`);
  const envelope = extractEnvelope(payload);
  const rawArticles = Array.isArray(envelope.articles)
    ? envelope.articles
    : Array.isArray(envelope.items)
      ? envelope.items
      : Array.isArray(payload)
        ? payload
        : [];

  const page = asNumber(envelope.page) ?? params.page ?? 1;
  const limit = asNumber(envelope.limit) ?? params.limit ?? 20;
  const total = asNumber(envelope.total) ?? asNumber(envelope.count) ?? rawArticles.length;
  const totalPages = asNumber(envelope.total_pages)
    ?? asNumber(envelope.pages)
    ?? Math.max(1, Math.ceil(total / Math.max(1, limit)));

  return {
    articles: rawArticles.map((article) => normalizeArticle(article)),
    total,
    page,
    limit,
    total_pages: totalPages,
  };
}

export async function getAdminBlogArticle(articleId: string): Promise<AdminBlogArticle> {
  const payload = await adminBlogFetch<unknown>(`/admin/blog/articles/${encodeURIComponent(articleId)}`);
  const envelope = extractEnvelope(payload);
  const article = isRecord(envelope.article) ? envelope.article : payload;
  return normalizeArticle(article);
}

export async function createAdminBlogArticle(payload: AdminBlogArticlePayload): Promise<AdminBlogArticle> {
  const result = await adminBlogFetch<unknown>('/admin/blog/articles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const envelope = extractEnvelope(result);
  const article = isRecord(envelope.article) ? envelope.article : result;
  return normalizeArticle(article);
}

export async function updateAdminBlogArticle(articleId: string, payload: AdminBlogArticlePayload): Promise<AdminBlogArticle> {
  const result = await adminBlogFetch<unknown>(`/admin/blog/articles/${encodeURIComponent(articleId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  const envelope = extractEnvelope(result);
  const article = isRecord(envelope.article) ? envelope.article : result;
  return normalizeArticle(article);
}

export async function deleteAdminBlogArticle(articleId: string): Promise<{ success: boolean }> {
  const result = await adminBlogFetch<unknown>(`/admin/blog/articles/${encodeURIComponent(articleId)}`, {
    method: 'DELETE',
  });
  const envelope = extractEnvelope(result);
  return {
    success: asBoolean(envelope.success) || asBoolean((result as UnknownRecord | undefined)?.success),
  };
}

export async function uploadAdminBlogImage(
  file: File,
  kind: AdminBlogImageKind,
): Promise<AdminBlogImageUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);

  const result = await adminBlogFetch<unknown>('/admin/blog/images/upload', {
    method: 'POST',
    body: formData,
  });

  return normalizeImageUpload(result);
}