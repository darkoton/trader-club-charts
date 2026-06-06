import type { Locale } from "../../i18n";
import { SITE_NAME, SITE_URL } from "../../configs/seo";
import routes, { buildPath } from "../../configs/routes";
import { BLOG_PER_PAGE } from "../config";
import { getPublicCopy } from "../shared/publicI18n";
import type { BlogArticleFull, BlogArticleSummary } from "../shared/types/blog";

interface BlogListJsonLdArgs {
  page: number;
  totalPages: number;
  total: number;
  items: BlogArticleSummary[];
  locale: Locale;
  siteUrl?: string;
}

/** Builds a CollectionPage + ItemList schema for the blog list page. */
export function buildBlogListJsonLd({
  page,
  totalPages,
  total,
  items,
  locale,
  siteUrl = SITE_URL,
}: BlogListJsonLdArgs): Record<string, unknown> {
  const copy = getPublicCopy(locale);

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: copy.blog.listStructuredName,
    description: `${copy.blog.seoDescription(total)} ${copy.blog.structuredPageSuffix(page, totalPages)}`.trim(),
    url: `${siteUrl}${buildPath.blogListPage(page)}`,
    inLanguage: copy.meta.schemaLanguage,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: items.map((article, i) => ({
        "@type": "ListItem",
        position: (page - 1) * BLOG_PER_PAGE + i + 1,
        url: `${siteUrl}${buildPath.blogArticle(article.slug)}`,
        name: article.title,
      })),
    },
  };
}

interface BlogArticleJsonLdArgs {
  article: BlogArticleFull;
  locale: Locale;
  siteUrl?: string;
}

/** Builds a BlogPosting + BreadcrumbList graph for an article page. */
export function buildBlogArticleJsonLd({
  article,
  locale,
  siteUrl = SITE_URL,
}: BlogArticleJsonLdArgs): Record<string, unknown> {
  const copy = getPublicCopy(locale);
  const url = `${siteUrl}${buildPath.blogArticle(article.slug)}`;

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    image: article.banner ? [article.banner] : undefined,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: { "@type": "Organization", name: SITE_NAME, url: siteUrl },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl,
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo.webp` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: copy.meta.schemaLanguage,
    keywords: article.tags.join(", "),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: copy.blog.breadcrumbHome, item: siteUrl },
      { "@type": "ListItem", position: 2, name: copy.blog.breadcrumbBlog, item: `${siteUrl}${routes.Blog}` },
      { "@type": "ListItem", position: 3, name: article.title, item: url },
    ],
  };

  return {
    "@context": "https://schema.org",
    "@graph": [blogPosting, breadcrumb],
  };
}
