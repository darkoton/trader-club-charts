import type { Ref } from "react";
import { useInView as useInViewLib } from "react-intersection-observer";

interface UseInViewOptions {
  /** Fraction of the target visible before firing (0..1). */
  threshold?: number;
  /**
   * Stop observing after the first enter. Defaults to `true` — once a
   * section is revealed, it stays revealed even when scrolled past or
   * back. This avoids the "flash of hidden content" glitch and keeps
   * layout stable for anchored deep-links.
   */
  once?: boolean;
  /** Root margin, e.g. "-10% 0px". */
  rootMargin?: string;
  /**
   * Kept for API compatibility with the previous custom implementation
   * but no longer has any effect — the hook now uses
   * `react-intersection-observer` which relies on the standard
   * IntersectionObserver behaviour.
   */
  downOnly?: boolean;
}

/**
 * Observe whether the returned `ref` element is within the viewport.
 * Used to trigger CSS-only reveal animations (fade-up, stagger, etc.)
 * on scroll.
 *
 * Thin wrapper around `react-intersection-observer` that keeps the
 * signature compatible with earlier callsites:
 *
 * ```tsx
 * const { ref, inView } = useInView<HTMLDivElement>();
 * <div ref={ref} data-in-view={inView ? "true" : "false"}>…</div>
 * ```
 *
 * The previous hand-rolled implementation relied on a `useRef` that
 * was attached via `ref={ref}`. That broke when the target was
 * mounted on a later render cycle (e.g. article page after its
 * skeleton resolves) because the `useEffect` only observed the
 * element on first mount. `react-intersection-observer` uses a
 * callback ref so the observer is hooked up whenever the element
 * actually lands in the DOM.
 */
export default function useInView<T extends Element = HTMLElement>({
  threshold = 0.15,
  once = true,
  rootMargin = "0px 0px -10% 0px",
}: UseInViewOptions = {}): {
  ref: Ref<T>;
  inView: boolean;
} {
  const { ref, inView } = useInViewLib({
    threshold,
    rootMargin,
    triggerOnce: once,
    // Treat the observer as "in view" on the server / in non-browser
    // environments so the reveal classes don't keep content hidden.
    initialInView: typeof window === "undefined",
  });

  return { ref: ref as unknown as Ref<T>, inView };
}
