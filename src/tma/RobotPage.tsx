/**
 * RobotPage — robot trading view with ID selector, current trade,
 * virtual-trading status, and history list.
 * Mirrors old_tma robot.js.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n, type Translations } from '../i18n';
import { fetchRobotIds, fetchTradingHistory, fetchVirtualTradingStatus } from './api';
import type { TmaRobotId, TmaTrade, TmaVirtualSession } from './types';

/* helpers */

function parseUtcStrict(iso?: string): number {
  if (!iso) return Date.now();
  let s = iso;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]$/.test(s)) s += 'Z';
  s = s.replace(/\.(\d{3})\d+Z$/, '.$1Z');
  return new Date(s).getTime();
}

function formatLocalTime(iso?: string): string {
  if (!iso) return '';
  try {
    const ms = parseUtcStrict(iso);
    const d = new Date(ms);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

/* ---------- Robot page ---------- */

interface Props {
  onOpenVirtualTrading: () => void;
  onRobotState?: (accountId: string, pocketId: string, expiration: number) => void;
  /** called by TmaApp to push socket events */
  lastBetPlaced?: TmaTrade | null;
  lastBetResult?: TmaTrade | null;
}

export function RobotPage({ onOpenVirtualTrading, onRobotState }: Props) {
  const { t } = useI18n();

  /* --- IDs & expiration --- */
  const [expiration, setExpiration] = useState<number>(() => {
    const saved = localStorage.getItem('robotExpiration');
    return saved ? parseInt(saved, 10) || 1 : 1;
  });

  const { data: robotIds = [] } = useQuery<TmaRobotId[]>({
    queryKey: ['tma-robot-ids'],
    queryFn: fetchRobotIds,
    staleTime: 120_000,
  });

  // Build expiration → accountId map
  const idsMap = useMemo(() => {
    const m: Record<number, string> = {};
    robotIds.forEach((r) => {
      if (r.expiration && r.id) {
        m[Number(r.expiration)] = r.id;
      }
    });
    return m;
  }, [robotIds]);

  const pocketMap = useMemo(() => {
    const m: Record<number, string> = {};
    robotIds.forEach((r) => {
      if (r.expiration && r.pocket_id) {
        m[Number(r.expiration)] = r.pocket_id;
      }
    });
    return m;
  }, [robotIds]);

  const availableExpirations = useMemo(
    () => Object.keys(idsMap).map(Number).sort((a, b) => a - b),
    [idsMap],
  );

  // auto-fix expiration if not available
  useEffect(() => {
    if (availableExpirations.length > 0 && !idsMap[expiration]) {
      setExpiration(availableExpirations[0]);
    }
  }, [availableExpirations, idsMap, expiration]);

  const accountId = idsMap[expiration];
  const pocketId = pocketMap[expiration] || accountId;

  // Notify parent of current robot state (for VT modal)
  useEffect(() => {
    if (accountId && onRobotState) {
      onRobotState(accountId, pocketId || '', expiration);
    }
  }, [accountId, pocketId, expiration, onRobotState]);

  const handleExpChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = parseInt(e.target.value, 10);
      setExpiration(v);
      localStorage.setItem('robotExpiration', String(v));
    },
    [],
  );

  /* --- Trading history --- */
  const { data: historyData = [] } = useQuery<TmaTrade[]>({
    queryKey: ['tma-trading-history', accountId],
    queryFn: () => fetchTradingHistory(accountId!, 50),
    enabled: !!accountId,
    refetchInterval: 30_000,
  });

  const firstTrade = historyData[0] ?? null;
  const historyTrades = useMemo(
    () => historyData.filter((tr) => tr.result != null),
    [historyData],
  );
  const lastKnownPair = useMemo(
    () => historyData.find((tr) => tr.full_symbol || tr.api_symbol)?.full_symbol
      || historyData.find((tr) => tr.full_symbol || tr.api_symbol)?.api_symbol
      || null,
    [historyData],
  );

  /* --- Virtual trading --- */
  const { data: vtStatus } = useQuery({
    queryKey: ['tma-virtual-status', accountId],
    queryFn: () => fetchVirtualTradingStatus(accountId!),
    enabled: !!accountId,
    refetchInterval: 30_000,
  });

  const vtSession: TmaVirtualSession | null =
    vtStatus?.data && vtStatus.data.active_sessions > 0 && vtStatus.data.sessions?.[0]
      ? vtStatus.data.sessions[0]
      : null;

  return (
    <div className="tma-robot robot-page">
      {/* Header */}
      <div className="tma-robot__header robot-header">
        <div className="tma-robot__info robot-info">
          <div className="tma-robot__left robot-left">
            <div className="tma-robot__icon robot-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
                <path opacity="0.4" d="M21.285 0H8.715C3.255 0 0 3.255 0 8.715V21.27C0 26.745 3.255 30 8.715 30H21.27C26.73 30 29.985 26.745 29.985 21.285V8.715C30 3.255 26.745 0 21.285 0Z" fill="#0097F9"/>
                <path d="M7.757 6.055c-.795.264-1.23 1.223-.91 2.006.14.334.29.519.576.699l.242.154.004 2.094c0 1.16-.017 2.107-.04 2.133a5.55 5.55 0 00-.29.475C6.479 15.12 6 16.906 6 18.612c0 .678.079 1.047.351 1.606.905 1.869 3.43 3.254 6.75 3.703.795.106 3.004.106 3.804 0 1.932-.26 3.57-.823 4.831-1.654.926-.616 1.537-1.262 1.919-2.05.312-.642.369-.963.338-1.887-.061-1.847-.58-3.545-1.555-5.093l-.1-.167V10.994l.004-2.08.233-.145c.285-.185.452-.387.588-.73.093-.224.106-.317.088-.62-.022-.433-.14-.706-.43-.992-.325-.33-.558-.418-1.076-.418-.417 0-.452.01-.716.15-.307.168-.527.405-.677.736-.14.3-.145.912-.004 1.214.114.25.435.602.65.721l.154.084v1.332 1.337l-.316-.281A8.28 8.28 0 0014.994 8.98a8.28 8.28 0 00-5.82 2.322l-.32.281V10.247 8.914l.154-.084c.215-.119.536-.471.65-.72.14-.302.136-.913-.004-1.214a1.65 1.65 0 00-.676-.73 1.2 1.2 0 00-.65-.165c-.244-.009-.442.009-.571.053zm3.324 8.4c.663.203 1.625.396 2.429.489.5.057.882.066 1.778.048 1.515-.03 2.429-.167 3.746-.563.25-.075.461-.132.466-.123.048.053.4.796.513 1.082.325.818.567 2.124.567 3.053v.48l-.154.17c-.443.489-1.664.854-3.58 1.07-.772.083-3.064.07-3.886-.027-1.73-.202-2.964-.581-3.382-1.042l-.154-.172v-.484c0-.835.18-1.912.466-2.762.132-.4.584-1.372.641-1.372.018 0 .268.07.55.154z" fill="#0097F9"/>
                <path d="M11.92 16.892c-.233.075-.43.233-.553.436-.171.294-.171.69.005.985.175.303.448.453.821.453.356 0 .606-.132.79-.409.41-.62.023-1.43-.71-1.482a1.06 1.06 0 00-.353.017zM17.541 16.892c-.233.075-.43.233-.553.436-.172.294-.172.69.004.985.176.303.448.453.821.453.233 0 .325-.022.492-.123.607-.356.615-1.284.013-1.636-.21-.128-.575-.176-.777-.115z" fill="#0097F9"/>
              </svg>
            </div>
            <span className="tma-robot__id robot-id">
              ID {pocketId || '...'}
            </span>
          </div>
          <div className="tma-robot__details robot-details time-dropdown">
            <select
              className="tma-robot__time-select"
              value={expiration}
              onChange={handleExpChange}
            >
              {availableExpirations.map((exp) => (
                <option key={exp} value={exp}>{exp} min</option>
              ))}
              {availableExpirations.length === 0 && (
                <option>...</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Current trade */}
      <CurrentTrade trade={firstTrade} expiration={expiration} t={t} searchPair={lastKnownPair} />

      {/* Virtual trading status */}
      <VirtualTradingStatus session={vtSession} onOpen={onOpenVirtualTrading} t={t} />

      {/* History */}
      <div className="tma-history trading-history">
        {historyTrades.length === 0 ? (
            <div className="tma-no-data">{t.tmaNoData}</div>
        ) : (
          historyTrades.map((trade, i) => (
            <HistoryItem key={trade.order_id || i} trade={trade} />
          ))
        )}
      </div>
    </div>
  );
}

/* ----- Current trade ----- */

function CurrentTrade({
  trade,
  expiration,
  t,
  searchPair,
}: {
  trade: TmaTrade | null;
  expiration: number;
  t: Translations;
  searchPair?: string | null;
}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [flowStep, setFlowStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!trade) return;

    if (trade.result && +(trade.result.next_stake ?? 0) === 1) {
      setTimeLeft(0);
      return;
    }

    const totalSec = expiration * 60;
    const startMs = parseUtcStrict(trade.started_at);
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    let left = Math.max(0, totalSec - elapsed);
    setTimeLeft(left);

    intervalRef.current = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(intervalRef.current);
        left = 0;
      }
      setTimeLeft(left);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [trade, expiration]);

  useEffect(() => {
    if (trade) return;
    const id = setInterval(() => {
      setFlowStep((prev) => (prev + 1) % 3);
    }, 2200);
    return () => clearInterval(id);
  }, [trade]);

  if (!trade) {
    const pairLabel = searchPair ?? t.tmaSignalFlowPairFallback;
    const steps = [
      t.tmaSignalFlowAnalyze,
      t.tmaSignalFlowPair.replace('{pair}', pairLabel),
      t.tmaSignalFlowAwaitEntry,
    ];

    return (
      <div className="tma-current-trade tma-current-trade--searching">
        <div className="tma-spinner" />
        <div className="tma-current-trade__search-title">{t.tmaSearchingSignalTitle}</div>
        <div className="tma-current-trade__search-step">{steps[flowStep]}</div>
      </div>
    );
  }

  if (trade.result && +(trade.result.next_stake ?? 0) === 1) {
    return (
      <div className="tma-current-trade">
        <span className="tma-current-trade__waiting">{t.tmaWaitingForBet}</span>
      </div>
    );
  }

  const totalSec = expiration * 60;
  const pct = totalSec > 0 ? (timeLeft / totalSec) * 100 : 0;
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');

  const amountLabel = trade.result
    ? `${t.tmaWaitingForOrder} $${trade.result.next_stake ?? 0}`
    : `${t.tmaOrderAmount}$${trade.amount ?? trade.stake_amount ?? 0}`;  

  return (
    <div className="tma-current-trade current-trade">
      <div className="tma-progress">
        <div className="tma-progress__bar progress-bar">
          <div className="tma-progress__fill" style={{ width: `${pct}%` }} />
          <span className="tma-progress__time">{mm}:{ss}</span>
        </div>
      </div>
      <div className="tma-current-trade__asset trade-asset">
        <div className="tma-current-trade__info asset-info">
          <span className="tma-current-trade__label asset-label">{t.tmaTradingAsset}</span>
          <span className="tma-current-trade__name asset-name">
            {trade.full_symbol || trade.api_symbol || 'Unknown'}
          </span>
          <span className="tma-current-trade__amount trade-amount">{amountLabel}</span>
        </div>
        <div className="tma-current-trade__right aset-right asset-right">
          <span className="tma-current-trade__dir asset-trend">
            {trade.direction === 'call' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none">
                <path opacity="0.4" d="M13.4917 1.66666H6.50841C3.47508 1.66666 1.66675 3.47499 1.66675 6.50832V13.4833C1.66675 16.525 3.47508 18.3333 6.50841 18.3333H13.4834C16.5167 18.3333 18.3251 16.525 18.3251 13.4917V6.50832C18.3334 3.47499 16.5251 1.66666 13.4917 1.66666Z" fill="#48C65B"/>
                <path d="M14.0251 7.84167C13.9668 7.7 13.8501 7.58334 13.7084 7.525C13.6418 7.5 13.5668 7.48334 13.4918 7.48334H11.9418C11.6168 7.48334 11.3584 7.74167 11.3584 8.06667C11.3584 8.39167 11.6168 8.65 11.9418 8.65H12.0918L10.3334 10.4083L9.48345 9.14167C9.38345 9 9.23345 8.9 9.05845 8.88334C8.87511 8.86667 8.71678 8.925 8.59178 9.05L6.10845 11.5333C5.88345 11.7583 5.88345 12.125 6.10845 12.3583C6.22511 12.475 6.36678 12.525 6.51678 12.525C6.66678 12.525 6.81678 12.4667 6.92511 12.3583L8.58348 10.375L9.75845 11.6417C9.85845 11.7833 10.0084 11.8833 10.1834 11.9C10.3668 11.9167 10.5251 11.8583 10.6501 11.7333L12.9168 9.46667V9.61667C12.9168 9.94167 13.1751 10.2 13.5001 10.2C13.8251 10.2 14.0834 9.94167 14.0834 9.61667V8.05834C14.0668 7.98334 14.0584 7.90834 14.0251 7.84167Z" fill="#48C65B"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none">
                <path opacity="0.4" d="M13.4917 1.66669H6.50841C3.47508 1.66669 1.66675 3.47502 1.66675 6.50835V13.4834C1.66675 16.525 3.47508 18.3334 6.50841 18.3334H13.4834C16.5167 18.3334 18.3251 16.525 18.3251 13.4917V6.50835C18.3334 3.47502 16.5251 1.66669 13.4917 1.66669Z" fill="#E04E4E"/>
                <path d="M14.0668 10.3917C14.0668 10.0667 13.8085 9.80835 13.4835 9.80835C13.1585 9.80835 12.9001 10.0667 12.9001 10.3917V10.5417L10.6335 8.27501C10.5085 8.15001 10.3418 8.09168 10.1668 8.10834C9.99181 8.12501 9.83348 8.21668 9.74181 8.36668L8.89181 9.63335L6.92515 7.65001C6.70015 7.42501 6.33348 7.42501 6.10015 7.65001C5.87515 7.87501 5.87515 8.24168 6.10015 8.47501L8.58348 10.9583C8.70848 11.0833 8.87515 11.1417 9.05015 11.125C9.22515 11.1083 9.38348 11.0167 9.47515 10.8667L10.3251 9.60001L12.0835 11.3583H11.9335C11.6085 11.3583 11.3501 11.6167 11.3501 11.9417C11.3501 12.2667 11.6085 12.525 11.9335 12.525H13.4835C13.5585 12.525 13.6335 12.5083 13.7085 12.4833C13.8501 12.425 13.9668 12.3083 14.0251 12.1667C14.0585 12.0917 14.0668 12.0167 14.0668 11.9417V10.3917Z" fill="#E04E4E"/>
              </svg>
            )}
          </span>
          <span className="tma-current-trade__pct">{trade.percent}%</span>
        </div>
      </div>
    </div>
  );
}

/* ----- Virtual trading status bar ----- */

function VirtualTradingStatus({
  session,
  onOpen,
  t,
}: {
  session: TmaVirtualSession | null;
  onOpen: () => void;
  t: Translations;
}) {
  return (
    <div className="tma-autotrading robot-autotrading-info">
      <div className="tma-autotrading__status autotrading-status-container">
        {session ? (
          <div className="tma-autotrading__indicator tma-autotrading__indicator--active status-indicator active">
            <div className="tma-autotrading__dot" />
            <span>{t.tmaVirtualTrading}</span>
          </div>
        ) : (
          <div className="tma-autotrading__indicator status-indicator inactive">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" fill="#999" />
            </svg>
            <span>{t.tmaVirtualTrading}</span>
          </div>
        )}
      </div>
      <button className="tma-autotrading__settings autotrading-settings-btn" onClick={onOpen}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path opacity="0.4" d="M1.667 10.733V9.267c0-.867.708-1.583 1.583-1.583 1.508 0 2.125-1.067 1.367-2.375-.434-.75-.175-1.725.583-2.158l1.442-.825c.658-.392 1.508-.159 1.9.5l.091.158c.75 1.308 1.984 1.308 2.742 0l.091-.158c.392-.659 1.242-.892 1.9-.5l1.442.825c.758.433 1.017 1.408.583 2.158-.758 1.308-.141 2.375 1.367 2.375.867 0 1.583.708 1.583 1.583v1.467c0 .867-.708 1.583-1.583 1.583-1.508 0-2.125 1.067-1.367 2.375.434.758.175 1.725-.583 2.158l-1.442.825c-.658.392-1.508.158-1.9-.5l-.091-.158c-.75-1.308-1.984-1.308-2.742 0l-.091.158c-.392.658-1.242.892-1.9.5L5.2 16.85c-.758-.433-1.017-1.408-.583-2.158.758-1.308.141-2.375-1.367-2.375-.867 0-1.583-.717-1.583-1.583z" fill="#7A8B9E"/>
          <path d="M10 12.708a2.708 2.708 0 100-5.417 2.708 2.708 0 000 5.417z" fill="#7A8B9E"/>
        </svg>
      </button>
    </div>
  );
}

/* ----- History item ----- */

function HistoryItem({ trade }: { trade: TmaTrade }) {
  const profit = trade.result ? Number(trade.result.profit) : 0;
  const isProfit = profit > 0;
  const isZero = profit === 0;
  const assetName = trade.full_symbol || trade.api_symbol || 'Unknown';
  const pct = Number(trade.percent || 0);
  const timeStr = formatLocalTime(trade.started_at);
  const amount = trade.amount ?? trade.stake_amount ?? 0;
  const totalVal = Math.abs(amount + profit).toFixed(2);

  return (
    <div className="tma-history__item history-item">
      <div className="tma-history__trade-info trade-info">
        <div className={`tma-history__asset asset-name ${pct > 0 ? 'profit' : 'loss'}`}>
          <span>{assetName}</span> {pct > 0 ? '+' : ''}{pct}%
        </div>
        <div className="tma-history__trade-amount trade-amount">
          <span className="tma-history__trend asset-trend">
            {trade.direction === 'call' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none">
                <path opacity="0.4" d="M13.4917 1.66666H6.50841C3.47508 1.66666 1.66675 3.47499 1.66675 6.50832V13.4833C1.66675 16.525 3.47508 18.3333 6.50841 18.3333H13.4834C16.5167 18.3333 18.3251 16.525 18.3251 13.4917V6.50832C18.3334 3.47499 16.5251 1.66666 13.4917 1.66666Z" fill="#48C65B"/>
                <path d="M14.0251 7.84167C13.9668 7.7 13.8501 7.58334 13.7084 7.525C13.6418 7.5 13.5668 7.48334 13.4918 7.48334H11.9418C11.6168 7.48334 11.3584 7.74167 11.3584 8.06667C11.3584 8.39167 11.6168 8.65 11.9418 8.65H12.0918L10.3334 10.4083L9.48345 9.14167C9.38345 9 9.23345 8.9 9.05845 8.88334C8.87511 8.86667 8.71678 8.925 8.59178 9.05L6.10845 11.5333C5.88345 11.7583 5.88345 12.125 6.10845 12.3583C6.22511 12.475 6.36678 12.525 6.51678 12.525C6.66678 12.525 6.81678 12.4667 6.92511 12.3583L8.58348 10.375L9.75845 11.6417C9.85845 11.7833 10.0084 11.8833 10.1834 11.9C10.3668 11.9167 10.5251 11.8583 10.6501 11.7333L12.9168 9.46667V9.61667C12.9168 9.94167 13.1751 10.2 13.5001 10.2C13.8251 10.2 14.0834 9.94167 14.0834 9.61667V8.05834C14.0668 7.98334 14.0584 7.90834 14.0251 7.84167Z" fill="#48C65B"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none">
                <path opacity="0.4" d="M13.4917 1.66669H6.50841C3.47508 1.66669 1.66675 3.47502 1.66675 6.50835V13.4834C1.66675 16.525 3.47508 18.3334 6.50841 18.3334H13.4834C16.5167 18.3334 18.3251 16.525 18.3251 13.4917V6.50835C18.3334 3.47502 16.5251 1.66669 13.4917 1.66669Z" fill="#E04E4E"/>
                <path d="M14.0668 10.3917C14.0668 10.0667 13.8085 9.80835 13.4835 9.80835C13.1585 9.80835 12.9001 10.0667 12.9001 10.3917V10.5417L10.6335 8.27501C10.5085 8.15001 10.3418 8.09168 10.1668 8.10834C9.99181 8.12501 9.83348 8.21668 9.74181 8.36668L8.89181 9.63335L6.92515 7.65001C6.70015 7.42501 6.33348 7.42501 6.10015 7.65001C5.87515 7.87501 5.87515 8.24168 6.10015 8.47501L8.58348 10.9583C8.70848 11.0833 8.87515 11.1417 9.05015 11.125C9.22515 11.1083 9.38348 11.0167 9.47515 10.8667L10.3251 9.60001L12.0835 11.3583H11.9335C11.6085 11.3583 11.3501 11.6167 11.3501 11.9417C11.3501 12.2667 11.6085 12.525 11.9335 12.525H13.4835C13.5585 12.525 13.6335 12.5083 13.7085 12.4833C13.8501 12.425 13.9668 12.3083 14.0251 12.1667C14.0585 12.0917 14.0668 12.0167 14.0668 11.9417V10.3917Z" fill="#E04E4E"/>
              </svg>
            )}
          </span>
          ${amount}
        </div>
      </div>
      <div
        className={`tma-history__current-value current-value ${isZero ? '' : isProfit ? 'profit' : 'loss'}`}
      >
        ${totalVal}
      </div>
      <div className="tma-history__details trade-details">
        <div className="tma-history__time trade-time">{timeStr}</div>
        <div
          className={`tma-history__profit profit-loss ${isZero ? '' : isProfit ? 'profit' : 'loss'}`}
        >
          {isZero ? '' : isProfit ? '+' : '-'}${Math.abs(profit).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
