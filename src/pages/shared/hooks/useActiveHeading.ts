import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which heading id (from the given list) is currently in view.
 * Returns both the active id and a `setActive` helper — pages call it on click
 * so the UI updates immediately without waiting for smooth-scroll to finish.
 *
 * Attaches its scroll listener to the real scroll container (not `window`),
 * so it still works when the app uses a custom scrolling element such as
 * `#root` or `body`.
 */
export default function useActiveHeading(ids: string[], offset = 120) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const idsRef = useRef(ids);

  // Lock scroll-driven updates for ~700ms after a manual click so
  // programmatic scroll doesn't overwrite the selection mid-flight.
  const lockUntil = useRef(0);

  const setActive = useCallback((id: string) => {
    lockUntil.current = Date.now() + 700;
    setActiveId(id);
  }, []);

  useEffect(() => {
    idsRef.current = ids;
    if (!ids.length) return;

    function pickActive() {
      if (Date.now() < lockUntil.current) return;

      const threshold = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const id of idsRef.current) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= threshold) current = id;
      }
      setActiveId(current ?? idsRef.current[0] ?? null);
    }

    pickActive();

    window.addEventListener("scroll", pickActive, { passive: true });
    window.addEventListener("resize", pickActive);
    return () => {
      window.removeEventListener("scroll", pickActive);
      window.removeEventListener("resize", pickActive);
    };
  }, [ids, offset]);

  return { activeId, setActive };
}
