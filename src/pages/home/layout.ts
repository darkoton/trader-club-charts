import type { SectionPadding } from "../shared/components/ui/Section";

/**
 * Home-page layout configuration.
 *
 * Single source of truth for section paddings, card grid gaps and
 * feature-card heights. Tweak values here — every home section picks
 * them up without touching component code.
 */

/* ─── Per-section vertical padding ─────────────────────────────── */

export const HOME_SECTION_PADDING: Record<
  "hero" | "features" | "partners" | "devices" | "security" | "faq",
  { pt: SectionPadding; pb: SectionPadding }
> = {
  hero: {
    pt: { mobile: "0rem", desktop: "0rem" },
    pb: { mobile: "2rem", desktop: "4rem" },
  },
  features: {
    pt: { mobile: "0rem", desktop: "4rem" },
    pb: { mobile: "4rem", desktop: "6rem" },
  },
  partners: {
    pt: { mobile: "0rem", desktop: "0rem" },
    pb: { mobile: "4rem", desktop: "6rem" },
  },
  devices: {
    pt: { mobile: "0rem", desktop: "4rem" },
    pb: { mobile: "0rem", desktop: "4rem" },
  },
  security: {
    pt: { mobile: "4rem", desktop: "6rem" },
    pb: { mobile: "0rem", desktop: "6rem" },
  },
  faq: {
    pt: { mobile: "4rem", desktop: "6rem" },
    pb: { mobile: "4rem", desktop: "6rem" },
  },
};

/* ─── Grid / gap tokens ────────────────────────────────────────── */

/** Gap between cards on lg+ (1024px+). Applies to features, devices, security. */
export const CARD_GAP_DESKTOP = "1.5rem";
/** Gap between cards on mobile (< lg). */
export const CARD_GAP_MOBILE = "0.5rem";

/** Gap between items in the FAQ accordion. */
export const FAQ_GAP_DESKTOP = "1rem";
export const FAQ_GAP_MOBILE = "0.5rem";

/* ─── Features bento — card heights & glow presets ─────────────── */

/**
 * Per-card heights. Tweak `mobile` / `desktop` to resize a single
 * card without touching the grid or the other cards.
 * Keys are the `FEATURES[i].title` slug — see `home/data/features.ts`.
 */
export const FEATURE_CARD_HEIGHT: Record<
  "langs" | "signals" | "demo" | "strategies" | "journal" | "robots",
  { mobile: string; desktop: string }
> = {
  langs: { mobile: "9rem", desktop: "12rem" },
  signals: { mobile: "29rem", desktop: "37rem" },
  demo: { mobile: "13.5rem", desktop: "15rem" },
  strategies: { mobile: "18.5rem", desktop: "34rem" },
  journal: { mobile: "15.75rem", desktop: "22rem" },
  robots: { mobile: "17rem", desktop: "27rem" },
};
