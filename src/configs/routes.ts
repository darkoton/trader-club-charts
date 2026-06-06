/**
 * Centralised route configuration for public marketing pages.
 * Every `to=` / `href=` across `src/pages/**` should come from here so a URL
 * schema can be changed in a single place.
 */
const routes = {
  Home: "/",
  Terminal: "/terminal",
  Blog: "/blog",
  BlogArticle: "/blog/:slug",
  Login: "/auth/login",
  Register: "/auth/register",
  RegisterStep2: "/auth/register/step-2",
  ResetPassword: "/auth/reset-password",
  OnlyGraph: "/only-graph",
  Admin: "/admin",
  CopyTrader: "/copy-trader",
  Affiliate: "/affiliate",
  Terms: "/terms",
  Privacy: "/privacy",
  Tma: "/tma",
} as const;

/** Builders for dynamic URLs — prefer these over manual string concat. */
export const buildPath = {
  blogArticle(slug: string) {
    return `${routes.Blog}/${slug}`;
  },
  blogListPage(page: number) {
    return page <= 1 ? routes.Blog : `${routes.Blog}?page=${page}`;
  },
  adminSection(mode: 'admin' | 'copy-trader', section?: string) {
    const baseRoute = mode === 'copy-trader' ? routes.CopyTrader : routes.Admin;
    return section ? `${baseRoute}/${section}` : baseRoute;
  },
  affiliateSection(section?: string) {
    return section ? `${routes.Affiliate}/${section}` : routes.Affiliate;
  },
};

/** External URLs (partners, socials). */
export const externalLinks = {
  pocketOption: "https://pocket-option.com",
  telegram: "https://t.me/posignals",
} as const;

export default routes;
