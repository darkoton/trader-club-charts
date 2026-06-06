import type { ReactNode } from "react";
import routes from "../../configs/routes";
import Seo from "../shared/components/seo/Seo";
import DefaultCtaBanner from "../shared/components/ui/DefaultCtaBanner";
import HeroSection from "./sections/HeroSection";
import FeaturesSection from "./sections/FeaturesSection";
import PartnersSection from "./sections/PartnersSection";
import DevicesSection from "./sections/DevicesSection";
import SecuritySection from "./sections/SecuritySection";
import FaqSection from "./sections/FaqSection";
import useInView from "../shared/hooks/useInView";
import { usePublicI18n } from "../shared/publicI18n";
import { buildHomeJsonLd } from "./jsonLd";

/**
 * Decorative backdrop wrapper — draws `line-1/2/3.webp` behind a
 * specific section and fades in once the section scrolls into view.
 * The image is a CSS background so it never competes for LCP.
 */
function DecoWrap({ variant, children }: { variant: "a" | "b" | "c"; children: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.08 });
  return (
    <div ref={ref} data-in-view={inView ? "true" : "false"} className="po-home-deco-wrap">
      <span aria-hidden="true" className={`po-home-deco po-home-deco--${variant}`} />
      {children}
    </div>
  );
}

export default function HomePage() {
  const { locale, publicT } = usePublicI18n();

  return (
    <>
      <Seo
        title={publicT.home.seoTitle}
        description={publicT.home.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.Home}
        jsonLd={buildHomeJsonLd(locale)}
      />

      <div className="relative flex-1">
        <div className="relative">
          <HeroSection />

          {/* line-3.webp behind "PO Terminal Делает Твой Трейдинг Умнее". */}
          <DecoWrap variant="c">
            <FeaturesSection />
          </DecoWrap>

          <PartnersSection />

          {/* line-2.webp behind "На Любом Устройстве". */}
          <DecoWrap variant="b">
            <DevicesSection />
          </DecoWrap>

          <SecuritySection />

          {/* line-1.webp behind "Часто Задаваемые Вопросы". */}
          <DecoWrap variant="a">
            <FaqSection />
          </DecoWrap>

          <section>
            <DefaultCtaBanner />
          </section>
        </div>
      </div>
    </>
  );
}
