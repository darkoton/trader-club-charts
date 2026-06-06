/**
 * DOM scroll helpers shared across `/pages`.
 * Centralised so anchor-link / in-article navigation behaves consistently.
 */

/** Default offset (px) kept above scrolled-into-view elements. */
export const SCROLL_OFFSET = 96;

/**
 * Walks up the DOM from `el` and returns the nearest ancestor that
 * actually scrolls vertically. Falls back to `window` when no such
 * ancestor exists (e.g. on pages where the viewport is the scroller).
 */
export default function getScrollParent(el: Element | null): HTMLElement | Window {
  if (!el) return window;

  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    const canScroll = overflowY === "auto" || overflowY === "scroll";
    if (canScroll && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }

  // Check body / documentElement explicitly — our layout sets overflow-y:auto on #root/body.
  for (const candidate of [document.body, document.documentElement]) {
    if (!candidate) continue;
    const { overflowY } = getComputedStyle(candidate);
    const canScroll = overflowY === "auto" || overflowY === "scroll";
    if (canScroll && candidate.scrollHeight > candidate.clientHeight) return candidate;
  }

  return window;
}

/** Scroll `scroller` so that `el` sits `offset` px below its top edge. */
export function scrollElementIntoView(
  el: HTMLElement,
  scroller: HTMLElement | Window,
  offset = SCROLL_OFFSET,
  behavior: ScrollBehavior = "smooth",
) {
  const elRect = el.getBoundingClientRect();

  if (scroller === window) {
    const top = elRect.top + window.scrollY - offset;
    window.scrollTo({ top, behavior });
    return;
  }

  const container = scroller as HTMLElement;
  const containerRect = container.getBoundingClientRect();
  const top = elRect.top - containerRect.top + container.scrollTop - offset;
  container.scrollTo({ top, behavior });
}
