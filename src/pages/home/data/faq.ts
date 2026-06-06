import type { FaqItem } from "../../shared/types/ui";
import type { Locale } from "../../../i18n";
import { getPublicCopy } from "../../shared/publicI18n";

export function getFaqItems(locale: Locale): FaqItem[] {
  return getPublicCopy(locale).home.faqItems;
}
