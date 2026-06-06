import type { Locale } from "../../i18n";
import routes from "../../configs/routes";
import { SITE_NAME, SITE_URL } from "../../configs/seo";
import { getPublicCopy } from "../shared/publicI18n";

/**
 * Builds the combined JSON-LD schema graph for the home page.
 * Includes Organization, WebSite (with search action) and FAQPage entities.
 */
export function buildHomeJsonLd(locale: Locale): Record<string, unknown> {
  const copy = getPublicCopy(locale);
  const faqItems = copy.home.faqItems;

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.webp`,
    sameAs: [],
    description: copy.home.seoDescription,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: copy.meta.schemaLanguage,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}${routes.Blog}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, faqPage],
  };
}
