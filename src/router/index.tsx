import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import routes from "../configs/routes";
import TerminalGuard from "../pages/shared/components/guards/TerminalGuard";

const LAZY_RELOAD_KEY = "tc-lazy-route-reload";

function lazyWithRecovery<TModule extends { default: React.ComponentType<any> }>(
  importer: () => Promise<TModule>,
) {
  return lazy(async () => {
    try {
      const loaded = await importer();
      try {
        sessionStorage.removeItem(LAZY_RELOAD_KEY);
      } catch {
        // ignore storage failures
      }
      return loaded;
    } catch (error) {
      const canReload = typeof window !== "undefined";
      if (!canReload) {
        throw error;
      }

      let shouldReload = false;
      try {
        shouldReload = sessionStorage.getItem(LAZY_RELOAD_KEY) !== "1";
        if (shouldReload) {
          sessionStorage.setItem(LAZY_RELOAD_KEY, "1");
        }
      } catch {
        shouldReload = true;
      }

      if (shouldReload) {
        window.location.reload();
        return new Promise<TModule>(() => undefined);
      }

      throw error;
    }
  });
}

const App = lazyWithRecovery(() => import("../App"));
const AdminPage = lazyWithRecovery(() => import("../components/AdminPage").then((m) => ({ default: m.AdminPage })));
const AffiliatePage = lazyWithRecovery(() => import("../components/AffiliatePage").then((m) => ({ default: m.AffiliatePage })));
const OnlyGraphPage = lazyWithRecovery(() => import("../components/OnlyGraphPage").then((m) => ({ default: m.OnlyGraphPage })));
const TmaAuthPage = lazyWithRecovery(() => import("../tma/TmaAuthPage").then((m) => ({ default: m.TmaAuthPage })));
const PageLayout = lazyWithRecovery(() => import("../pages/PageLayout"));
const HomePage = lazyWithRecovery(() => import("../pages/home/HomePage"));
const BlogListPage = lazyWithRecovery(() => import("../pages/blog/BlogListPage"));
const BlogArticlePage = lazyWithRecovery(() => import("../pages/blog/BlogArticlePage"));
const TermsPage = lazyWithRecovery(() => import("../pages/legal/TermsPage"));
const PrivacyPage = lazyWithRecovery(() => import("../pages/legal/PrivacyPage"));
const LoginPage = lazyWithRecovery(() => import("../pages/auth/LoginPage"));
const RegisterPage = lazyWithRecovery(() => import("../pages/auth/RegisterPage"));
const RegisterStep2Page = lazyWithRecovery(() => import("../pages/auth/RegisterStep2Page"));
const ResetPasswordPage = lazyWithRecovery(() => import("../pages/auth/ResetPasswordPage"));
const NotFoundPage = lazyWithRecovery(() => import("../pages/not-found/NotFoundPage"));

function withSuspense(node: ReactNode) {
  return (
    <Suspense fallback={<RouteLoader />}>
      {node}
    </Suspense>
  );
}

function RouteLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#070707',
        color: '#c5cdd8',
        fontSize: 14,
      }}
    >
      Загрузка...
    </div>
  );
}

function getManagementModeFromHash(hash: string) {
  const hashRoute = hash.replace("#", "");
  return hashRoute === "admin" ? "admin" : hashRoute === "copy-trader" ? "copy-trader" : null;
}

function LegacyManagementRedirect() {
  const location = useLocation();
  const managementMode = getManagementModeFromHash(location.hash);
  const targetPath = managementMode === "copy-trader" ? routes.CopyTrader : routes.Admin;

  return <Navigate to={{ pathname: targetPath, search: location.search }} replace />;
}

const managementMode = getManagementModeFromHash(window.location.hash);

const router = createBrowserRouter([
  {
    element: withSuspense(<PageLayout />),
    children: [
      { path: routes.Home, element: withSuspense(<HomePage />) },
      { path: routes.Blog, element: withSuspense(<BlogListPage />) },
      { path: routes.BlogArticle, element: withSuspense(<BlogArticlePage />) },
      { path: routes.Terms, element: withSuspense(<TermsPage />) },
      { path: routes.Privacy, element: withSuspense(<PrivacyPage />) },
      { path: routes.Login, element: withSuspense(<LoginPage />) },
      { path: routes.Register, element: withSuspense(<RegisterPage />) },
      { path: routes.RegisterStep2, element: withSuspense(<RegisterStep2Page />) },
      { path: routes.ResetPassword, element: withSuspense(<ResetPasswordPage />) },
      { path: "*", element: withSuspense(<NotFoundPage />) },
    ],
  },
  {
    path: routes.Terminal,
    element: managementMode ? (
      withSuspense(<LegacyManagementRedirect />)
    ) : (
      <TerminalGuard>
        {withSuspense(<App />)}
      </TerminalGuard>
    ),
  },
  { path: routes.Admin, element: withSuspense(<AdminPage mode="admin" />) },
  { path: `${routes.Admin}/:section`, element: withSuspense(<AdminPage mode="admin" />) },
  { path: routes.CopyTrader, element: withSuspense(<AdminPage mode="copy-trader" />) },
  { path: `${routes.CopyTrader}/:section`, element: withSuspense(<AdminPage mode="copy-trader" />) },
  { path: routes.Affiliate, element: withSuspense(<AffiliatePage />) },
  { path: `${routes.Affiliate}/:section`, element: withSuspense(<AffiliatePage />) },
  { path: routes.OnlyGraph, element: withSuspense(<OnlyGraphPage />) },
  { path: routes.Tma, element: withSuspense(<TmaAuthPage />) },
]);

export default router;
