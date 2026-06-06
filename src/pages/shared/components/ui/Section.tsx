import type { CSSProperties, ElementType, ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { CONTAINER } from "../layout/container";

/**
 * Unified marketing section wrapper.
 *
 * Handles the repetitive boilerplate used across every home/blog/auth
 * section: the `CONTAINER` max-width + horizontal padding, a `relative`
 * positioning context, an optional reveal-observer hook-up (via
 * forwarded ref + `data-in-view`), and — most importantly — **per-side
 * vertical padding props** so each page can tune `pt` / `pb` at two
 * breakpoints without hand-rolling Tailwind strings.
 *
 * ```tsx
 * <Section pt={{ mobile: "3rem",  desktop: "6.625rem" }}
 *          pb={{ mobile: "2rem",  desktop: "4rem" }}>
 *   …
 * </Section>
 * ```
 */

export interface SectionPadding {
  /** Applied below `lg` (<1024px). Any CSS length. */
  mobile?: string;
  /** Applied at `lg+` (>=1024px). Any CSS length. */
  desktop?: string;
}

export interface SectionProps {
  children: ReactNode;
  /** Extra classes merged onto the inner container. */
  className?: string;
  /** `data-in-view` signal for reveal animations. */
  inView?: boolean;
  /** Top padding: `{ mobile, desktop }`. */
  pt?: SectionPadding;
  /** Bottom padding: `{ mobile, desktop }`. */
  pb?: SectionPadding;
  /** HTML tag for the outer element. */
  as?: ElementType;
  /** Skip the `CONTAINER` width constraint. */
  fluid?: boolean;
}

function buildStyle(pt?: SectionPadding, pb?: SectionPadding): CSSProperties {
  const s: Record<string, string> = {};
  if (pt?.mobile) s["--po-section-pt-m"] = pt.mobile;
  if (pt?.desktop) s["--po-section-pt-d"] = pt.desktop;
  if (pb?.mobile) s["--po-section-pb-m"] = pb.mobile;
  if (pb?.desktop) s["--po-section-pb-d"] = pb.desktop;
  return s as CSSProperties;
}

const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { children, className = "", inView, pt, pb, as: Tag = "section", fluid = false },
  ref,
) {
  const container = fluid ? "" : CONTAINER;
  return (
    <Tag
      ref={ref as Ref<HTMLElement>}
      data-in-view={inView === undefined ? undefined : inView ? "true" : "false"}
      className={`po-section relative ${container} ${className}`.trim()}
      style={buildStyle(pt, pb)}
    >
      {children}
    </Tag>
  );
});

export default Section;

/* ─── Responsive gap helper ───────────────────────────────────── */

/**
 * Returns an inline-style object for a responsive `gap`. Apply
 * together with the `.po-gap` class from `pages.css`.
 *
 * ```tsx
 * <div className="po-gap flex flex-col" style={gapStyle("8px", "24px")}>…</div>
 * ```
 */
export function gapStyle(mobile: string, desktop: string): CSSProperties {
  return {
    ["--po-gap-m" as string]: mobile,
    ["--po-gap-d" as string]: desktop,
  } as CSSProperties;
}
