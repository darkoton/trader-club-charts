import { Link } from "react-router-dom";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import {
  BTN_HEIGHT_PX,
  BTN_PX_PRIMARY,
  BTN_PX_COMPACT,
  BTN_SECONDARY_BG,
  BTN_SECONDARY_BG_HOVER,
  BTN_DARK_BG,
  BTN_DARK_BG_HOVER,
} from "../../../config";
import { SpinnerIcon } from "../icons";

/**
 * Unified pill button used across the marketing site.
 *
 *  • height 50px, pill radius
 *  • text 16px / 600 / 20px (Montserrat — set globally on `.po-pages`)
 *  • variants:
 *      primary   — accent blue, px-32, glow on hover
 *      secondary — #222B37, px-18, accent text (used for info / hint buttons)
 *      dark      — #222222, px-32, neutral text
 *      ghost     — transparent with subtle border (legacy fallback)
 *  • can render as <button>, <Link to=...>, or <a href=...>
 *  • `loading` replaces children with a centered spinner and blocks clicks
 *  • `leftIcon` / `rightIcon` provide before/after slots
 *
 * The old `size` prop is accepted for backwards compatibility but ignored —
 * height is always 50px. All custom classes still merge via `className`.
 */

type Variant = "primary" | "secondary" | "dark" | "ghost";

const BASE =
  "relative inline-flex items-center justify-center gap-2 " +
  "font-semibold leading-5 no-underline select-none " +
  "transition-[background-color,color,border-color] duration-300 " +
  "focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "po-btn-primary bg-accent text-accent-contrast hover:bg-accent-hover",
  secondary: "po-btn-secondary text-accent hover:text-white",
  dark: "po-btn-dark text-gray-300 hover:text-white",
  ghost:
    "po-btn-ghost border border-white/[0.08] bg-transparent text-gray-300 " +
    "hover:border-white/20 hover:text-white",
};

const STYLE_BY_VARIANT: Record<Variant, CSSProperties> = {
  primary: {
    height: BTN_HEIGHT_PX,
    paddingLeft: BTN_PX_PRIMARY,
    paddingRight: BTN_PX_PRIMARY,
    borderRadius: 9999,
  },
  secondary: {
    height: BTN_HEIGHT_PX,
    paddingLeft: BTN_PX_COMPACT,
    paddingRight: BTN_PX_COMPACT,
    borderRadius: 9999,
    backgroundColor: BTN_SECONDARY_BG,
  },
  dark: {
    height: BTN_HEIGHT_PX,
    paddingLeft: BTN_PX_PRIMARY,
    paddingRight: BTN_PX_PRIMARY,
    borderRadius: 9999,
    backgroundColor: BTN_DARK_BG,
  },
  ghost: {
    height: BTN_HEIGHT_PX,
    paddingLeft: BTN_PX_PRIMARY,
    paddingRight: BTN_PX_PRIMARY,
    borderRadius: 9999,
  },
};

interface CommonProps {
  variant?: Variant;
  /** @deprecated height is fixed at 50px. Prop kept for call-site compat. */
  size?: "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "style"> & {
    to?: undefined;
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  to: string;
  href?: undefined;
  type?: undefined;
};

type ButtonAsAnchor = CommonProps & {
  href: string;
  to?: undefined;
  target?: string;
  rel?: string;
  type?: undefined;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink | ButtonAsAnchor;

/** True when the Button links to a placeholder "#" target. */
function isHashHref(p: ButtonProps): boolean {
  if ("to" in p && p.to === "#") return true;
  if ("href" in p && p.href === "#") return true;
  return false;
}

/** Hover backgrounds for variants that use inline `style` (not Tailwind bg). */
function attachHoverBg(variant: Variant) {
  if (variant === "secondary") {
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
        (e.currentTarget.style.backgroundColor = BTN_SECONDARY_BG_HOVER),
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) =>
        (e.currentTarget.style.backgroundColor = BTN_SECONDARY_BG),
    };
  }
  if (variant === "dark") {
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
        (e.currentTarget.style.backgroundColor = BTN_DARK_BG_HOVER),
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) =>
        (e.currentTarget.style.backgroundColor = BTN_DARK_BG),
    };
  }
  return {};
}

export default function Button(props: ButtonProps) {
  const {
    variant = "primary",
    fullWidth = false,
    loading = false,
    leftIcon,
    rightIcon,
    children,
    className = "",
    style,
  } = props;

  const cls = [
    BASE,
    VARIANT_CLASSES[variant],
    fullWidth ? "w-full" : "",
    loading ? "pointer-events-none" : "",
    isHashHref(props) ? "po-hash-disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const mergedStyle: CSSProperties = { ...STYLE_BY_VARIANT[variant], ...style };

  const content = (
    <>
      <span
        className="inline-flex items-center gap-2"
        style={{ opacity: loading ? 0 : 1, transition: "opacity 150ms" }}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </span>
      {loading && (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <SpinnerIcon size={20} />
        </span>
      )}
    </>
  );

  if ("to" in props && props.to) {
    const hover = attachHoverBg(variant);
    return (
      <Link
        to={props.to}
        className={cls}
        style={mergedStyle}
        aria-busy={loading || undefined}
        {...hover}
      >
        {content}
      </Link>
    );
  }

  if ("href" in props && props.href) {
    const hover = attachHoverBg(variant);
    return (
      <a
        href={props.href}
        target={props.target}
        rel={props.rel}
        className={cls}
        style={mergedStyle}
        aria-busy={loading || undefined}
        {...hover}
      >
        {content}
      </a>
    );
  }

  const rest = props as ButtonAsButton;
  const hover = attachHoverBg(variant);
  return (
    <button
      type={rest.type ?? "button"}
      onClick={rest.onClick}
      disabled={rest.disabled || loading}
      aria-label={rest["aria-label"]}
      aria-busy={loading || undefined}
      className={cls}
      style={mergedStyle}
      {...hover}
    >
      {content}
    </button>
  );
}
