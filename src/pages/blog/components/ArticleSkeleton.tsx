import { CONTAINER } from "../../shared/components/layout/container";

const MAIN_LINE_WIDTHS = ["95%", "88%", "92%", "85%", "90%", "87%"];
const SECONDARY_LINE_WIDTHS = ["90%", "82%", "96%", "88%"];
const TOC_LINE_WIDTHS = ["70%", "55%", "80%", "60%", "65%"];

/** Skeleton displayed while a blog article is loading.
 * Layout mirrors `BlogArticlePage` exactly — same gap, sidebar width
 * and image radius — so when real content arrives there is zero
 * layout shift. */
export default function ArticleSkeleton() {
  return (
    <div className={`${CONTAINER} po-fade-in w-full py-12`}>
      <div className="flex gap-10 xl:gap-16">
        <div className="min-w-0 flex-1">
          <div className="po-skeleton mb-3 h-4 w-32" />
          <div className="po-skeleton mb-4 h-8 w-3/4" />
          <div className="po-skeleton mb-6 h-5 w-full" />
          <div className="po-skeleton mb-6 aspect-video w-full" style={{ borderRadius: 24 }} />
          <div className="space-y-4">
            {MAIN_LINE_WIDTHS.map((w, i) => (
              <div key={`m${i}`} className="po-skeleton h-4" style={{ width: w }} />
            ))}
            <div className="po-skeleton mt-10 h-6 w-48" />
            {SECONDARY_LINE_WIDTHS.map((w, i) => (
              <div key={`s${i}`} className="po-skeleton h-4" style={{ width: w }} />
            ))}
          </div>
        </div>
        <aside className="hidden shrink-0 lg:block lg:w-[19.625rem]">
          <div className="sticky top-[7.125rem] space-y-2">
            <div className="po-skeleton mb-3 h-3 w-24" />
            {TOC_LINE_WIDTHS.map((w, i) => (
              <div key={`t${i}`} className="po-skeleton h-3.5" style={{ width: w }} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
