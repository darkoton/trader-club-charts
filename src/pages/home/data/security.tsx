import type { FeatureCard } from "../../shared/types/ui";
import { PocketOptionIcon, SupportIcon, TeacherIcon } from "../../shared/components/icons";
import type { Locale } from "../../../i18n";
import { getPublicCopy } from "../../shared/publicI18n";

/** Security pillars displayed in the "Ваша безопасность — наш приоритет" section. */
export function getSecurityCards(locale: Locale): FeatureCard[] {
  const items = getPublicCopy(locale).home.securityCards;

  return [
    {
      icon: <PocketOptionIcon size={32} />,
      title: items[0].title,
      desc: items[0].desc,
    },
    {
      icon: <TeacherIcon size={32} />,
      title: items[1].title,
      desc: items[1].desc,
    },
    {
      icon: <SupportIcon size={32} />,
      title: items[2].title,
      desc: items[2].desc,
    },
  ];
}
