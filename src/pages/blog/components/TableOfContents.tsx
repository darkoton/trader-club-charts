import { useMemo } from "react";
import type { TocEntry } from "../../shared/types/blog";
import useActiveHeading from "../../shared/hooks/useActiveHeading";
import { usePublicI18n } from "../../shared/publicI18n";

interface TableOfContentsProps {
  entries: TocEntry[];
}

/**
 * Sticky table of contents for an article — scroll-spy + smooth scroll.
 *
 * Scroll is delegated to the native `scrollIntoView` which honours the
 * `scroll-padding-top: 140px` set on `<html>` in `pages.css`, so the
 * target heading ends up comfortably below the fixed header instead of
 * being hidden underneath it.
 */
export default function TableOfContents({ entries }: TableOfContentsProps) {
  const { publicT } = usePublicI18n();
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);
  const { activeId, setActive } = useActiveHeading(ids, 140);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;

    event.preventDefault();
    setActive(id);

    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav aria-label={publicT.blog.tocAria} className="space-y-0.5">
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          onClick={(e) => handleClick(e, entry.id)}
          className={`block rounded-md px-2.5 py-1.5 text-[0.8125rem] no-underline transition-colors ${
            activeId === entry.id ? "po-toc-link--active" : "text-[#BABDC3] hover:text-accent"
          }`}
        >
          {entry.title}
        </a>
      ))}
    </nav>
  );
}
