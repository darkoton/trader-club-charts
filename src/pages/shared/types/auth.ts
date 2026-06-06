/* ─── Auth responses ─── */

export type TwoFactorState = 'disabled' | 'enabled' | 'required';

export interface AuthResponse {
  token: string;
  is_confirmed: boolean;
  is_register?: boolean;
  trader_id?: number | null;
  po_user_id?: number | null;
  terminal_user_id?: string | null;
  better_account_id?: string | null;
  /** Deeplink to PocketOption deposit page returned by v2 register / 403 deposit-required login. */
  deposit_link?: string | null;
  two_factor_state?: TwoFactorState;
  two_factor_enabled?: boolean;
}

/** Returned by `loginUser` when PocketOption requires a 2FA code. */
export interface TwoFactorChallenge {
  requires_2fa: true;
  challenge_id: string;
  auth_status?: 'requires_2fa' | string;
  error_code?: string;
  confirm_2fa_endpoint?: string | null;
  is_confirmed?: boolean;
  two_factor_state?: Extract<TwoFactorState, 'enabled' | 'required'>;
  two_factor_enabled?: boolean;
}

export type LoginResult = AuthResponse | TwoFactorChallenge;

export function hasTwoFactorChallengeSignal(result: unknown): result is Partial<TwoFactorChallenge> {
  if (!result || typeof result !== 'object') return false;
  const candidate = result as Record<string, unknown>;
  return candidate.requires_2fa === true
    || candidate.auth_status === 'requires_2fa'
    || candidate.error_code === 'requires_2fa'
    || candidate.two_factor_state === 'required'
    || (typeof candidate.challenge_id === 'string' && candidate.challenge_id.trim().length > 0);
}

export function isTwoFactorChallenge(result: unknown): result is TwoFactorChallenge {
  return hasTwoFactorChallengeSignal(result)
    && typeof (result as TwoFactorChallenge).challenge_id === 'string'
    && (result as TwoFactorChallenge).challenge_id.trim().length > 0;
}

/* ─── User profile ─── */

export interface UserProfile {
  auth_type: "terminal" | "telegram";
  email?: string;
  is_confirmed: boolean;
  trader_id?: number | null;
  user_id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  avatar_url?: string;
  group_invite_link?: string | null;
  is_admin?: boolean;
  two_factor_state?: TwoFactorState;
  two_factor_enabled?: boolean;
}
