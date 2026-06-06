import { Link } from "react-router-dom";
import routes from "../../configs/routes";
import LegalPageTemplate, { type LegalFact, type LegalSection } from "./LegalPageTemplate";
import { getLegalCopy, type LegalSectionCopy } from "./legalCopy";
import { usePublicI18n } from "../shared/publicI18n";

function renderSectionBody(section: LegalSectionCopy) {
  return (
    <>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.bullets?.length ? (
        <ul className="space-y-2">
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {section.richLink ? (
        <p>
          {section.richLink.before}
          {section.richLink.internal ? (
            <Link to={routes.Privacy} className="text-accent transition-colors hover:text-accent-hover">
              {section.richLink.label}
            </Link>
          ) : (
            <a
              href="https://po-terminal.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent transition-colors hover:text-accent-hover"
            >
              {section.richLink.label}
            </a>
          )}
          {section.richLink.after}
        </p>
      ) : null}
    </>
  );
}

export default function TermsPage() {
  const { locale, publicT } = usePublicI18n();
  const copy = getLegalCopy(locale).terms;
  const facts: LegalFact[] = copy.facts.map((fact) => ({ label: fact.label, value: fact.value }));
  const sections: LegalSection[] = copy.sections.map((section) => ({
    id: section.id,
    number: section.number,
    title: section.title,
    body: renderSectionBody(section),
  }));

  return (
    <LegalPageTemplate
      title={copy.title}
      description={copy.description}
      locale={publicT.meta.ogLocale}
      canonical={routes.Terms}
      eyebrow={copy.eyebrow}
      facts={facts}
      factsTitle={publicT.legal.factsTitle}
      asideTitle={publicT.legal.asideTitle}
      intro={
        <>
          {copy.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </>
      }
      sections={sections}
    />
  );
}