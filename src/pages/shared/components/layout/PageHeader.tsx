import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import routes from "../../../../configs/routes";
import { useI18n, type Locale } from "../../../../i18n";
import { usePublicI18n } from "../../publicI18n";
import SiteLogo from "./SiteLogo";
import Button from "../ui/Button";
import useAuth from "../../hooks/useAuth";
import { ArrowUpIcon, CloseIcon, DocumentIcon, HomeIcon, MenuIcon, UserIcon } from "../icons";

const ICON_SIZE = 16;

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `po-link-header text-[0.9375rem] font-medium ${isActive ? "is-active" : ""}`;

const mobileTabClass = ({ isActive }: { isActive: boolean }) =>
  `po-link-header flex flex-1 justify-center rounded-full px-4 py-3 text-[0.9375rem] font-medium ${
    isActive ? "is-active bg-white/5" : ""
  }`;

const MOBILE_LOCALE_LABELS: Record<Locale, string> = {
  uk: "Укр",
  ru: "Ру",
  en: "Англ",
};

const MOBILE_LOCALE_MENU_LABELS: Record<Locale, string> = {
  uk: "Українська",
  ru: "Русский",
  en: "English",
};

const DESKTOP_LOCALE_LABELS: Record<Locale, string> = {
  uk: "УКР",
  ru: "РУ",
  en: "АНГЛ",
};

function maskEmail(email: string, hideEmail: boolean): string {
  if (!hideEmail || !email) return email;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return local.slice(0, 2) + "***@" + domain;
}

/**
 * Marketing-site header.
 *
 * The pill and mobile drawer are each rendered as *direct* `position: fixed`
 * elements (see `.po-header-shell` / `.po-drawer-shell`). Nesting a
 * `backdrop-filter` layer inside another fixed/z-indexed ancestor traps the
 * filter in a descendant stacking context in Chromium, so the pill stops
 * blurring the page. Keeping each blur layer as its own fixed root fixes
 * that and also makes the drawer position independent of any container.
 */
export default function PageHeader() {
  const { user, isLoading } = useAuth();
  const { locale, setLocale } = useI18n();
  const { publicT } = usePublicI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hideEmail, setHideEmail] = useState(() => {
    try {
      return localStorage.getItem("tc_hide_email") === "1";
    } catch {
      return false;
    }
  });
  // Keep the drawer mounted through its closing animation.
  const [rendered, setRendered] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const syncHideEmail = () => {
      try {
        setHideEmail(localStorage.getItem("tc_hide_email") === "1");
      } catch {
        setHideEmail(false);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "tc_hide_email") return;
      syncHideEmail();
    };

    const handleCustomChange = () => {
      syncHideEmail();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("tc-hide-email-change", handleCustomChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("tc-hide-email-change", handleCustomChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      setRendered(true);
      return;
    }
    if (!rendered) return;
    const t = setTimeout(() => setRendered(false), 260);
    return () => clearTimeout(t);
  }, [mobileOpen, rendered]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  // Lock background scroll (html + body) while the drawer is open.
  // Locking only <body> is not enough on iOS Safari.
  useEffect(() => {
    if (!mobileOpen) return;
    const html = document.documentElement;
    const { body } = document;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyTouch: body.style.touchAction,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.touchAction = prev.bodyTouch;
    };
  }, [mobileOpen]);

  // Close on Esc.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <header className="po-header-root" data-open={mobileOpen ? "true" : "false"}>
      {/* Transparent click-outside layer. */}
      {rendered && (
        <button
          type="button"
          aria-label={publicT.header.closeMenu}
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
          className="po-mobile-backdrop fixed inset-0 z-40 cursor-default bg-transparent lg:hidden"
        />
      )}

      {/* Pill — itself position: fixed so backdrop-filter correctly samples
          the scrolling page behind it. Per Figma (1920px): height 82px,
          padding 24px left / 16px right, logo → nav gap 80px. */}
      <div className="po-header-shell">
        <div className="container mx-auto">
          <div className="po-header-pill flex h-[5.125rem] items-center justify-between rounded-[3.125rem] border border-white/5 pl-5 pr-4 lg:pl-6 lg:pr-4">
            <div className="flex items-center gap-6 lg:gap-20">
              <SiteLogo />

              {/* Desktop nav */}
              <nav className="hidden items-center gap-7 lg:flex">
                <NavLink to={routes.Home} end className={navLinkClass}>
                  <HomeIcon size={ICON_SIZE} />
                  {publicT.header.navHome}
                </NavLink>
                <NavLink to={routes.Blog} className={navLinkClass}>
                  <DocumentIcon size={ICON_SIZE} />
                  {publicT.header.navBlog}
                </NavLink>
              </nav>
            </div>

            <div className="flex items-center gap-2 lg:gap-3">
              <MobileLocaleSwitcher
                locale={locale}
                setLocale={setLocale}
                ariaLabel={publicT.header.languagePicker}
              />

              <DesktopLocaleSwitcher
                locale={locale}
                setLocale={setLocale}
                ariaLabel={publicT.header.languagePicker}
              />

              {/* Desktop auth */}
              <div className="hidden items-center gap-3 lg:flex">
                <DesktopAuth user={user} isLoading={isLoading} hideEmail={hideEmail} />
              </div>

              {/* Mobile burger — crossfade+rotate between menu / close. */}
              <button
                type="button"
                aria-label={mobileOpen ? publicT.header.closeMenu : publicT.header.openMenu}
                aria-expanded={mobileOpen}
                aria-controls="mobile-menu"
                onClick={() => setMobileOpen((v) => !v)}
                className="po-burger relative flex h-[3.125rem] w-[3.125rem] shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast lg:hidden"
              >
                <span
                  aria-hidden="true"
                  className={`po-burger-icon po-burger-icon--menu ${mobileOpen ? "is-hidden" : "is-visible"}`}
                >
                  <MenuIcon size={20} />
                </span>
                <span
                  aria-hidden="true"
                  className={`po-burger-icon po-burger-icon--close ${mobileOpen ? "is-visible" : "is-hidden"}`}
                >
                  <CloseIcon size={20} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer — also its own fixed element (not a descendant of the
          pill) so the blur works. Scrolls internally when content overflows;
          `scroll-padding-bottom` keeps the last item clear of the viewport
          edge. */}
      {rendered && (
        <div id="mobile-menu" className="po-drawer-shell lg:hidden">
          <div className="container mx-auto">
            <div
              className={`po-mobile-menu space-y-3 pb-6 ${mobileOpen ? "is-open" : "is-closing"}`}
            >
              <div className="po-drawer-pill flex items-center gap-1 rounded-[3.125rem] border border-white/5 p-2">
                <NavLink to={routes.Home} end className={mobileTabClass}>
                  <HomeIcon size={ICON_SIZE} />
                  {publicT.header.navHome}
                </NavLink>
                <NavLink to={routes.Blog} className={mobileTabClass}>
                  <DocumentIcon size={ICON_SIZE} />
                  {publicT.header.navBlog}
                </NavLink>
              </div>

              <div className="po-drawer-pill space-y-2 rounded-[2rem] border border-white/5 p-3">
                <MobileAuth user={user} isLoading={isLoading} hideEmail={hideEmail} />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function MobileLocaleSwitcher(
  { locale, setLocale, ariaLabel }: { locale: Locale; setLocale: (locale: Locale) => void; ariaLabel: string },
) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const activeLabel = MOBILE_LOCALE_LABELS[locale];

  return (
    <div
      ref={rootRef}
      className="relative lg:hidden"
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 min-w-[4.875rem] items-center justify-between gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:border-white/20 hover:bg-white/[0.07]"
      >
        <span>{activeLabel}</span>
        <ArrowUpIcon
          size={14}
          className={`shrink-0 text-white/70 transition-transform ${open ? "rotate-0" : "rotate-180"}`}
        />
      </button>

      <div
        role="menu"
        aria-label={ariaLabel}
        className={`absolute right-0 top-[calc(100%+0.5rem)] min-w-[10rem] overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#121212]/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        {(["uk", "ru", "en"] as const).map((item) => {
          const active = item === locale;

          return (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              onClick={() => {
                setLocale(item);
                setOpen(false);
              }}
              aria-pressed={active}
              aria-checked={active}
              className={`flex w-full items-center justify-between rounded-[0.9rem] px-3 py-2.5 text-left transition-colors ${
                active ? "bg-white/[0.08] text-white" : "text-white/68 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <span className="flex flex-col">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em]">
                  {MOBILE_LOCALE_LABELS[item]}
                </span>
                <span className="text-[0.8rem] font-medium normal-case tracking-normal text-white/58">
                  {MOBILE_LOCALE_MENU_LABELS[item]}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full transition-colors ${active ? "bg-accent" : "bg-white/15"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopLocaleSwitcher(
  { locale, setLocale, ariaLabel }: { locale: Locale; setLocale: (locale: Locale) => void; ariaLabel: string },
) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative hidden lg:block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-[3.125rem] min-w-[8.75rem] items-center justify-between gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-[0.9rem] font-semibold tracking-[0.04em] text-white transition-colors hover:border-white/20 hover:bg-white/[0.07]"
      >
        <span>{DESKTOP_LOCALE_LABELS[locale]}</span>
        <ArrowUpIcon
          size={16}
          className={`shrink-0 text-white/70 transition-transform ${open ? "rotate-0" : "rotate-180"}`}
        />
      </button>

      <div
        role="menu"
        aria-label={ariaLabel}
        className={`absolute right-0 top-[calc(100%+0.625rem)] min-w-[12.5rem] overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#121212]/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        {(["uk", "ru", "en"] as const).map((item) => {
          const active = item === locale;

          return (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                setLocale(item);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-[0.9rem] px-3 py-3 text-left transition-colors ${
                active ? "bg-white/[0.08] text-white" : "text-white/68 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <span className="flex flex-col">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em]">
                  {DESKTOP_LOCALE_LABELS[item]}
                </span>
                <span className="text-[0.875rem] font-medium normal-case tracking-normal text-white/58">
                  {MOBILE_LOCALE_MENU_LABELS[item]}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full transition-colors ${active ? "bg-accent" : "bg-white/15"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Auth slots ─── */

type AuthUser = ReturnType<typeof useAuth>["user"];

function DesktopAuth({ user, isLoading, hideEmail }: { user: AuthUser; isLoading: boolean; hideEmail: boolean }) {
  const { publicT } = usePublicI18n();

  if (isLoading) {
    return <div className="h-[3.125rem] w-32 animate-pulse rounded-full bg-white/10" />;
  }

  if (user) {
    return (
      <Button
        to={user.is_confirmed ? routes.Terminal : routes.RegisterStep2}
        variant="secondary"
        leftIcon={<UserIcon size={ICON_SIZE} />}
      >
        <span className="block max-w-[18rem] truncate xl:max-w-[22rem]">
          {user.email ? maskEmail(user.email, hideEmail) : publicT.header.account}
        </span>
      </Button>
    );
  }

  return (
    <>
      <Button variant="dark" to={routes.Login}>
        {publicT.header.login}
      </Button>
      <Button variant="primary" to={routes.Register}>
        {publicT.header.register}
      </Button>
    </>
  );
}

function MobileAuth({ user, isLoading, hideEmail }: { user: AuthUser; isLoading: boolean; hideEmail: boolean }) {
  const { publicT } = usePublicI18n();

  if (isLoading) {
    return <div className="h-[3.125rem] w-full animate-pulse rounded-full bg-white/10" />;
  }

  if (user) {
    return (
      <Button
        to={user.is_confirmed ? routes.Terminal : routes.RegisterStep2}
        variant="secondary"
        fullWidth
        leftIcon={<UserIcon size={ICON_SIZE} />}
      >
        {user.email ? maskEmail(user.email, hideEmail) : publicT.header.account}
      </Button>
    );
  }

  return (
    <>
      <Button to={routes.Login} variant="dark" fullWidth>
        {publicT.header.login}
      </Button>
      <Button to={routes.Register} variant="primary" fullWidth>
        {publicT.header.register}
      </Button>
    </>
  );
}
