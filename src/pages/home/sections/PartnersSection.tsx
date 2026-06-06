import routes from "../../../configs/routes";
import Button from "../../shared/components/ui/Button";

/**
 * "Являемся Прямыми Партнёрами" — text + CTA on the left,
 * MacBook screenshot with an iPhone overlay on the right.
 */
import Section from "../../shared/components/ui/Section";
import SectionHeading from "../../shared/components/ui/SectionHeading";
import useInView from "../../shared/hooks/useInView";
import { usePublicI18n } from "../../shared/publicI18n";
import { HOME_SECTION_PADDING } from "../layout";

export default function PartnersSection() {
  const { publicT } = usePublicI18n();
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <Section
      ref={ref}
      inView={inView}
      pt={HOME_SECTION_PADDING.partners.pt}
      pb={HOME_SECTION_PADDING.partners.pb}
    >
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="text-left">
          <SectionHeading align="left" className="mb-5 sm:mb-6" reveal="po-reveal-left">
            {publicT.home.partnersTitleLead}{" "}<span className="po-underline po-underline-draw">{publicT.home.partnersTitleAccent}</span>
            <br />
            {publicT.home.partnersTitleSuffix}
          </SectionHeading>

          <p
            className="po-reveal mb-8 max-w-[440px] text-[0.875rem] leading-relaxed text-[#BABDC3] lg:text-[1rem]"
            style={{ ["--po-delay" as unknown as string]: "120ms" } as React.CSSProperties}
          >
            {publicT.home.partnersDescription}
          </p>

          <div
            className="po-reveal inline-block"
            style={{ ["--po-delay" as unknown as string]: "220ms" } as React.CSSProperties}
          >
            <Button to={routes.Terminal}>{publicT.home.partnersButton}</Button>
          </div>
        </div>

        <div
          className="po-reveal-right relative mx-auto w-full max-w-[620px] pb-4 pl-8 sm:pb-6 sm:pl-0"
          style={{ ["--po-delay" as unknown as string]: "180ms" } as React.CSSProperties}
        >
          <img
            src="/img/devices/MacBook Pro 14.webp"
            alt={publicT.home.partnersMacbookAlt}
            loading="lazy"
            decoding="async"
            width={732}
            height={533}
            className="block h-auto w-full select-none"
            draggable={false}
          />

          <img
            src="/img/devices/iPhone 14 Pro.webp"
            alt={publicT.home.partnersPhoneAlt}
            loading="lazy"
            decoding="async"
            width={540}
            height={611}
            style={{ ["--po-delay" as unknown as string]: "420ms" } as React.CSSProperties}
            className="
              po-reveal-tilt po-partners-phone
              absolute bottom-0 left-0 w-[26%] min-w-[6rem] max-w-[10.625rem]
              select-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.55)]
              sm:w-[25%] sm:min-w-[6.875rem] sm:-left-[3rem] xl:-left-[4rem]
            "
            draggable={false}
          />
        </div>
      </div>
    </Section>
  );
}
