import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import routes, { buildPath } from "../../configs/routes";
import { SITE_URL } from "../../configs/seo";
import { BLOG_PER_PAGE, SEARCH_DEBOUNCE_MS } from "../config";
import { CONTAINER } from "../shared/components/layout/container";
import Seo from "../shared/components/seo/Seo";
import { gapStyle } from "../shared/components/ui/Section";
import DefaultCtaBanner from "../shared/components/ui/DefaultCtaBanner";
import useDebounce from "../shared/hooks/useDebounce";
import { usePublicI18n } from "../shared/publicI18n";
import { BLOG_CARD_GAP_DESKTOP, BLOG_CARD_GAP_MOBILE } from "./layout";
import useInView from "../shared/hooks/useInView";
import ArticleCard from "./components/ArticleCard";
import BlogEmptyState from "./components/BlogEmptyState";
import BlogHero from "./components/BlogHero";
import BlogListSkeleton from "./components/BlogListSkeleton";
import BlogPagination from "./components/BlogPagination";
import useBlogArticles from "./hooks/useBlogArticles";
import { buildBlogListJsonLd } from "./jsonLd";

export default function BlogListPage() {
  const { locale, publicT } = usePublicI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const searchFromUrl = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);
  const isSearchPending = searchInput !== debouncedSearch;

  const { items, totalPages, total, loading, batchId } = useBlogArticles({
    page,
    search: debouncedSearch,
  });

  const heroInView = useInView<HTMLDivElement>({ threshold: 0.08 });
  const listInView = useInView<HTMLDivElement>({ threshold: 0.05 });
  const paginationInView = useInView<HTMLDivElement>({ threshold: 0.5 });

  const canonicalPath = buildPath.blogListPage(page);

  // Unified loading state: while any fetch is in flight OR the user is
  // still typing (debounce window), we show the skeleton in place of
  // the cards. Once the request resolves, the skeleton fades out and
  // the card grid fades in — no intermediate "dimmed list" state.
  const showSkeleton = loading || isSearchPending;

  function goToPage(next: number) {
    const params: Record<string, string> = {};
    if (next > 1) params.page = String(next);
    if (debouncedSearch) params.q = debouncedSearch;
    setSearchParams(params);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    // Drop the page param when the user edits the query.
    if (page !== 1) {
      setSearchParams(value ? { q: value } : {});
    }
  }

  return (
    <div className="w-full">
      <Seo
        title={publicT.blog.seoTitle(page)}
        description={publicT.blog.seoDescription(total)}
        locale={publicT.meta.ogLocale}
        canonical={canonicalPath}
        jsonLd={buildBlogListJsonLd({ page, totalPages, total, items, siteUrl: SITE_URL, locale })}
        prevPage={
          page > 1 ? (page === 2 ? routes.Blog : buildPath.blogListPage(page - 1)) : undefined
        }
        nextPage={page < totalPages ? buildPath.blogListPage(page + 1) : undefined}
      />

      <div ref={heroInView.ref} data-in-view={heroInView.inView ? "true" : "false"}>
        <BlogHero searchValue={searchInput} onSearchChange={handleSearchChange} />
      </div>

      <div
        ref={listInView.ref}
        data-in-view={listInView.inView ? "true" : "false"}
        className={`${CONTAINER}`}
        style={{ paddingBottom: 64 }}
      >
        {showSkeleton ? (
          <BlogListSkeleton count={BLOG_PER_PAGE} />
        ) : items.length === 0 ? (
          <BlogEmptyState query={debouncedSearch} />
        ) : (
          <ul
            key={batchId}
            className="po-fade-in po-gap grid sm:grid-cols-2 lg:grid-cols-3"
            style={gapStyle(BLOG_CARD_GAP_MOBILE, BLOG_CARD_GAP_DESKTOP)}
          >
            {items.map((article, i) => (
              <li
                key={article.slug}
                className="po-card-reveal"
                style={
                  {
                    ["--po-delay" as unknown as string]: `${Math.min(i, 8) * 60}ms`,
                  } as React.CSSProperties
                }
              >
                <ArticleCard article={article} />
              </li>
            ))}
          </ul>
        )}

        <div
          ref={paginationInView.ref}
          data-in-view={paginationInView.inView ? "true" : "false"}
          className="po-reveal"
        >
          <BlogPagination page={page} totalPages={totalPages} onChange={goToPage} />
        </div>
      </div>

      <section>
        <DefaultCtaBanner />
      </section>
    </div>
  );
}
