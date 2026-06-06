/**
 * Public barrel for the `/pages` marketing site.
 * External consumers (router, tests) should import from here so internal
 * structure of `pages/` can evolve without touching call sites.
 */

export { default as PageLayout } from "./PageLayout";

export { default as TerminalGuard } from "./shared/components/guards/TerminalGuard";

export { default as HomePage } from "./home/HomePage";

export { default as BlogListPage } from "./blog/BlogListPage";
export { default as BlogArticlePage } from "./blog/BlogArticlePage";

export { default as TermsPage } from "./legal/TermsPage";
export { default as PrivacyPage } from "./legal/PrivacyPage";

export { default as NotFoundPage } from "./not-found/NotFoundPage";

export { default as LoginPage } from "./auth/LoginPage";
export { default as RegisterPage } from "./auth/RegisterPage";
export { default as RegisterStep2Page } from "./auth/RegisterStep2Page";
export { default as ResetPasswordPage } from "./auth/ResetPasswordPage";
