import { Helmet } from "react-helmet-async";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE, DEFAULT_LOCALE } from "../../../../configs/seo";

interface SeoProps {
  title: string;
  description: string;
  locale?: string;
  canonical?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  ogImageAlt?: string;
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleAuthor?: string;
  articleSection?: string;
  articleTags?: string[];
  noIndex?: boolean;
  jsonLd?: Record<string, unknown>;
  /** rel="prev" for paginated pages */
  prevPage?: string;
  /** rel="next" for paginated pages */
  nextPage?: string;
}

export default function Seo({
  title,
  description,
  locale = DEFAULT_LOCALE,
  canonical,
  ogType = "website",
  ogImage,
  ogImageAlt,
  articlePublishedTime,
  articleModifiedTime,
  articleAuthor,
  articleSection,
  articleTags,
  noIndex = false,
  jsonLd,
  prevPage,
  nextPage,
}: SeoProps) {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = canonical ? `${SITE_URL}${canonical}` : SITE_URL;
  const image = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      {/* Base */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {prevPage && <link rel="prev" href={`${SITE_URL}${prevPage}`} />}
      {nextPage && <link rel="next" href={`${SITE_URL}${nextPage}`} />}

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={locale} />
      <meta property="og:image" content={image} />
      {ogImageAlt && <meta property="og:image:alt" content={ogImageAlt} />}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Article-specific OG */}
      {articlePublishedTime && (
        <meta property="article:published_time" content={articlePublishedTime} />
      )}
      {articleModifiedTime && (
        <meta property="article:modified_time" content={articleModifiedTime} />
      )}
      {articleAuthor && <meta property="article:author" content={articleAuthor} />}
      {articleSection && <meta property="article:section" content={articleSection} />}
      {articleTags?.map((tag) => (
        <meta key={tag} property="article:tag" content={tag} />
      ))}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD Structured Data */}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
