import { useMemo, useRef, useState } from 'react';
import { mapBetterAuthUiState, type BetterAuthStatusPayload } from '../api/better';
import { useI18n } from '../i18n';

function formatJwtPreview(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 48) return value;
  return `${value.slice(0, 24)}...${value.slice(-24)}`;
}

interface BetterAuthStatusModalProps {
  authStatus: BetterAuthStatusPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirmTwoFactor: (code: string) => void | Promise<void>;
  onLogout: () => void;
}

export function BetterAuthStatusModal({
  authStatus,
  loading,
  error,
  onClose,
  onConfirmTwoFactor,
  onLogout,
}: BetterAuthStatusModalProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const authUiState = useMemo(() => mapBetterAuthUiState(authStatus), [authStatus]);

  const isTwoFactor = authUiState.kind === 'requires_2fa';

  const title = useMemo(() => {
    switch (authUiState.kind) {
      case 'requires_2fa':
        return '2FA';
      case 'logout_required':
        return t.logout || 'Logout';
      case 'auth_blocked':
        return 'Auth';
      default:
        return '';
    }
  }, [authUiState.kind, t.logout]);

  const description = useMemo(() => {
    if (authUiState.kind === 'none') return '';
    return authUiState.message;
  }, [authUiState]);

  const handleCopyJwt = async () => {
    const token = authStatus?.failing_jwt?.trim();
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopyMessage('JWT copied to clipboard');
    } catch {
      setCopyMessage('Failed to copy JWT');
    }
  };

  if (!authStatus || authUiState.kind === 'none') return null;

  const canDismiss = !loading && authUiState.kind !== 'logout_required';
  const acknowledgeLabel = authUiState.kind === 'auth_blocked' ? 'OK' : (t.cancel || 'Cancel');

  return (
    <div className="po-login-backdrop" onClick={() => { if (canDismiss) onClose(); }}>
      <div className="po-login" onClick={(event) => event.stopPropagation()}>
        <div className="po-login__header">
          <span className="po-login__title">{title}</span>
          {canDismiss && (
            <button className="po-login__close" type="button" onClick={onClose}>✕</button>
          )}
        </div>

        <div className="po-login__warning">{description}</div>

        <div className="po-login__notice">
          {authStatus.email && <div className="po-login__meta-row"><strong>Email:</strong><span>{authStatus.email}</span></div>}
          {authStatus.po_user_id != null && <div className="po-login__meta-row"><strong>PO User ID:</strong><span>{authStatus.po_user_id}</span></div>}
          {authStatus.account_id && <div className="po-login__meta-row"><strong>Mongo Account ID:</strong><span>{authStatus.account_id}</span></div>}
          {authStatus.terminal_user_id && <div className="po-login__meta-row"><strong>Terminal User ID:</strong><span>{authStatus.terminal_user_id}</span></div>}
          {authStatus.auth_event_id && <div className="po-login__meta-row"><strong>Auth Event ID:</strong><span>{authStatus.auth_event_id}</span></div>}
          {authStatus.endpoint && <div className="po-login__meta-row"><strong>Endpoint:</strong><span>{authStatus.endpoint}</span></div>}
          {authStatus.error_stage && <div className="po-login__meta-row"><strong>Stage:</strong><span>{authStatus.error_stage}</span></div>}
          {authStatus.error_source && <div className="po-login__meta-row"><strong>Source:</strong><span>{authStatus.error_source}</span></div>}
          {authStatus.upstream_status != null && <div className="po-login__meta-row"><strong>HTTP Status:</strong><span>{authStatus.upstream_status}</span></div>}
          {authStatus.details?.reason && <div className="po-login__meta-row"><strong>Reason:</strong><span>{authStatus.details.reason}</span></div>}
          {authStatus.failing_jwt && (
            <div className="po-login__meta-row">
              <strong>JWT{authStatus.failing_jwt_kind ? ` (${authStatus.failing_jwt_kind})` : ''}:</strong>
              <span>{formatJwtPreview(authStatus.failing_jwt)}</span>
            </div>
          )}
        </div>

        {authStatus.failing_jwt && (
          <div className="po-login__actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
            <button className="po-login__secondary" type="button" onClick={() => void handleCopyJwt()} disabled={loading}>
              Copy JWT
            </button>
            {copyMessage ? <span className="po-login__label">{copyMessage}</span> : null}
          </div>
        )}

        {isTwoFactor ? (
          <form
            key={authStatus.auth_event_id ?? authStatus.challenge_id ?? authStatus.account_id ?? authStatus.auth_status}
            className="po-login__form"
            onSubmit={(event) => {
              event.preventDefault();
              const code = inputRef.current?.value?.trim() ?? '';
              if (!code.trim() || loading) return;
              void onConfirmTwoFactor(code);
            }}
          >
            <div className="po-login__field">
              <label className="po-login__label">{t.bet2faCode || '2FA Code'}</label>
              <input
                className="po-login__input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                ref={inputRef}
                defaultValue=""
                disabled={loading}
                autoFocus
                required
              />
            </div>

            {error && <div className="po-login__error">{error}</div>}

            <div className="po-login__actions">
              <button className="po-login__secondary" type="button" onClick={onClose} disabled={loading}>
                {t.cancel || 'Cancel'}
              </button>
              <button className="po-login__submit" type="submit" disabled={loading}>
                {loading ? t.loading : (t.bet2faConfirm || 'Confirm')}
              </button>
            </div>
          </form>
        ) : (
          <div className="po-login__form">
            {error && <div className="po-login__error">{error}</div>}
            <div className="po-login__actions">
              {authUiState.kind === 'auth_blocked' && (
                <button className="po-login__secondary" type="button" onClick={onClose} disabled={loading}>
                  {acknowledgeLabel}
                </button>
              )}
              {authUiState.kind === 'logout_required' ? (
                <button className="po-login__submit" type="button" onClick={onLogout} disabled={loading}>
                  {loading ? t.loading : (t.logout || 'Logout')}
                </button>
              ) : authUiState.kind === 'auth_blocked' ? null : (
                <button className="po-login__submit" type="button" onClick={onClose} disabled={loading}>
                  {loading ? t.loading : acknowledgeLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}