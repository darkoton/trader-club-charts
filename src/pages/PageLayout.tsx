import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ToastContainer } from "react-toastify";
import { createAffiliateVisit } from "../api/affiliate";
import routes from "../configs/routes";
import {
  captureAffiliateTrackingFromSearch,
  ensureAffiliateVisitorId,
  hasAffiliateTrackingContext,
  hasAffiliateVisitSearchParams,
  persistAffiliateVisitorId,
} from "./shared/api/terminalAuth";
import PageHeader from "./shared/components/layout/PageHeader";
import PageFooter from "./shared/components/layout/PageFooter";
import useScrollToTop from "./shared/hooks/useScrollToTop";
import { ENABLE_ANIMATIONS, TOAST_LIMIT } from "./config";
import "../styles/tailwind.css";

const AFFILIATE_VISIT_SESSION_PREFIX = "affiliate-visit:";

export default function PageLayout() {
  useScrollToTop();
  const { pathname, search } = useLocation();
  const isAuthPage =
    pathname === routes.Login ||
    pathname === routes.Register ||
    pathname === routes.RegisterStep2 ||
    pathname === routes.ResetPassword;

  useEffect(() => {
    captureAffiliateTrackingFromSearch(search);
  }, [search]);

  useEffect(() => {
    if (!hasAffiliateVisitSearchParams(search)) return;

    const tracking = captureAffiliateTrackingFromSearch(search);
    if (!hasAffiliateTrackingContext(tracking) || !tracking.ref_code) return;

    const sessionKey = `${AFFILIATE_VISIT_SESSION_PREFIX}${pathname}?${new URLSearchParams(search).toString()}`;

    try {
      if (sessionStorage.getItem(sessionKey) === "1") return;
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      /* private mode */
    }

    const visitorId = ensureAffiliateVisitorId();

    void createAffiliateVisit({
      ref_code: tracking.ref_code,
      al: tracking.al ?? null,
      sub_id1: tracking.sub_id1 ?? null,
      sub_id2: tracking.sub_id2 ?? null,
      sub_id3: tracking.sub_id3 ?? null,
      sub_id4: tracking.sub_id4 ?? null,
      sub_id5: tracking.sub_id5 ?? null,
      utm_source: tracking.utm_source ?? null,
      utm_campaign: tracking.utm_campaign ?? null,
      utm_medium: tracking.utm_medium ?? null,
      utm_term: tracking.utm_term ?? null,
      utm_content: tracking.utm_content ?? null,
      click_id: tracking.click_id ?? null,
      site_id: tracking.site_id ?? null,
      visitor_id: visitorId,
    })
      .then((response) => {
        if (typeof response.visitor_id === "string" && response.visitor_id.trim()) {
          persistAffiliateVisitorId(response.visitor_id);
        }
      })
      .catch(() => {
        try {
          sessionStorage.removeItem(sessionKey);
        } catch {
          /* private mode */
        }
      });
  }, [pathname, search]);

  return (
    <HelmetProvider>
      <div
        className={`po-pages relative flex min-h-screen flex-col bg-background text-white ${
          isAuthPage ? "po-pages--auth " : ""
        }${
          ENABLE_ANIMATIONS ? "po-anim" : ""
        }`}
      >
        {/* Page-wide decorative glow — two mirrored "effect.webp" layers,
            pinned to the top corners. Non-interactive, behind every
            page section. */}
        <div aria-hidden="true" className="po-page-fx">
          <span className="po-page-fx__blob po-page-fx__blob--left" />
          <span className="po-page-fx__blob po-page-fx__blob--right" />
        </div>

        <PageHeader />

        {/* Top padding on <main> accounts for the fixed header pill
            plus the gap before the first section.
            - mobile: 12px top + 68px pill + 44px gap = 124px (7.75rem)
            - lg+:    16px top + 82px pill + 106px gap = 204px (12.75rem) */}
        <main className="relative z-[1] flex flex-1 flex-col pt-[7.75rem] lg:pt-[12.75rem]">
          <Outlet />
        </main>

        <PageFooter />

        <ToastContainer
          position="bottom-right"
          theme="dark"
          newestOnTop
          closeOnClick
          pauseOnHover
          hideProgressBar={false}
          limit={TOAST_LIMIT}
        />
      </div>
    </HelmetProvider>
  );
}
