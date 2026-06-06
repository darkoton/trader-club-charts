/**
 * AccountSwitcher — Header component for switching PO accounts and demo/real mode.
 * 
 * Shows a compact button in the header with the current account + mode.
 * Dropdown: list of accounts, demo/real toggle, add account button.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { BetterAccount, AccountBalances, AccountInfo } from '../api/better';
import { getAccounts, getBalance } from '../api/better';
import { betterSocket } from '../api/betterSocket';
import type { BalanceUpdateEvent, BalanceChangedEvent } from '../api/betterSocket';
import { useI18n } from '../i18n';

import EyeIcon from '../assets/icons/eye.svg?react';

interface AccountSwitcherProps {
  selectedAccount: BetterAccount | null;
  isDemo: boolean;
  onSelectAccount: (account: BetterAccount | null) => void;
  onToggleDemo: (isDemo: boolean) => void;
  onOpenLogin: () => void;
}

/** Map ISO currency code to its symbol. Fallback: code + space. */
function currencySymbol(code: string | undefined): string {
  if (!code) return '$';
  const map: Record<string, string> = {
    // Americas
    USD: '$', CAD: 'CA$', MXN: 'MX$', BRL: 'R$', ARS: 'AR$', CLP: 'CL$', COP: 'CO$',
    // Europe
    EUR: '€', GBP: '£', CHF: 'Fr ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ',
    PLN: 'zł ', CZK: 'Kč ', HUF: 'Ft ', RON: 'lei ', BGN: 'лв ', HRK: 'kn ',
    RUB: '₽', UAH: '₴', KZT: '₸', BYN: 'Br ', GEL: '₾', AMD: '֏', AZN: '₼',
    TRY: '₺', MDL: 'L ',
    // Asia / Pacific
    JPY: '¥', CNY: '¥', HKD: 'HK$', SGD: 'S$', KRW: '₩', INR: '₹', IDR: 'Rp ',
    THB: '฿', MYR: 'RM ', PHP: '₱', TWD: 'NT$', PKR: '₨', BDT: '৳', VND: '₫',
    // Middle East / Africa
    AED: 'د.إ ', SAR: '﷼ ', ILS: '₪', EGP: 'E£ ', ZAR: 'R ', NGN: '₦', KES: 'KSh ',
    // Crypto-fiat aliases
    USDT: '$', USDC: '$',
  };
  return map[code.toUpperCase()] ?? `${code} `;
}

/** Apply a socket balance event into the balances map. Creates entry if missing. */
function applySocketBalance(
  prev: Record<string, AccountBalances>,
  accountId: string,
  isDemoEvt: boolean,
  bal: number,
  currency?: string,
  accountInfo?: AccountInfo,
): Record<string, AccountBalances> {
  const existing = prev[accountId];
  if (existing) {
    const updated: AccountBalances = { ...existing, balances: { ...existing.balances } };
    if (isDemoEvt) updated.balances.demo = bal;
    else updated.balances.real = bal;
    if (currency) {
      updated.currencies = {
        ...(existing.currencies ?? { demo: 'USD', real: 'USD' }),
        ...(isDemoEvt ? { demo: currency } : { real: currency }),
      };
    }
    if (accountInfo) updated.account_info = accountInfo;
    return { ...prev, [accountId]: updated };
  }
  // Create a minimal entry so the header shows the balance immediately
  return {
    ...prev,
    [accountId]: {
      account_id: accountId,
      email: '',
      balances: { demo: isDemoEvt ? bal : 0, real: isDemoEvt ? 0 : bal },
      currencies: currency
        ? (isDemoEvt ? { demo: currency, real: 'USD' } : { demo: 'USD', real: currency })
        : undefined,
      account_info: accountInfo,
    },
  };
}

export function AccountSwitcher({
  selectedAccount,
  isDemo,
  onSelectAccount,
  onToggleDemo,
  onOpenLogin,
}: AccountSwitcherProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<BetterAccount[]>([]);
  const [balances, setBalances] = useState<Record<string, AccountBalances>>({});
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [showBalancePopup, setShowBalancePopup] = useState(false);

  // Multi-account UI is intentionally disabled for all roles.
  const multiAccountEnabled = false;
  // Admin flag is kept for compatibility with access-dependent behavior.
  const isAdmin = (() => { try { return localStorage.getItem('tc_is_admin') === '1'; } catch { return false; } })();

  const closeBalancePopup = useCallback(() => {
    setShowBalancePopup(false);
  }, []);

  /* ─── Email visibility toggle (persisted in localStorage) ─── */
  const [hideEmail, setHideEmail] = useState(() => localStorage.getItem('tc_hide_email') === '1');

  const toggleHideEmail = useCallback(() => {
    setHideEmail((prev) => {
      const next = !prev;
      localStorage.setItem('tc_hide_email', next ? '1' : '0');
      window.dispatchEvent(new CustomEvent('tc-hide-email-change', { detail: next }));
      return next;
    });
  }, []);

  const maskEmail = useCallback((email: string) => {
    if (!hideEmail || !email) return email;
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return local.slice(0, 2) + '***@' + domain;
  }, [hideEmail]);

  /* ─── Load selected account balance on mount / account change ─── */
  useEffect(() => {
    if (!selectedAccount) return;
    let cancelled = false;
    getBalance(selectedAccount.id)
      .then((b) => {
        if (!cancelled) {
          setBalances((prev) => ({ ...prev, [b.account_id]: b }));
        }
      })
      .catch(() => {});

    // Subscribe to real-time balance for selected account
    betterSocket.subscribeBalance(selectedAccount.id, isDemo);

    return () => {
      cancelled = true;
      betterSocket.unsubscribeBalance(selectedAccount.id, isDemo);
    };
  }, [selectedAccount, isDemo]);

  /* ─── Load all accounts when dropdown opens (admin only) ─── */
  useEffect(() => {
    if (!open || !isAdmin || !multiAccountEnabled) return;
    setLoading(true);
    getAccounts()
      .then((accs) => {
        setAccounts(accs);
        // Load balances for all accounts
        Promise.all(accs.map((a) => getBalance(a.id).catch(() => null)))
          .then((results) => {
            const bMap: Record<string, AccountBalances> = {};
            results.forEach((r) => { if (r) bMap[r.account_id] = r; });
            setBalances((prev) => ({ ...prev, ...bMap }));
          });
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [open, isAdmin, multiAccountEnabled]);

  /* ─── Real-time balance via socket (always active) ─── */
  useEffect(() => {
    const unsub1 = betterSocket.onBalanceUpdate((data: BalanceUpdateEvent) => {
      setBalances((prev) => applySocketBalance(prev, data.account_id, data.is_demo, data.balance, data.currency, data.account_info));
    });
    const unsub2 = betterSocket.onBalanceChanged((data: BalanceChangedEvent) => {
      setBalances((prev) => applySocketBalance(prev, data.account_id, data.is_demo, data.balance, data.currency));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  /* ─── Close on outside click ─── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) &&
          (!portalRef.current || !portalRef.current.contains(target))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelectAccount = useCallback((acc: BetterAccount) => {
    onSelectAccount(acc);
    setOpen(false);
  }, [onSelectAccount]);

  const currentBal = selectedAccount && balances[selectedAccount.id];
  const displayBal = currentBal
    ? (isDemo ? currentBal.balances.demo : currentBal.balances.real)
    : null;

  return (
    <div className="account-switcher" ref={ref}>
      <button
        className="account-switcher__trigger"
        onClick={() => {setOpen(!open); setShowBalancePopup(true);}}
      >
        <span className={`account-switcher__mode${isDemo ? ' account-switcher__mode--demo' : ' account-switcher__mode--real'}`}>
          {isDemo ? 'D' : 'R'}
        </span>
        <span className="account-switcher__info">
          {selectedAccount ? (
            <>
              {displayBal !== null && (
                <span className="account-switcher__bal">{currencySymbol(currentBal?.currencies?.[isDemo ? 'demo' : 'real'])}{displayBal.toFixed(2)}</span>
              )}
            </>
          ) : (
            <span className="account-switcher__no-acc">{t.betNoAccount}</span>
          )}
        </span>
        <svg className="account-switcher__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.96004 4.47501L6.70004 7.73501C6.31504 8.12001 5.68504 8.12001 5.30004 7.73501L2.04004 4.47501" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (() => {
        const isMobile = window.innerWidth <= 600;
        const dropdownContent = (
          <>
            {/* Demo / Real toggle + Hide email */}
            <div className="account-switcher__mode-toggle">
              <button
                className={`account-switcher__mode-btn${isDemo ? ' account-switcher__mode-btn--active' : ''}`}
                onClick={() => onToggleDemo(true)}
              >
                <span className="account-switcher__mode-top"><span className="account-switcher__mode-letter account-switcher__mode-letter--demo">D</span>Demo</span>
                <span className="account-switcher__mode-bal">$33425.99</span>
              </button>
              <button
                className={`account-switcher__mode-btn${!isDemo ? ' account-switcher__mode-btn--active' : ''}`}
                onClick={() => onToggleDemo(false)}
              >
                <span className="account-switcher__mode-top"><span className="account-switcher__mode-letter account-switcher__mode-letter--real">R</span> Real</span>
                <span className="account-switcher__mode-bal">$33425.99</span>
              </button>
              <button
                type="button"
                className="account-switcher__eye-btn"
                onClick={toggleHideEmail}
                title={hideEmail ? 'Show emails' : 'Hide emails'}
              >
                {hideEmail ? '🙈' : <EyeIcon/>}
              </button>
            </div>

            {/* <div className="account-switcher__sep" /> */}

            {/* Account list (multi-accounting) */}
            {isAdmin && multiAccountEnabled && (<>
            {loading ? (
              <div className="account-switcher__loading">{t.loading}</div>
            ) : accounts.length === 0 ? (
              <div className="account-switcher__empty">
                <span>{t.betNoAccounts}</span>
              </div>
            ) : (
              <div className="account-switcher__list">
                {accounts.map((acc) => {
                  const bal = balances[acc.id];
                  const isActive = selectedAccount?.id === acc.id;
                  const accBal = bal ? (isDemo ? bal.balances.demo : bal.balances.real) : null;
                  return (
                    <div key={acc.id} className={`account-switcher__item${isActive ? ' account-switcher__item--active' : ''}`}>
                      <button
                        className="account-switcher__item-main"
                        onClick={() => handleSelectAccount(acc)}
                      >
                        <span className={`account-switcher__item-dot${acc.is_active && acc.has_tokens ? ' account-switcher__item-dot--ok' : ''}`} />
                        <span className="account-switcher__item-email">{maskEmail(acc.email)}</span>
                        {accBal !== null && (
                          <span className="account-switcher__item-bal">{currencySymbol(bal?.currencies?.[isDemo ? 'demo' : 'real'])}{accBal.toFixed(2)}</span>
                        )}
                        {isActive && <span className="account-switcher__item-check">✓</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="account-switcher__sep" />

            {/* Add account button */}
            <button className="account-switcher__add" onClick={() => { setOpen(false); onOpenLogin(); }}>
              <span className="account-switcher__add-icon">+</span>
              <span>{t.betAddAccount}</span>
            </button>
            </>)}

            {/* Single-account mode: show add button when account is missing */}
            {(!isAdmin || !multiAccountEnabled) && !selectedAccount && (
              <>
                <div className="account-switcher__sep" />
                <button className="account-switcher__add" onClick={() => { setOpen(false); onOpenLogin(); }}>
                  <span className="account-switcher__add-icon">+</span>
                  <span>{t.betAddAccount}</span>
                </button>
              </>
            )}
          </>
        );

        if (isMobile && showBalancePopup) {
          return createPortal(
            <div className="ac-portal" onClick={() => setOpen(false)}>
              <div className="ac-portal__sheet" ref={portalRef} onClick={(e) => e.stopPropagation()}>
                <div className="portal-sheet__handle" />
                <div className="portal-sheet__close-header">
                  <span className="portal-sheet__close-title">Баланс</span>
                  <button className="portal-sheet__close-btn" onClick={closeBalancePopup}>✕</button>
                  </div>
                {dropdownContent}
              </div>
            </div>,
            document.body
          );
        }

        return (
          <div className="account-switcher__dropdown">
            {dropdownContent}
          </div>
        );
      })()}

    </div>
  );
}
