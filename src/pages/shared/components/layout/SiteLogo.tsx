import { Link, useLocation } from "react-router-dom";
import routes from "../../../../configs/routes";

interface SiteLogoProps {
  /**
   * When true, the logo is not clickable. By default the component
   * auto-disables itself on the home page (we're already there) and
   * stays clickable elsewhere.
   */
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SiteLogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
};

/**
 * "PO Terminal" brand logotype — accent "PO" + plain "Terminal".
 * Shared between `PageHeader` and `PageFooter`.
 *
 * Clickable on every page except `/` where it acts as a static title.
 */
export default function SiteLogo({ disabled, size = "sm", className = "" }: SiteLogoProps) {
  const { pathname } = useLocation();
  const isHome = pathname === routes.Home;
  const isDisabled = disabled ?? isHome;

  const cls = [
    "inline-flex items-center gap-1.5 font-bold text-white no-underline",
    SIZE_CLASSES[size],
    isDisabled ? "pointer-events-none" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link to={routes.Home} className={cls} aria-disabled={isDisabled || undefined}>
      <span className="text-accent">PO</span>
      <span>Terminal</span>
    </Link>
  );
}
