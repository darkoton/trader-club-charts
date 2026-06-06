import type { FeatureCard } from "../../shared/types/ui";
import {
  ActivityIcon,
  ArrowSquareRightIcon,
  BookIcon,
  DocumentTextIcon,
  FlashIcon,
  NotificationIcon,
} from "../../shared/components/icons";
import type { Locale } from "../../../i18n";
import { getPublicCopy } from "../../shared/publicI18n";

/** Feature cards for the bento grid on the home page. */
export function getFeatures(locale: Locale): FeatureCard[] {
  const items = getPublicCopy(locale).home.features;

  return [
    {
      icon: <BookIcon size={24} />,
      title: items[0].title,
      desc: items[0].desc,
    },
    {
      icon: <ActivityIcon size={24} />,
      title: items[1].title,
      desc: items[1].desc,
    },
    {
      icon: <DocumentTextIcon size={24} />,
      title: items[2].title,
      desc: items[2].desc,
    },
    {
      icon: <NotificationIcon size={24} />,
      title: items[3].title,
      desc: items[3].desc,
    },
    {
      icon: <ArrowSquareRightIcon size={24} />,
      title: items[4].title,
      desc: items[4].desc,
    },
    {
      icon: <FlashIcon size={24} />,
      title: items[5].title,
      desc: items[5].desc,
    },
  ];
}
