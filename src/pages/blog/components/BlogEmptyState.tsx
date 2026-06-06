import { DocumentTextIcon, SearchIcon } from "../../shared/components/icons";
import { usePublicI18n } from "../../shared/publicI18n";

interface BlogEmptyStateProps {
  /** Current search query — if set, we show "nothing found" variant. */
  query?: string;
}

/** Friendly empty state shown when no articles are available. */
export default function BlogEmptyState({ query }: BlogEmptyStateProps) {
  const { publicT } = usePublicI18n();
  const isSearch = Boolean(query);

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="mb-5 text-gray-700">
        {isSearch ? <SearchIcon size={64} /> : <DocumentTextIcon size={64} />}
      </div>

      <p className="mb-2 text-lg font-semibold text-[#BABDC3]">
        {isSearch ? publicT.blog.emptySearchTitle : publicT.blog.emptyListTitle}
      </p>

      <p className="max-w-sm text-center text-sm text-gray-600">
        {isSearch
          ? publicT.blog.emptySearchDescription(query ?? "")
          : publicT.blog.emptyListDescription}
      </p>
    </div>
  );
}
