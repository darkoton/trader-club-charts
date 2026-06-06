import type { CSSProperties, ReactNode } from "react";
import { useI18n } from "../../../i18n";
import { usePublicI18n } from "../../shared/publicI18n";
import { getFeatures } from "../data/features";
import Section, { gapStyle } from "../../shared/components/ui/Section";
import SectionHeading from "../../shared/components/ui/SectionHeading";
import useInView from "../../shared/hooks/useInView";
import { ArrowUpIcon, BitcoinIcon, FlashIcon, UserIcon } from "../../shared/components/icons";
import {
  CARD_GAP_DESKTOP,
  CARD_GAP_MOBILE,
  FEATURE_CARD_HEIGHT,
  HOME_SECTION_PADDING,
} from "../layout";

// Inlined chart SVGs — rendered via dangerouslySetInnerHTML so CSS
// can animate the internal <rect>/<path> layers individually.
// NOTE: must live in `src/` (not `/public`) so Vite's `?raw` query
// is processed — public assets bypass the plugin pipeline and would
// make the import resolve to index.html instead of the SVG string.
import graph1 from "../../../assets/features/graph-1.svg?raw";
import graph2 from "../../../assets/features/graph-2.svg?raw";
import graph3 from "../../../assets/features/graph-3.svg?raw";

/**
 * Bento grid of feature cards per the Figma 1920px mock.
 *
 * Desktop (lg+): 3 columns × 2 rows — static grid with 24px gaps.
 * Mobile (< lg): horizontal snap carousel of the same 3 columns —
 *                one column visible at a time, swipe left/right.
 *
 * The per-card heights live in `home/layout.ts` under
 * `FEATURE_CARD_HEIGHT` — tweak values there to resize a single
 * card on either breakpoint without touching this file.
 */

/** Card key → index into `FEATURES` (source order in data). */
type FeatureKey = "langs" | "signals" | "demo" | "strategies" | "journal" | "robots";

/**
 * Column layout shared by mobile carousel & desktop grid.
 * Each column holds its cards top→bottom. Reorder entries here to
 * move a card between columns / rows.
 */
const FEATURE_COLUMNS: { key: FeatureKey; featureIdx: number; delay: string }[][] = [
  [
    { key: "langs", featureIdx: 0, delay: "80ms" },
    { key: "signals", featureIdx: 3, delay: "160ms" },
  ],
  [
    { key: "strategies", featureIdx: 1, delay: "320ms" },
    { key: "demo", featureIdx: 4, delay: "240ms" },
  ],
  [
    { key: "journal", featureIdx: 2, delay: "400ms" },
    { key: "robots", featureIdx: 5, delay: "480ms" },
  ],
];

/**
 * Mobile carousel layout (< md): 2 slides × 3 cards stacked.
 * Reorder entries here to change which cards appear on each slide.
 */
const FEATURE_SLIDES_MOBILE: { key: FeatureKey; featureIdx: number; delay: string }[][] = [
  [
    { key: "langs", featureIdx: 0, delay: "80ms" },
    { key: "signals", featureIdx: 3, delay: "160ms" },
    { key: "demo", featureIdx: 4, delay: "240ms" },
  ],
  [
    { key: "strategies", featureIdx: 1, delay: "80ms" },
    { key: "journal", featureIdx: 2, delay: "160ms" },
    { key: "robots", featureIdx: 5, delay: "240ms" },
  ],
];

/** Per-card visual/background/glow definitions. */
const FEATURE_CONTENT: Record<
  FeatureKey,
  { visual: ReactNode; background?: ReactNode; glows: CardGlowProps[] }
> = {
  langs: {
    background: (
      <>
        <div
          aria-hidden="true"
          className="po-lang-visual pointer-events-none absolute inset-0 z-[3] opacity-[0.25]"
        >
          <img
            src="/img/features/gb.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="po-lang-flag po-lang-flag--gb absolute right-[7%] top-[-3%] w-[30%]"
            draggable={false}
          />
          <img
            src="/img/features/br.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="po-lang-flag po-lang-flag--br absolute top-[32%] right-[18%] w-[30%]"
            draggable={false}
          />
          <img
            src="/img/features/nl.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="po-lang-flag po-lang-flag--nl absolute top-[48%] right-[-5%] w-[30%] "
            draggable={false}
          />
        </div>
        <div
          aria-hidden="true"
          className="po-lang-map-wrap pointer-events-none absolute z-[2] inset-0"
        >
          <img
            src="/img/features/map.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="po-lang-map absolute inset-0 h-full w-full select-none object-cover"
            draggable={false}
          />
        </div>
      </>
    ),
    visual: null,
    glows: [
      { size: "16.25rem", blur: "8.75rem", opacity: 0.28, top: "-55%", right: "-60%" },
      { size: "16.25rem", blur: "8.75rem", opacity: 0.28, bottom: "-55%", left: "-70%" },
    ],
  },
  signals: {
    background: (
      <BackgroundImage
        className="opacity-[0.12]"
        src="/img/features/notification.webp"
        top="-36%"
        right="-55%"
        width="50rem"
      />
    ),
    visual: (
      <>
        <InlineChart svg={graph1} variant="a" />
        <SignalPillCard />
      </>
    ),
    glows: [
      { size: "23.5625rem", blur: "8.75rem", opacity: 0.28, top: "-45%", right: "-45%" },
      { size: "23.5625rem", blur: "8.75rem", opacity: 0.28, bottom: "-45%", left: "-45%" },
    ],
  },
  demo: {
    background: (
      <BackgroundImage
        className="opacity-[0.25]"
        src="/img/features/book.webp"
        top="-10%"
        right="-2%"
        width="12.875rem"
      />
    ),
    visual: <DemoAccountCard />,
    glows: [{ size: "23.125rem", blur: "6.875rem", opacity: 0.28, top: "-115%", right: "16%" }],
  },
  strategies: {
    background: (
      <BackgroundImage
        src="/img/features/circle.webp"
        top="center"
        left="center"
        width="23.5625rem"
        className="mt-[12%]"
      />
    ),
    visual: (
      <div className="mt-[1rem] flex flex-1 flex-col lg:mt-0">
        <InlineChart svg={graph2} variant="b" />
      </div>
    ),
    glows: [
      { size: "23.5625rem", blur: "8.75rem", opacity: 0.28, top: "-45%", right: "-45%" },
      { size: "23.5625rem", blur: "8.75rem", opacity: 0.28, bottom: "-45%", left: "-45%" },
    ],
  },
  journal: {
    visual: <JournalCard />,
    glows: [
      { size: "14rem", blur: "7.5rem", opacity: 0.32, top: "-6rem", right: "-7rem" },
      { size: "14rem", blur: "7.5rem", opacity: 0.32, bottom: "-6rem", left: "-7rem" },
    ],
  },
  robots: {
    visual: (
      <div className="mt-[1rem] flex flex-1 flex-col lg:mt-0">
        <InlineChart svg={graph3} variant="c" />
      </div>
    ),
    glows: [{ size: "16rem", blur: "8.125rem", opacity: 0.35, bottom: "-8rem", left: "-9rem" }],
  },
};

export default function FeaturesSection() {
  const { locale } = useI18n();
  const { publicT } = usePublicI18n();
  const features = getFeatures(locale);
  const { ref, inView } = useInView<HTMLElement>();

  /** Render a column of cards. Heights come from `FEATURE_CARD_HEIGHT[key]`
   *  (mobile/desktop) — same values used on every breakpoint. */
  const renderColumn = (
    column: (typeof FEATURE_COLUMNS)[number],
    columnGap: string,
    cardWidthClass: string,
  ) => (
    <div className={`flex flex-col ${cardWidthClass}`} style={{ gap: columnGap }}>
      {column.map(({ key, featureIdx, delay }) => {
        const content = FEATURE_CONTENT[key];
        const h = FEATURE_CARD_HEIGHT[key];
        return (
          <FeatureCard
            key={key}
            title={features[featureIdx].title}
            desc={features[featureIdx].desc}
            delay={delay}
            heightMobile={h.mobile}
            heightDesktop={h.desktop}
            glows={content.glows}
            background={content.background}
          >
            {content.visual}
          </FeatureCard>
        );
      })}
    </div>
  );

  return (
    <Section
      ref={ref}
      as="section"
      inView={inView}
      pt={HOME_SECTION_PADDING.features.pt}
      pb={HOME_SECTION_PADDING.features.pb}
    >
      <SectionHeading className="mb-10 sm:mb-14">
        <span className="po-underline">{publicT.home.featuresHeadingAccent}</span>{" "}
        <span className="text-white">{publicT.home.featuresHeadingMiddle}</span>
        <br />
        {publicT.home.featuresHeadingBottom}
      </SectionHeading>

      {/* ───── Mobile (< sm / 480px): horizontal snap carousel —
           2 slides × 3 cards. Heights from `FEATURE_CARD_HEIGHT[key].mobile`.
           Negative inline margins match the container padding so the
           strip spans full viewport while the first slide aligns with
           the heading; right side overflows to the viewport edge. */}
      <div
        className="po-features-grid po-gap -mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 pb-2 sm:hidden"
        style={gapStyle(CARD_GAP_MOBILE, CARD_GAP_DESKTOP)}
      >
        {FEATURE_SLIDES_MOBILE.map((slide, ci) => (
          <div key={ci} className="w-[85%] min-w-[17rem] shrink-0 snap-start">
            {renderColumn(slide, CARD_GAP_MOBILE, "")}
          </div>
        ))}
      </div>

      {/* ───── Tablet (sm…lg): 2-column grid, 3 rows.
           Heights from `FEATURE_CARD_HEIGHT[key].mobile` (same as < sm). */}
      <div
        className="po-gap hidden sm:grid sm:grid-cols-2 sm:items-start lg:hidden"
        style={gapStyle(CARD_GAP_MOBILE, CARD_GAP_DESKTOP)}
      >
        {FEATURE_SLIDES_MOBILE.map((column, ci) => (
          <div key={ci}>{renderColumn(column, CARD_GAP_DESKTOP, "")}</div>
        ))}
      </div>

      {/* ───── Desktop (lg+): static 3×2 grid — per-card heights from
           `FEATURE_CARD_HEIGHT[key].desktop` (the bento composition). */}
      <div
        className="po-gap hidden lg:grid lg:grid-cols-3"
        style={gapStyle(CARD_GAP_MOBILE, CARD_GAP_DESKTOP)}
      >
        {FEATURE_COLUMNS.map((column, ci) => (
          <div key={ci}>{renderColumn(column, CARD_GAP_DESKTOP, "")}</div>
        ))}
      </div>
    </Section>
  );
}

/* ─────────── Configurable glow blob ─────────── */

/**
 * Positionable decorative glow used inside feature/device/security cards.
 *
 * Every coordinate / dimension is opt-in and accepts any CSS length
 * (`"-8rem"`, `"10%"`, `"-120px"`, …), so each card can tune its own
 * mood without touching shared CSS.
 */
export interface CardGlowProps {
  /** Diameter. Default `16rem`. */
  size?: string;
  /** Blur radius. Default `130px`. */
  blur?: string;
  /** Any CSS color. Default accent `#80B2FF`. */
  color?: string;
  /** 0..1 opacity. Default `0.55`. */
  opacity?: number;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  /** Extra utility classes (e.g. responsive sizing). */
  className?: string;
}

export function CardGlow({
  size = "16rem",
  blur = "8.125rem",
  color = "#80B2FF",
  opacity = 0.38,
  top,
  right,
  bottom,
  left,
  className = "",
}: CardGlowProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: color,
    filter: `blur(${blur})`,
    top,
    right,
    bottom,
    left,
  };
  // Expose the configured opacity as a CSS var so media queries /
  // pulse keyframes can scale it (e.g. dim on mobile, breathe).
  (style as Record<string, string | number>)["--po-glow-opacity"] = opacity;
  style.opacity = "var(--po-glow-opacity)" as unknown as number;
  return (
    <span
      aria-hidden="true"
      className={`po-card-glow pointer-events-none absolute z-0 scale-[0.65] rounded-full lg:scale-100 ${className}`.trim()}
      style={style}
    />
  );
}

/* ─────────── Background decorative image (rotated webp from /img/features).
 *
 * Each side (`top`/`right`/`bottom`/`left`) accepts any CSS length
 * or the string `"center"` — in which case the image is centered
 * on that axis via `50%` + a translate transform.
 *
 * `width`/`height` accept any CSS length; the default `max-width:
 * none` (overrides Tailwind preflight) means an explicit pixel
 * size won't be shrunk to fit the parent. */
export interface BackgroundImageProps {
  src: string;
  /** Top offset — any CSS length or `"center"`. */
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  /** Image width — any CSS length (e.g. `"780px"`, `"92%"`). */
  width?: string;
  /** Image height — any CSS length. */
  height?: string;
  /** Extra utility classes (e.g. `rotate-[6deg]`). */
  className?: string;
}

function BackgroundImage({
  src,
  top,
  right,
  bottom,
  left,
  width,
  height,
  className = "",
}: BackgroundImageProps) {
  const style: CSSProperties = { width, height };

  // Resolve `"center"` on either axis to `50%` + matching translate.
  const tx = left === "center" || right === "center" ? "-50%" : "0";
  const ty = top === "center" || bottom === "center" ? "-50%" : "0";
  if (tx !== "0" || ty !== "0") style.transform = `translate(${tx}, ${ty})`;

  style.top = top === "center" ? "50%" : top;
  style.right = right === "center" ? undefined : right;
  style.bottom = bottom === "center" ? undefined : bottom;
  style.left = left === "center" ? "50%" : left;
  // If caller asked for `right:"center"` or `bottom:"center"` but
  // didn't also set the opposite side, fall back to 50% on that axis.
  if (right === "center" && left === undefined) style.left = "50%";
  if (bottom === "center" && top === undefined) style.top = "50%";

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`pointer-events-none absolute z-[1] max-w-none select-none ${className}`.trim()}
      style={style}
    />
  );
}

/* ─────────── Shared card shell ─────────── */

interface FeatureCardProps {
  title: string;
  desc: string;
  className?: string;
  delay?: string;
  children?: ReactNode;
  cornerIcon?: ReactNode;
  /** Fixed height at < lg. Any CSS length. */
  heightMobile?: string;
  /** Fixed height at lg+. Any CSS length. */
  heightDesktop?: string;
  /**
   * Per-card blur glows. Pass an array of `CardGlowProps` to override
   * the default two corner-glows. Pass `[]` to render none.
   */
  glows?: CardGlowProps[];
  /**
   * Optional decorative layer that spans the ENTIRE card under all
   * content (below text + visuals, above glows). Use for full-bleed
   * webp artwork like notification/book/circle.
   */
  background?: ReactNode;
}

const DEFAULT_GLOWS: CardGlowProps[] = [
  { size: "16rem", blur: "8.125rem", opacity: 0.38, top: "-8rem", left: "-9rem" },
  { size: "16rem", blur: "8.125rem", opacity: 0.38, bottom: "-8rem", right: "-9rem" },
];

function FeatureCard({
  title,
  desc,
  className = "",
  delay,
  children,
  cornerIcon,
  heightMobile,
  heightDesktop,
  glows = DEFAULT_GLOWS,
  background,
}: FeatureCardProps) {
  const style: CSSProperties = {};
  if (delay) (style as Record<string, string>)["--po-delay"] = delay;
  if (heightMobile) (style as Record<string, string>)["--po-card-h-m"] = heightMobile;
  if (heightDesktop) (style as Record<string, string>)["--po-card-h-d"] = heightDesktop;

  return (
    <div
      className={`
        po-feature-card po-reveal group relative flex flex-col
        cursor-default overflow-hidden rounded-[2rem] border border-white/[0.06] bg-card p-[1.125rem] lg:p-6
        transition-[background-color,border-color,color] duration-300
        hover:border-accent/40
        ${heightMobile || heightDesktop ? "po-feature-card--sized" : ""}
        ${className}
      `}
      style={style}
    >
      {glows.map((g, i) => (
        <CardGlow key={i} {...g} />
      ))}

      {/* Decorative background layer. Renders whatever the caller
          passes — typically one or more <BackgroundImage /> with
          their own position/size classes. Each decor controls its
          own placement; this just sits under content. */}
      {background}

      {cornerIcon && (
        <span
          aria-hidden="true"
          className="po-feature-card__corner pointer-events-none absolute right-6 top-6 z-[5]"
        >
          {cornerIcon}
        </span>
      )}

      <h3 className="relative z-20 mb-1 text-[1.125rem] font-semibold text-white lg:mb-2">
        {title}
      </h3>
      <p className="relative z-20 max-w-[20.5rem] text-[0.875rem] leading-[1.4] text-[#BABDC3] lg:text-[1rem]">
        {desc}
      </p>

      {children && <div className="relative z-[1] mt-auto flex flex-col">{children}</div>}

      <span aria-hidden="true" className="po-feature-card__noise" />
    </div>
  );
}

/* Inline SVG chart — rendered via innerHTML so CSS can animate the
   internal <rect> candles and <path> MA-lines individually. */
function InlineChart({ svg, variant }: { svg: string; variant: "a" | "b" | "c" }) {
  return (
    <div
      className={`po-chart po-chart--${variant} relative mt-2 flex-1 overflow-hidden lg:mt-6`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ───── Торговые Сигналы 24/7 — pill styled identically to DemoAccountCard.
   Flash icon sits OUTSIDE the top-right corner and pulses. */
function SignalPillCard() {
  const { publicT } = usePublicI18n();

  return (
    <div className="po-demo-pill po-signal-pill relative mt-4">
      {/* Inner wrapper clips the right-center glow to the pill's
          rounded shape. Flash icon lives OUTSIDE this wrapper so
          it can overflow the top-right corner unclipped. */}
      <div className="relative flex items-center gap-3 overflow-hidden rounded-[1.25rem] border border-white/[0.06] bg-[#0E0E0E]/70 p-3">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0 z-0 h-[10rem] w-[10rem] -translate-y-1/2 -translate-x-1/2 rounded-full bg-[#80B2FF] opacity-[0.35]"
          style={{ filter: "blur(80px)" }}
        />
        <span className="relative z-[1] flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-[1rem] bg-[#FFFFFF0D] text-[#70829D]">
          <BitcoinIcon size={26} />
        </span>
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col gap-2 pr-5">
          <span className="flex items-center gap-1 text-[14px] text-white">
            {publicT.home.signalCardTitle}
            <ArrowUpIcon size={14} className="text-white" />
          </span>
          <span className="po-signal-bar block h-[0.375rem] w-full overflow-hidden rounded-full bg-white/[0.06]">
            <span className="po-signal-bar__fill block h-full rounded-full bg-[#80B2FF]" />
          </span>
        </div>
      </div>
      {/* Flash icon — slightly overflows the pill's top-right corner and
          continuously pulses via `.po-flash-pulse` keyframes. */}
      <span
        aria-hidden="true"
        className="po-signal-pill__flash po-flash-pulse pointer-events-none absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full text-[#80B2FF]"
      >
        <FlashIcon size={28} />
      </span>
    </div>
  );
}

/* ───── Доступен Демо-счёт — pill with "$10 000.00". */
function DemoAccountCard() {
  const { publicT } = usePublicI18n();

  return (
    <div className="po-demo-pill relative mt-4 flex items-center gap-3 overflow-hidden rounded-[1.25rem] border border-white/[0.06] bg-[#0E0E0E]/70 p-3">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-0 z-0 h-[10rem] w-[10rem] -translate-y-1/2 -translate-x-1/2 rounded-full bg-[#80B2FF] opacity-[0.35]"
        style={{ filter: "blur(80px)" }}
      />
      <span className="relative z-[1] flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-[1rem] bg-[#FFFFFF0D] text-[#70829D]">
        <UserIcon size={26} />
      </span>
      <div className="relative z-[1] flex min-w-0 flex-col">
        <span className="text-[14px] text-white">{publicT.home.demoCardTitle}</span>
        <span className="po-demo-amount text-[1rem] font-semibold text-[#80B2FF]">
          $10&nbsp;000.00
        </span>
      </div>
    </div>
  );
}

/* ───── Дневник Трейдера — mini trades table + 54% circle KPI.
   Last row leaves left padding so the circle KPI doesn't overlap its text. */
function JournalCard() {
  const { publicT } = usePublicI18n();
  const rows: Array<{
    pair: string;
    side: "BUY" | "SELL";
    sideLabel: string;
    pct: string;
    positive: boolean;
    /** Row is visible only at lg+ (hidden on mobile/tablet per Figma). */
    lgOnly?: boolean;
  }> = [
    { pair: "BTC/USDT", side: "BUY", sideLabel: publicT.home.buy, pct: "+4.5%", positive: true },
    { pair: "ETH/USDT", side: "SELL", sideLabel: publicT.home.sell, pct: "-3.2%", positive: false },
    { pair: "ADA/USDT", side: "BUY", sideLabel: publicT.home.buy, pct: "+2.8%", positive: true, lgOnly: true },
  ];

  return (
    <div className="po-journal relative mt-5 text-[14px]">
      <div className="overflow-hidden rounded-2xl border border-[#131313] bg-[#131313]">
        <div className="flex h-8 items-center bg-[#171717] px-4 font-medium text-white">{publicT.home.journalHeader}</div>
        <ul>
          {rows.map((r) => (
            <li
              key={r.pair + r.side}
              className={`${r.lgOnly ? "hidden lg:flex" : "flex"} h-[2.375rem] w-full items-center justify-between gap-3 border-t border-[#1D1D1D] px-4 lg:h-[3.25rem]`}
            >
              <span className="flex items-center gap-2 font-medium text-white">
                {r.pair}
                <span
                  className={`po-journal__badge rounded-[4px] px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase ${
                    r.side === "BUY"
                      ? "po-journal__badge--buy bg-[#80B2FF33] text-[#80B2FF]"
                      : "po-journal__badge--sell bg-[#FF6B6B33] text-[#FF6B6B]"
                  }`}
                >
                  {r.sideLabel}
                </span>
              </span>
              <span
                className={r.positive ? "font-medium text-[#80B2FF]" : "font-medium text-[#FF6B6B]"}
              >
                {r.pct}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mint-green KPI circle.
         · Mobile / tablet: small, top-right, overlapping the header.
         · Desktop (lg+): large, bottom-left, overlapping the last row. */}
      <div className="po-journal__kpi pointer-events-none absolute hidden items-center justify-center lg:-bottom-5 lg:-left-6 lg:flex lg:h-[92px] lg:w-[92px]">
        <img
          src="/img/features/circle.svg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full select-none"
          draggable={false}
        />
        <span className="relative text-[14px] font-medium text-white">54%</span>
      </div>
    </div>
  );
}
