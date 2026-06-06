import type { CSSProperties, ReactNode } from "react";
import Seo from "../shared/components/seo/Seo";
import Section from "../shared/components/ui/Section";
import DefaultCtaBanner from "../shared/components/ui/DefaultCtaBanner";

export interface LegalFact {
  label: string;
  value: ReactNode;
}

export interface LegalSection {
  id: string;
  number: string;
  title: string;
  body: ReactNode;
}

interface LegalPageTemplateProps {
  title: string;
  description: string;
  locale?: string;
  canonical: string;
  eyebrow: string;
  intro: ReactNode;
  facts: LegalFact[];
  sections: LegalSection[];
  asideTitle?: string;
  factsTitle?: string;
}

const delayStyle = (delay: string): CSSProperties =>
  ({ ["--po-delay" as string]: delay }) as CSSProperties;

export default function LegalPageTemplate({
  title,
  description,
  locale,
  canonical,
  eyebrow,
  intro,
  facts,
  sections,
  asideTitle = "On this page",
  factsTitle = "Quick facts",
}: LegalPageTemplateProps) {
  return (
    <>
      <Seo title={title} description={description} canonical={canonical} locale={locale} />

      <div className="relative flex-1">
        <Section pt={{ mobile: "0rem", desktop: "0rem" }} pb={{ mobile: "4rem", desktop: "6rem" }}>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] px-5 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
            <span className="pointer-events-none absolute -left-14 top-0 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
            <span className="pointer-events-none absolute -right-8 bottom-0 h-36 w-36 rounded-full bg-white/10 blur-3xl" />

            <div className="relative z-[1] grid gap-8 lg:grid-cols-[minmax(0,1fr),320px] lg:items-end">
              <div className="po-reveal" data-in-view="true" style={delayStyle("0ms")}>
                <span className="mb-4 inline-flex rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-accent">
                  {eyebrow}
                </span>

                <h1 className="max-w-[14ch] text-[2.25rem] font-semibold leading-[1.02] text-white sm:text-[2.9rem] lg:text-[4.25rem]">
                  {title}
                </h1>

                <p className="mt-5 max-w-[60rem] text-[0.975rem] leading-7 text-[#c9ccd2] sm:text-[1.0625rem]">
                  {description}
                </p>
              </div>

              <div
                className="po-reveal rounded-[1.5rem] border border-white/10 bg-[#0c0c0d]/85 p-5 backdrop-blur-sm sm:p-6"
                data-in-view="true"
                style={delayStyle("120ms")}
              >
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-[#7f8792]">
                  {factsTitle}
                </p>

                <dl className="mt-5 space-y-4">
                  {facts.map((fact) => (
                    <div key={fact.label} className="border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
                      <dt className="text-[0.75rem] uppercase tracking-[0.14em] text-[#6f7680]">
                        {fact.label}
                      </dt>
                      <dd className="mt-2 text-[0.95rem] leading-6 text-white">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[280px,minmax(0,1fr)] xl:grid-cols-[320px,minmax(0,1fr)]">
            <aside
              className="po-reveal self-start rounded-[1.75rem] border border-white/10 bg-[#0b0b0c]/85 p-5 backdrop-blur-sm lg:sticky lg:top-[8.25rem]"
              data-in-view="true"
              style={delayStyle("180ms")}
            >
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-[#7f8792]">
                {asideTitle}
              </p>

              <nav className="mt-4">
                <ul className="space-y-2">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="group flex items-start gap-3 rounded-[1rem] border border-white/0 px-3 py-2 text-left text-[0.9375rem] leading-6 text-[#a8adb6] transition-all hover:border-white/10 hover:bg-white/[0.03] hover:text-white"
                      >
                        <span className="mt-0.5 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-accent/80 transition-colors group-hover:text-accent">
                          {section.number}
                        </span>
                        <span>{section.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <article
              className="po-content po-reveal rounded-[1.75rem] border border-white/10 bg-[#0b0b0c]/90 p-5 backdrop-blur-sm sm:p-7 lg:p-10"
              data-in-view="true"
              style={delayStyle("240ms")}
            >
              <div className="rounded-[1.5rem] border border-accent/10 bg-accent/[0.06] p-5 sm:p-6">
                <div className="space-y-4 text-[0.975rem] leading-7 text-[#d3d6db] sm:text-[1rem]">
                  {intro}
                </div>
              </div>

              <div className="mt-6 space-y-4 sm:space-y-5">
                {sections.map((section) => (
                  <section
                    id={section.id}
                    key={section.id}
                    className="scroll-mt-36 rounded-[1.5rem] border border-white/8 bg-white/[0.02] p-5 sm:p-6 lg:p-7"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-4">
                      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-accent/80">
                        {section.number}
                      </span>
                      <h2 className="text-[1.15rem] font-semibold text-white sm:text-[1.35rem]">
                        {section.title}
                      </h2>
                    </div>

                    <div className="mt-4 space-y-4 text-[0.95rem] leading-7 text-[#c7c9ce] sm:text-[1rem]">
                      {section.body}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>
        </Section>

        <section className="pb-16 lg:pb-24">
          <DefaultCtaBanner />
        </section>
      </div>
    </>
  );
}