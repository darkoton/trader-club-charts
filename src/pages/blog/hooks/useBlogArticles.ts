import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArticles } from "../../shared/api/blog";
import { usePublicI18n } from "../../shared/publicI18n";
import type { BlogArticleSummary } from "../../shared/types/blog";
import { BLOG_PER_PAGE, MIN_SKELETON_MS, withMinDelay } from "../../config";

interface UseBlogArticlesArgs {
  page: number;
  search: string;
}

interface UseBlogArticlesResult {
  items: BlogArticleSummary[];
  totalPages: number;
  total: number;
  loading: boolean;
  /** Monotonically increasing id of the last completed fetch — safe to use
   *  as a React `key` so lists re-mount (and animate in) on every new batch
   *  of data instead of re-animating immediately on URL changes. */
  batchId: number;
}

/**
 * Fetches a page of blog articles with optional search.
 * Aborts stale requests and enforces a minimum skeleton duration.
 */
export default function useBlogArticles({
  page,
  search,
}: UseBlogArticlesArgs): UseBlogArticlesResult {
  const { locale } = usePublicI18n();
  const [items, setItems] = useState<BlogArticleSummary[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [batchId, setBatchId] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (p: number, q: string, currentLocale: typeof locale) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const data = await withMinDelay(
        fetchArticles({ page: p, limit: BLOG_PER_PAGE, search: q || undefined, locale: currentLocale }),
        MIN_SKELETON_MS,
      );
      if (controller.signal.aborted) return;
      setItems(data.articles);
      setTotalPages(data.total_pages);
      setTotal(data.total);
      setBatchId((id) => id + 1);
    } catch {
      if (controller.signal.aborted) return;
      setItems([]);
      setTotalPages(1);
      setTotal(0);
      setBatchId((id) => id + 1);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, search, locale);
  }, [page, search, locale, load]);

  return { items, totalPages, total, loading, batchId };
}
