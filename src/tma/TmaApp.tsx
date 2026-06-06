/**
 * TmaApp — main TMA container with bottom navigation and page router.
 * Replaces the iframe that used to load old_tma.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../i18n';
import { useTmaSocket } from './useTmaSocket';
import { ChatsPage } from './ChatsPage';
import { ChatView } from './ChatView';
import { CalculatorPage } from './CalculatorPage';
import { CalendarPage } from './CalendarPage';
import { RobotPage } from './RobotPage';
import { VirtualTradingModal } from './VirtualTradingModal';
import type { TmaRoute, TmaChat } from './types';
import './tma.css';

/* ─── Nav icons (from old_tma bottom-menu) ─── */

const RobotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path opacity="0.4" d="M19.5868 0.666687H8.41341C3.56008 0.666687 0.666748 3.56002 0.666748 8.41335V19.5734C0.666748 24.44 3.56008 27.3334 8.41341 27.3334H19.5734C24.4268 27.3334 27.3201 24.44 27.3201 19.5867V8.41335C27.3334 3.56002 24.4401 0.666687 19.5868 0.666687Z" fill="#838E99"/>
    <path d="M7.56148 6.04887C6.85491 6.28345 6.46844 7.13574 6.75341 7.83164C6.87833 8.12877 7.01106 8.29298 7.2648 8.45327L7.4795 8.5901L7.48341 10.4511C7.48341 11.4832 7.46779 12.3238 7.44827 12.3472C7.42876 12.3668 7.31555 12.5583 7.19063 12.7695C6.4255 14.1065 6 15.6938 6 17.2108C6 17.8128 6.07027 18.1412 6.3123 18.6378C7.11646 20.2993 9.36109 21.5308 12.3123 21.9296C13.0189 22.0235 14.9824 22.0235 15.6929 21.9296C17.4105 21.699 18.8666 21.1985 19.987 20.4596C20.8106 19.9123 21.3533 19.3376 21.6929 18.6378C21.97 18.067 22.0208 17.7816 21.9935 16.9605C21.9388 15.3185 21.4782 13.8094 20.6116 12.4332L20.5218 12.2847V10.4393L20.5257 8.5901L20.7326 8.46109C20.9863 8.29688 21.1347 8.11704 21.2557 7.8121C21.3376 7.61271 21.3494 7.53061 21.3337 7.26084C21.3142 6.8777 21.2088 6.63531 20.9512 6.38119C20.6623 6.08797 20.4554 6.00977 19.9948 6.00977C19.6239 6.00977 19.5927 6.01759 19.3585 6.1427C19.0852 6.29126 18.89 6.50238 18.7573 6.7956C18.6324 7.06536 18.6285 7.6088 18.7534 7.87465C18.8549 8.0975 19.1399 8.41026 19.3311 8.51582L19.4678 8.5901V9.77471V10.9632L19.1867 10.713C17.6487 9.34466 15.8959 8.64875 13.9948 8.64875C12.1093 8.64875 10.3487 9.35247 8.82238 10.713L8.53741 10.9632V9.77471V8.5901L8.67404 8.51582C8.86532 8.41026 9.15029 8.0975 9.25178 7.87465C9.3767 7.6088 9.3728 7.06536 9.24788 6.7956C9.11515 6.49847 8.91997 6.29126 8.64671 6.14661C8.43201 6.02932 8.35784 6.01368 8.06896 6.00196C7.85036 5.99414 7.67469 6.00977 7.56148 6.04887ZM10.5166 13.5162C11.106 13.696 11.961 13.8681 12.6753 13.9502C13.1204 14.001 13.46 14.0088 14.2563 13.9932C15.6031 13.9658 16.4151 13.8446 17.5862 13.4927C17.8087 13.4263 17.9961 13.3754 18 13.3833C18.0429 13.4302 18.3552 14.0909 18.4567 14.345C18.7456 15.0722 18.9603 16.2334 18.9603 17.0583V17.4844L18.8237 17.6369C18.4294 18.0709 17.3442 18.3954 15.6421 18.5869C14.9551 18.6612 12.9174 18.6495 12.1874 18.5635C10.6493 18.3836 9.55237 18.0474 9.18152 17.6369L9.04489 17.4844V17.0544C9.04489 16.3115 9.20494 15.3537 9.45868 14.5991C9.57579 14.2434 9.97787 13.3794 10.0286 13.3794C10.0442 13.3794 10.2667 13.4419 10.5166 13.5162Z" fill="#838E99"/>
    <path d="M11.2623 15.6821C11.0554 15.7486 10.8797 15.8893 10.7704 16.0692C10.6182 16.3311 10.6182 16.683 10.7743 16.9449C10.9305 17.2147 11.1725 17.3476 11.5043 17.3476C11.8205 17.3476 12.043 17.2303 12.207 16.984C12.57 16.4328 12.2265 15.7134 11.5746 15.6665C11.4614 15.6547 11.3209 15.6665 11.2623 15.6821Z" fill="#838E99"/>
    <path d="M16.2589 15.6821C16.052 15.7486 15.8763 15.8893 15.767 16.0692C15.6148 16.3311 15.6148 16.683 15.7709 16.9449C15.9271 17.2147 16.1691 17.3476 16.5009 17.3476C16.7078 17.3476 16.7898 17.328 16.9381 17.2381C17.4768 16.9214 17.4846 16.0965 16.9498 15.7838C16.7625 15.6704 16.4385 15.6274 16.2589 15.6821Z" fill="#838E99"/>
  </svg>
);

const ChatsIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path opacity="0.4" d="M21.5866 2.66669H10.4133C5.55996 2.66669 2.66663 5.56002 2.66663 10.4134V21.5734C2.66663 26.44 5.55996 29.3334 10.4133 29.3334H21.5733C26.4266 29.3334 29.32 26.44 29.32 21.5867V10.4134C29.3333 5.56002 26.44 2.66669 21.5866 2.66669Z" fill="#838E99"></path>
    <path d="M9.17334 25.2C8.62667 25.2 8.17334 24.7467 8.17334 24.2V21.44C8.17334 20.8933 8.62667 20.44 9.17334 20.44C9.72001 20.44 10.1733 20.8933 10.1733 21.44V24.2C10.1733 24.76 9.72001 25.2 9.17334 25.2Z" fill="#838E99"></path>
    <path d="M16 25.2C15.4533 25.2 15 24.7467 15 24.2V18.6667C15 18.12 15.4533 17.6667 16 17.6667C16.5467 17.6667 17 18.12 17 18.6667V24.2C17 24.76 16.5467 25.2 16 25.2Z" fill="#838E99"></path>
    <path d="M22.8267 25.2C22.28 25.2 21.8267 24.7467 21.8267 24.2V15.9067C21.8267 15.36 22.28 14.9067 22.8267 14.9067C23.3733 14.9067 23.8267 15.36 23.8267 15.9067V24.2C23.8267 24.76 23.3867 25.2 22.8267 25.2Z" fill="#838E99"></path>
    <path d="M23.8266 7.76005C23.8266 7.69338 23.7999 7.61338 23.7866 7.54672C23.7733 7.49338 23.7599 7.42672 23.7466 7.37338C23.7199 7.32005 23.6799 7.28005 23.6533 7.22672C23.6133 7.17338 23.5733 7.10672 23.5199 7.06672C23.5066 7.05338 23.5066 7.04005 23.4933 7.04005C23.4533 7.01338 23.4133 7.00005 23.3733 6.97338C23.3199 6.93338 23.2533 6.89338 23.1866 6.86672C23.1199 6.84005 23.0533 6.84005 22.9866 6.82672C22.9333 6.81338 22.8933 6.80005 22.8399 6.80005H18.9333C18.3866 6.80005 17.9333 7.25338 17.9333 7.80005C17.9333 8.34672 18.3866 8.80005 18.9333 8.80005H20.5999C17.4266 12.1334 13.4266 14.48 8.93327 15.6134C8.39993 15.7467 8.0666 16.2934 8.19993 16.8267C8.3066 17.28 8.71993 17.5867 9.17327 17.5867C9.25327 17.5867 9.33327 17.5734 9.41327 17.56C14.1733 16.3734 18.4266 13.9067 21.8266 10.4134V11.7067C21.8266 12.2534 22.2799 12.7067 22.8266 12.7067C23.3733 12.7067 23.8266 12.2534 23.8266 11.7067V7.80005C23.8266 7.78672 23.8266 7.77338 23.8266 7.76005Z" fill="#838E99"></path>
  </svg>
);

const AnalyticsIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path opacity="0.4" d="M21.5866 2.66669H10.4133C5.55996 2.66669 2.66663 5.56002 2.66663 10.4134V21.5734C2.66663 26.44 5.55996 29.3334 10.4133 29.3334H21.5733C26.4266 29.3334 29.32 26.44 29.32 21.5867V10.4134C29.3333 5.56002 26.44 2.66669 21.5866 2.66669Z" fill="#838E99"/>
    <path d="M21.8933 10.4134V21.5867C21.8933 22.44 21.2 23.1334 20.3466 23.1334C19.48 23.1334 18.7866 22.44 18.7866 21.5867V10.4134C18.7866 9.56003 19.48 8.8667 20.3466 8.8667C21.2 8.8667 21.8933 9.56003 21.8933 10.4134Z" fill="#838E99"/>
    <path d="M13.2132 17.24V21.5867C13.2132 22.44 12.5199 23.1334 11.6532 23.1334C10.7999 23.1334 10.1066 22.44 10.1066 21.5867V17.24C10.1066 16.3867 10.7999 15.6934 11.6532 15.6934C12.5199 15.6934 13.2132 16.3867 13.2132 17.24Z" fill="#838E99"/>
  </svg>
);

const CalcIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path opacity="0.4" d="M10.6667 29.3334H21.3333C25.0133 29.3334 28 26.3467 28 22.6667V9.33335C28 5.65335 25.0133 2.66669 21.3333 2.66669H10.6667C6.98667 2.66669 4 5.65335 4 9.33335V22.6667C4 26.3467 6.98667 29.3334 10.6667 29.3334Z" fill="#838E99"></path>
    <path d="M20 7.61334H12C10.6267 7.61334 9.49335 8.73334 9.49335 10.12V11.4533C9.49335 12.8267 10.6133 13.96 12 13.96H20C21.3733 13.96 22.5067 12.84 22.5067 11.4533V10.12C22.5067 8.73334 21.3867 7.61334 20 7.61334Z" fill="#838E99"></path>
    <path d="M10.88 19.8933C10.6933 19.8933 10.52 19.8533 10.36 19.7866C10.2 19.72 10.0533 19.6266 9.93332 19.5066C9.67999 19.2533 9.53333 18.92 9.53333 18.56C9.53333 18.3866 9.57333 18.2133 9.63999 18.0533C9.70666 17.88 9.79999 17.7466 9.93332 17.6133C10.24 17.3066 10.7067 17.16 11.1333 17.2533C11.2133 17.2666 11.3067 17.2933 11.3867 17.3333C11.4667 17.36 11.5467 17.4 11.6133 17.4533C11.6933 17.4933 11.76 17.56 11.8133 17.6133C11.9333 17.7466 12.04 17.88 12.1067 18.0533C12.1733 18.2133 12.2 18.3866 12.2 18.56C12.2 18.92 12.0667 19.2533 11.8133 19.5066C11.56 19.76 11.2267 19.8933 10.88 19.8933Z" fill="#838E99"></path>
    <path d="M16.2 19.8933C15.8534 19.8933 15.52 19.76 15.2667 19.5067C15.0134 19.2533 14.8667 18.92 14.8667 18.56C14.8667 18.2133 15.0134 17.8667 15.2667 17.6133C15.76 17.12 16.6534 17.12 17.1467 17.6133C17.2667 17.7467 17.3734 17.88 17.44 18.0533C17.5067 18.2133 17.5334 18.3867 17.5334 18.56C17.5334 18.92 17.4 19.2533 17.1467 19.5067C16.8934 19.76 16.56 19.8933 16.2 19.8933Z" fill="#838E99"></path>
    <path d="M21.5333 19.8933C21.1866 19.8933 20.8533 19.76 20.6 19.5067C20.3466 19.2533 20.2 18.92 20.2 18.56C20.2 18.2133 20.3466 17.8667 20.6 17.6133C21.0933 17.12 21.9866 17.12 22.48 17.6133C22.7333 17.8667 22.88 18.2133 22.88 18.56C22.88 18.7333 22.84 18.9067 22.7733 19.0667C22.7066 19.2267 22.6133 19.3733 22.48 19.5067C22.2266 19.76 21.8933 19.8933 21.5333 19.8933Z" fill="#838E99"></path>
    <path d="M10.88 25.2267C10.52 25.2267 10.1867 25.0933 9.93332 24.84C9.67999 24.5866 9.53333 24.2533 9.53333 23.8933C9.53333 23.5467 9.67999 23.2 9.93332 22.9466C10.0533 22.8266 10.2 22.7333 10.36 22.6667C10.6933 22.5333 11.0533 22.5333 11.3867 22.6667C11.4667 22.6933 11.5467 22.7333 11.6133 22.7867C11.6933 22.8267 11.76 22.8933 11.8133 22.9466C12.0667 23.2 12.2133 23.5467 12.2133 23.8933C12.2133 24.2533 12.0667 24.5866 11.8133 24.84C11.56 25.0933 11.2267 25.2267 10.88 25.2267Z" fill="#838E99"></path>
    <path d="M16.2 25.2266C15.8534 25.2266 15.52 25.0933 15.2667 24.84C15.0134 24.5866 14.8667 24.2533 14.8667 23.8933C14.8667 23.8 14.88 23.72 14.8934 23.6266C14.92 23.5466 14.9467 23.4666 14.9734 23.3866C15.0134 23.3066 15.0534 23.2266 15.0934 23.1466C15.1467 23.08 15.2 23.0133 15.2667 22.9466C15.3867 22.8266 15.5334 22.7333 15.6934 22.6666C16.1867 22.4666 16.7734 22.5733 17.1467 22.9466C17.4 23.2 17.5334 23.5466 17.5334 23.8933C17.5334 24.2533 17.4 24.5866 17.1467 24.84C17.0267 24.96 16.88 25.0533 16.72 25.12C16.56 25.1866 16.3867 25.2266 16.2 25.2266Z" fill="#838E99"></path>
    <path d="M21.5334 25.2266C21.36 25.2266 21.1867 25.1866 21.0267 25.12C20.8667 25.0533 20.72 24.96 20.6 24.84C20.3467 24.5866 20.2134 24.2533 20.2134 23.8933C20.2134 23.5466 20.3467 23.2 20.6 22.9466C20.96 22.5733 21.56 22.4666 22.0534 22.6666C22.2134 22.7333 22.36 22.8266 22.48 22.9466C22.7334 23.2 22.8667 23.5466 22.8667 23.8933C22.8667 24.2533 22.7334 24.5866 22.48 24.84C22.2267 25.0933 21.8934 25.2266 21.5334 25.2266Z" fill="#838E99"></path>
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path opacity="0.4" d="M15.9998 7.06665V28.44C15.7732 28.44 15.5332 28.4 15.3465 28.2933L15.2932 28.2667C12.7332 26.8667 8.2665 25.4 5.37317 25.0133L4.9865 24.96C3.7065 24.8 2.6665 23.6 2.6665 22.32V6.21332C2.6665 4.62665 3.95984 3.42665 5.5465 3.55999C8.3465 3.78665 12.5865 5.19999 14.9598 6.67999L15.2932 6.87999C15.4932 6.99999 15.7465 7.06665 15.9998 7.06665Z" fill="#838E99"/>
    <path d="M29.3333 6.22666V22.32C29.3333 23.6 28.2933 24.8 27.0133 24.96L26.5733 25.0133C23.6667 25.4 19.1867 26.88 16.6267 28.2933C16.4533 28.4 16.24 28.44 16 28.44V7.06666C16.2533 7.06666 16.5067 7 16.7067 6.88L16.9333 6.73333C19.3067 5.24 23.56 3.81333 26.36 3.57333H26.44C28.0267 3.44 29.3333 4.62666 29.3333 6.22666Z" fill="#838E99"/>
    <path d="M10.3335 12.32H7.3335C6.78683 12.32 6.3335 11.8667 6.3335 11.32C6.3335 10.7733 6.78683 10.32 7.3335 10.32H10.3335C10.8802 10.32 11.3335 10.7733 11.3335 11.32C11.3335 11.8667 10.8802 12.32 10.3335 12.32Z" fill="#838E99"/>
    <path d="M11.3335 16.32H7.3335C6.78683 16.32 6.3335 15.8667 6.3335 15.32C6.3335 14.7733 6.78683 14.32 7.3335 14.32H11.3335C11.8802 14.32 12.3335 14.7733 12.3335 15.32C12.3335 15.8667 11.8802 16.32 11.3335 16.32Z" fill="#838E99"/>
  </svg>
);

export function TmaApp() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [route, setRoute] = useState<TmaRoute>(() => {
    try {
      const saved = localStorage.getItem('tma_active_route') as TmaRoute | null;
      const valid: TmaRoute[] = ['robot', 'chats', 'analytics', 'calculator', 'calendar'];
      return saved && valid.includes(saved) ? saved : 'chats';
    } catch {
      return 'chats';
    }
  });
  const [selectedChatId, setSelectedChatId] = useState<string | number | null>(null);
  const [chatListRoute, setChatListRoute] = useState<'chats' | 'analytics'>('chats');
  const [showVTModal, setShowVTModal] = useState(false);
  // Robot expiration state shared for VT modal
  const [robotExpiration, setRobotExpiration] = useState(1);
  const [robotAccountId, setRobotAccountId] = useState('');
  const [robotPocketId, setRobotPocketId] = useState('');

  // Ref-based callback forwarded from socket to the currently open ChatView
  const chatViewSocketRef = useRef<((data: { chat_id: string | number; message: import('./types').TmaChatMessage }) => void) | null>(null);

  // Socket: update cache in-place on real-time events (no HTTP refetch)
  const { joinVirtualTrading, leaveVirtualTrading } = useTmaSocket({
    onNewMessage: useCallback((data: { chat_id: string | number; message: import('./types').TmaChatMessage }) => {
      // Update last_message in tma-chats cache without fetching
      queryClient.setQueryData<import('./types').TmaChat[]>(['tma-chats'], (old) => {
        if (!old) return old;
        return old.map((c) =>
          String(c.id) === String(data.chat_id)
            ? {
                ...c,
                last_message: {
                  type_request: data.message.type_request ?? '',
                  data: data.message.data ?? {},
                  date: data.message.date || data.message.created_at || '',
                  created_at: data.message.created_at,
                },
                last_message_time: data.message.date || data.message.created_at || c.last_message_time,
                unread_count: (c.unread_count || 0) + 1,
              }
            : c,
        );
      });
      // Forward to ChatView if it's currently open for this chat
      chatViewSocketRef.current?.(data);
    }, [queryClient]),
    onBetPlaced: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['tma-trading-history'] });
    }, [queryClient]),
    onBetResult: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['tma-trading-history'] });
      queryClient.invalidateQueries({ queryKey: ['tma-virtual-status'] });
    }, [queryClient]),
    onVirtualTradeResult: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['tma-virtual-status'] });
    }, [queryClient]),
    onVirtualTradePending: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['tma-virtual-status'] });
    }, [queryClient]),
  });

  // Persist route to localStorage whenever it changes (but not chatView — go back to chats)
  useEffect(() => {
    if (route !== 'chatView') {
      try { localStorage.setItem('tma_active_route', route); } catch { /* ignore */ }
    }
  }, [route]);

  const openChat = useCallback((chat: TmaChat, sourceRoute: 'chats' | 'analytics' = 'chats') => {
    setChatListRoute(sourceRoute);
    setSelectedChatId(chat.id);
    setRoute('chatView');
  }, []);

  const goBack = useCallback(() => {
    setRoute(chatListRoute);
    setSelectedChatId(null);
  }, [chatListRoute]);

  const navigate = useCallback((r: TmaRoute) => {
    setRoute(r);
    setSelectedChatId(null);
  }, []);

  return (
    <div className="tma-app">
      <div className={`tma-page page-content${route === 'chatView' || route === 'analytics' ? ' page-content--chat-view' : ''}${route === 'analytics' ? ' page-content--analytics' : ''}`}>
        {route === 'robot' && (
          <RobotPage
            onOpenVirtualTrading={() => {
              setShowVTModal(true);
              if (robotPocketId) joinVirtualTrading(Number(robotPocketId));
            }}
            onRobotState={(acc, pocket, exp) => {
              setRobotAccountId(acc);
              setRobotPocketId(pocket);
              setRobotExpiration(exp);
            }}
          />
        )}
        {route === 'chats' && <ChatsPage onOpenChat={(chat) => openChat(chat, 'chats')} mode="standard" />}
        {route === 'chatView' && selectedChatId !== null && (
          <ChatView
            chatId={selectedChatId as string | number}
            onBack={goBack}
            socketMsgRef={chatViewSocketRef}
            isAnalyticsMode={chatListRoute === 'analytics'}
          />
        )}
        {route === 'analytics' && (
          <ChatView
            chatId={0}
            onBack={() => {}}
            socketMsgRef={chatViewSocketRef}
            hideBackButton
            allowSignalAmountEditor
            isAnalyticsMode
          />
        )}
        {route === 'calculator' && <CalculatorPage />}
        {route === 'calendar' && <CalendarPage />}
      </div>

      {route !== 'chatView' && (
        <nav className="bottom-menu">
          <div
            data-route="robot"
            className={route === 'robot' ? 'active' : undefined}
            onClick={() => navigate('robot')}
            title={t.tmaRobot}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('robot');
              }
            }}
          >
            <RobotIcon />
          </div>
          <div
            data-route="chats"
            className={route === 'chats' ? 'active' : undefined}
            onClick={() => navigate('chats')}
            title={t.tmaChats}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('chats');
              }
            }}
          >
            <ChatsIcon />
          </div>
          <div
            data-route="analytics"
            className={route === 'analytics' ? 'active' : undefined}
            onClick={() => navigate('analytics')}
            title={t.tmaAnalytics}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('analytics');
              }
            }}
          >
            <AnalyticsIcon />
          </div>
          <div
            data-route="calculator"
            className={route === 'calculator' ? 'active' : undefined}
            onClick={() => navigate('calculator')}
            title={t.tmaCalculator}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('calculator');
              }
            }}
          >
            <CalcIcon />
          </div>
          <div
            data-route="calendar"
            className={route === 'calendar' ? 'active' : undefined}
            onClick={() => navigate('calendar')}
            title={t.tmaCalendar}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('calendar');
              }
            }}
          >
            <CalendarIcon />
          </div>
        </nav>
      )}

      {showVTModal && robotAccountId && (
        <VirtualTradingModal
          accountId={robotAccountId}
          pocketId={robotPocketId}
          expiration={robotExpiration}
          onClose={() => {
            setShowVTModal(false);
            if (robotPocketId) leaveVirtualTrading(Number(robotPocketId));
          }}
        />
      )}
    </div>
  );
}
