/**
 * UserProfileMenu — Avatar button with dropdown showing user info,
 * language selector, and logout.
 *
 * Fetches profile from /user/me on mount (or uses dev-mode stub).
 * The language list is a searchable grid — ready for many locales.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { authService } from '../services/auth';
import { changePassword, deleteAccount, getMyProfile, persistUserAccess, readStoredUserAccess, type UserProfile } from '../api/user';
import { useI18n, LOCALE_LABELS, LOCALE_FLAGS, type Locale } from '../i18n';
import { storageService } from '../services/storage';
import type { AccountStatus } from '../types/accountStatus';
import { ACCOUNT_STATUS_BONUSES } from '../types/accountStatus';
import routes from '../configs/routes';

import UserIcon from '../assets/icons/user.svg?react';
import CopyIcon from '../assets/icons/copy.svg?react';
import CupIcon from '../assets/icons/cup.svg?react';
import LanguageIcon from '../assets/icons/language.svg?react';
import LogoutIcon from '../assets/icons/logout.svg?react';
import StatsIcon from '../assets/icons/stats.svg?react';
import TradeIcon from '../assets/icons/trade.svg?react';

/* ─── Constants ─── */
const ALL_LOCALES: Locale[] = Object.keys(LOCALE_LABELS) as Locale[];

/* ═══════════ Component ═══════════ */

interface UserProfileMenuProps {
  onOpenCopyTrading?: () => void;
  onOpenAccountStats?: () => void;
  onOpenTradingTop?: () => void;
  showBetting?: boolean;
  onToggleBetting?: (v: boolean) => void;
}

export function UserProfileMenu({ onOpenCopyTrading, onOpenAccountStats, onOpenTradingTop, showBetting, onToggleBetting }: UserProfileMenuProps) {
  const { t, locale, setLocale } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('standard');

  const [avatarError] = useState(false);
  const [storedAccess, setStoredAccess] = useState(() => readStoredUserAccess());
  const menuRef = useRef<HTMLDivElement>(null);

  /* ─── Password change state ─── */
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  /* ─── Account deletion state ─── */
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delError, setDelError] = useState<string | null>(null);
  const [delLoading, setDelLoading] = useState(false);

  /* ─── Fetch profile ─── */
  useEffect(() => {
    if (authService.isDevMode() && !authService.isAuthenticated()) {
      // Dev-mode stub
      setProfile({
        user_id: 0,
        first_name: 'Dev',
        last_name: 'Mode',
        username: null,
        avatar_url: null,
        language_code: 'en',
        is_premium: false,
        is_admin: true,
        trader_id: 0,
      });
      persistUserAccess({ is_admin: true, is_copy_trader: false, copy_trader_access: null });
      return;
    }

    getMyProfile()
      .then((p) => {
        setProfile(p);
        persistUserAccess(p);
        setStoredAccess(readStoredUserAccess());
      })
      .catch((err) => console.warn('Failed to load profile:', err));
  }, []);

  /* ─── Load account status from storage ─── */
  useEffect(() => {
    setAccountStatus(storageService.getAccountStatus());
  }, []);

  /* ─── Close on outside click ─── */
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setLangOpen(false);
        setStatusOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleLocale = useCallback((l: Locale) => {
    setLocale(l);
    setLangOpen(false);
  }, [setLocale]);

  const handleAccountStatus = useCallback((status: AccountStatus) => {
    setAccountStatus(status);
    setStatusOpen(false);
    storageService.patchAccountStatus(status);
    // Trigger re-render to apply bonus
    window.dispatchEvent(new CustomEvent('accountStatusChanged', { detail: status }));
  }, []);

  /* ─── Password change handler ─── */
  const handleChangePassword = useCallback(async () => {
    setPwdError(null);
    setPwdSuccess(false);
    if (pwdNew.length < 6) { setPwdError(t.passwordTooShort); return; }
    if (pwdNew !== pwdConfirm) { setPwdError(t.passwordMismatch); return; }
    setPwdLoading(true);
    try {
      await changePassword({ current_password: pwdCurrent, new_password: pwdNew });
      setPwdSuccess(true);
      setPwdCurrent(''); setPwdNew(''); setPwdConfirm('');
      setTimeout(() => { setShowPasswordModal(false); setPwdSuccess(false); }, 1500);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPwdLoading(false);
    }
  }, [pwdCurrent, pwdNew, pwdConfirm, t]);

  /* ─── Account deletion handler ─── */
  const handleDeleteAccount = useCallback(async () => {
    setDelError(null);
    if (!delPassword) { setDelError(t.deleteAccountPassword); return; }
    setDelLoading(true);
    try {
      await deleteAccount({ password: delPassword });
      authService.logout();
      window.location.href = '/';
    } catch (err) {
      setDelError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDelLoading(false);
    }
  }, [delPassword, t]);

  const handleLogout = useCallback(() => {
    persistUserAccess(null);
    authService.logout();
    setOpen(false);
    window.location.href = '/';
  }, []);

  /* ─── Derived ─── */
  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username || 'User'
    : '…';

  const initials = profile
    ? (profile.first_name?.[0] ?? '') + (profile.last_name?.[0] ?? '') || (profile.username?.[0]?.toUpperCase() ?? 'U')
    : '…';

  const showAvatar = profile?.avatar_url && !avatarError;
  
  // Use profile if loaded, otherwise check localStorage fallback
  const isAdmin = profile?.is_admin ?? storedAccess.isAdmin;
  const hasAffiliateAccess = profile?.affiliate_access?.has_access ?? storedAccess.hasAffiliateAccess;
  const hasCopyTraderAccess = profile?.copy_trader_access?.has_access ?? storedAccess.hasCopyTraderAccess;
  
  const managementItems = [
    isAdmin ? { key: 'admin', label: t.adminPanel, target: routes.Admin, icon: '⚙' } : null,
    hasAffiliateAccess ? { key: 'affiliate', label: t.affiliateMenu, target: routes.Affiliate, icon: '🤝' } : null,
    hasCopyTraderAccess ? { key: 'copy-trader', label: t.copyTraderMenu, target: routes.CopyTrader, icon: '📋' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; target: string; icon: string }>;

  const handleOpenManagement = useCallback((target: string) => {
    const adminUrl = new URL(window.location.origin + window.location.pathname);
    const token = authService.getToken();
    if (token) {
      adminUrl.searchParams.set('token', token);
    }
    adminUrl.pathname = target;
    adminUrl.hash = '';

    window.open(adminUrl.toString(), '_blank');
    setOpen(false);
  }, []);

  return (
    <div className="upm" ref={menuRef}>
      {/* ─── Avatar trigger ─── */}
      <button className="upm__trigger" onClick={() => { setOpen((v) => !v); setLangOpen(false); setStatusOpen(false); }} title={displayName}>
        {showAvatar ? (
          <>
          {/* <img
            className="upm__avatar"
            src={profile!.avatar_url!}
            alt={displayName}
            onError={() => setAvatarError(true)}
          /> */}
          <UserIcon className="upm__avatar"/>
          </>
        ) : (
          <span className="upm__initials">{initials}</span>
        )}
      </button>

      {/* ─── Dropdown ─── */}
      {open && (
        <div className="upm__dropdown">
          {/* User card */}
          <div className="upm__card">
            <div className="upm__card-avatar">
              {showAvatar ? (
                <>
                {/* <img src={profile!.avatar_url!} alt="" onError={() => setAvatarError(true)} /> */}
                <UserIcon/>
                </>
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="upm__card-info">
              <span className="upm__card-name">{displayName}</span>
              {profile?.username && <span className="upm__card-username">@{profile.username}</span>}
            </div>
            {profile?.is_premium && <span className="upm__badge">⭐</span>}
          </div>

          <div className="upm__sep" />

          {/* Language selector row */}
          <button className="upm__row" onClick={() => setLangOpen((v) => !v)}>
            <span className="upm__row-icon"><LanguageIcon /></span>
            <span className="upm__row-label">{t.language}</span>
            <span className="upm__row-value">{LOCALE_FLAGS[locale]} {LOCALE_LABELS[locale]}</span>
            <span className={`upm__chevron${langOpen ? ' upm__chevron--open' : ''}`}>
              <svg width="1em" height="1em" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.45502 9.96004L7.71502 6.70004C8.10002 6.31504 8.10002 5.68504 7.71502 5.30004L4.45502 2.04004" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {/* Language sub-panel */}
          {langOpen && (
            <div className="upm__lang-panel">
              {ALL_LOCALES.map((l) => (
                <button
                  key={l}
                  className={`upm__lang-item${locale === l ? ' upm__lang-item--active' : ''}`}
                  onClick={() => handleLocale(l)}
                >
                  <span className="upm__lang-flag">{LOCALE_FLAGS[l]}</span>
                  <span className="upm__lang-name">{LOCALE_LABELS[l]}</span>
                  {locale === l && <span className="upm__lang-check">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Account Status selector */}
          <button className="upm__row" onClick={() => setStatusOpen((v) => !v)}>
            <span className="upm__row-icon"><UserIcon /></span>
            <span className="upm__row-label">{t.accountStatus}</span>
            <span className="upm__row-value">
              {accountStatus === 'standard' && t.statusStandard}
              {accountStatus === 'master' && t.statusMaster}
              {accountStatus === 'guru' && t.statusGuru}
              {accountStatus === 'vip' && t.statusVip}
              {accountStatus === 'vipElite' && t.statusVipElite}
              {' '}(+{ACCOUNT_STATUS_BONUSES[accountStatus]}%)
            </span>
            <span className={`upm__chevron${statusOpen ? ' upm__chevron--open' : ''}`}>
              <svg width="1em" height="1em" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.45502 9.96004L7.71502 6.70004C8.10002 6.31504 8.10002 5.68504 7.71502 5.30004L4.45502 2.04004" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
</span>
          </button>

          {/* Account Status sub-panel */}
          {statusOpen && (
            <div className="upm__lang-panel">
              {(['standard', 'master', 'guru', 'vip', 'vipElite'] as AccountStatus[]).map((status) => (
                <button
                  key={status}
                  className={`upm__lang-item${accountStatus === status ? ' upm__lang-item--active' : ''}`}
                  onClick={() => handleAccountStatus(status)}
                >
                  <span className="upm__lang-flag">
                    {status === 'standard' && '⚪'}
                    {status === 'master' && '🟢'}
                    {status === 'guru' && '🔵'}
                    {status === 'vip' && '🟠'}
                    {status === 'vipElite' && '🟣'}
                  </span>
                  <span className="upm__lang-name">
                    {status === 'standard' && t.statusStandard}
                    {status === 'master' && t.statusMaster}
                    {status === 'guru' && t.statusGuru}
                    {status === 'vip' && t.statusVip}
                    {status === 'vipElite' && t.statusVipElite}
                    {' + '}{ACCOUNT_STATUS_BONUSES[status]}%
                  </span>
                  {accountStatus === status && <span className="upm__lang-check">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Management panel links */}
          {managementItems.length > 0 && (
            <>
              <div className="upm__sep" />
              {managementItems.map((item) => (
                <button className="upm__row" key={item.key} onClick={() => handleOpenManagement(item.target)}>
                  <span className="upm__row-icon">{item.icon}</span>
                  <span className="upm__row-label">{item.label}</span>
                </button>
              ))}
            </>
          )}

          {onOpenAccountStats && (
            <>
              <div className="upm__sep" />
              <button className="upm__row" onClick={() => { onOpenAccountStats(); setOpen(false); }}>
                <span className="upm__row-icon"><StatsIcon /></span>
                <span className="upm__row-label">{t.accountStats}</span>
              </button>
            </>
          )}

          {onOpenTradingTop && (
            <>
              <div className="upm__sep" />
              <button className="upm__row" onClick={() => { onOpenTradingTop(); setOpen(false); }}>
                <span className="upm__row-icon"><CupIcon /></span>
                <span className="upm__row-label">{t.top100Title}</span>
              </button>
            </>
          )}

          {/* Copy Trading button */}
          {onOpenCopyTrading && (
            <>
              <div className="upm__sep" />
              <button className="upm__row" onClick={() => { onOpenCopyTrading(); setOpen(false); }}>
                <CopyIcon className="upm__row-icon upm__row-icon--svg" />
                <span className="upm__row-label">{t.ctTitle}</span>
              </button>
            </>
          )}

          {/* Trading panel toggle */}
          {onToggleBetting && (
            <>
              <div className="upm__sep" />
              <button className="upm__row" onClick={() => onToggleBetting(!showBetting)}>
                <span className="upm__row-icon"><TradeIcon/></span>
                <span className="upm__row-label">{t.showBetting}</span>
                <span className={`upm__toggle${showBetting ? ' upm__toggle--on' : ''}`}>
                <span className="upm__toggle-knob" />
                </span>
              </button>
            </>
          )}

          <>
            <div className="upm__sep" />
            <button className="upm__row upm__row--danger" onClick={handleLogout}>
              <span className="upm__row-icon"><LogoutIcon /></span>
              <span className="upm__row-label">{t.logout}</span>
            </button>
          </>

        </div>
      )}

      {/* ─── Change Password Modal ─── */}
      {showPasswordModal && (
        <div className="upm-modal__backdrop" onMouseDown={() => setShowPasswordModal(false)}>
          <div className="upm-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="upm-modal__header">
              <span className="upm-modal__title">🔑 {t.changePassword}</span>
              <button className="upm-modal__close" onClick={() => setShowPasswordModal(false)}>✕</button>
            </div>
            <div className="upm-modal__body">
              <label className="upm-modal__label">{t.currentPassword}</label>
              <input
                className="upm-modal__input"
                type="password"
                value={pwdCurrent}
                onChange={(e) => setPwdCurrent(e.target.value)}
                autoComplete="current-password"
              />
              <label className="upm-modal__label">{t.newPassword}</label>
              <input
                className="upm-modal__input"
                type="password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                autoComplete="new-password"
              />
              <label className="upm-modal__label">{t.confirmPassword}</label>
              <input
                className="upm-modal__input"
                type="password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {pwdError && <div className="upm-modal__error">{pwdError}</div>}
              {pwdSuccess && <div className="upm-modal__success">{t.passwordChanged}</div>}
            </div>
            <div className="upm-modal__footer">
              <button className="upm-modal__btn upm-modal__btn--secondary" onClick={() => setShowPasswordModal(false)}>
                {t.cancel}
              </button>
              <button className="upm-modal__btn upm-modal__btn--primary" onClick={handleChangePassword} disabled={pwdLoading}>
                {pwdLoading ? '...' : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Account Modal ─── */}
      {showDeleteModal && (
        <div className="upm-modal__backdrop" onMouseDown={() => setShowDeleteModal(false)}>
          <div className="upm-modal upm-modal--danger" onMouseDown={(e) => e.stopPropagation()}>
            <div className="upm-modal__header">
              <span className="upm-modal__title">⚠️ {t.deleteAccountConfirm}</span>
              <button className="upm-modal__close" onClick={() => setShowDeleteModal(false)}>✕</button>
            </div>
            <div className="upm-modal__body">
              <p className="upm-modal__warning">{t.deleteAccountWarning}</p>
              <label className="upm-modal__label">{t.deleteAccountPassword}</label>
              <input
                className="upm-modal__input"
                type="password"
                value={delPassword}
                onChange={(e) => setDelPassword(e.target.value)}
                autoComplete="current-password"
              />
              {delError && <div className="upm-modal__error">{delError}</div>}
            </div>
            <div className="upm-modal__footer">
              <button className="upm-modal__btn upm-modal__btn--secondary" onClick={() => setShowDeleteModal(false)}>
                {t.cancel}
              </button>
              <button className="upm-modal__btn upm-modal__btn--danger" onClick={handleDeleteAccount} disabled={delLoading}>
                {delLoading ? '...' : t.deleteAccount}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
