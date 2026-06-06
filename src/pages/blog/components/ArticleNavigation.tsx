import { Link } from "react-router-dom";
import { buildPath } from "../../../configs/routes";
import { ArrowLeftIcon, ArrowRightIcon } from "../../shared/components/icons";
import type { ArticleNeighbor } from "../../shared/types/blog";

interface ArticleNavigationProps {
  prev: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
}

const CARD_BASE = "po-card-blog group no-underline";

const ARROW = "po-icon-btn shrink-0";

/** Prev / next article links shown at the bottom of an article. */
export default function ArticleNavigation({ prev, next }: ArticleNavigationProps) {
  if (!prev && !next) return null;

  return (
    <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {prev ? (
        <Link to={buildPath.blogArticle(prev.slug)} className={`${CARD_BASE} po-card-blog--row`}>
          <span className={ARROW}>
            <ArrowLeftIcon size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold text-white">{prev.title}</p>
            <p className="mt-1 line-clamp-2 text-[0.8125rem] text-gray-500">{prev.description}</p>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          to={buildPath.blogArticle(next.slug)}
          className={`${CARD_BASE} po-card-blog--row-reverse`}
        >
          <span className={ARROW}>
            <ArrowRightIcon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold text-white">{next.title}</p>
            <p className="mt-1 line-clamp-2 text-[0.8125rem] text-gray-500">{next.description}</p>
          </div>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
