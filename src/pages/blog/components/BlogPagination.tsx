import { ArrowLeftThinIcon, ArrowRightThinIcon } from "../../shared/components/icons";
import { usePublicI18n } from "../../shared/publicI18n";

interface BlogPaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/** Pagination navigation for the blog list. */
export default function BlogPagination({ page, totalPages, onChange }: BlogPaginationProps) {
  const { publicT } = usePublicI18n();
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav aria-label={publicT.blog.paginationAria} className="mt-12 flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={publicT.blog.prevPage}
        className="po-icon-btn"
      >
        <ArrowLeftThinIcon size={16} />
      </button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? "page" : undefined}
          className="po-icon-btn text-sm font-medium"
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={publicT.blog.nextPage}
        className="po-icon-btn"
      >
        <ArrowRightThinIcon size={16} />
      </button>
    </nav>
  );
}
