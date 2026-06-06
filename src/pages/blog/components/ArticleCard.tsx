import { Link } from "react-router-dom";
import { buildPath } from "../../../configs/routes";
import { usePublicI18n, formatPublicDate } from "../../shared/publicI18n";
import type { BlogArticleSummary } from "../../shared/types/blog";

interface ArticleCardProps {
  article: BlogArticleSummary;
}

/** Single article card shown on the blog list grid. */
export default function ArticleCard({ article }: ArticleCardProps) {
  const { locale } = usePublicI18n();
  const formattedDate = formatPublicDate(locale, article.published_at);

  return (
    <Link
      to={buildPath.blogArticle(article.slug)}
      className="po-card-blog group h-full"
      aria-label={article.title}
    >
      <time dateTime={article.published_at} className="text-xs text-gray-600">
        {formattedDate}
      </time>

      <h2 className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-white">
        {article.title}
      </h2>
    </Link>
  );
}
