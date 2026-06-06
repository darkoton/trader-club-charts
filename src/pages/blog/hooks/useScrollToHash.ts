import { useEffect } from "react";
import type { BlogArticleFull } from "../../shared/types/blog";

/**
 * After the article is rendered, if the URL has a hash, scroll the matching
 * heading into view. Uses `scrollIntoView` so the browser honours
 * `scroll-padding-top` defined on `<html>` (140px), keeping the target
 * below the fixed header.
 */
export default function useScrollToHash(article: BlogArticleFull | null) {
  useEffect(() => {
    if (!article) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.scrollIntoView({ behavior: "auto", block: "start" });
    });

    return () => cancelAnimationFrame(raf);
  }, [article]);
}
