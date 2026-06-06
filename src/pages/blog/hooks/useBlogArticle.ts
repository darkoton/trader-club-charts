import { useEffect, useState } from "react";
import { fetchArticleBySlug } from "../../shared/api/blog";
import { usePublicI18n } from "../../shared/publicI18n";
import type { ArticleNeighbor, BlogArticleFull, TocEntry } from "../../shared/types/blog";
import { MIN_SKELETON_MS, withMinDelay } from "../../config";

interface UseBlogArticleResult {
  article: BlogArticleFull | null;
  toc: TocEntry[];
  prev: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
  loading: boolean;
  notFound: boolean;
}

/** Fetches a single article by slug with skeleton delay and cancellation. */
export default function useBlogArticle(slug: string | undefined): UseBlogArticleResult {
  const { locale } = usePublicI18n();
  const [article, setArticle] = useState<BlogArticleFull | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [prev, setPrev] = useState<ArticleNeighbor | null>(null);
  const [next, setNext] = useState<ArticleNeighbor | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    withMinDelay(fetchArticleBySlug(slug, locale), MIN_SKELETON_MS)
      .then((data) => {
        if (cancelled) return;
        setArticle(data.article);
        setToc(data.toc);
        setPrev(data.prev_article);
        setNext(data.next_article);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, locale]);

  return { article, toc, prev, next, loading, notFound };
}
