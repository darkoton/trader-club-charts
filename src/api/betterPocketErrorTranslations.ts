import { getTmaApiDomain } from '../tma/api';
import type { Locale } from '../i18n';
import type { PocketErrorTranslationStatus, PocketErrorTranslations } from './adminPocketErrors';

export interface PublicPocketErrorTranslationItem {
  key: string;
  source?: string | null;
  stage?: string | null;
  status?: number | null;
  text: string;
  translations?: PocketErrorTranslations;
}

export interface PublicPocketErrorTranslationsResponse {
  locale: Locale;
  phrases: Record<string, string>;
  items: PublicPocketErrorTranslationItem[];
  total: number;
  include_untranslated: boolean;
  filters: {
    source: string | null;
    stage: string | null;
  };
}

export interface PublicPocketErrorTranslationsQuery {
  locale?: Locale;
  source?: string;
  stage?: string;
  include_untranslated?: boolean;
}

export interface PocketErrorTranslationDictionary {
  locale: Locale;
  phrases: Record<string, string>;
  items: PublicPocketErrorTranslationItem[];
}

function buildPublicTmaUrl(path: string): string {
  return `${getTmaApiDomain()}${path}`;
}

function buildQuery(params?: PublicPocketErrorTranslationsQuery): string {
  const qs = new URLSearchParams();
  if (!params) return '';

  qs.set('locale', params.locale || 'ru');
  if (params.source) qs.set('source', params.source);
  if (params.stage) qs.set('stage', params.stage);
  if (typeof params.include_untranslated === 'boolean') {
    qs.set('include_untranslated', params.include_untranslated ? 'true' : 'false');
  }

  const serialized = qs.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getPublicPocketErrorTranslations(params?: PublicPocketErrorTranslationsQuery): Promise<PublicPocketErrorTranslationsResponse> {
  const query = buildQuery(params);
  const response = await fetch(buildPublicTmaUrl(`/api/public/better/pocket-errors/translations${query}`));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText || 'Failed to load Pocket error translations');
  }
  return response.json();
}

export function createPocketErrorTranslationDictionary(response: PublicPocketErrorTranslationsResponse): PocketErrorTranslationDictionary {
  return {
    locale: response.locale,
    phrases: response.phrases || {},
    items: Array.isArray(response.items) ? response.items : [],
  };
}

export function translatePocketErrorMessage(message: string | null | undefined, dictionary?: Pick<PocketErrorTranslationDictionary, 'phrases'> | null): string {
  if (!message) return '';
  if (!dictionary?.phrases) return message;
  return dictionary.phrases[message] || message;
}

export function getPocketErrorTranslationStatus(translations?: PocketErrorTranslations | null): PocketErrorTranslationStatus {
  const filled = [translations?.ru, translations?.en, translations?.uk]
    .filter((value) => typeof value === 'string' && value.trim()).length;
  if (filled === 0) return 'new';
  if (filled === 3) return 'translated';
  return 'partial';
}
