/**
 * Shared icon utilities — detect icon type and render accordingly.
 *
 * Icons from the API can be:
 *   - null/undefined — no icon set
 *   - emoji string (e.g. "₿", "💱")
 *   - server file URL starting with "/icons/" (e.g. "/icons/category_crypto.png")
 */

import { getApiBaseUrl } from '../services/apiFetch';
import { getCachedIconUrl } from '../services/imageCache';

export const COPY_TRADING_ICON_SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.2" ry="2.2"/><path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9"/></svg>';

interface CopyTradingIconProps {
  className?: string;
}

export function CopyTradingIcon({ className }: CopyTradingIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="11" height="11" rx="2.2" ry="2.2" />
      <path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9" />
    </svg>
  );
}

/* ─── Fallback emoji map (used when API returns no icon) ─── */
const FALLBACK_ICONS: Record<string, string> = {
  crypto: '₿',
  cryptocurrency: '₿',
  forex: '💱',
  currency: '💱',
  stocks: '📈',
  stock: '📈',
  commodities: '🛢️',
  commodity: '🛢️',
  indices: '📊',
  index: '📊',
  metals: '🥇',
  energies: '⚡',
  shares: '🏛️',
  otc: '🔄',
};
const FALLBACK_DEFAULT = '📌';

/** True when value is a server-hosted icon path (starts with /icons/). */
export function isIconUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('/icons/');
}

/** Build full URL for a file icon path. */
export function getIconFullUrl(iconPath: string): string {
  const base = getApiBaseUrl().replace(/\/api\/?$/, '');
  return `${base}${iconPath}`;
}

/** Get the best icon string for a category — from API or fallback. */
export function getCategoryIcon(categoryName: string, apiIcon?: string | null): string {
  if (apiIcon) return apiIcon;
  return FALLBACK_ICONS[categoryName.toLowerCase()] ?? FALLBACK_DEFAULT;
}

/** Get the best icon for a currency: currency icon → category icon → fallback. */
export function getCurrencyDisplayIcon(
  categoryName: string,
  currencyIcon?: string | null,
  categoryIcon?: string | null,
): string {
  return currencyIcon || categoryIcon || FALLBACK_ICONS[categoryName.toLowerCase()] || FALLBACK_DEFAULT;
}

/**
 * Render an icon value (emoji or image URL) into a React element.
 * Use inside JSX: {renderIcon(value, 20)}
 */
export function renderIcon(
  value: string | null | undefined,
  size = 32,
  className?: string,
): React.ReactNode {
  if (!value) return null;
  if (isIconUrl(value)) {
    const src = getCachedIconUrl(value) ?? getIconFullUrl(value);
    return (
      <img
        src={src}
        alt=""
        className={className}
        style={{ width: size, height: size, objectFit: 'contain', verticalAlign: 'middle' }}
        loading="lazy"
      />
    );
  }
  return <span className={className}>{value}</span>;
}
