/**
 * Blog API client.
 * All public blog endpoints live under `/blog/`.
 */

import { API_BASE } from "../../config";
import type { Locale } from "../../../i18n";
import type {
  ArticlesListResponse,
  ArticleDetailResponse,
  TagsResponse,
} from "../types/blog";

export type {
  BlogArticleSummary,
  BlogArticleFull,
  BlogSection,
  TocEntry,
  ArticleNeighbor,
} from "../types/blog";

/* ─── API calls ─── */

export async function fetchArticles(opts?: {
  page?: number;
  limit?: number;
  search?: string;
  tag?: string;
  locale?: Locale;
}): Promise<ArticlesListResponse["data"]> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.search) params.set("search", opts.search);
  if (opts?.tag) params.set("tag", opts.tag);
  if (opts?.locale) {
    params.set("locale", opts.locale);
    params.set("lang", opts.locale);
  }

  const res = await fetch(`${API_BASE}/blog/articles?${params}`);
  if (!res.ok) throw new Error(`Blog API error: ${res.status}`);
  const json: ArticlesListResponse = await res.json();
  return json.data;
}

export async function fetchArticleBySlug(
  slug: string,
  locale?: Locale,
): Promise<ArticleDetailResponse["data"]> {
  const params = new URLSearchParams();
  if (locale) {
    params.set("locale", locale);
    params.set("lang", locale);
  }
  const query = params.toString();
  const res = await fetch(`${API_BASE}/blog/articles/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(`Blog API error: ${res.status}`);
  const json: ArticleDetailResponse = await res.json();
  return json.data;
}

export async function fetchTags(): Promise<TagsResponse["data"]> {
  const res = await fetch(`${API_BASE}/blog/tags`);
  if (!res.ok) throw new Error(`Blog API error: ${res.status}`);
  const json: TagsResponse = await res.json();
  return json.data;
}
