/**
 * React hook for applying account status bonus to profit
 */

import { useState, useEffect } from 'react';
import { storageService } from '../services/storage';
import { applyStatusBonus, type AccountStatus } from '../types/accountStatus';

export function useAccountBonus() {
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('standard');

  useEffect(() => {
    const syncAccountStatus = () => {
      setAccountStatus(storageService.getAccountStatus());
    };

    // Load initial status
    syncAccountStatus();

    // Listen for status changes
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<AccountStatus>;
      setAccountStatus(customEvent.detail);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key !== 'tc_user_settings') return;
      syncAccountStatus();
    };

    window.addEventListener('accountStatusChanged', handler);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', syncAccountStatus);
    document.addEventListener('visibilitychange', syncAccountStatus);
    return () => {
      window.removeEventListener('accountStatusChanged', handler);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', syncAccountStatus);
      document.removeEventListener('visibilitychange', syncAccountStatus);
    };
  }, []);

  const applyBonus = (baseProfit: number): number => {
    return applyStatusBonus(baseProfit, accountStatus);
  };

  return { accountStatus, applyBonus };
}
