interface BlogListSkeletonProps {
  count: number;
}

/**
 * Skeleton grid displayed while blog articles are loading.
 * Mirrors the structure of `ArticleCard` (date + 2-line title) so the
 * placeholder height matches the real card to the pixel — preventing
 * layout shift when articles arrive.
 */
export default function BlogListSkeleton({ count }: BlogListSkeletonProps) {
  return (
    <ul className="po-fade-in grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="po-card-blog h-full">
            {/* date — same height as <time className="text-xs"> ≈ 16px */}
            <div className="po-skeleton h-4 w-28" />
            {/* title — 2 lines of text-[0.9375rem] leading-snug ≈ 2 × 21px */}
            <div className="space-y-1.5">
              <div className="po-skeleton h-[1.125rem] w-full" />
              <div className="po-skeleton h-[1.125rem] w-3/4" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
