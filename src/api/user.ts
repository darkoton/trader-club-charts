/**
 * User API — password change & account deletion
 */

import { apiFetch } from '../services/apiFetch';

export interface ManagedCopyTraderSummary {
  id: string;
  name: string;
  account_id: string;
  account_email?: string | null;
  is_active: boolean;
}

export interface CopyTraderAccessInfo {
  has_access: boolean;
  managed_traders: ManagedCopyTraderSummary[];
  managed_traders_count: number;
  linked_emails: string[];
  can_open_docs: boolean;
  docs_url: string | null;
}

export interface AffiliateBotSummary {
  bot_username: string;
  ref_code: string | null;
  affiliate_email: string | null;
  affiliate_name: string | null;
  affiliate_access_enabled: boolean;
  partner_link_id: string | null;
  links_count: number;
}

export interface AffiliateAccessInfo {
  has_access: boolean;
  matched_emails: string[];
  requires_bot_selection: boolean;
  selected_bot: AffiliateBotSummary | null;
  bots: AffiliateBotSummary[];
}

export interface UserProfile {
  user_id: number;
  email?: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  language_code: string | null;
  is_premium: boolean;
  is_admin: boolean;
  is_copy_trader?: boolean;
  trader_id: number;
  bot_username?: string;
  copy_trader_access?: CopyTraderAccessInfo | null;
  affiliate_access?: AffiliateAccessInfo | null;
}

export interface StoredUserAccess {
  isAdmin: boolean;
  isCopyTrader: boolean;
  hasCopyTraderAccess: boolean;
  hasAffiliateAccess: boolean;
}

const ADMIN_STORAGE_KEY = 'tc_is_admin';
const COPY_TRADER_STORAGE_KEY = 'tc_is_copy_trader';
const COPY_TRADER_ACCESS_STORAGE_KEY = 'tc_has_copy_trader_access';
const AFFILIATE_ACCESS_STORAGE_KEY = 'tc_has_affiliate_access';

export async function getMyProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/user/me');
}

export function persistUserAccess(profile: Pick<UserProfile, 'is_admin' | 'is_copy_trader' | 'copy_trader_access' | 'affiliate_access'> | null): void {
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, profile?.is_admin ? '1' : '0');
    localStorage.setItem(COPY_TRADER_STORAGE_KEY, profile?.is_copy_trader ? '1' : '0');
    localStorage.setItem(COPY_TRADER_ACCESS_STORAGE_KEY, profile?.copy_trader_access?.has_access ? '1' : '0');
    localStorage.setItem(AFFILIATE_ACCESS_STORAGE_KEY, profile?.affiliate_access?.has_access ? '1' : '0');
  } catch {
    // Ignore storage failures in private mode.
  }
}

export function readStoredUserAccess(): StoredUserAccess {
  try {
    return {
      isAdmin: localStorage.getItem(ADMIN_STORAGE_KEY) === '1',
      isCopyTrader: localStorage.getItem(COPY_TRADER_STORAGE_KEY) === '1',
      hasCopyTraderAccess: localStorage.getItem(COPY_TRADER_ACCESS_STORAGE_KEY) === '1',
      hasAffiliateAccess: localStorage.getItem(AFFILIATE_ACCESS_STORAGE_KEY) === '1',
    };
  } catch {
    return {
      isAdmin: false,
      isCopyTrader: false,
      hasCopyTraderAccess: false,
      hasAffiliateAccess: false,
    };
  }
}

/** Change user password */
export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/user/password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** Delete user account (requires password confirmation) */
export async function deleteAccount(payload: {
  password: string;
}): Promise<void> {
  await apiFetch('/user/account', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}
