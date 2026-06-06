import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import routes from '../configs/routes';
import { useI18n, type Locale } from '../i18n';
import { DEFAULT_BOT_LINKS, fetchProfile, getResolvedBotLinks, setTerminalToken } from '../pages/shared/api/terminalAuth';
import { getStoredTmaGroupInviteLink, setStoredTmaGroupInviteLink } from './api';
import { TmaApp } from './TmaApp';
import './tma.css';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080/api';
const DEFAULT_BOT = (import.meta.env.VITE_TMA_BOT_USERNAME as string | undefined) || 'trader_start_bot';
const TG_WEBAPP_SCRIPT_ID = 'telegram-web-app-sdk';
const TG_WEBAPP_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';
const AUTH_ASSET_BASE = '/img/tma-auth';
const LOCALE_STORAGE_KEY = 'tc_locale';
const AUTH_REQUEST_TIMEOUT_MS = 10000;

type Screen = 'loading' | 'needTelegram' | 'prelogin' | 'login' | 'accessDenied' | 'app';
type PreloginStep = 1 | 2 | 3 | 4 | 5 | 6;

interface BotData {
  channel_name?: string;
  ru_link?: string;
  others_link?: string;
  telegram_link?: string;
  technical_work_enabled?: boolean;
  technical_banner_text?: string;
}

interface BotDataResponse {
  data?: BotData;
}

interface AuthResponse {
  access?: boolean;
  found?: boolean;
  token?: string;
  pocket_id?: string | number;
  blocked?: boolean;
  status_message?: string;
  error_message?: string;
  user_data?: Record<string, unknown>;
  notification_chat_ids?: Array<string | number>;
  group_invite_link?: string;
}

type CopyKey =
  | 'prelogin_step1_title'
  | 'prelogin_step2_title'
  | 'prelogin_step3_title_other'
  | 'prelogin_step3_title_ru'
  | 'prelogin_step4_title'
  | 'register'
  | 'next'
  | 'yes'
  | 'no'
  | 'other'
  | 'ru'
  | 'need_register'
  | 'need_pay'
  | 'choose_country'
  | 'click_register'
  | 'create_account'
  | 'after_register'
  | 'remain_details'
  | 'min_dep'
  | 'after_finish'
  | 'vpn_step1_title'
  | 'vpn_step1_title_text'
  | 'vpn_step2_title'
  | 'vpn_disabled'
  | 'yes_sure'
  | 'login'
  | 'login_description'
  | 'login_placeholder'
  | 'access_denied'
  | 'need_telegram'
  | 'need_telegram_hint'
  | 'open_bot';

const COPY: Record<Locale, Record<CopyKey, string>> = {
  ru: {
    prelogin_step1_title: 'Вы являетесь нашим партнёром?',
    prelogin_step2_title: 'Чтобы получить доступ к сервису',
    prelogin_step3_title_other: 'Регистрация пользователя на pocketoption',
    prelogin_step3_title_ru: 'Регистрация для пользователей из России',
    prelogin_step4_title: 'Почти всё готово!',
    register: 'Регистрация',
    next: 'Далее',
    yes: 'Да',
    no: 'Нет',
    other: 'Другая страна',
    ru: 'Россия',
    need_register: 'Нужно пройти регистрацию',
    need_pay: 'Пополнить счёт на любую сумму',
    choose_country: 'Выберите вашу страну',
    click_register: 'Нажмите “Регистрация”',
    create_account: 'Создать аккаунт',
    after_register: 'После создания нажмите на кнопку “Далее”',
    remain_details: 'Осталось пополнить счет',
    min_dep: 'Минимальная сумма пополнения:',
    after_finish: 'После пополнения нажмите на кнопку "Далее"',
    vpn_step1_title: 'Регистрацию нужно пройти без VPN',
    vpn_step1_title_text: 'Отключите VPN перед регистрацией',
    vpn_step2_title: 'Вы точно, прям точно, отключили VPN? ☺️',
    vpn_disabled: 'VPN отключен',
    yes_sure: 'Да!',
    login: 'Вход',
    login_description: 'Введите ваш PocketOption ID для продолжения',
    login_placeholder: 'Введите ваш ID',
    access_denied: 'Доступ временно недоступен.',
    need_telegram: 'Откройте через Telegram',
    need_telegram_hint: 'Telegram WebApp not available. Open the application through Telegram.',
    open_bot: 'Открыть бота',
  },
  uk: {
    prelogin_step1_title: 'Ви являєтесь нашим партнером?',
    prelogin_step2_title: 'Щоб отримати доступ до сервісу',
    prelogin_step3_title_other: 'Реєстрація користувача на pocketoption',
    prelogin_step3_title_ru: 'Реєстрація для користувачів з Росії',
    prelogin_step4_title: 'Майже все готово!',
    register: 'Реєстрація',
    next: 'Далі',
    yes: 'Так',
    no: 'Ні',
    other: 'Інша країна',
    ru: 'Росія',
    need_register: 'Потрібно пройти реєстрацію',
    need_pay: 'Поповнити рахунок на будь-яку суму',
    choose_country: 'Виберіть вашу країну',
    click_register: 'Натисніть "Реєстрація"',
    create_account: 'Створити акаунт',
    after_register: 'Після створення натисніть на кнопку “Далі”',
    remain_details: 'Залишилося поповнити рахунок',
    min_dep: 'Мінімальна сума поповнення:',
    after_finish: 'Після поповнення натисніть на кнопку "Далі"',
    vpn_step1_title: 'Реєстрацію потрібно пройти без VPN',
    vpn_step1_title_text: 'Відключіть VPN перед реєстрацією',
    vpn_step2_title: 'Ви точно, прям точно, відключили VPN?',
    vpn_disabled: 'VPN відключено',
    yes_sure: 'Так!',
    login: 'Вхід',
    login_description: 'Введіть ваш PocketOption ID для продовження',
    login_placeholder: 'Введіть ваш ID',
    access_denied: 'Доступ тимчасово недоступний.',
    need_telegram: 'Відкрийте через Telegram',
    need_telegram_hint: 'Telegram WebApp недоступний. Відкрийте застосунок через Telegram.',
    open_bot: 'Відкрити бота',
  },
  en: {
    prelogin_step1_title: 'Are you our partner?',
    prelogin_step2_title: 'To get access to the service',
    prelogin_step3_title_other: 'Registration of a user on pocketoption',
    prelogin_step3_title_ru: 'Registration for users from Russia',
    prelogin_step4_title: 'Almost everything is ready!',
    register: 'Register',
    next: 'Next',
    yes: 'Yes',
    no: 'No',
    other: 'Other country',
    ru: 'Russia',
    need_register: 'Need to register',
    need_pay: 'Make a deposit',
    choose_country: 'Choose your country',
    click_register: 'Click “Register”',
    create_account: 'Create account',
    after_register: 'After creating, click the “Next” button',
    remain_details: 'It remains to top up the account',
    min_dep: 'Minimum deposit amount:',
    after_finish: 'After deposit, click the “Next” button',
    vpn_step1_title: 'Registration must be completed without VPN',
    vpn_step1_title_text: 'Turn off VPN before registration',
    vpn_step2_title: 'Are you sure, really sure, you turned off VPN? ☺️',
    vpn_disabled: 'VPN disabled',
    yes_sure: 'Yes!',
    login: 'Login',
    login_description: 'Enter your PocketOption ID to continue',
    login_placeholder: 'Enter your ID',
    access_denied: 'Access temporarily unavailable.',
    need_telegram: 'Open in Telegram',
    need_telegram_hint: 'Telegram WebApp not available. Open the application through Telegram.',
    open_bot: 'Open bot',
  },
};

function readParamFromSearchOrHash(name: string): string {
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get(name)?.trim();
  if (fromSearch) return fromSearch;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get(name)?.trim() || '';
}

function decodeInitData(raw: string): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw) || raw;
  } catch {
    return raw;
  }
}

function getInitData(): string {
  const webAppInitData = (
    window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }
  ).Telegram?.WebApp?.initData;
  if (webAppInitData?.trim()) return webAppInitData.trim();
  return decodeInitData(readParamFromSearchOrHash('tgWebAppData'));
}

function getBotUsername(): string {
  return new URLSearchParams(window.location.search).get('bot') || DEFAULT_BOT;
}

function toTelegramLink(bot: string): string {
  const normalized = bot.replace(/^@+/, '').trim();
  return `https://t.me/${normalized || DEFAULT_BOT}`;
}

async function ensureTelegramWebAppSdk(): Promise<void> {
  const w = window as typeof window & {
    Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } };
  };

  if (w.Telegram?.WebApp) {
    w.Telegram.WebApp.ready?.();
    w.Telegram.WebApp.expand?.();
    return;
  }

  const existing = document.getElementById(TG_WEBAPP_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve) => {
      if ((window as typeof window & { Telegram?: unknown }).Telegram) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
    });
    w.Telegram?.WebApp?.ready?.();
    w.Telegram?.WebApp?.expand?.();
    return;
  }

  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.id = TG_WEBAPP_SCRIPT_ID;
    script.src = TG_WEBAPP_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });

  w.Telegram?.WebApp?.ready?.();
  w.Telegram?.WebApp?.expand?.();
}

function setCookie(name: string, value: string, days: number) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}

function normalizeLocale(value: string | undefined, fallback: Locale): Locale {
  if (!value) return fallback;
  if (value.startsWith('uk')) return 'uk';
  if (value.startsWith('en')) return 'en';
  return 'ru';
}

function hasUserSelectedLocale(): boolean {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return saved === 'ru' || saved === 'uk' || saved === 'en';
  } catch {
    return false;
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timerId);
  }
}

export function TmaAuthPage() {
  const navigate = useNavigate();
  const { locale, setLocale } = useI18n();
  const copy = useMemo(() => COPY[locale], [locale]);
  const retryTimerRef = useRef<number | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [preloginStep, setPreloginStep] = useState<PreloginStep>(1);
  const [isRussianPath, setIsRussianPath] = useState(false);
  const [registrationLink, setRegistrationLink] = useState('');
  const [botData, setBotData] = useState<BotData | null>(null);
  const [telegramLink, setTelegramLink] = useState(DEFAULT_BOT_LINKS.telegram_link);
  const [loginId, setLoginId] = useState('');
  const [loginError, setLoginError] = useState('');
  const [accessDeniedMessage, setAccessDeniedMessage] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [hintText, setHintText] = useState('');

  const bot = getBotUsername();

  const applyAuthPayload = useCallback(async (data: AuthResponse, fallbackPocketId?: string) => {
    if (data.token) {
      setTerminalToken(data.token);

      try {
        const profile = await fetchProfile();
        if (!profile.is_confirmed) {
          navigate(routes.RegisterStep2, { replace: true });
          return;
        }
      } catch {
        // Keep previous behavior and allow the TMA flow to continue if profile fetch fails.
      }
    }

    const globalWindow = window as typeof window & {
      authData?: AuthResponse;
      userData?: Record<string, unknown>;
      pocket_id?: string | number;
      notificationChatIds?: Array<string | number>;
      groupInviteLink?: string;
    };

    globalWindow.authData = data;
    globalWindow.userData = data.user_data || {};
    globalWindow.notificationChatIds = data.notification_chat_ids || [];
    globalWindow.groupInviteLink = data.group_invite_link || getStoredTmaGroupInviteLink();
    setStoredTmaGroupInviteLink(data.group_invite_link);

    const resolvedPocketId = String(data.pocket_id ?? fallbackPocketId ?? '').trim();
    if (resolvedPocketId) {
      globalWindow.pocket_id = resolvedPocketId;
      setCookie('pocket_id', resolvedPocketId, 30);
    }

    const languageCode = typeof data.user_data?.language_code === 'string'
      ? normalizeLocale(data.user_data.language_code, locale)
      : locale;
    if (!hasUserSelectedLocale() && languageCode !== locale) setLocale(languageCode);

    setScreen('app');
  }, [locale, navigate, setLocale]);

  const showAccessDenied = useCallback((message: string, blocked = false) => {
    setIsBlocked(blocked);
    setAccessDeniedMessage(message || copy.access_denied);
    setScreen('accessDenied');
  }, [copy.access_denied]);

  const bootstrapAuth = useCallback(async () => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    await ensureTelegramWebAppSdk();

    const tgLocale = (
      window as typeof window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }
    ).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const nextLocale = normalizeLocale(tgLocale, locale);
    if (!hasUserSelectedLocale() && nextLocale !== locale) setLocale(nextLocale);

    const initData = getInitData();
    if (!initData) {
      setHintText(copy.need_telegram_hint);
      setScreen('needTelegram');
      return;
    }

    setHintText('');
    setLoginError('');
    setScreen('loading');

    try {
      const botLinks = await getResolvedBotLinks(bot);
      setTelegramLink(botLinks.telegram_link || toTelegramLink(bot));
    } catch {
      setTelegramLink(toTelegramLink(bot));
    }

    try {
      const botRes = await fetchWithTimeout(`${API_BASE}/v1/get_bot_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData, bot }),
      });
      const botJson = (await botRes.json().catch(() => ({}))) as BotDataResponse;
      const nextBotData = botJson.data || null;
      setBotData(nextBotData);

      if (nextBotData?.telegram_link) setTelegramLink(nextBotData.telegram_link);

      if (nextBotData?.technical_work_enabled) {
        showAccessDenied(nextBotData.technical_banner_text || copy.access_denied, false);
        return;
      }

      const authRes = await fetchWithTimeout(`${API_BASE}/v1/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData, bot }),
      });
      const authJson = (await authRes.json().catch(() => ({}))) as AuthResponse;

      if (authJson.blocked) {
        showAccessDenied(authJson.status_message || copy.access_denied, true);
        return;
      }

      if (authRes.ok && authJson.access) {
        applyAuthPayload(authJson);
        return;
      }

      if (authJson.access === false || authRes.status === 400 || authRes.status === 401 || authRes.status === 403) {
        setPreloginStep(1);
        setScreen('prelogin');
        return;
      }

      retryTimerRef.current = window.setTimeout(() => {
        void bootstrapAuth();
      }, 2000);
    } catch {
      retryTimerRef.current = window.setTimeout(() => {
        void bootstrapAuth();
      }, 2000);
    }
  }, [API_BASE, applyAuthPayload, bot, copy.access_denied, copy.need_telegram_hint, locale, setLocale, showAccessDenied]);

  useEffect(() => {
    void bootstrapAuth();
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
  }, [bootstrapAuth]);

  const handleLogin = useCallback(async () => {
    const id = loginId.trim();
    if (!id) return;

    const initData = getInitData();
    if (!initData) {
      setHintText(copy.need_telegram_hint);
      setScreen('needTelegram');
      return;
    }

    setLoginError('');
    setScreen('loading');

    try {
      const res = await fetchWithTimeout(`${API_BASE}/v1/pocket_auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ init_data: initData, trader_id: Number(id), bot }),
      });
      const data = (await res.json().catch(() => ({}))) as AuthResponse;

      if (data.blocked) {
        showAccessDenied(data.status_message || copy.access_denied, true);
        return;
      }

      if ((data.access || data.found) && data.token) {
        applyAuthPayload(data, id);
        return;
      }

      setLoginError(data.error_message || copy.access_denied);
      setScreen('login');
    } catch {
      setLoginError(copy.access_denied);
      setScreen('login');
    }
  }, [API_BASE, applyAuthPayload, bot, copy.access_denied, copy.need_telegram_hint, loginId, showAccessDenied]);

  const headerTitle = botData?.channel_name || bot;

  if (screen === 'app') return <TmaApp />;

  return (
    <div className="tma-app" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 12px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {screen === 'loading' && <LoadingScreen />}

        {screen === 'needTelegram' && (
          <AuthShell title={headerTitle}>
            <InfoCard title={copy.need_telegram} description={hintText || copy.need_telegram_hint}>
              <PrimaryLink href={telegramLink}>{copy.open_bot}</PrimaryLink>
            </InfoCard>
          </AuthShell>
        )}

        {screen === 'accessDenied' && (
          <AuthShell title={headerTitle}>
            <InfoCard title={accessDeniedMessage || copy.access_denied} description="">
              <img src={isBlocked ? `${AUTH_ASSET_BASE}/banned.png` : `${AUTH_ASSET_BASE}/tech_3.png`} alt={isBlocked ? 'blocked' : 'maintenance'} style={{ width: 120, maxWidth: '100%', margin: '0 auto 12px', display: 'block' }} />
            </InfoCard>
          </AuthShell>
        )}

        {screen === 'login' && (
          <AuthShell title={headerTitle} backVisible onBack={() => setScreen('prelogin')}>
            <LoginCard
              title={copy.login}
              description={copy.login_description}
              placeholder={copy.login_placeholder}
              buttonLabel={copy.login}
              value={loginId}
              error={loginError}
              onChange={setLoginId}
              onSubmit={() => void handleLogin()}
            />
          </AuthShell>
        )}

        {screen === 'prelogin' && (
          <AuthShell
            title={headerTitle}
            backVisible={preloginStep > 1}
            onBack={() => {
              if (preloginStep === 5 && !isRussianPath) return void setPreloginStep(2);
              if (preloginStep === 5 && isRussianPath) return void setPreloginStep(4);
              if (preloginStep === 4 && isRussianPath) return void setPreloginStep(3);
              if (preloginStep === 3 && isRussianPath) return void setPreloginStep(2);
              if (preloginStep === 6) return void setPreloginStep(5);
              setPreloginStep((prev) => (prev > 1 ? ((prev - 1) as PreloginStep) : prev));
            }}
          >
            <PreloginCard
              copy={copy}
              step={preloginStep}
              isRussianPath={isRussianPath}
              registrationLink={registrationLink || (isRussianPath ? botData?.ru_link || '' : botData?.others_link || '')}
              onDirectLogin={() => setScreen('login')}
              onStartRegistration={() => setPreloginStep(2)}
              onChooseRussia={() => {
                setIsRussianPath(true);
                setRegistrationLink(botData?.ru_link || '');
                setPreloginStep(3);
              }}
              onChooseOther={() => {
                setIsRussianPath(false);
                setRegistrationLink(botData?.others_link || '');
                setPreloginStep(5);
              }}
              onVpnDisabled={() => setPreloginStep(4)}
              onYesSure={() => setPreloginStep(5)}
              onNextFromRegistration={() => setPreloginStep(6)}
              onFinish={() => setScreen('login')}
            />
          </AuthShell>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ textAlign: 'center', color: '#c5cdd8' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #2c3340', borderTopColor: '#2ebd85', animation: 'tma-spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes tma-spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ marginTop: 16 }}>Авторизация…</p>
    </div>
  );
}

function AuthShell({ title, children, backVisible = false, onBack }: { title: string; children: ReactNode; backVisible?: boolean; onBack?: () => void }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 18, padding: 20, boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={onBack} style={{ visibility: backVisible ? 'visible' : 'hidden', background: 'transparent', border: 'none', color: '#557BAF', fontSize: 24, cursor: 'pointer', padding: 0 }}>‹</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={`${AUTH_ASSET_BASE}/logo.png`} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16 }}>{title}</span>
        </div>
        <div style={{ width: 20 }} />
      </div>
      {children}
    </div>
  );
}

function InfoCard({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 8px' }}>
      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 24, lineHeight: 1.3 }}>{title}</div>
      {description ? <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>{description}</p> : null}
      {children}
    </div>
  );
}

function LoginCard({ title, description, placeholder, buttonLabel, value, error, onChange, onSubmit }: { title: string; description: string; placeholder: string; buttonLabel: string; value: string; error: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <img src={`${AUTH_ASSET_BASE}/logo.png`} alt="logo" style={{ width: 56, height: 56, objectFit: 'contain', margin: '0 auto 8px', display: 'block' }} />
      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 26 }}>{title}</div>
      <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>{description}</p>
      <div style={{ marginTop: 18 }}>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onSubmit(); }}
          placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 12, border: '1px solid #2c3340', background: '#0f172a', color: '#fff', fontSize: 15 }}
        />
        <button onClick={onSubmit} style={{ width: '100%', marginTop: 12, padding: '14px 16px', borderRadius: 12, border: 'none', background: '#2ebd85', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{buttonLabel}</button>
        {error ? <p style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</p> : null}
      </div>
    </div>
  );
}

function PreloginCard({ copy, step, isRussianPath, registrationLink, onDirectLogin, onStartRegistration, onChooseRussia, onChooseOther, onVpnDisabled, onYesSure, onNextFromRegistration, onFinish }: { copy: Record<CopyKey, string>; step: PreloginStep; isRussianPath: boolean; registrationLink: string; onDirectLogin: () => void; onStartRegistration: () => void; onChooseRussia: () => void; onChooseOther: () => void; onVpnDisabled: () => void; onYesSure: () => void; onNextFromRegistration: () => void; onFinish: () => void }) {
  if (step === 1) {
    return <StepCard title={copy.prelogin_step1_title} actions={<><PrimaryButton onClick={onDirectLogin}>{copy.yes}</PrimaryButton><SecondaryButton onClick={onStartRegistration}>{copy.no}</SecondaryButton></>} />;
  }

  if (step === 2) {
    return (
      <StepCard
        title={copy.prelogin_step2_title}
        body={<><FeatureLine iconSrc={`${AUTH_ASSET_BASE}/tick-circle.png`}>{copy.need_register}</FeatureLine><FeatureLine iconSrc={`${AUTH_ASSET_BASE}/tick-circle.png`}>{copy.need_pay}</FeatureLine></>}
        footer={<p style={smallTextStyle}>{copy.choose_country}</p>}
        actions={<><PrimaryButton onClick={onChooseRussia}>{copy.ru}</PrimaryButton><SecondaryButton onClick={onChooseOther}>{copy.other}</SecondaryButton></>}
      />
    );
  }

  if (step === 3) {
    return <StepCard imageSrc={`${AUTH_ASSET_BASE}/vpn-icon2.png`} imageAlt="vpn-step-1" title={copy.vpn_step1_title} body={<p style={subtitleStyle}>{copy.vpn_step1_title_text}</p>} actions={<PrimaryButton onClick={onVpnDisabled}>{copy.vpn_disabled}</PrimaryButton>} />;
  }

  if (step === 4) {
    return <StepCard imageSrc={`${AUTH_ASSET_BASE}/vpn-icon.png`} imageAlt="vpn-step-2" title={copy.vpn_step2_title} actions={<PrimaryButton onClick={onYesSure}>{copy.yes_sure}</PrimaryButton>} />;
  }

  if (step === 5) {
    const title = isRussianPath ? copy.prelogin_step3_title_ru : copy.prelogin_step3_title_other;
    return (
      <StepCard
        imageSrc={`${AUTH_ASSET_BASE}/reg-icon.png`}
        imageAlt="register"
        title={title}
        body={<><FeatureLine iconSrc={`${AUTH_ASSET_BASE}/note.png`}>{copy.click_register}</FeatureLine><FeatureLine iconSrc={`${AUTH_ASSET_BASE}/profile.png`}>{copy.create_account}</FeatureLine></>}
        footer={<p style={smallTextStyle}>{copy.after_register}</p>}
        actions={<><PrimaryLink href={registrationLink || '#'}>{copy.register}</PrimaryLink><SecondaryButton onClick={onNextFromRegistration}>{copy.next}</SecondaryButton></>}
      />
    );
  }

  return (
    <StepCard
      imageSrc={`${AUTH_ASSET_BASE}/alm-icon.png`}
      imageAlt="deposit"
      title={copy.prelogin_step4_title}
      body={<><p style={subtitleStyle}>{copy.remain_details}</p><p style={{ ...subtitleStyle, marginTop: 6 }}>{copy.min_dep} <b>$5</b></p></>}
      footer={<p style={smallTextStyle}>{copy.after_finish}</p>}
      actions={<PrimaryButton onClick={onFinish}>{copy.next}</PrimaryButton>}
    />
  );
}

function StepCard({ title, body, footer, actions, imageSrc, imageAlt }: { title: string; body?: ReactNode; footer?: ReactNode; actions: ReactNode; imageSrc?: string; imageAlt?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 2px 2px' }}>
      {imageSrc ? <img src={imageSrc} alt={imageAlt || ''} style={{ width: 74, maxWidth: '100%', margin: '0 auto 12px', display: 'block' }} /> : null}
      <div style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 24, lineHeight: 1.3 }}>{title}</div>
      {body ? <div style={{ marginTop: 16 }}>{body}</div> : null}
      <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>{actions}</div>
      {footer ? <div style={{ marginTop: 12 }}>{footer}</div> : null}
    </div>
  );
}

function FeatureLine({ children, iconSrc }: { children: ReactNode; iconSrc?: string }) {
  return (
    <div style={{ color: '#d1d5db', fontSize: 15, lineHeight: 1.5, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      {iconSrc ? <img src={iconSrc} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flex: '0 0 auto' }} /> : <span>•</span>}
      <span>{children}</span>
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={{ padding: '14px 16px', borderRadius: 12, border: 'none', background: '#2ebd85', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{children}</button>;
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #2c3340', background: '#172033', color: '#d1d5db', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{children}</button>;
}

function PrimaryLink({ children, href }: { children: ReactNode; href: string }) {
  return <a href={href} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '14px 16px', borderRadius: 12, background: '#2ebd85', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>{children}</a>;
}

const subtitleStyle: CSSProperties = { color: '#d1d5db', fontSize: 15, lineHeight: 1.5 };
const smallTextStyle: CSSProperties = { color: '#9ca3af', fontSize: 13, lineHeight: 1.5 };
