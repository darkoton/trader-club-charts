import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the window to the top on every route change and on initial
 * mount (F5 / refresh). Runs once in `PageLayout`.
 *
 * Behaviour:
 *  • initial mount (F5 / refresh) → instant, always top
 *  • pathname change (full route) → instant
 *  • only search/query change on same path (e.g. pagination) → smooth
 *  • skipped entirely if the URL carries a `#hash` anchor
 *
 * We also opt out of the browser's automatic scroll restoration so a
 * refresh can never leave the user mid-page (otherwise Chrome would
 * restore the last scroll position before React paints, producing a
 * brief "jump" into the page).
 */
export default function useScrollToTop() {
  const { pathname, search } = useLocation();
  const prevPath = useRef(pathname);
  const didMount = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    // Skip when the browser is about to jump to an anchor.
    if (window.location.hash) {
      prevPath.current = pathname;
      didMount.current = true;
      return;
    }

    // First mount → always start at the very top, instantly.
    if (!didMount.current) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      prevPath.current = pathname;
      didMount.current = true;
      return;
    }

    const pathChanged = pathname !== prevPath.current;
    prevPath.current = pathname;

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: pathChanged ? "auto" : "smooth",
    });
  }, [pathname, search]);
}
