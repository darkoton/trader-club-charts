/**
 * CalendarPage — trade diary calendar with stats & day modal.
 * Mirrors old_tma calendar.js.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n, type Translations } from '../i18n';
import { fetchDiaryInfo, resolveTmaDiaryUserId, saveDiaryDay, setDiaryPublic } from './api';

/* ---------- helpers ---------- */

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDateRange(year: number, month: number) {
  const dim = getDaysInMonth(year, month);
  const mm = String(month + 1).padStart(2, '0');
  return `01.${mm}.${year} - ${dim}.${mm}.${year}`;
}

interface DayData {
  id: number;
  is_filled: boolean;
  loss_amount: number;
  profit_amount: number;
  comment: string;
  can_edit: boolean;
}

function getDiaryPublicValue(response: unknown): boolean {
  const payload = response as {
    trader?: { diary_public?: boolean | number | string; is_public?: boolean | number | string };
    is_public?: boolean | number | string;
    diary_public?: boolean | number | string;
  } | null;

  const raw = payload?.trader?.diary_public ?? payload?.trader?.is_public ?? payload?.is_public ?? payload?.diary_public;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'public';
  }
  return false;
}

function getDiaryAccountId(response: unknown, fallbackUserId?: string): string {
  const payload = response as {
    trader?: { user_id?: string | number | null; trader_id?: string | number | null; pocket_id?: string | number | null; id?: string | number | null };
    user_id?: string | number | null;
    trader_id?: string | number | null;
    pocket_id?: string | number | null;
    id?: string | number | null;
  } | null;

  const value = payload?.trader?.user_id
    ?? payload?.trader?.trader_id
    ?? payload?.trader?.pocket_id
    ?? payload?.trader?.id
    ?? payload?.user_id
    ?? payload?.trader_id
    ?? payload?.pocket_id
    ?? payload?.id
    ?? fallbackUserId
    ?? '';

  return value == null ? '' : String(value);
}

/* ---------- component ---------- */

export function CalendarPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = localStorage.getItem('tma_calendar_ym');
      if (saved) {
        const [y, m] = saved.split('-').map(Number);
        if (y > 2000 && m >= 0 && m <= 11) {
          const d = new Date();
          d.setFullYear(y, m, 1);
          return d;
        }
      }
    } catch { /* ignore */ }
    return new Date();
  });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchId, setDebouncedSearchId] = useState('');
  const [modalDay, setModalDay] = useState<number | null>(null);
  const [resolvedOwnDiaryId, setResolvedOwnDiaryId] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  /* persist viewed month */
  useEffect(() => {
    try { localStorage.setItem('tma_calendar_ym', `${year}-${month}`); } catch { /* ignore */ }
  }, [year, month]);

  /* --- data fetch --- */
  const dateRange = formatDateRange(year, month).replace(/\s/g, '');
  const userId = debouncedSearchId.trim() || undefined;

  const {
    data: diaryResp,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['tma-diary', dateRange, userId],
    queryFn: () => fetchDiaryInfo(dateRange, userId),
    staleTime: 30_000,
  });

  const monthData: Record<number, DayData> = (diaryResp as any)?.data ?? {};
  const stats = (diaryResp as any)?.statistics ??
    (diaryResp as any
      ? {
          last_7_days: (diaryResp as any).last_7_days,
          last_30_days: (diaryResp as any).last_30_days,
          all_time: (diaryResp as any).all_time,
        }
      : undefined);
  const diaryPublic = getDiaryPublicValue(diaryResp);
  const diaryAccountId = getDiaryAccountId(diaryResp, userId || resolvedOwnDiaryId);

  useEffect(() => {
    if (userId) return;
    let cancelled = false;
    void resolveTmaDiaryUserId().then((id) => {
      if (!cancelled && id) {
        setResolvedOwnDiaryId(id);
      }
    }).catch(() => {
      // Ignore unresolved user id.
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  /* --- navigation --- */
  const goPrev = useCallback(() => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() - 1);
      return n;
    });
  }, []);
  const goNext = useCallback(() => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + 1);
      return n;
    });
  }, []);

  /* --- search --- */
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/\D/g, '');
      setSearchInput(v);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedSearchId(v);
      }, 1000);
    },
    [],
  );

  /* --- public toggle --- */
  const pubMut = useMutation({
    mutationFn: (isPublic: boolean) => setDiaryPublic(isPublic),
    onMutate: async (nextIsPublic: boolean) => {
      await qc.cancelQueries({ queryKey: ['tma-diary'] });
      const previous = qc.getQueriesData({ queryKey: ['tma-diary'] });

      previous.forEach(([key, value]) => {
        const current = (value ?? {}) as Record<string, unknown>;
        const currentTrader = (current.trader ?? {}) as Record<string, unknown>;
        qc.setQueryData(key, {
          ...current,
          is_public: nextIsPublic,
          diary_public: nextIsPublic,
          trader: {
            ...currentTrader,
            is_public: nextIsPublic,
            diary_public: nextIsPublic,
          },
        });
      });

      return { previous };
    },
    onError: (_error, _nextIsPublic, context) => {
      context?.previous?.forEach(([key, value]) => {
        qc.setQueryData(key, value);
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tma-diary'] }),
  });

  /* --- save day --- */
  const saveMut = useMutation({
    mutationFn: (p: { id: number; comment: string; loss: number; profit: number }) =>
      saveDiaryDay(p.id, p.profit, p.loss, p.comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tma-diary'] });
      setModalDay(null);
    },
  });

  /* --- calendar grid --- */
  const firstDow = ((new Date(year, month, 1).getDay() || 7) - 1); // Mon=0
  const daysInMonth = getDaysInMonth(year, month);
  const prevDays = getDaysInMonth(year, month - 1);

  const cells: { day: number; type: 'prev' | 'cur' | 'next'; data?: DayData }[] = useMemo(() => {
    const arr: typeof cells = [];
    for (let i = firstDow - 1; i >= 0; i--) arr.push({ day: prevDays - i, type: 'prev' });
    for (let d = 1; d <= daysInMonth; d++) arr.push({ day: d, type: 'cur', data: monthData[d] });
    const rem = (7 - (arr.length % 7)) % 7;
    for (let d = 1; d <= rem; d++) arr.push({ day: d, type: 'next' });
    return arr;
  }, [firstDow, daysInMonth, prevDays, monthData]);

  /* --- day modal state --- */
  const dayData = modalDay != null ? monthData[modalDay] : undefined;
  const [mProfit, setMProfit] = useState('0');
  const [mLoss, setMLoss] = useState('0');
  const [mComment, setMComment] = useState('');
  useEffect(() => {
    if (dayData) {
      setMProfit(String(dayData.profit_amount || 0));
      setMLoss(String(dayData.loss_amount || 0));
      setMComment(dayData.comment || '');
    }
  }, [dayData]);

  const mBalance = (parseFloat(mProfit) || 0) - (parseFloat(mLoss) || 0);

  /* --- weekday labels --- */
  const weekdays = [
    t.tmaMon, t.tmaTue, t.tmaWed,
    t.tmaThu, t.tmaFri, t.tmaSat, t.tmaSun,
  ];

  return (
    <div className="tma-calendar calendar-container">
      {/* Top bar: public toggle + user ID + search */}
      <div className="tma-calendar__top">
        <div className="tma-calendar__user calendar-user">
          <button
            className="tma-calendar__public-toggle tma-calendar__privacy-btn"
            type="button"
            onClick={() => pubMut.mutate(!diaryPublic)}
            aria-pressed={diaryPublic}
            title={diaryPublic ? t.tmaPublicDiary : t.tmaPrivateDiary}
          >
            {diaryPublic ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="0.5" y="0.5" width="23" height="23" rx="7.5" fill="#48C65B"/>
                <rect x="0.5" y="0.5" width="23" height="23" rx="7.5" stroke="#1D9D30"/>
                <path d="M18.5306 9.03063L10.5306 17.0306C10.4609 17.1005 10.3781 17.156 10.287 17.1939C10.1958 17.2317 10.0981 17.2512 9.99935 17.2512C9.90064 17.2512 9.8029 17.2317 9.71173 17.1939C9.62057 17.156 9.53778 17.1005 9.4681 17.0306L5.9681 13.5306C5.89833 13.4609 5.84299 13.378 5.80524 13.2869C5.76748 13.1957 5.74805 13.098 5.74805 12.9994C5.74805 12.9007 5.76748 12.803 5.80524 12.7119C5.84299 12.6207 5.89833 12.5379 5.9681 12.4681C6.03786 12.3984 6.12069 12.343 6.21184 12.3053C6.30299 12.2675 6.40069 12.2481 6.49935 12.2481C6.59801 12.2481 6.69571 12.2675 6.78686 12.3053C6.87801 12.343 6.96083 12.3984 7.0306 12.4681L9.99997 15.4375L17.4693 7.96938C17.6102 7.82848 17.8013 7.74933 18.0006 7.74933C18.1999 7.74933 18.391 7.82848 18.5318 7.96938C18.6727 8.11028 18.7519 8.30137 18.7519 8.50063C18.7519 8.69989 18.6727 8.89098 18.5318 9.03188L18.5306 9.03063Z" fill="white"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="0.5" y="0.5" width="23" height="23" rx="7.5" fill="#E54848"/>
                <rect x="0.5" y="0.5" width="23" height="23" rx="7.5" stroke="#B91C1C"/>
                <path d="M8.22183 8.22183C8.51472 7.92894 8.9896 7.92894 9.28249 8.22183L12 10.9393L14.7175 8.22183C15.0104 7.92894 15.4853 7.92894 15.7782 8.22183C16.0711 8.51472 16.0711 8.9896 15.7782 9.28249L13.0607 12L15.7782 14.7175C16.0711 15.0104 16.0711 15.4853 15.7782 15.7782C15.4853 16.0711 15.0104 16.0711 14.7175 15.7782L12 13.0607L9.28249 15.7782C8.9896 16.0711 8.51472 16.0711 8.22183 15.7782C7.92894 15.4853 7.92894 15.0104 8.22183 14.7175L10.9393 12L8.22183 9.28249C7.92894 8.9896 7.92894 8.51472 8.22183 8.22183Z" fill="white"/>
              </svg>
            )}
            <span className="tma-calendar__privacy-text">{diaryPublic ? t.tmaPublicDiaryShort : t.tmaPrivateDiaryShort}</span>
          </button>
          {diaryAccountId ? (
            <span className="tma-calendar__account-id">ID: {diaryAccountId}</span>
          ) : null}
        </div>

        <div className="tma-calendar__search-box">
          <input
            className="tma-calendar__search"
            type="text"
            inputMode="numeric"
            placeholder={t.tmaSearchUser}
            value={searchInput}
            onChange={handleSearch}
          />
          {searchInput && (
            <button className="tma-calendar__search-clear" onClick={() => { setSearchInput(''); setDebouncedSearchId(''); }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Month navigation */}
      <div className="tma-calendar__header calendar-header">
        <button className="tma-calendar__nav prev-date" onClick={goPrev}>
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M6.28 10.22a.75.75 0 11-1.06 1.06l-5-5a.75.75 0 010-1.06l5-5a.75.75 0 111.06 1.06L1.81 5.75l4.47 4.47z" fill="#496177"/></svg>
        </button>
        <span className="tma-calendar__date-range date-range">{formatDateRange(year, month)}</span>
        <button className="tma-calendar__nav next-date" onClick={goNext}>
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M.72 10.22a.75.75 0 101.06 1.06l5-5a.75.75 0 000-1.06l-5-5A.75.75 0 00.72 1.28L5.19 5.75.72 10.22z" fill="#496177"/></svg>
        </button>
      </div>

      {/* Weekday header */}
      <div className="tma-calendar__weekdays calendar-weekdays">
        {weekdays.map((w) => (
          <div className="tma-calendar__weekday weekday" key={w}>{w}</div>
        ))}
      </div>

      {/* Grid / spinner / error */}
      {isLoading ? (
        <div className="tma-spinner" />
      ) : isError ? (
        <div className="tma-calendar__error">
          <p>{t.tmaDiaryNotFound}</p>
          <button onClick={() => refetch()}>{t.tmaRetry}</button>
        </div>
      ) : (
        <>
          <div className="tma-calendar__grid calendar-grid">
            {cells.map((c, i) => {
              if (c.type !== 'cur') {
                return (
                  <div key={i} className="tma-calendar__day calendar-day tma-calendar__day--empty tma-calendar__day--faded">
                    <div className="tma-calendar__day-num">{c.day}</div>
                  </div>
                );
              }
              const d = c.data;
              const net = d ? d.profit_amount - d.loss_amount : 0;
              const cls =
                net > 0 ? 'tma-calendar__day--profit' : net < 0 ? 'tma-calendar__day--loss' : 'tma-calendar__day--empty';
              return (
                <div
                  key={i}
                  className={`tma-calendar__day calendar-day ${cls}`}
                  onClick={() => {
                    if (d) setModalDay(c.day);
                  }}
                >
                  <div className="tma-calendar__day-num">{c.day}</div>
                  {net !== 0 && (
                    <div className="tma-calendar__day-info">
                      {net > 0 ? `+$${net}` : `-$${Math.abs(net)}`}
                    </div>
                  )}
                  {net === 0 && d?.comment && (
                    <div className="tma-calendar__day-comment">{d.comment}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Stats */}
          {stats && <DiaryStats stats={stats} t={t} />}
        </>
      )}

      {/* Day Modal */}
      {modalDay != null && dayData && (
        <div className="tma-modal-overlay" onClick={() => setModalDay(null)}>
          <div className="tma-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tma-modal__header modal-header">
              <span className="tma-modal__date">
                {String(modalDay).padStart(2, '0')}.{String(month + 1).padStart(2, '0')}.{year}
              </span>
              <button className="tma-modal__close modal-close" onClick={() => setModalDay(null)}>
                &times;
              </button>
            </div>
            <div className="tma-modal__body">
              <textarea
                className="tma-modal__comment"
                placeholder={t.tmaComment}
                value={mComment}
                onChange={(e) => setMComment(e.target.value)}
                disabled={!dayData.can_edit}
              />

              <div className="tma-modal__result">
                <div className="tma-modal__result-label">{t.tmaDayResult}</div>
                <div className="tma-modal__amounts">
                  <div className="tma-modal__amount-group">
                    <label className="tma-modal__minus">-$</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="tma-modal__amount-input"
                      value={mLoss}
                      onChange={(e) => setMLoss(e.target.value.replace(/[^\d.]/g, ''))}
                      disabled={!dayData.can_edit}
                    />
                  </div>
                  <div className="tma-modal__amount-group">
                    <label className="tma-modal__plus">+$</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="tma-modal__amount-input"
                      value={mProfit}
                      onChange={(e) => setMProfit(e.target.value.replace(/[^\d.]/g, ''))}
                      disabled={!dayData.can_edit}
                    />
                  </div>
                </div>
              </div>

              <div className="tma-modal__stats">
                <div className="tma-modal__stat">
                  <span>{t.tmaProfit}</span>
                  <span className="tma-modal__stat-val tma-modal__stat-val--profit">
                    +${(parseFloat(mProfit) || 0).toFixed(2)}
                  </span>
                </div>
                <div className="tma-modal__stat">
                  <span>{t.tmaLoss}</span>
                  <span className="tma-modal__stat-val tma-modal__stat-val--loss">
                    -${(parseFloat(mLoss) || 0).toFixed(2)}
                  </span>
                </div>
                <div className="tma-modal__stat">
                  <span>{t.tmaDayResult}</span>
                  <span
                    className={`tma-modal__stat-val ${
                      mBalance > 0 ? 'tma-modal__stat-val--profit' : mBalance < 0 ? 'tma-modal__stat-val--loss' : ''
                    }`}
                  >
                    {mBalance > 0 ? '+' : mBalance < 0 ? '-' : ''}${Math.abs(mBalance).toFixed(2)}
                  </span>
                </div>
              </div>

              {dayData.can_edit && (
                <button
                  className="tma-modal__save modal-save"
                  disabled={saveMut.isPending}
                  onClick={() =>
                    saveMut.mutate({
                      id: dayData.id,
                      comment: mComment,
                      loss: parseFloat(mLoss) || 0,
                      profit: parseFloat(mProfit) || 0,
                    })
                  }
                >
                  {t.tmaSaveDay}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Stats sub-component --- */

function DiaryStats({ stats, t }: { stats: any; t: Translations }) {
  const renderPeriod = (label: string, s: any) => {
    if (!s) return null;
    const net = s.net_profit ?? 0;
    return (
      <div className="tma-calendar__stats-period" key={label}>
        <div className="tma-calendar__stats-period-title">{label}</div>
        <div className="tma-calendar__stats-row">
          <span>{t.tmaNetProfit}:</span>
          <span className={net > 0 ? 'positive' : net < 0 ? 'negative' : ''}>
            {net > 0 ? '+' : ''}{net < 0 ? '-' : ''}${Math.abs(net)}
          </span>
        </div>
        <div className="tma-calendar__stats-row">
          <span>{t.tmaProfit}:</span>
          <span className="positive">${s.total_profit ?? 0}</span>
        </div>
        <div className="tma-calendar__stats-row">
          <span>{t.tmaLoss}:</span>
          <span className="negative">${s.total_loss ?? 0}</span>
        </div>
        <div className="tma-calendar__stats-row">
          <span>{t.tmaPositiveDays}:</span>
          <span>{s.positive_days ?? 0}</span>
        </div>
        <div className="tma-calendar__stats-row">
          <span>{t.tmaNegativeDays}:</span>
          <span>{s.negative_days ?? 0}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="tma-calendar__stats">
      <div className="tma-calendar__stats-title">{t.tmaDiaryStats}</div>
      {renderPeriod(t.tmaLast7Days, stats.last_7_days)}
      {renderPeriod(t.tmaLast30Days, stats.last_30_days)}
      {renderPeriod(t.tmaAllTime, stats.all_time)}
    </div>
  );
}
