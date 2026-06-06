/**
 * ChatsPage — chat list with search, read-all and drag-and-drop reordering.
 * Mirrors old_tma chats.js renderChatsList + setupChatsListWithDnD.
 * Order is persisted in localStorage under CHAT_ORDER_KEY.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../i18n';
import { fetchChats, getStoredTmaGroupInviteLink, readAllMessages, fetchMessageTemplates, renderTmaMessage, resolveTmaMediaUrl } from './api';
import type { TmaChat, TmaLastMessage } from './types';

const CHAT_ORDER_KEY = 'tma_chats_order';

/* Use stringified IDs so we support both numeric and string chat IDs */
function loadChatOrder(): string[] {
  try {
    const s = localStorage.getItem(CHAT_ORDER_KEY);
    return s ? (JSON.parse(s) as string[]) : [];
  } catch {
    return [];
  }
}

function saveChatOrder(ids: string[]) {
  try {
    localStorage.setItem(CHAT_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota errors
  }
}

interface Props {
  onOpenChat: (chat: TmaChat) => void;
  mode?: 'standard' | 'analytics';
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    let normalized = dateStr;
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr) && !/[zZ]$/.test(dateStr)) {
      normalized += 'Z';
    }
    normalized = normalized.replace(/\.(\d{3})\d+Z$/, '.$1Z');
    const d = new Date(normalized);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

/** Returns the display title for a chat, preferring localised titles */
function chatTitle(chat: TmaChat, locale: string): string {
  if (chat.titles) {
    return chat.titles[locale] || chat.titles['ru'] || chat.titles['en'] || chat.title || String(chat.id);
  }
  return chat.title || String(chat.id);
}

/** Returns true if the last message is a ready_signal type */
function isReadySignal(chat: TmaChat): boolean {
  const lm = chat.last_message;
  if (!lm || typeof lm === 'string') return false;
  return ['ready_signal', 'ready_signal_1', 'ready_signal_2'].includes((lm as TmaLastMessage).type_request);
}

function isMainSignal(chat: TmaChat): boolean {
  const lm = chat.last_message;
  if (!lm || typeof lm === 'string') return false;
  return ['main_signal', 'main_signal_1', 'main_signal_2'].includes((lm as TmaLastMessage).type_request);
}

/** Returns win/loss/martingale if the last message is a result_signal, otherwise null */
function resultSignalDot(chat: TmaChat): 'win' | 'loss' | 'martingale' | null {
  const lm = chat.last_message;
  if (!lm || typeof lm === 'string') return null;
  if ((lm as TmaLastMessage).type_request !== 'result_signal') return null;
  const r = ((lm as TmaLastMessage).data?.result ?? '').toLowerCase();
  if (r === 'win' || r === 'plus') return 'win';
  if (r === 'loss' || r === 'lose' || r === 'minus') return 'loss';
  if (r === 'martingale') return 'martingale';
  return null;
}

/** Returns the last message date string */
function lastMessageDate(chat: TmaChat): string | undefined {
  const lm = chat.last_message;
  if (lm && typeof lm === 'object') return (lm as TmaLastMessage).date || (lm as TmaLastMessage).created_at || chat.last_message_time;
  return chat.last_message_time;
}

export function ChatsPage({ onOpenChat, mode = 'standard' }: Props) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  /* ── DnD order (string IDs) ── */
  const [chatOrder, setChatOrder] = useState<string[]>(loadChatOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const draggingIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const touchStartedRef = useRef(false);
  const mouseDragStartedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const touchCandidateRef = useRef<{ sid: string; x: number; y: number } | null>(null);
  const mouseCandidateRef = useRef<{ sid: string; x: number; y: number } | null>(null);
  const suppressOpenClickRef = useRef(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetTouchDnD = useCallback(() => {
    clearLongPressTimer();
    touchStartedRef.current = false;
    mouseDragStartedRef.current = false;
    touchCandidateRef.current = null;
    mouseCandidateRef.current = null;
    draggingIdRef.current = null;
    dragOverIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, [clearLongPressTimer]);

  /* ── Data fetching ── */
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['tma-chats'],
    queryFn: fetchChats,
    staleTime: 5 * 60_000, // 5 min — socket keeps data fresh
    refetchOnWindowFocus: false,
  });

  const { data: templates } = useQuery({
    queryKey: ['tma-message-templates'],
    queryFn: fetchMessageTemplates,
    staleTime: Infinity,   // cache forever per session
    gcTime: Infinity,
  });

  const readAllMut = useMutation({
    mutationFn: readAllMessages,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tma-chats'] }),
  });

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    let list = chats.filter((c) => String(c.id) !== '0');
    list = list.filter((chat) => {
      const category = (chat.category ?? '').trim().toLowerCase();
      if (mode === 'analytics') return category === 'analytics';
      return category !== 'analytics';
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => chatTitle(c, locale).toLowerCase().includes(q));
    }
    return list;
  }, [chats, search, locale, mode]);

  /* ── Ordered list (DnD order + new chats appended) ── */
  const ordered = useMemo(() => {
    if (chatOrder.length === 0) return filtered;
    const map = new Map(filtered.map((c) => [String(c.id), c]));
    const result: TmaChat[] = [];
    for (const sid of chatOrder) {
      const chat = map.get(sid);
      if (chat) result.push(chat);
    }
    for (const chat of filtered) {
      if (!chatOrder.includes(String(chat.id))) result.push(chat);
    }
    return result;
  }, [filtered, chatOrder]);

  /* ── DnD reorder ── */
  const reorder = useCallback(
    (fromSid: string, toSid: string) => {
      const currentSids = ordered.map((c) => String(c.id));
      const fromIdx = currentSids.indexOf(fromSid);
      const toIdx = currentSids.indexOf(toSid);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const next = [...currentSids];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      saveChatOrder(next);
      setChatOrder(next);
    },
    [ordered],
  );

  /* ── Mobile touch drag ── */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;

      const candidate = touchCandidateRef.current;
      if (candidate && !touchStartedRef.current) {
        const dx = Math.abs(touch.clientX - candidate.x);
        const dy = Math.abs(touch.clientY - candidate.y);
        if (dx > 8 || dy > 8) {
          clearLongPressTimer();
          touchCandidateRef.current = null;
        }
        return;
      }

      if (!touchStartedRef.current || !draggingIdRef.current) return;
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const chatEl = el?.closest('[data-chat-id]') as HTMLElement | null;
      if (chatEl) {
        const overId = chatEl.dataset.chatId;
        if (overId && overId !== draggingIdRef.current) { dragOverIdRef.current = overId; setDragOverId(overId); }
      }
    }

    function onTouchEnd() {
      const didDrag = touchStartedRef.current;
      if (draggingIdRef.current && dragOverIdRef.current && draggingIdRef.current !== dragOverIdRef.current) {
        reorder(draggingIdRef.current, dragOverIdRef.current);
      }
      if (didDrag) {
        suppressOpenClickRef.current = true;
      }
      resetTouchDnD();
    }

    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', onTouchEnd);
    return () => {
      list.removeEventListener('touchmove', onTouchMove);
      list.removeEventListener('touchend', onTouchEnd);
      list.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [clearLongPressTimer, reorder, resetTouchDnD]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const candidate = mouseCandidateRef.current;
      if (candidate && !mouseDragStartedRef.current) {
        const dx = Math.abs(event.clientX - candidate.x);
        const dy = Math.abs(event.clientY - candidate.y);
        if (dx > 8 || dy > 8) {
          clearLongPressTimer();
          mouseCandidateRef.current = null;
        }
        return;
      }

      if (!mouseDragStartedRef.current || !draggingIdRef.current) return;
      event.preventDefault();
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const chatEl = el?.closest('[data-chat-id]') as HTMLElement | null;
      if (!chatEl) return;
      const overId = chatEl.dataset.chatId;
      if (overId && overId !== dragOverIdRef.current) {
        dragOverIdRef.current = overId;
        setDragOverId(overId);
      }
    }

    function onMouseUp() {
      const didDrag = mouseDragStartedRef.current;
      if (draggingIdRef.current && dragOverIdRef.current && draggingIdRef.current !== dragOverIdRef.current) {
        reorder(draggingIdRef.current, dragOverIdRef.current);
      }
      if (didDrag) {
        suppressOpenClickRef.current = true;
      }
      resetTouchDnD();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [clearLongPressTimer, reorder, resetTouchDnD]);

  useEffect(() => () => resetTouchDnD(), [resetTouchDnD]);

  const handleTouchStart = useCallback((sid: string, event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchCandidateRef.current = { sid, x: touch.clientX, y: touch.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      const candidate = touchCandidateRef.current;
      if (!candidate || candidate.sid !== sid) return;
      touchStartedRef.current = true;
      draggingIdRef.current = sid;
      dragOverIdRef.current = sid;
      setDraggingId(sid);
      setDragOverId(sid);
    }, 180);
  }, [clearLongPressTimer]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartedRef.current) {
      clearLongPressTimer();
      touchCandidateRef.current = null;
    }
  }, [clearLongPressTimer]);

  const handleMouseDown = useCallback((sid: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    mouseCandidateRef.current = { sid, x: event.clientX, y: event.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      const candidate = mouseCandidateRef.current;
      if (!candidate || candidate.sid !== sid) return;
      mouseDragStartedRef.current = true;
      draggingIdRef.current = sid;
      dragOverIdRef.current = sid;
      setDraggingId(sid);
      setDragOverId(sid);
    }, 180);
  }, [clearLongPressTimer]);

  const handleMouseLeave = useCallback(() => {
    if (!mouseDragStartedRef.current) {
      clearLongPressTimer();
      mouseCandidateRef.current = null;
    }
  }, [clearLongPressTimer]);

  const totalUnread = useMemo(() => filtered.reduce((s, c) => s + (c.unread_count || 0), 0), [filtered]);
  const groupInviteLink = getStoredTmaGroupInviteLink();

  /** Render last message preview text */
  function lastMsgText(chat: TmaChat): string {
    const lm = chat.last_message;
    if (!lm) return '';
    if (typeof lm === 'string') return lm.replace(/<[^>]*>/g, '').trim();
    if (templates) {
      const rendered = renderTmaMessage(lm.type_request, lm.data, templates, locale);
      if (rendered) return rendered.replace(/\n/g, ' ').slice(0, 120);
    }
    // Fallback: show symbol only (no raw type_request)
    return lm.data?.symbol || '';
  }

  return (
    <div className="tg-chats-list">
      {/* Search + Read All */}
      <div className="tma-chat-search chat-search-container">
        <input
          className="tma-chat-search__input chat-search-input"
          type="text"
          placeholder={t.tmaSearchChats}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {totalUnread > 0 && (
          <button
            className="tma-read-all-btn read-all-button"
            title={t.tmaReadAll}
            onClick={() => readAllMut.mutate()}
          >
          <svg fill="CurrentColor" height="64px" width="64px" version="1.1" id="Icons" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" xmlSpace="preserve"><g id="SVGRepo_bgCarrier" strokeWidth="0"></g><g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M13,23c0-1.4,0.3-2.8,0.9-4c-0.2,0-0.4-0.1-0.5-0.2l-1.6-1.4l-5.1,4.4C6.5,21.9,6.2,22,6,22c-0.3,0-0.6-0.1-0.8-0.3 c-0.4-0.4-0.3-1,0.1-1.4l4.9-4.2l-4.9-4.2c-0.4-0.4-0.5-1-0.1-1.4c0.4-0.4,1-0.5,1.4-0.1l7.3,6.4l7.3-6.4c0.4-0.4,1-0.3,1.4,0.1 c0.4,0.4,0.3,1-0.1,1.4L21,13.2c0.6-0.1,1.3-0.2,2-0.2c1.4,0,2.8,0.3,4,0.8V9c0-1.7-1.3-3-3-3H4C2.3,6,1,7.3,1,9v14c0,1.7,1.3,3,3,3 h9.5C13.2,25.1,13,24,13,23z"></path> <path d="M17.3,17.3c-3.1,3.1-3.1,8.2,0,11.3s8.2,3.1,11.3,0s3.1-8.2,0-11.3S20.5,14.2,17.3,17.3z M25.8,21.6L24.4,23l1.4,1.4 c0.4,0.4,0.4,1,0,1.4c-0.4,0.4-1,0.4-1.4,0L23,24.4l-1.4,1.4c-0.4,0.4-1,0.4-1.4,0c-0.4-0.4-0.4-1,0-1.4l1.4-1.4l-1.4-1.4 c-0.4-0.4-0.4-1,0-1.4c0.4-0.4,1-0.4,1.4,0l1.4,1.4l1.4-1.4c0.4-0.4,1-0.4,1.4,0C26.2,20.6,26.2,21.2,25.8,21.6z"></path> </g></svg>
          </button>
        )}
      </div>

      {/* Chat list */}
      {isLoading ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
          <div className="tma-spinner" />
        </div>
      ) : ordered.length === 0 && !(mode === 'standard' && groupInviteLink) ? (
        <div className="tma-no-data">{mode === 'analytics' ? t.tmaAnalyticsEmptyTitle : t.tmaNoChats}</div>
      ) : (
        <div ref={listRef}>
          {mode === 'standard' && groupInviteLink && (
            <a
              className="tma-chat-item tma-chat-item--link tg-chat-item"
              href={groupInviteLink}
              target="_blank"
              rel="noreferrer"
            >
              <div className="tma-chat-item__photo tg-chat-photo">
                <img src="/img/premium.jpg" alt="Premium club" />
              </div>
              <div className="tma-chat-item__content tg-chat-content tg-chat-info">
                <div className="tma-chat-item__header tg-chat-header">
                  <span className="tma-chat-item__title tg-chat-title">{t.tmaPremiumClub}</span>
                  <div className="tma-chat-item__time-wrap">
                    <span className="tma-chat-item__time tg-chat-time">
                      {formatTime(new Date().toISOString())}
                    </span>
                  </div>
                </div>
                <div className="tma-chat-item__footer tg-chat-footer">
                  <span className="tma-chat-item__last-msg tg-chat-last-msg">{t.tmaTapToJoin}</span>
                </div>
              </div>
            </a>
          )}

          {ordered.map((chat) => {
            const sid = String(chat.id);
            const title = chatTitle(chat, locale);
            return (
              <div
                key={sid}
                data-chat-id={sid}
                className={
                  'tma-chat-item tg-chat-item' +
                  (draggingId === sid ? ' tma-chat-item--dragging' : '') +
                  (dragOverId === sid && draggingId !== sid ? ' tma-chat-item--drag-over' : '')
                }
                onClick={() => {
                  if (suppressOpenClickRef.current) {
                    suppressOpenClickRef.current = false;
                    return;
                  }
                  if (draggingId !== null) return;
                  onOpenChat(chat);
                }}
                onMouseDown={(event) => handleMouseDown(sid, event)}
                onMouseLeave={handleMouseLeave}
                onTouchStart={(event) => handleTouchStart(sid, event)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
              >
                {/* Drag handle */}
                {/* <div
                  className="tma-chat-drag-handle"
                  aria-hidden
                  onClick={(event) => event.stopPropagation()}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <rect x="4" y="5" width="16" height="2" rx="1" />
                    <rect x="4" y="11" width="16" height="2" rx="1" />
                    <rect x="4" y="17" width="16" height="2" rx="1" />
                  </svg>
                </div> */}

                <div className="tma-chat-item__photo tg-chat-photo">
                  {chat.photo ? (
                    <img src={resolveTmaMediaUrl(chat.photo)} alt="" />
                  ) : (
                    <div style={{
                      width: 45, height: 45, borderRadius: '50%', background: '#2a3642',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 700, color: '#fff',
                    }}>
                      {title.charAt(0) || '?'}
                    </div>
                  )}
                </div>

                <div className="tma-chat-item__content tg-chat-content tg-chat-info">
                  <div className="tma-chat-item__header tg-chat-header">
                    <span className="tma-chat-item__title tg-chat-title">{title}</span>
                    <div className="tma-chat-item__time-wrap">
                      {isReadySignal(chat) && <span className="tma-chat-item__ready-dot" aria-label="ready signal" />}
                      {isMainSignal(chat) && <span className="tma-chat-item__main-dot" aria-label="active signal">!</span>}
                      {(() => { const d = resultSignalDot(chat); return d ? <span className={`tma-chat-item__result-dot tma-chat-item__result-dot--${d}`} aria-label={d} /> : null; })()}
                      <span className="tma-chat-item__time tg-chat-time">
                        {formatTime(lastMessageDate(chat))}
                      </span>
                    </div>
                  </div>
                  <div className="tma-chat-item__footer tg-chat-footer">
                    <span className="tma-chat-item__last-msg tg-chat-last-msg">
                      {lastMsgText(chat)}
                    </span>
                    {(chat.unread_count ?? 0) > 0 && (
                      <span className="tma-chat-item__unread tg-chat-unread">{chat.unread_count}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
