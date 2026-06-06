import { useState } from "react";
import Section, { gapStyle } from "../../shared/components/ui/Section";
import SectionHeading from "../../shared/components/ui/SectionHeading";
import { AddIcon, MinusIcon } from "../../shared/components/icons";
import { useI18n } from "../../../i18n";
import { usePublicI18n } from "../../shared/publicI18n";
import { getFaqItems } from "../data/faq";
import type { FaqItem } from "../../shared/types/ui";

import useInView from "../../shared/hooks/useInView";
import { FAQ_GAP_DESKTOP, FAQ_GAP_MOBILE, HOME_SECTION_PADDING } from "../layout";

export default function FaqSection() {
  const { locale } = useI18n();
  const { publicT } = usePublicI18n();
  const faqItems = getFaqItems(locale);
  const { ref, inView } = useInView<HTMLElement>();
  // Only one accordion item open at a time. `null` → all collapsed.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Section
      ref={ref}
      inView={inView}
      pt={HOME_SECTION_PADDING.faq.pt}
      pb={HOME_SECTION_PADDING.faq.pb}
    >
      <SectionHeading className="mb-10 sm:mb-14">
        {publicT.home.faqTitleLead}{" "}<span className="po-underline">{publicT.home.faqTitleAccent}</span>
      </SectionHeading>

      <div
        className="po-gap mx-auto flex max-w-[680px] flex-col xl:max-w-[980px]"
        style={gapStyle(FAQ_GAP_MOBILE, FAQ_GAP_DESKTOP)}
      >
        {faqItems.map((item, i) => (
          <FaqAccordionItem
            key={item.q}
            item={item}
            index={i}
            open={openIndex === i}
            onToggle={() => setOpenIndex((cur) => (cur === i ? null : i))}
          />
        ))}
      </div>
    </Section>
  );
}

interface FaqAccordionItemProps {
  item: FaqItem;
  index: number;
  open: boolean;
  onToggle: () => void;
}

function FaqAccordionItem({ item, index, open, onToggle }: FaqAccordionItemProps) {
  return (
    <div
      className={`po-reveal rounded-[1.5rem] border transition-colors duration-300 ${
        open
          ? "border-[#3B3B3B52] bg-white/[#1D1D1D33]"
          : "border-white/[0.06] bg-[#1D1D1D33] hover:border-[#3B3B3B66] hover:bg-[#1D1D1D66]"
      }`}
      style={{ ["--po-delay" as unknown as string]: `${index * 80}ms` } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-4 border-0 bg-transparent px-6 py-5 text-left text-[0.9375rem] font-medium text-white transition-colors duration-300 lg:text-[1rem]"
      >
        <span>{item.q}</span>

        {open ? (
          <MinusIcon size={20} className="shrink-0 text-[#BABDC3]" />
        ) : (
          <AddIcon size={20} className="shrink-0 text-[#BABDC3]" />
        )}
      </button>

      <div
        className="grid transition-all duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-[0.875rem] leading-[1.7] text-[#BABDC3] lg:text-[1rem]">
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}
