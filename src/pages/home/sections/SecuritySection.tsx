import { useI18n } from "../../../i18n";
import { usePublicI18n } from "../../shared/publicI18n";
import { getSecurityCards } from "../data/security";

/**
 * "Ваша Безопасность — Наш Приоритет".
 * Two-column (heading + cards) on xl+. Below xl — heading on top,
 * horizontal snap-scroll carousel on the bottom.
 */
import Section, { gapStyle } from "../../shared/components/ui/Section";
import SectionHeading from "../../shared/components/ui/SectionHeading";
import useInView from "../../shared/hooks/useInView";
import { CARD_GAP_DESKTOP, CARD_GAP_MOBILE, HOME_SECTION_PADDING } from "../layout";

export default function SecuritySection() {
  const { locale } = useI18n();
  const { publicT } = usePublicI18n();
  const securityCards = getSecurityCards(locale);
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <Section
      ref={ref}
      inView={inView}
      pt={HOME_SECTION_PADDING.security.pt}
      pb={HOME_SECTION_PADDING.security.pb}
      className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] xl:gap-16"
    >
      <div>
        <SectionHeading align="left" className="mb-4" reveal="po-reveal-left">
          {publicT.home.securityTitleTop}
          <br />
          <span className="po-underline">{publicT.home.securityTitleAccent}</span>
        </SectionHeading>

        <p
          className="po-reveal max-w-[420px] whitespace-pre-line text-[0.875rem] leading-relaxed text-[#BABDC3] lg:text-[1rem]"
          style={{ ["--po-delay" as unknown as string]: "140ms" } as React.CSSProperties}
        >
          {publicT.home.securityDescription}
        </p>
      </div>

      {/* Carousel — the strip bleeds out by exactly the current
          container padding (`-mx-4 px-4` etc.), so the first card
          sits flush with the heading while the right edge extends
          to the viewport border. At xl+ the strip turns into a
          static 3-column grid. */}
      <div
        className="
            po-security-cards po-gap
            -mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 pb-2
            sm:-mx-6 sm:px-6
            lg:-mx-8 lg:px-8
            xl:mx-0 xl:grid xl:grid-cols-3 xl:snap-none xl:overflow-visible xl:px-0 xl:pb-0
          "
        style={gapStyle(CARD_GAP_MOBILE, CARD_GAP_DESKTOP)}
      >
        {securityCards.map((card, i) => (
          <div
            key={card.title}
            className="
                po-security-card po-reveal-scale relative flex
                w-[86%] min-w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden
                rounded-[2rem] border border-[rgba(59,59,59,0.2)] p-6
                sm:w-[62%]
                md:w-[calc(40%-14px)]
                lg:w-[calc(34%-16px)]
                xl:w-auto xl:min-w-0 xl:shrink-0
              "
            style={
              {
                ["--po-delay" as unknown as string]: `${180 + i * 120}ms`,
              } as React.CSSProperties
            }
          >
            <span aria-hidden="true" className="po-device-card__glow po-device-card__glow--tl" />
            <span aria-hidden="true" className="po-device-card__glow po-device-card__glow--br" />

            <div className="po-security-card__icon relative z-10 mb-5 flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-2xl">
              {card.icon}
            </div>

            <h3 className="relative z-10 mb-3 text-[1.125rem] font-semibold text-[#FFFFFF]">
              {card.title}
            </h3>

            <p className="relative z-10 whitespace-pre-line text-[0.875rem] leading-relaxed text-[#BABDC3] lg:text-[1rem]">
              {card.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
