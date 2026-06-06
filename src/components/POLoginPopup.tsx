/**
 * POLoginPopup — Popup for adding a PocketOption account.
 * Shows email + password form, calls Better API to create account.
 */

import { useState, useCallback } from 'react';
import { addAccount, confirm2fa, isBetterAuthStatusError } from '../api/better';
import type { BetterAccount } from '../api/better';
import { useI18n } from '../i18n';
import { resetSiteSessionAndRedirectToLogin } from '../pages/shared/api/terminalAuth';

interface POLoginPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: (account: BetterAccount) => void;
}

export function POLoginPopup({ isOpen, onClose, onAccountAdded }: POLoginPopupProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /* ─── 2FA state ─── */
  const [needs2fa, setNeeds2fa] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [pendingAccount, setPendingAccount] = useState<BetterAccount | null>(null);

  const shouldRestartAuthFlow = useCallback((message: string) => (
    /invalid token|jwt|signature mismatch/i.test(message)
  ), []);

  const resetState = useCallback(() => {
    setEmail('');
    setPassword('');
    setError(null);
    setNeeds2fa(false);
    setTwoFaCode('');
    setPendingAccountId(null);
    setPendingAccount(null);
    setSuccess(false);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const result = await addAccount(email.trim(), password);
      if (result.requires_2fa) {
        // Account saved but needs 2FA confirmation
        setPendingAccountId(result.account.id);
        setPendingAccount(result.account);
        setNeeds2fa(true);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onAccountAdded(result.account);
          resetState();
          onClose();
        }, 1200);
      }
    } catch (err: unknown) {
      if (isBetterAuthStatusError(err)) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      if (shouldRestartAuthFlow(msg)) {
        setError(t.betInvalidCredentials);
        return;
      }
      if (/not_partner/i.test(msg)) {
        setError(t.betNotPartner);
      } else if (/deposit_required/i.test(msg)) {
        setError(t.betDepositRequired);
      } else if (/failed to fetch|network request failed|networkerror|load failed/i.test(msg)) {
        setError(t.betterDisconnected ?? 'Торговый сервер недоступен. Проверьте интернет/VPN и попробуйте снова.');
      } else if (/invalid credentials|401|авторизация не удалась|login failed/i.test(msg)) {
        setError(t.betInvalidCredentials);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [email, onAccountAdded, onClose, password, resetState, shouldRestartAuthFlow, t]);

  const handle2faSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAccountId || !twoFaCode.trim()) return;
    setLoading(true);
    setError(null);

    try {
      await confirm2fa(pendingAccountId, twoFaCode.trim());
      // Update the pending account with has_tokens = true
      const confirmedAccount: BetterAccount = { ...pendingAccount!, has_tokens: true };
      setSuccess(true);
      setTimeout(() => {
        onAccountAdded(confirmedAccount);
        resetState();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      if (isBetterAuthStatusError(err)) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      if (shouldRestartAuthFlow(msg)) {
        resetState();
        onClose();
        resetSiteSessionAndRedirectToLogin();
        return;
      }
      if (/not_partner/i.test(msg)) {
        setError(t.betNotPartner);
        // Account stub was removed server-side, reset 2FA flow
        setNeeds2fa(false);
        setPendingAccountId(null);
        setPendingAccount(null);
      } else if (/deposit_required/i.test(msg)) {
        setError(t.betDepositRequired);
        setNeeds2fa(false);
        setPendingAccountId(null);
        setPendingAccount(null);
      } else if (/failed to fetch|network request failed|networkerror|load failed/i.test(msg)) {
        setError(t.betterDisconnected ?? 'Торговый сервер недоступен. Проверьте интернет/VPN и попробуйте снова.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [onAccountAdded, onClose, pendingAccount, pendingAccountId, resetState, shouldRestartAuthFlow, t, twoFaCode]);

  if (!isOpen) return null;

  return (
    <div className="po-login-backdrop" onClick={onClose}>
      <div className={`po-login${success ? ' po-login--success' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Mobile drag handle */}
        <div className="portal-sheet__handle" />

        {success ? (
          <div className="po-login__success-anim">
            <div className="po-login__success-circle">
              <svg className="po-login__success-check" viewBox="0 0 52 52" fill="none">
                <circle className="po-login__success-ring" cx="26" cy="26" r="24" stroke="#2ebd85" strokeWidth="3" />
                <path className="po-login__success-path" d="M14 27l8 8 16-16" stroke="#2ebd85" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="po-login__success-text">{t.betLogin} ✓</span>
          </div>
        ) : needs2fa ? (
          <>
            <div className="po-login__header">
              <span className="po-login__title">2FA</span>
              <button className="po-login__close" onClick={() => { resetState(); onClose(); }}>✕</button>
            </div>

            <form className="po-login__form" onSubmit={handle2faSubmit}>
              <div className="po-login__field">
                <label className="po-login__label">{t.bet2faCode || '2FA Code'}</label>
                <input
                  className="po-login__input"
                  type="text"
                  inputMode="numeric"
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value)}
                  placeholder="123456"
                  required
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>

              {error && <div className="po-login__error">{error}</div>}

              <button
                className="po-login__submit"
                type="submit"
                disabled={loading || !twoFaCode.trim()}
              >
                {loading ? t.loading : (t.bet2faConfirm || 'Confirm')}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="po-login__header">
              <span className="po-login__title">{t.betLoginTitle}</span>
              <button className="po-login__close" onClick={onClose}>✕</button>
            </div>

        <form className="po-login__form" onSubmit={handleSubmit}>
          <div className="po-login__field">
            <label className="po-login__label">Email</label>
            <input
              className="po-login__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="po-login__field">
            <label className="po-login__label">{t.betPassword}</label>
            <input
              className="po-login__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className="po-login__error">{error}</div>}

          <button
            className="po-login__submit"
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
          >
            {loading ? t.loading : t.betLogin}
          </button>
        </form>

        <div className="po-login__footer">
          <span className="po-login__footer-text">{t.betLoginHint}</span>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
