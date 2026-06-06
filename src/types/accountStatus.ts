/**
 * Account Status with profit bonuses
 */

export type AccountStatus = 'standard' | 'master' | 'guru' | 'vip' | 'vipElite';

export interface AccountStatusInfo {
  label: string;
  bonus: number;
}

export const ACCOUNT_STATUS_BONUSES: Record<AccountStatus, number> = {
  standard: 0,
  master: 2,
  guru: 4,
  vip: 6,
  vipElite: 8,
};

/**
 * Apply account status bonus to base profit
 * Maximum profit is capped at 92%
 * @example applyStatusBonus(100, 'master') // => 92 (capped)
 * @example applyStatusBonus(70, 'master') // => 72
 */
export function applyStatusBonus(baseProfit: number, status: AccountStatus = 'standard'): number {
  const bonus = ACCOUNT_STATUS_BONUSES[status] ?? 0;
  const result = baseProfit + bonus;
  return Math.min(result, 92); // Cap at 92%
}

/** Map payout_increase value from server to AccountStatus */
export function statusFromPayoutIncrease(payoutIncrease: number): AccountStatus {
  const entries = Object.entries(ACCOUNT_STATUS_BONUSES) as [AccountStatus, number][];
  // Find exact match or closest match that doesn't exceed the value
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i][1] <= payoutIncrease) return entries[i][0];
  }
  return 'standard';
}
