import routes from "../../../configs/routes";
import Section from "../../shared/components/ui/Section";
import Button from "../../shared/components/ui/Button";
import { ArrowRightIcon } from "../../shared/components/icons";
import useInView from "../../shared/hooks/useInView";
import { usePublicI18n } from "../../shared/publicI18n";
import { HOME_SECTION_PADDING } from "../layout";

/**
 * Hero section — headline, CTA button and terminal preview screenshot
 * combined into a single section.
 */
export default function HeroSection() {
  const { publicT } = usePublicI18n();
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0, rootMargin: "0px" });

  return (
    <Section
      ref={ref}
      inView={inView}
      pt={HOME_SECTION_PADDING.hero.pt}
      pb={HOME_SECTION_PADDING.hero.pb}
      className="text-center"
    >
      <h1
        className="po-reveal mx-auto mb-3 max-w-[1024px] text-balance text-[2.25rem] font-extrabold uppercase leading-[1.1] tracking-tight text-white sm:mb-2 sm:text-[3rem] sm:leading-[1.05] md:text-[3.75rem]"
        style={{ ["--po-delay" as unknown as string]: "0ms" } as React.CSSProperties}
      >
        <span className="po-hero-accent text-accent">{publicT.home.heroTitleAccent}</span> — {" "}
        {publicT.home.heroTitleSuffix}
      </h1>

      <p
        className="po-reveal mx-auto mb-8 max-w-[1024px] text-[0.875rem] leading-relaxed text-[#BABDC3] sm:mb-6 lg:text-[1rem]"
        style={{ ["--po-delay" as unknown as string]: "150ms" } as React.CSSProperties}
      >
        {publicT.home.heroDescription}
      </p>

      <div
        className="po-reveal mb-10 flex justify-center sm:mb-14 md:mb-[6.625rem]"
        style={{ ["--po-delay" as unknown as string]: "280ms" } as React.CSSProperties}
      >
        <Button to={routes.Terminal} rightIcon={<ArrowRightIcon size={16} />}>
          {publicT.home.heroButton}
        </Button>
      </div>

      {/* Terminal preview — breaks out to full viewport width on mobile. */}
      <div
        className="po-reveal-scale po-hero-preview relative"
        style={{ ["--po-delay" as unknown as string]: "420ms" } as React.CSSProperties}
      >
        <picture>
          <source media="(min-width: 768px)" srcSet="/img/hero-image-pc.webp" />
          <img
            src="/img/hero-image-mobile.webp"
            alt={publicT.home.heroImageAlt}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1440}
            height={900}
            className="block h-auto w-full select-none object-contain"
            draggable={false}
          />
        </picture>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32
                         bg-gradient-to-b from-transparent to-background"
        />
      </div>
    </Section>
  );
}
