/**
 * VirtualTradingModal — start / manage virtual trading sessions.
 * Mirrors old_tma robot.js showStartTradingModal + showActiveSessionModal.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n, type Translations } from '../i18n';
import {
  fetchVirtualTradingStatus,
  startVirtualTrading,
  stopVirtualTrading,
  fetchVirtualTradingCurrentTrades,
} from './api';
import type { TmaVirtualSession } from './types';

interface Props {
  accountId: string;
  pocketId: string;
  expiration: number;
  onClose: () => void;
}

const MULTIPLIER = 2.5;
const MARTIN_LEVELS = 6;

function calcRequiredDeposit(stake: number): number {
  let total = 0;
  let prev = stake;
  for (let i = 0; i < MARTIN_LEVELS; i++) {
    if (i === 0) {
      total += stake;
    } else {
      prev *= MULTIPLIER;
      total += prev;
    }
  }
  return total;
}

function formatNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n)).replace(/,/g, ' ');
}

function formatLocalTime(iso?: string): string {
  if (!iso) return '';
  try {
    let s = iso;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]$/.test(s)) s += 'Z';
    s = s.replace(/\.(\d{3})\d+Z$/, '.$1Z');
    return new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export function VirtualTradingModal({ accountId, pocketId, expiration, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: vtStatus, isLoading } = useQuery({
    queryKey: ['tma-virtual-status', accountId],
    queryFn: () => fetchVirtualTradingStatus(accountId),
    staleTime: 5_000,
  });

  const hasSession =
    vtStatus?.data && vtStatus.data.active_sessions > 0 && vtStatus.data.sessions?.length > 0;
  const session: TmaVirtualSession | null = hasSession ? vtStatus.data.sessions[0] : null;

  if (isLoading) {
    return (
      <div className="tma-modal-overlay tma-modal-overlay--vt modal-overlay" onClick={onClose}>
        <div className="tma-modal modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="tma-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="tma-modal-overlay tma-modal-overlay--vt modal-overlay" onClick={onClose}>
      <div className="tma-modal tma-vt-modal modal-content" onClick={(e) => e.stopPropagation()}>
        {session ? (
          <ActiveView
            session={session}
            accountId={accountId}
            pocketId={pocketId}
            expiration={expiration}
            onClose={onClose}
            t={t}
            qc={qc}
          />
        ) : (
          <StartView
            accountId={accountId}
            pocketId={pocketId}
            expiration={expiration}
            onClose={onClose}
            t={t}
            qc={qc}
          />
        )}
      </div>
    </div>
  );
}

/* ============ Start Trading View ============ */

function StartView({
  accountId,
  pocketId,
  expiration,
  onClose,
  t,
  qc,
}: {
  accountId: string;
  pocketId: string;
  expiration: number;
  onClose: () => void;
  t: Translations;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [deposit, setDeposit] = useState(163);
  const [stake, setStake] = useState(1);
  const [customStake, setCustomStake] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);

  const effectiveStake = isCustom ? parseFloat(customStake) || 0 : stake;
  const required = useMemo(() => calcRequiredDeposit(effectiveStake), [effectiveStake]);
  const isValid = deposit >= required && effectiveStake > 0;

  const startMut = useMutation({
    mutationFn: () => startVirtualTrading(accountId, deposit, effectiveStake),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tma-virtual-status'] });
      qc.invalidateQueries({ queryKey: ['tma-trading-history'] });
    },
  });

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDeposit(Number(e.target.value));
  }, []);

  const handleDepInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
    setDeposit(Math.min(999999, Math.max(0, v)));
  }, []);

  // Sync slider background
  useEffect(() => {
    if (!sliderRef.current) return;
    const pct = ((deposit - 163) / (20000 - 163)) * 100;
    sliderRef.current.style.background = `linear-gradient(to right, #0097F9 0%, #0097F9 ${pct}%, #1c2b3a ${pct}%, #1c2b3a 100%)`;
  }, [deposit]);

  return (
    <>
      <div className="tma-vt-modal__header modal-header">
        <div className="tma-vt-modal__header-left auto-trading-bot-header-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
            <path opacity="0.4" d="M21.285 0H8.715C3.255 0 0 3.255 0 8.715V21.27C0 26.745 3.255 30 8.715 30H21.27C26.73 30 29.985 26.745 29.985 21.285V8.715C30 3.255 26.745 0 21.285 0Z" fill="#0097F9"/>
            <circle cx="12" cy="17" r="3" fill="#0097F9"/>
            <circle cx="18" cy="17" r="3" fill="#0097F9"/>
          </svg>
          <span>ID {pocketId}</span>
        </div>
        <div className="tma-vt-modal__header-right auto-trading-bot-header-right">
          <span className="tma-vt-modal__exp">{expiration} min</span>
          <button className="tma-modal__close modal-close" onClick={onClose}>&times;</button>
        </div>
      </div>

      <div className="tma-vt-modal__body modal-body">
        <div className="tma-vt-modal__title-wrap">
          <h2 className="tma-vt-modal__title">{t.tmaVirtualTrading}</h2>
          <div className="tma-vt-modal__status">
            <div className="tma-autotrading__dot" />
            <span>{t.tmaVirtualTrading}</span>
          </div>
        </div>

        {/* Deposit */}
        <div className="tma-vt-modal__section">
          <h3>{t.tmaEnterDeposit}</h3>
          <div className="tma-deposit-display">
            <span className="tma-deposit-currency">$</span>
            <input
              type="text"
              className="tma-deposit-input"
              value={deposit}
              onChange={handleDepInput}
              inputMode="numeric"
            />
          </div>
          <div className="tma-deposit-slider-wrap">
            <div className="tma-deposit-bubble">${formatNum(deposit)}</div>
            <input
              ref={sliderRef}
              type="range"
              className="tma-deposit-slider"
              min={163}
              max={20000}
              step={1}
              value={deposit}
              onChange={handleSlider}
            />
            <div className="tma-deposit-labels">
              <span>$163</span>
              <span>$20 000</span>
            </div>
          </div>
        </div>

        {/* Stake */}
        <div className="tma-vt-modal__section">
          <h3>{t.tmaInitialStake}</h3>
          <div className="tma-stake-buttons">
            {[1, 2, 3, 4].map((v) => (
              <button
                key={v}
                className={`tma-stake-btn ${!isCustom && stake === v ? 'tma-stake-btn--selected' : ''}`}
                onClick={() => {
                  setStake(v);
                  setIsCustom(false);
                }}
              >
                ${v}
              </button>
            ))}
            <button
              className={`tma-stake-btn tma-stake-btn--custom ${isCustom ? 'tma-stake-btn--selected' : ''}`}
              onClick={() => setIsCustom(true)}
            >
              <span className="tma-deposit-currency">$</span>
              <input
                type="text"
                className="tma-stake-custom-input"
                placeholder="0"
                value={customStake}
                inputMode="decimal"
                onChange={(e) => {
                  setCustomStake(e.target.value.replace(/[^\d.]/g, ''));
                  setIsCustom(true);
                }}
              />
            </button>
          </div>

          {!isValid && effectiveStake > 0 && (
            <div className="tma-stake-error">
              {t.tmaMinDeposit}: ${required.toFixed(2)}
            </div>
          )}
          <div className="tma-stake-info">{t.tmaStakeInfo}</div>
        </div>
      </div>

      <div className="tma-vt-modal__footer modal-footer">
        <button
          className="tma-vt-modal__start-btn"
          disabled={!isValid || startMut.isPending}
          onClick={() => startMut.mutate()}
        >
          {t.tmaStartTrading}
        </button>
      </div>
    </>
  );
}

/* ============ Active Session View ============ */

function ActiveView({
  session,
  accountId,
  pocketId,
  expiration,
  onClose,
  t,
  qc,
}: {
  session: TmaVirtualSession;
  accountId: string;
  pocketId: string;
  expiration: number;
  onClose: () => void;
  t: Translations;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const stopMut = useMutation({
    mutationFn: () => stopVirtualTrading(accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tma-virtual-status'] });
      qc.invalidateQueries({ queryKey: ['tma-trading-history'] });
    },
  });

  const { data: currentTradesData } = useQuery({
    queryKey: ['tma-vt-current-trades', accountId],
    queryFn: () => fetchVirtualTradingCurrentTrades(accountId),
    refetchInterval: 15_000,
  });
  const historyData = currentTradesData?.data?.trades ?? [];

  const activeTradesCount = session.active_trades ?? 0;
  const profit = session.total_profit ?? 0;

  return (
    <>
      <div className="tma-vt-modal__header modal-header">
        <div className="tma-vt-modal__header-left auto-trading-bot-header-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
            <path opacity="0.4" d="M21.285 0H8.715C3.255 0 0 3.255 0 8.715V21.27C0 26.745 3.255 30 8.715 30H21.27C26.73 30 29.985 26.745 29.985 21.285V8.715C30 3.255 26.745 0 21.285 0Z" fill="#0097F9"/>
            <circle cx="12" cy="17" r="3" fill="#0097F9"/>
            <circle cx="18" cy="17" r="3" fill="#0097F9"/>
          </svg>
          <span>ID {pocketId}</span>
        </div>
        <div className="tma-vt-modal__header-right auto-trading-bot-header-right">
          <span className="tma-vt-modal__exp">{expiration} min</span>
          <button className="tma-modal__close modal-close" onClick={onClose}>&times;</button>
        </div>
      </div>

      <div className="tma-vt-modal__body modal-body">
        <h2 className="tma-vt-modal__title">{t.tmaVirtualTrading}</h2>

        <div className="tma-vt-session">
          <div className="tma-vt-session__row">
            <span>{t.tmaBalance}</span>
            <span>${session.current_balance?.toFixed(2)}</span>
          </div>
          <div className="tma-vt-session__row">
            <span>{t.tmaDeposit}</span>
            <span>${session.starting_balance}</span>
          </div>
          <div className="tma-vt-session__row">
            <span>{t.tmaProfit}</span>
            <span className={profit >= 0 ? 'positive' : 'negative'}>
              {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
            </span>
          </div>
          <div className="tma-vt-session__row">
            <span>{t.tmaTrades}</span>
            <span>{session.total_trades} ({t.tmaSuccessful}: {session.successful_trades})</span>
          </div>
          <div className="tma-vt-session__row">
            <span>{t.tmaStake}</span>
            <span>${session.base_stake}</span>
          </div>
        </div>

        {/* Active trades count */}
        {activeTradesCount > 0 && (
          <div className="tma-vt-active-trades">
            <span className="tma-vt-active-trades__label">
              {t.tmaActiveTrades}: {activeTradesCount}
            </span>
          </div>
        )}

        {/* Recent history */}
        {historyData.length > 0 ? (
          <div className="tma-vt-history">
            <h3>{t.tmaHistory}</h3>
            <div className="tma-trades-container">
              {historyData
                .slice(0, 20)
                .map((trade, i) => {
                  const p = trade.result ? Number(trade.result.profit) : Number(trade.profit_amount || 0);
                  return (
                    <div className="tma-history__item" key={trade.order_id || i}>
                      <div className="tma-history__trade-info">
                        <span>{trade.full_symbol || trade.api_symbol}</span>
                        <span>${trade.amount ?? trade.stake_amount}</span>
                      </div>
                      <div className="tma-history__details">
                        <span>{formatLocalTime(trade.started_at)}</span>
                        <span className={p > 0 ? 'positive' : p < 0 ? 'negative' : ''}>
                          {p > 0 ? '+' : ''}{p < 0 ? '-' : ''}${Math.abs(p).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="tma-vt-history">
            <h3>{t.tmaHistory}</h3>
            <div className="tma-trades-container tma-trades-container--empty">{t.tmaNoData}</div>
          </div>
        )}
      </div>

      <div className="tma-vt-modal__footer modal-footer">
        <button
          className="tma-vt-modal__stop-btn"
          disabled={stopMut.isPending}
          onClick={() => stopMut.mutate()}
        >
          {t.tmaStopTrading}
        </button>
      </div>
    </>
  );
}
