import type { ReactNode } from "react";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FeatureCard {
  icon: ReactNode;
  title: string;
  desc: string;
}
