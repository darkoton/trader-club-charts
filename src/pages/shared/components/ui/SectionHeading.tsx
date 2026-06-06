import type { ReactNode } from "react";

interface SectionHeadingProps {
  /** Main heading; `accent` portion gets highlighted in accent color */
  children: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
  className?: string;
  /**
   * Reveal animation variant applied to the `<h2>`.
   * Set to `"none"` to opt out.
   */
  reveal?: "po-reveal" | "po-reveal-left" | "po-reveal-right" | "none";
  /** Heading scale: `md` = 38px desktop (default, all section <h2>s),
   *  `xl` = 52px desktop (top-level page <h1> opt-in). */
  size?: "xl" | "md";
}

/** Target sizes per design spec. */
const HEADING_CLS_XL =
  "last:mb-0 mb-3 sm:mb-4 text-[2rem] font-semibold text-white sm:text-[2.5rem] lg:text-[3.25rem]";
const HEADING_CLS_MD =
  "last:mb-0 mb-3 sm:mb-4 text-[1.625rem] font-semibold text-white sm:text-[2rem] lg:text-[2.375rem]";

/**
 * Unified section title used across `/pages/**` marketing sections.
 * Keeps heading sizing, font and reveal animation consistent everywhere.
 * Wrap a word in `<span className="po-underline">` to get the animated
 * accent underline effect.
 */
export default function SectionHeading({
  children,
  subtitle,
  align = "center",
  className = "",
  reveal = "po-reveal",
  size = "md",
}: SectionHeadingProps) {
  const alignCls = align === "center" ? "text-center" : "text-left";
  const revealCls = reveal === "none" ? "" : reveal;
  const sizeCls = size === "md" ? HEADING_CLS_MD : HEADING_CLS_XL;
  return (
    <div className={`${alignCls} ${className}`.trim()}>
      <h2 className={`${revealCls} ${sizeCls}`.trim()}>{children}</h2>

      {subtitle && (
        <p
          className={`text-[0.875rem] lg:text-[1rem] text-[#BABDC3] ${
            align === "center" ? "mx-auto max-w-[600px]" : "max-w-[600px]"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
