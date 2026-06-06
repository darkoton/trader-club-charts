import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { storageService } from './services/storage';

/* ─── Supported locales ─── */
export type Locale = 'ru' | 'uk' | 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: 'Русский',
  uk: 'Українська',
  en: 'English',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ru: '🇷🇺',
  uk: '🇺🇦',
  en: '🇬🇧',
};

/* ─── Translation keys ─── */
export interface Translations {
  /* Header */
  addChart: string;

  /* Toolbar */
  charts: string;
  dragMode: string;
  applyToAll: string;
  disableAll: string;

  /* Chart card */
  chartN: string;           /* "Chart #{n}" pattern */
  settings: string;
  remove: string;

  /* Settings modal */
  indicators: string;
  tvIndicators: string;
  searchIndicators: string;
  activeStudies: string;
  allIndicators: string;
  noResults: string;
  separatePane: string;
  indicatorsNotFound: string;
  cancel: string;
  save: string;
  reset: string;
  done: string;

  /* Currency modal */
  selectCurrency: string;
  timeframe: string;
  searchCurrency: string;
  all: string;
  favorites: string;
  currenciesNotFound: string;
  ccpMinPayout: string;
  ccpPrevKey: string;
  ccpNextKey: string;
  loading: string;
  failedLoadCurrencies: string;
  failedInitChart: string;
  tvNoSignalForPair: string;

  /* Auth */
  authRequired: string;
  authDescription: string;

  /* Profile */
  profile: string;
  logout: string;
  language: string;
  changePassword: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  passwordChanged: string;
  passwordMismatch: string;
  passwordTooShort: string;
  deleteAccount: string;
  deleteAccountConfirm: string;
  deleteAccountWarning: string;
  deleteAccountPassword: string;
  accountDeleted: string;
  confirm: string;
  accountStats: string;
  accountStatsNoData: string;
  accountStatsUpdated: string;
  accountStatsLeaderboard: string;
  accountStatsLeaderboardVisible: string;
  accountStatsLeaderboardHidden: string;
  accountStatsHideFromTop: string;
  accountStatsShowInTop: string;
  top100Title: string;
  top100Subtitle: string;
  top100NoData: string;
  top100Updated: string;
  top100SortBy: string;
  top100SortProfit: string;
  top100SortWinrate: string;
  top100SortTurnover: string;
  top100SortWins: string;
  top100WinsLabel: string;
  top100BalanceLabel: string;
  top100UserIdLabel: string;
  top100AccountIdLabel: string;
  top100PoIdLabel: string;
  copyTraderMenu: string;
  copyTraderAccessDenied: string;
  affiliateMenu: string;
  affiliateAccessDenied: string;

  /* Misc */
  initializing: string;
  connectionLost: string;
  reconnecting: string;

  /* Admin */
  adminPanel: string;
  search: string;
  adminCategories: string;
  adminCurrencies: string;
  adminNoCategories: string;
  adminEmoji: string;
  adminUploadFile: string;
  adminChooseFile: string;
  adminDeleteIcon: string;
  adminCurrentIcon: string;
  adminNoIcon: string;
  adminFileTooLarge: string;
  adminInvalidFormat: string;
  adminUploadSuccess: string;
  adminDeleteConfirm: string;
  adminDragOrClick: string;

  /* Custom Indicators (admin) */
  adminIndicators: string;

  /* Currency Mapping (admin) */
  adminMapping: string;
  adminAutoMap: string;
  adminAutoMapForce: string;
  adminAutoMapResult: string;
  adminNotMapped: string;
  adminMappedCount: string;
  adminMappingAll: string;
  adminMappingMapped: string;
  adminMappingUnmapped: string;
  adminMappingClear: string;
  adminMappingNoAssets: string;

  /* Warnings */
  lowProfit: string;
  autoScroll: string;
  autoScrollOff: string;

  /* Disconnect details */
  disconnReason: string;
  disconnDetails: string;
  disconnError: string;
  disconnTime: string;
  disconnAttempts: string;
  disconnTransport: string;
  disconnUrl: string;
  betterDisconnected: string;

  /* Account Status */
  accountStatus: string;
  statusStandard: string;
  statusMaster: string;
  statusGuru: string;
  statusVip: string;
  statusVipElite: string;

  /* Trading Panel (Better / PocketOption) */
  betTime: string;
  betAmount: string;
  betPayout: string;
  betProfit: string;
  betBuy: string;
  betSell: string;
  betPrevAsset: string;
  betNextAsset: string;
  betActive: string;
  betClockAhead: string;
  betClockBehind: string;
  betNoAccount: string;
  betNoAccounts: string;
  betAddAccount: string;
  betLoginTitle: string;
  betPassword: string;
  betLogin: string;
  betLoginHint: string;
  betLoginTimingHint: string;
  betInvalidCredentials: string;
  betNotPartner: string;
  betDepositRequired: string;
  tpMinDuration: string;
  tpFixedDuration: string;
  tpByTime: string;
  tpCurrentTime: string;
  tpAutoTimeOffset: string;
  tpExpiryPassed: string;
  betTradeError: string;
  betRequestPending: string;
  betRequestAccepted: string;
  betRequestTimeout: string;
  bet2faCode: string;
  bet2faConfirm: string;
  betConnected: string;
  ccpOtc: string;
  ccpForex: string;
  betLoginBtn: string;
  showBetting: string;
  betHistory: string;
  betHistoryLoading: string;
  betHistoryEmpty: string;
  betTrades: string;
  betOpened: string;
  betClosed: string;

  /* PocketOption account management */
  poChangePassword: string;
  poDeleteAccount: string;
  poDeleteConfirm: string;
  poDeleteWarning: string;
  poPasswordChanged: string;

  /* WebApp Frame */
  webAppTitle: string;
  webAppMinimize: string;
  webAppMaximize: string;
  webAppClose: string;

  /* Copy Trading */
  ctTitle: string;
  ctNoTraders: string;
  ctCopying: string;
  ctCopySettings: string;
  ctProportion: string;
  ctProportionHint: string;
  ctStopBalance: string;
  ctStopBalanceHint: string;
  ctMinCopyAmount: string;
  ctMinCopyHint: string;
  ctStartCopy: string;
  ctStopCopy: string;
  ctUpdate: string;
  ctNoAccount: string;
  ctFollowers: string;
  ctTabToday: string;
  ctTabMonth: string;
  ctTabAll: string;
  ctNoStats: string;
  ctStatTrades: string;
  ctStatProfitable: string;
  ctStatTurnover: string;
  ctStatProfit: string;
  ctStatMaxTrade: string;
  ctStatMinTrade: string;
  ctStatMaxProfit: string;
  ctCopyBtn: string;
  ctBack: string;
  ctConfirm: string;
  ctCurrency: string;
  ctTradeRange: string;
  ctSummaryProportion: string;
  ctSummaryStop: string;
  ctSummaryMin: string;
  ctUnlimited: string;
  ctAdminTab: string;
  ctAdminCreate: string;
  ctAdminEdit: string;
  ctAdminName: string;
  ctAdminAccountId: string;
  ctAdminSearchAccount: string;
  ctAdminNoAccounts: string;
  ctAdminDescription: string;
  ctAdminActive: string;
  ctAdminAvatar: string;
  ctStopAllCopy: string;
  ctAdminSubscribers: string;
  ctAdminSubscribersHint: string;
  ctAdminNoSubscribers: string;
  ctAdminDisconnect: string;
  ctAdminDisconnectAll: string;
  ctAdminOwnerScope: string;
  ctAdminEnableTrader: string;
  ctAdminDisableTrader: string;
  ctAdminTraderActivated: string;
  ctAdminTraderDeactivated: string;
  ctAdminSubscriptionsDeactivated: string;

  /* Candle Stats (admin) */
  adminQuotes: string;
  adminQuotesHours: string;
  adminQuotesTicks: string;
  adminQuotesCandles: string;
  adminQuotesNoData: string;
  adminQuotesGap: string;

  /* Whitelist (admin) */
  adminWhitelist: string;
  adminChats: string;
  adminChatsOnlyMissing: string;
  adminChatsReload: string;
  adminChatsSyncAll: string;
  adminChatsSyncSelected: string;
  adminChatsForceTitles: string;
  adminChatsForceCategory: string;
  adminChatsForceTitleField: string;
  adminChatsForceExpiration: string;
  adminChatsNoChats: string;
  adminChatsSelect: string;
  adminChatsProblemCategory: string;
  adminChatsProblemTitles: string;
  adminChatsVisible: string;
  adminChatsHidden: string;
  adminChatsTitle: string;
  adminChatsTitles: string;
  adminChatsCategory: string;
  adminChatsType: string;
  adminChatsSignalMode: string;
  adminChatsFilterMode: string;
  adminChatsModeStandard: string;
  adminChatsModeAnalytics: string;
  adminChatsExpiration: string;
  adminChatsChatId: string;
  adminChatsImagePath: string;
  adminChatsAnalyticsPairs: string;
  adminChatsAnalyticsPairSearch: string;
  adminChatsAnalyticsHint: string;
  adminChatsAnalyticsAvailablePairs: string;
  adminChatsAnalyticsSelectedPairs: string;
  adminChatsAnalyticsNoPairs: string;
  adminChatsAnalyticsAllTimeframes: string;
  adminChatsAnalyticsPairInput: string;
  adminChatsAnalyticsTimeframesPlaceholder: string;
  adminChatsAnalyticsPairRequired: string;
  adminChatsAnalyticsTimeframesInvalid: string;
  adminChatsSaved: string;
  adminChatsSyncDone: string;
  adminChatsConfirmDeleteIcon: string;
  adminChatsNothingToUpdate: string;
  adminChatsUpdated: string;
  adminChatsSkipped: string;
  adminBlog: string;
  adminBlogCreate: string;
  adminBlogReload: string;
  adminBlogFilterAll: string;
  adminBlogFilterPublished: string;
  adminBlogFilterDraft: string;
  adminBlogPage: string;
  adminBlogTotal: string;
  adminBlogNoArticles: string;
  adminBlogSelect: string;
  adminBlogTitle: string;
  adminBlogSlug: string;
  adminBlogSlugHint: string;
  adminBlogDescription: string;
  adminBlogThumbnail: string;
  adminBlogBanner: string;
  adminBlogTags: string;
  adminBlogTagsHint: string;
  adminBlogPublishedAt: string;
  adminBlogCreatedAt: string;
  adminBlogUpdatedAt: string;
  adminBlogSections: string;
  adminBlogSectionsCount: string;
  adminBlogAddSection: string;
  adminBlogDeleteArticle: string;
  adminBlogConfirmDeleteArticle: string;
  adminBlogSaveArticle: string;
  adminBlogArticleSaved: string;
  adminBlogArticleCreated: string;
  adminBlogArticleDeleted: string;
  adminBlogSectionTitle: string;
  adminBlogSectionContent: string;
  adminBlogSectionDelete: string;
  adminBlogSectionMoveUp: string;
  adminBlogSectionMoveDown: string;
  adminBlogPreview: string;
  adminBlogNeedTitle: string;
  adminBlogNeedSectionTitle: string;
  adminBlogToolbarParagraph: string;
  adminBlogToolbarH3: string;
  adminBlogToolbarH4: string;
  adminBlogToolbarBold: string;
  adminBlogToolbarItalic: string;
  adminBlogToolbarBulletList: string;
  adminBlogToolbarOrderedList: string;
  adminBlogToolbarQuote: string;
  adminBlogToolbarLink: string;
  adminBlogToolbarImage: string;
  adminBlogToolbarUploadImage: string;
  adminBlogToolbarClear: string;
  adminBlogPromptLink: string;
  adminBlogPromptImage: string;
  adminBlogUploadImage: string;
  adminBlogImageUploaded: string;
  adminBlogImageTooLarge: string;
  adminBlogImageInvalidFormat: string;
  adminBlogImageUploadNoUrl: string;
  adminBlogUntitled: string;
  adminBlogDragHint: string;
  adminTradingTop: string;
  adminTradingTopAccounts: string;
  adminTradingTopFakes: string;
  adminTradingTopSearchAccounts: string;
  adminTradingTopNoAccounts: string;
  adminTradingTopNoFakes: string;
  adminTradingTopSelectAccount: string;
  adminTradingTopSelectFake: string;
  adminTradingTopVisible: string;
  adminTradingTopHidden: string;
  adminTradingTopOverrideName: string;
  adminTradingTopOverrideAvatar: string;
  adminTradingTopPublicName: string;
  adminTradingTopPublicAvatar: string;
  adminTradingTopCorrections: string;
  adminTradingTopResetCorrections: string;
  adminTradingTopApplyCorrections: string;
  adminTradingTopCorrectionEmpty: string;
  adminTradingTopCorrectionsSaved: string;
  adminTradingTopCorrectionsReset: string;
  adminTradingTopSaved: string;
  adminTradingTopName: string;
  adminTradingTopAvatarUrl: string;
  adminTradingTopPoId: string;
  adminTradingTopBalance: string;
  adminTradingTopSave: string;
  adminTradingTopTerminalAuth: string;
  adminTradingTopOpenTerminal: string;
  adminTradingTopTerminalUserId: string;
  adminTradingTopAccountActive: string;
  adminTradingTopTokenExpires: string;
  adminTradingTopLastAuthAt: string;
  adminTradingTopTokenRefreshed: string;
  adminTradingTopAuthOpened: string;
  adminTradingTopCreateFake: string;
  adminTradingTopUpdateFake: string;
  adminTradingTopDeleteFake: string;
  adminTradingTopNameRequired: string;
  adminTradingTopFakeCreated: string;
  adminTradingTopFakeUpdated: string;
  adminTradingTopFakeDeleted: string;
  adminWlPoUserId: string;
  adminWlEmail: string;
  adminWlComment: string;
  adminWlAdd: string;
  adminWlEmpty: string;
  adminWlDeleteConfirm: string;
  adminWlAddedBy: string;
  adminWlDuplicate: string;
  adminWlNeedIdOrEmail: string;

  /* TMA — Bottom Nav */
  tmaRobot: string;
  tmaChats: string;
  tmaAnalytics: string;
  tmaAnalyticsEmptyTitle: string;
  tmaAnalyticsEmptyText: string;
  tmaCalculator: string;
  tmaCalendar: string;

  /* TMA — Chats */
  tmaSearchChats: string;
  tmaNoChats: string;
  tmaLoadMore: string;
  tmaNotifications: string;
  tmaReadAll: string;
  tmaCopied: string;
  tmaPremiumClub: string;
  tmaTapToJoin: string;
  tmaSignalPreviewSignalTime: string;
  tmaSignalPreviewLastBar: string;
  tmaSignalPreviewLastTick: string;

  /* TMA — Robot */
  tmaRobotTitle: string;
  tmaWaitingForBet: string;
  tmaWaitingForOrder: string;
  tmaOrderAmount: string;
  tmaTradingHistory: string;
  tmaNoTrades: string;
  tmaVirtualTrading: string;
  tmaStartTrading: string;
  tmaStopTrading: string;
  tmaEnterDeposit: string;
  tmaInitialStake: string;
  tmaStakeInfo: string;
  tmaMinDeposit: string;
  tmaConfirmStop: string;
  tmaDeposit: string;
  tmaCurrentBalance: string;
  tmaTotalProfit: string;
  tmaTotalTrades: string;
  tmaWinRate: string;
  tmaSessionDuration: string;
  tmaActiveTrades: string;
  tmaFailedLoadAutoTrading: string;
  tmaSearchingSignalTitle: string;
  tmaSignalFlowAnalyze: string;
  tmaSignalFlowPair: string;
  tmaSignalFlowAwaitEntry: string;
  tmaSignalFlowPairFallback: string;

  /* TMA — Calculator */
  tmaCalcSafe: string;
  tmaCalcBasic: string;
  tmaCalcProgressive: string;
  tmaCalcSafeDesc: string;
  tmaCalcBasicDesc: string;
  tmaCalcProgressiveDesc: string;
  tmaCalcDeposit: string;
  tmaCalcCoefficient: string;
  tmaCalcSummary: string;
  tmaCalcBack: string;

  /* TMA — Calendar */
  tmaCalendarTitle: string;
  tmaDiaryStats: string;
  tmaLast7Days: string;
  tmaLast30Days: string;
  tmaAllTime: string;
  tmaNetProfit: string;
  tmaTotalProfitStat: string;
  tmaTotalLoss: string;
  tmaPositiveDays: string;
  tmaNegativeDays: string;
  tmaProfit: string;
  tmaLoss: string;
  tmaComment: string;
  tmaSaveDay: string;
  tmaPublicDiary: string;
  tmaPrivateDiary: string;
  tmaPublicDiaryShort: string;
  tmaPrivateDiaryShort: string;
  tmaSearchUser: string;
  tmaDiaryNotFound: string;
  tmaRetry: string;

  /* TMA — Additional */
  tmaBack: string;
  tmaBalance: string;
  tmaHistory: string;
  tmaTrades: string;
  tmaSuccessful: string;
  tmaStake: string;
  tmaNoData: string;
  tmaTradingAsset: string;
  tmaDayResult: string;
  tmaMartingale: string;
  tmaCalcDescription: string;
  tmaCalcValueDesc: string;
  tmaCalcDep1: string;
  tmaCalcDep2: string;
  tmaCalcDep3: string;
  tmaCalcDep4: string;
  tmaCalcDep5: string;
  tmaCalcDep6: string;
  tmaCalcRequired: string;
  tmaMon: string;
  tmaTue: string;
  tmaWed: string;
  tmaThu: string;
  tmaFri: string;
  tmaSat: string;
  tmaSun: string;
}

/* ─── Translation dictionaries ─── */

const ru: Translations = {
  addChart: '+ График',
  charts: 'Графики',
  dragMode: 'Перемещение',
  applyToAll: 'Применить ко всем',
  disableAll: 'Выключить все',
  chartN: 'График',
  settings: 'Настройки',
  remove: 'Удалить',
  indicators: 'Индикаторы',
  tvIndicators: 'TV Индикаторы',
  searchIndicators: 'Поиск индикаторов...',
  activeStudies: 'Активные',
  allIndicators: 'Все индикаторы',
  noResults: 'Ничего не найдено',
  separatePane: 'отд. панель',
  indicatorsNotFound: 'Индикаторы не найдены',
  cancel: 'Отмена',
  save: 'Сохранить',
  reset: 'Сбросить',
  done: 'Готово',
  selectCurrency: 'Выберите валюту',
  timeframe: 'Таймфрейм',
  searchCurrency: 'Поиск валюты...',
  all: 'Все',
  favorites: 'Избранное',
  currenciesNotFound: 'Валюты не найдены',
  ccpMinPayout: 'Мин. доходность %',
  ccpPrevKey: 'Пред.',
  ccpNextKey: 'След.',
  loading: 'Загрузка...',
  failedLoadCurrencies: 'Не удалось загрузить валюты',
  failedInitChart: 'Не удалось инициализировать график',
  tvNoSignalForPair: 'Нет сигнала по запрошенной паре',
  authRequired: 'Требуется авторизация',
  authDescription: 'Для доступа к платформе авторизуйтесь через Telegram.',
  profile: 'Профиль',
  logout: 'Выйти',
  language: 'Язык',
  changePassword: 'Сменить пароль',
  currentPassword: 'Текущий пароль',
  newPassword: 'Новый пароль',
  confirmPassword: 'Подтвердите пароль',
  passwordChanged: 'Пароль успешно изменён',
  passwordMismatch: 'Пароли не совпадают',
  passwordTooShort: 'Минимум 6 символов',
  deleteAccount: 'Выйти из аккаунта',
  deleteAccountConfirm: 'Выйти из аккаунта?',
  deleteAccountWarning: 'Это действие необратимо. Все данные будут удалены.',
  deleteAccountPassword: 'Введите пароль для подтверждения',
  accountDeleted: 'Аккаунт удалён',
  confirm: 'Подтвердить',
  accountStats: 'Статистика аккаунта',
  accountStatsNoData: 'Статистика пока недоступна',
  accountStatsUpdated: 'Обновлено',
  accountStatsLeaderboard: 'Видимость в рейтинге',
  accountStatsLeaderboardVisible: 'Аккаунт виден в общем рейтинге Top 100',
  accountStatsLeaderboardHidden: 'Аккаунт скрыт из общего рейтинга Top 100',
  accountStatsHideFromTop: 'Скрыть из рейтинга',
  accountStatsShowInTop: 'Показать в рейтинге',
  top100Title: 'Топ 100',
  top100Subtitle: 'Общий рейтинг пользователей Better по торговой статистике',
  top100NoData: 'Лидеры пока недоступны',
  top100Updated: 'Обновлено',
  top100SortBy: 'Сортировка',
  top100SortProfit: 'По прибыли',
  top100SortWinrate: 'По винрейту',
  top100SortTurnover: 'По обороту',
  top100SortWins: 'По победам',
  top100WinsLabel: 'Победы:',
  top100BalanceLabel: 'Баланс:',
  top100UserIdLabel: 'User ID:',
  top100AccountIdLabel: 'Account ID:',
  top100PoIdLabel: 'PO ID:',
  copyTraderMenu: 'Меню copy-trader',
  copyTraderAccessDenied: 'Нет доступа к меню copy-trader',
  affiliateMenu: 'Affiliate кабинет',
  affiliateAccessDenied: 'Нет доступа к affiliate кабинету',
  initializing: 'Инициализация...',
  connectionLost: 'Соединение потеряно',
  reconnecting: 'Переподключение...',
  adminPanel: 'Админ-панель',
  search: 'Поиск...',
  adminCategories: 'Категории',
  adminCurrencies: 'Валюты',
  adminNoCategories: 'Нет категорий',
  adminEmoji: 'Эмодзи',
  adminUploadFile: 'Загрузить файл',
  adminChooseFile: 'Выбрать файл',
  adminDeleteIcon: 'Удалить иконку',
  adminCurrentIcon: 'Текущая иконка',
  adminNoIcon: 'Нет иконки',
  adminFileTooLarge: 'Файл слишком большой (макс. 512 КБ)',
  adminInvalidFormat: 'Допустимые форматы: PNG, SVG, WEBP',
  adminUploadSuccess: 'Иконка загружена',
  adminDeleteConfirm: 'Удалить иконку?',
  adminDragOrClick: 'Перетащите или нажмите',

  /* Custom Indicators (admin) */
  adminIndicators: 'Индикаторы',

  /* Currency Mapping (admin) */
  adminMapping: 'Маппинг',
  adminAutoMap: 'Авто-маппинг',
  adminAutoMapForce: 'Принудительно',
  adminAutoMapResult: 'Результат',
  adminNotMapped: 'Не привязан',
  adminMappedCount: 'Привязано',
  adminMappingAll: 'Все',
  adminMappingMapped: 'Привязанные',
  adminMappingUnmapped: 'Непривязанные',
  adminMappingClear: 'Сбросить',
  adminMappingNoAssets: 'Активы не найдены',

  lowProfit: 'Низкая доходность',
  autoScroll: 'Автопрокрутка',
  autoScrollOff: 'Выкл',
  disconnReason: 'Причина',
  disconnDetails: 'Описание',
  disconnError: 'Ошибка',
  disconnTime: 'Время',
  disconnAttempts: 'Попытки',
  disconnTransport: 'Транспорт',
  disconnUrl: 'Сервер',
  betterDisconnected: 'Торговый сервер отключён, переподключение...',
  accountStatus: 'Статус аккаунта',
  statusStandard: 'Стандарт',
  statusMaster: 'Мастер',
  statusGuru: 'Гуру',
  statusVip: 'VIP',
  statusVipElite: 'VIP Elite',

  betTime: 'Время',
  betAmount: 'Сумма',
  betPayout: 'Выплата',
  betProfit: 'Прибыль',
  betBuy: 'Выше',
  betSell: 'Ниже',
  betPrevAsset: 'Предыдущая пара',
  betNextAsset: 'Следующая пара',
  betActive: 'активных',
  betClockAhead: 'Часы устройства спешат примерно на',
  betClockBehind: 'Часы устройства отстают примерно на',
  betNoAccount: 'Нет аккаунта',
  betNoAccounts: 'Нет аккаунтов PocketOption',
  betAddAccount: 'Добавить аккаунт',
  betLoginTitle: 'Вход в PocketOption',
  betPassword: 'Пароль',
  betLogin: 'Войти',
  bet2faCode: '2FA код',
  bet2faConfirm: 'Подтвердить',
  betLoginHint: 'Используйте данные от аккаунта PocketOption',
  betLoginTimingHint: 'Авторизация занимает ~20–30 сек, после подключение к серверам ещё ~40 сек',
  betInvalidCredentials: 'Неправильный логин или пароль, повторите попытку',
  betNotPartner: 'Этот аккаунт не найден среди партнёрских трейдеров',
  betDepositRequired: 'Для использования необходимо пополнить PocketOption аккаунт',
  tpMinDuration: 'Мин. время сделки: 5 сек',
  tpFixedDuration: 'Фиксированно',
  tpByTime: 'По времени',
  tpCurrentTime: 'Время',
  tpAutoTimeOffset: 'Автосмещение времени',
  tpExpiryPassed: 'Время экспирации уже прошло',
  betTradeError: 'Ошибка открытия сделки',
  betRequestPending: 'Запрос ставки отправлен',
  betRequestAccepted: 'Ставка принята',
  betRequestTimeout: 'Нет ответа на запрос ставки',
  betConnected: '✅BS Connected',
  ccpOtc: 'OTC',
  ccpForex: 'Forex',
  betLoginBtn: 'Войти в PO',
  showBetting: 'Торговая панель',
  betHistory: 'История ставок',
  betHistoryLoading: 'Загрузка…',
  betHistoryEmpty: 'Нет ставок',
  betTrades: 'Сделки',
  betOpened: 'Открытые',
  betClosed: 'Закрытые',

  poChangePassword: 'Сменить пароль PO',
  poDeleteAccount: 'Выйти из аккаунта',
  poDeleteConfirm: 'Выйти из аккаунта PocketOption?',
  poDeleteWarning: 'Аккаунт будет отвязан. Ставки перестанут работать. Это действие необратимо.',
  poPasswordChanged: 'Пароль PO аккаунта изменён',

  webAppTitle: 'Веб-приложение',
  webAppMinimize: 'Свернуть',
  webAppMaximize: 'Развернуть',
  webAppClose: 'Закрыть',

  ctTitle: 'Копитрейдинг',
  ctNoTraders: 'Нет провайдеров',
  ctCopying: 'Копирую',
  ctCopySettings: 'Настройки копирования',
  ctProportion: 'Пропорция копирования',
  ctProportionHint: 'Вы копируете % от суммы провайдера',
  ctStopBalance: 'Стоп-баланс',
  ctStopBalanceHint: 'Копирование остановится при балансе ниже этой суммы',
  ctMinCopyAmount: 'Мин. сумма копирования',
  ctMinCopyHint: 'Сделки ниже этой суммы не копируются',
  ctStartCopy: 'Начать копировать',
  ctStopCopy: 'Прекратить копирование',
  ctUpdate: 'Обновить',
  ctNoAccount: 'Подключите аккаунт PocketOption',
  ctFollowers: 'Подписчиков',
  ctTabToday: 'Сегодня',
  ctTabMonth: 'Месяц',
  ctTabAll: 'Всё время',
  ctNoStats: 'Нет статистики',
  ctStatTrades: 'Сделки:',
  ctStatProfitable: 'Прибыльные сделки:',
  ctStatTurnover: 'Торговый оборот:',
  ctStatProfit: 'Прибыль:',
  ctStatMaxTrade: 'Макс. сделка:',
  ctStatMinTrade: 'Мин. сделка:',
  ctStatMaxProfit: 'Макс. прибыль:',
  ctCopyBtn: 'Копировать',
  ctBack: 'Назад',
  ctConfirm: 'Подтвердить',
  ctCurrency: 'Валюта',
  ctTradeRange: 'Диапазон сделок',
  ctSummaryProportion: 'Вы будете копировать',
  ctSummaryStop: 'Стоп при балансе ниже',
  ctSummaryMin: 'Мин. сумма копируемой сделки',
  ctUnlimited: 'Без ограничений',
  ctAdminTab: 'Копитрейдинг',
  ctAdminCreate: 'Новый копитрейдер',
  ctAdminEdit: 'Редактировать',
  ctAdminName: 'Имя',
  ctAdminAccountId: 'Аккаунт',
  ctAdminSearchAccount: 'Поиск по email...',
  ctAdminNoAccounts: 'Аккаунты не найдены',
  ctAdminDescription: 'Описание',
  ctAdminActive: 'Активен',
  ctAdminAvatar: 'Аватар',
  ctStopAllCopy: 'Отключить все подписки',
  ctAdminSubscribers: 'Подписчики',
  ctAdminSubscribersHint: 'Управление активными подписчиками этого трейдера',
  ctAdminNoSubscribers: 'Подписчики не найдены',
  ctAdminDisconnect: 'Отключить',
  ctAdminDisconnectAll: 'Отключить всех',
  ctAdminOwnerScope: 'Доступен просмотр своих трейдеров и управление своими подписчиками.',
  ctAdminEnableTrader: 'Включить трейдера',
  ctAdminDisableTrader: 'Выключить трейдера',
  ctAdminTraderActivated: 'трейдер включён',
  ctAdminTraderDeactivated: 'трейдер выключен',
  ctAdminSubscriptionsDeactivated: 'подписок отключено',
  adminQuotes: 'Котировки',
  adminQuotesHours: 'Период (часы)',
  adminQuotesTicks: 'Тики',
  adminQuotesCandles: 'Закрытые свечи',
  adminQuotesNoData: 'Нет данных за выбранный период',
  adminQuotesGap: 'Пропуск',
  adminWhitelist: 'Вайтлист',
  adminChats: 'Чаты',
  adminChatsOnlyMissing: 'Только проблемные',
  adminChatsReload: 'Обновить',
  adminChatsSyncAll: 'Заполнить все',
  adminChatsSyncSelected: 'Заполнить выбранный',
  adminChatsForceTitles: 'Перегенерировать titles',
  adminChatsForceCategory: 'Перегенерировать category',
  adminChatsForceTitleField: 'Перегенерировать title',
  adminChatsForceExpiration: 'Перегенерировать expiration',
  adminChatsNoChats: 'Чаты не найдены',
  adminChatsSelect: 'Выберите чат слева',
  adminChatsProblemCategory: 'Нет category',
  adminChatsProblemTitles: 'Нет titles',
  adminChatsVisible: 'Виден',
  adminChatsHidden: 'Скрыт',
  adminChatsTitle: 'Основное название',
  adminChatsTitles: 'Переводы',
  adminChatsCategory: 'Категория',
  adminChatsType: 'Тип',
  adminChatsSignalMode: 'Режим сигнала',
  adminChatsFilterMode: 'Фильтр режима',
  adminChatsModeStandard: 'Стандарт',
  adminChatsModeAnalytics: 'Аналитика',
  adminChatsExpiration: 'Экспирация',
  adminChatsChatId: 'Chat ID',
  adminChatsImagePath: 'Путь к иконке',
  adminChatsAnalyticsPairs: 'Управление аналитикой пар',
  adminChatsAnalyticsPairSearch: 'Поиск пары из mapping',
  adminChatsAnalyticsHint: 'Пары можно быстро брать из mapping или вводить вручную. Таймфреймы задаются положительными целыми числами, а пустое значение означает все ТФ.',
  adminChatsAnalyticsAvailablePairs: 'Быстрое добавление',
  adminChatsAnalyticsSelectedPairs: 'Выбранные пары',
  adminChatsAnalyticsNoPairs: 'Для этого чата пары аналитики ещё не настроены',
  adminChatsAnalyticsAllTimeframes: 'Все ТФ',
  adminChatsAnalyticsPairInput: 'Пара, например eurusd_otc',
  adminChatsAnalyticsTimeframesPlaceholder: 'Таймфреймы: 1, 3, 5. Пусто = все ТФ',
  adminChatsAnalyticsPairRequired: 'Укажите пару для аналитики',
  adminChatsAnalyticsTimeframesInvalid: 'Таймфреймы должны быть положительными целыми числами через запятую или пробел',
  adminChatsSaved: 'Чат обновлён',
  adminChatsSyncDone: 'Синхронизация завершена',
  adminChatsConfirmDeleteIcon: 'Удалить иконку чата?',
  adminChatsNothingToUpdate: 'Нет изменений для сохранения',
  adminChatsUpdated: 'обновлено',
  adminChatsSkipped: 'пропущено',
  adminBlog: 'Статьи',
  adminBlogCreate: 'Новая статья',
  adminBlogReload: 'Обновить',
  adminBlogFilterAll: 'Все статьи',
  adminBlogFilterPublished: 'Опубликованные',
  adminBlogFilterDraft: 'Черновики',
  adminBlogPage: 'Страница',
  adminBlogTotal: 'Всего',
  adminBlogNoArticles: 'Статьи не найдены',
  adminBlogSelect: 'Выберите статью слева или создайте новую',
  adminBlogTitle: 'Название',
  adminBlogSlug: 'Slug',
  adminBlogSlugHint: 'Оставьте пустым для автогенерации',
  adminBlogDescription: 'Краткое описание',
  adminBlogThumbnail: 'Thumbnail URL',
  adminBlogBanner: 'Banner URL',
  adminBlogTags: 'Теги',
  adminBlogTagsHint: 'новичкам, pocket-option, стратегии',
  adminBlogPublishedAt: 'Дата публикации',
  adminBlogCreatedAt: 'Создано',
  adminBlogUpdatedAt: 'Обновлено',
  adminBlogSections: 'Разделы',
  adminBlogSectionsCount: 'разделов',
  adminBlogAddSection: 'Добавить раздел',
  adminBlogDeleteArticle: 'Удалить статью',
  adminBlogConfirmDeleteArticle: 'Удалить статью?',
  adminBlogSaveArticle: 'Сохранить статью',
  adminBlogArticleSaved: 'Статья обновлена',
  adminBlogArticleCreated: 'Статья создана',
  adminBlogArticleDeleted: 'Статья удалена',
  adminBlogSectionTitle: 'Заголовок раздела',
  adminBlogSectionContent: 'HTML-контент',
  adminBlogSectionDelete: 'Удалить раздел',
  adminBlogSectionMoveUp: 'Переместить вверх',
  adminBlogSectionMoveDown: 'Переместить вниз',
  adminBlogPreview: 'Preview',
  adminBlogNeedTitle: 'Укажите название статьи',
  adminBlogNeedSectionTitle: 'У каждого раздела должен быть заголовок',
  adminBlogToolbarParagraph: 'P',
  adminBlogToolbarH3: 'H3',
  adminBlogToolbarH4: 'H4',
  adminBlogToolbarBold: 'B',
  adminBlogToolbarItalic: 'I',
  adminBlogToolbarBulletList: 'UL',
  adminBlogToolbarOrderedList: 'OL',
  adminBlogToolbarQuote: 'Quote',
  adminBlogToolbarLink: 'Link',
  adminBlogToolbarImage: 'Img',
  adminBlogToolbarUploadImage: 'Файл',
  adminBlogToolbarClear: 'Clear',
  adminBlogPromptLink: 'Введите ссылку. Пустое значение удалит link.',
  adminBlogPromptImage: 'Введите URL изображения',
  adminBlogUploadImage: 'Загрузить изображение',
  adminBlogImageUploaded: 'Изображение загружено',
  adminBlogImageTooLarge: 'Изображение слишком большое (макс. 10 МБ)',
  adminBlogImageInvalidFormat: 'Допустимые форматы: PNG, JPG, JPEG, WEBP, GIF, AVIF, SVG',
  adminBlogImageUploadNoUrl: 'Бекенд не вернул URL загруженного изображения',
  adminBlogUntitled: 'Без названия',
  adminBlogDragHint: 'Разделы можно перетаскивать или двигать стрелками.',
  adminTradingTop: 'Leaderboard',
  adminTradingTopAccounts: 'Реальные аккаунты',
  adminTradingTopFakes: 'Fake entries',
  adminTradingTopSearchAccounts: 'Поиск по email, nickname или real_login',
  adminTradingTopNoAccounts: 'Аккаунты для leaderboard не найдены',
  adminTradingTopNoFakes: 'Fake entries пока нет',
  adminTradingTopSelectAccount: 'Выберите аккаунт слева',
  adminTradingTopSelectFake: 'Выберите fake entry слева или создайте новый',
  adminTradingTopVisible: 'Виден',
  adminTradingTopHidden: 'Скрыт',
  adminTradingTopOverrideName: 'Публичное имя',
  adminTradingTopOverrideAvatar: 'Публичный avatar URL',
  adminTradingTopPublicName: 'Имя в leaderboard',
  adminTradingTopPublicAvatar: 'URL аватара в leaderboard',
  adminTradingTopCorrections: 'Коррекции статистики',
  adminTradingTopResetCorrections: 'Сбросить коррекции',
  adminTradingTopApplyCorrections: 'Применить коррекции',
  adminTradingTopCorrectionEmpty: 'Введите хотя бы одно значение коррекции',
  adminTradingTopCorrectionsSaved: 'Коррекции сохранены',
  adminTradingTopCorrectionsReset: 'Коррекции сброшены',
  adminTradingTopSaved: 'Изменения сохранены',
  adminTradingTopName: 'Имя',
  adminTradingTopAvatarUrl: 'Avatar URL',
  adminTradingTopPoId: 'PO ID',
  adminTradingTopBalance: 'Баланс USD',
  adminTradingTopSave: 'Сохранить профиль',
  adminTradingTopTerminalAuth: 'Вход под аккаунтом',
  adminTradingTopOpenTerminal: 'Войти под этим аккаунтом',
  adminTradingTopTerminalUserId: 'Terminal user ID',
  adminTradingTopAccountActive: 'Аккаунт активен',
  adminTradingTopTokenExpires: 'Токен истекает',
  adminTradingTopLastAuthAt: 'Последняя авторизация',
  adminTradingTopTokenRefreshed: 'Токен обновлён',
  adminTradingTopAuthOpened: 'Терминал открыт с токеном пользователя',
  adminTradingTopCreateFake: 'Создать fake entry',
  adminTradingTopUpdateFake: 'Сохранить fake entry',
  adminTradingTopDeleteFake: 'Удалить fake entry',
  adminTradingTopNameRequired: 'Имя обязательно',
  adminTradingTopFakeCreated: 'Fake entry создан',
  adminTradingTopFakeUpdated: 'Fake entry обновлён',
  adminTradingTopFakeDeleted: 'Fake entry удалён',
  adminWlPoUserId: 'PO User ID',
  adminWlEmail: 'Email',
  adminWlComment: 'Комментарий',
  adminWlAdd: 'Добавить',
  adminWlEmpty: 'Вайтлист пуст',
  adminWlDeleteConfirm: 'Удалить запись?',
  adminWlAddedBy: 'Добавил',
  adminWlDuplicate: 'Запись уже существует',
  adminWlNeedIdOrEmail: 'Укажите PO User ID или Email',

  /* TMA */
  tmaRobot: 'Робот',
  tmaChats: 'Чаты',
  tmaAnalytics: 'Аналитика',
  tmaAnalyticsEmptyTitle: 'Аналитика пока не настроена',
  tmaAnalyticsEmptyText: 'Ожидайте сигналов',
  tmaCalculator: 'Калькулятор',
  tmaCalendar: 'Календарь',
  tmaSearchChats: 'Поиск по чатам',
  tmaNoChats: 'Нет чатов',
  tmaLoadMore: 'Загрузить ещё',
  tmaNotifications: 'Уведомления',
  tmaReadAll: 'Прочитать все',
  tmaCopied: 'Скопировано',
  tmaPremiumClub: 'Premium club',
  tmaTapToJoin: 'Нажмите, чтобы вступить',
  tmaSignalPreviewSignalTime: 'Сообщение',
  tmaSignalPreviewLastBar: 'Последняя свеча',
  tmaSignalPreviewLastTick: 'Последний тик',
  tmaRobotTitle: 'Робот',
  tmaWaitingForBet: 'Ожидание сделки',
  tmaWaitingForOrder: 'Ожидание ордера',
  tmaOrderAmount: 'Сумма ордера',
  tmaTradingHistory: 'История торговли',
  tmaNoTrades: 'Нет сделок',
  tmaVirtualTrading: 'ВИРТУАЛЬНАЯ ТОРГОВЛЯ',
  tmaStartTrading: 'Начать торговлю',
  tmaStopTrading: 'Остановить торговлю',
  tmaEnterDeposit: 'Введите стартовый депозит',
  tmaInitialStake: 'Стартовая сделка',
  tmaStakeInfo: 'После проигрышной серии размер сделки увеличивается по мартингейлу, чтобы компенсировать убытки.',
  tmaMinDeposit: 'Мин. депозит',
  tmaConfirmStop: 'Вы уверены что хотите остановить торговлю?',
  tmaDeposit: 'Депозит',
  tmaCurrentBalance: 'Текущий баланс',
  tmaTotalProfit: 'Общий профит',
  tmaTotalTrades: 'Всего сделок',
  tmaWinRate: 'Процент побед',
  tmaSessionDuration: 'Сессия',
  tmaActiveTrades: 'Активные сделки',
  tmaFailedLoadAutoTrading: 'Не удалось загрузить статус авто-торговли',
  tmaSearchingSignalTitle: 'Поиск подходящего сигнала',
  tmaSignalFlowAnalyze: 'Анализируем рынок',
  tmaSignalFlowPair: 'Ищем сигнал по паре {pair}',
  tmaSignalFlowAwaitEntry: 'Ожидаем точку входа',
  tmaSignalFlowPairFallback: 'выбранной',
  tmaCalcSafe: 'Безопасный',
  tmaCalcBasic: 'Базовый',
  tmaCalcProgressive: 'Прогрессивный',
  tmaCalcSafeDesc: 'Мартингейл с коэффициентом ×2.3',
  tmaCalcBasicDesc: 'Мартингейл с коэффициентом ×2.5',
  tmaCalcProgressiveDesc: 'Мартингейл с коэффициентом ×2.7',
  tmaCalcDeposit: 'Депозит',
  tmaCalcCoefficient: 'Коэффициент',
  tmaCalcSummary: 'Мартингейл',
  tmaCalcBack: 'Назад',
  tmaCalendarTitle: 'Торговый дневник',
  tmaDiaryStats: 'Статистика',
  tmaLast7Days: 'Последние 7 дней',
  tmaLast30Days: 'Последние 30 дней',
  tmaAllTime: 'За всё время',
  tmaNetProfit: 'Чистая прибыль',
  tmaTotalProfitStat: 'Общий профит',
  tmaTotalLoss: 'Общий убыток',
  tmaPositiveDays: 'Положит. дней',
  tmaNegativeDays: 'Отриц. дней',
  tmaProfit: 'Профит',
  tmaLoss: 'Убыток',
  tmaComment: 'Комментарий',
  tmaSaveDay: 'Сохранить',
  tmaPublicDiary: 'Публичный дневник',
  tmaPrivateDiary: 'Приватный дневник',
  tmaPublicDiaryShort: 'Публичный',
  tmaPrivateDiaryShort: 'Приватный',
  tmaSearchUser: 'ID пользователя',
  tmaDiaryNotFound: 'Данные не найдены',
  tmaRetry: 'Повторить',

  tmaBack: 'Назад',
  tmaBalance: 'Баланс',
  tmaHistory: 'История',
  tmaTrades: 'Сделки',
  tmaSuccessful: 'успешных',
  tmaStake: 'Ставка',
  tmaNoData: 'Нет данных',
  tmaTradingAsset: 'Торговый актив',
  tmaDayResult: 'Результат дня',
  tmaMartingale: 'Мартингейл',
  tmaCalcDescription: 'Калькулятор мартингейл-стратегии для торговли',
  tmaCalcValueDesc: 'Введите начальный депозит для расчёта',
  tmaCalcDep1: 'Депозит 1',
  tmaCalcDep2: 'Депозит 2',
  tmaCalcDep3: 'Депозит 3',
  tmaCalcDep4: 'Депозит 4',
  tmaCalcDep5: 'Депозит 5',
  tmaCalcDep6: 'Депозит 6',
  tmaCalcRequired: 'Необходимый депозит',
  tmaMon: 'Пн',
  tmaTue: 'Вт',
  tmaWed: 'Ср',
  tmaThu: 'Чт',
  tmaFri: 'Пт',
  tmaSat: 'Сб',
  tmaSun: 'Вс',
};

const uk: Translations = {
  addChart: '+ Графік',
  charts: 'Графіки',
  dragMode: 'Переміщення',
  applyToAll: 'Застосувати до всіх',
  disableAll: 'Вимкнути всі',
  chartN: 'Графік',
  settings: 'Налаштування',
  remove: 'Видалити',
  indicators: 'Індикатори',
  tvIndicators: 'TV Індикатори',
  searchIndicators: 'Пошук індикаторів...',
  activeStudies: 'Активні',
  allIndicators: 'Усі індикатори',
  noResults: 'Нічого не знайдено',
  separatePane: 'окр. панель',
  indicatorsNotFound: 'Індикатори не знайдено',
  cancel: 'Скасувати',
  save: 'Зберегти',
  reset: 'Скинути',
  done: 'Готово',
  selectCurrency: 'Оберіть валюту',
  timeframe: 'Таймфрейм',
  searchCurrency: 'Пошук валюти...',
  all: 'Усі',
  favorites: 'Обране',
  currenciesNotFound: 'Валюти не знайдено',
  ccpMinPayout: 'Мін. дохідність %',
  ccpPrevKey: 'Попер.',
  ccpNextKey: 'Наст.',
  loading: 'Завантаження...',
  failedLoadCurrencies: 'Не вдалося завантажити валюти',
  failedInitChart: 'Не вдалося ініціалізувати графік',
  tvNoSignalForPair: 'Немає сигналу по запитаній парі',
  authRequired: 'Потрібна авторизація',
  authDescription: 'Для доступу до платформи авторизуйтесь через Telegram.',
  profile: 'Профіль',
  logout: 'Вийти',
  language: 'Мова',
  changePassword: 'Змінити пароль',
  currentPassword: 'Поточний пароль',
  newPassword: 'Новий пароль',
  confirmPassword: 'Підтвердіть пароль',
  passwordChanged: 'Пароль успішно змінено',
  passwordMismatch: 'Паролі не збігаються',
  passwordTooShort: 'Мінімум 6 символів',
  deleteAccount: 'Видалити акаунт',
  deleteAccountConfirm: 'Видалити акаунт назавжди?',
  deleteAccountWarning: 'Ця дія незворотна. Усі дані буде видалено.',
  deleteAccountPassword: 'Введіть пароль для підтвердження',
  accountDeleted: 'Акаунт видалено',
  confirm: 'Підтвердити',
  accountStats: 'Статистика акаунта',
  accountStatsNoData: 'Статистика поки недоступна',
  accountStatsUpdated: 'Оновлено',
  accountStatsLeaderboard: 'Видимість у рейтингу',
  accountStatsLeaderboardVisible: 'Акаунт видно в загальному рейтингу Top 100',
  accountStatsLeaderboardHidden: 'Акаунт приховано із загального рейтингу Top 100',
  accountStatsHideFromTop: 'Сховати з рейтингу',
  accountStatsShowInTop: 'Показати в рейтингу',
  top100Title: 'Топ 100',
  top100Subtitle: 'Загальний рейтинг користувачів Better за торговою статистикою',
  top100NoData: 'Лідери поки недоступні',
  top100Updated: 'Оновлено',
  top100SortBy: 'Сортування',
  top100SortProfit: 'За прибутком',
  top100SortWinrate: 'За вінрейтом',
  top100SortTurnover: 'За оборотом',
  top100SortWins: 'За перемогами',
  top100WinsLabel: 'Перемоги:',
  top100BalanceLabel: 'Баланс:',
  top100UserIdLabel: 'User ID:',
  top100AccountIdLabel: 'Account ID:',
  top100PoIdLabel: 'PO ID:',
  copyTraderMenu: 'Меню copy-trader',
  copyTraderAccessDenied: 'Немає доступу до меню copy-trader',
  affiliateMenu: 'Affiliate кабінет',
  affiliateAccessDenied: 'Немає доступу до affiliate кабінету',
  initializing: 'Ініціалізація...',
  connectionLost: "З'єднання втрачено",
  reconnecting: 'Перепідключення...',
  adminPanel: 'Адмін-панель',
  search: 'Пошук...',
  adminCategories: 'Категорії',
  adminCurrencies: 'Валюти',
  adminNoCategories: 'Немає категорій',
  adminEmoji: 'Емодзі',
  adminUploadFile: 'Завантажити файл',
  adminChooseFile: 'Обрати файл',
  adminDeleteIcon: 'Видалити іконку',
  adminCurrentIcon: 'Поточна іконка',
  adminNoIcon: 'Немає іконки',
  adminFileTooLarge: 'Файл занадто великий (макс. 512 КБ)',
  adminInvalidFormat: 'Допустимі формати: PNG, SVG, WEBP',
  adminUploadSuccess: 'Іконку завантажено',
  adminDeleteConfirm: 'Видалити іконку?',
  adminDragOrClick: 'Перетягніть або натисніть',

  adminIndicators: 'Індикатори',

  adminMapping: 'Маппінг',
  adminAutoMap: 'Авто-маппінг',
  adminAutoMapForce: 'Примусово',
  adminAutoMapResult: 'Результат',
  adminNotMapped: 'Не прив\'язаний',
  adminMappedCount: 'Прив\'язано',
  adminMappingAll: 'Усі',
  adminMappingMapped: 'Прив\'язані',
  adminMappingUnmapped: 'Не прив\'язані',
  adminMappingClear: 'Скинути',
  adminMappingNoAssets: 'Активи не знайдено',

  lowProfit: 'Низька дохідність',
  autoScroll: 'Автопрокрутка',
  autoScrollOff: 'Вимк',
  disconnReason: 'Причина',
  disconnDetails: 'Опис',
  disconnError: 'Помилка',
  disconnTime: 'Час',
  disconnAttempts: 'Спроби',
  disconnTransport: 'Транспорт',
  disconnUrl: 'Сервер',
  betterDisconnected: 'Торговий сервер відключено, перепідключення...',
  accountStatus: 'Статус акаунта',
  statusStandard: 'Стандарт',
  statusMaster: 'Майстер',
  statusGuru: 'Гуру',
  statusVip: 'VIP',
  statusVipElite: 'VIP Elite',

  betTime: 'Час',
  betAmount: 'Сума',
  betPayout: 'Виплата',
  betProfit: 'Прибуток',
  betBuy: 'Вище',
  betSell: 'Нижче',
  betPrevAsset: 'Попередня пара',
  betNextAsset: 'Наступна пара',
  betActive: 'активних',
  betClockAhead: 'Годинник пристрою поспішає приблизно на',
  betClockBehind: 'Годинник пристрою відстає приблизно на',
  betNoAccount: 'Немає акаунта',
  betNoAccounts: 'Немає акаунтів PocketOption',
  betAddAccount: 'Додати акаунт',
  betLoginTitle: 'Вхід до PocketOption',
  betPassword: 'Пароль',
  betLogin: 'Увійти',
  bet2faCode: '2FA код',
  bet2faConfirm: 'Підтвердити',
  betLoginHint: 'Використовуйте дані від акаунта PocketOption',
  betLoginTimingHint: 'Авторизація займає ~20–30 сек, після підключення до серверів ще ~40 сек',
  betInvalidCredentials: 'Невірний логін або пароль, спробуйте ще раз',
  betNotPartner: 'Цей акаунт не знайдено серед партнерських трейдерів',
  betDepositRequired: 'Для використання необхідно поповнити PocketOption акаунт',
  tpMinDuration: 'Мін. час угоди: 5 сек',
  tpFixedDuration: 'Фіксовано',
  tpByTime: 'За часом',
  tpCurrentTime: 'Час',
  tpAutoTimeOffset: 'Автозсув часу',
  tpExpiryPassed: 'Час експірації вже минув',
  betTradeError: 'Помилка відкриття угоди',
  betRequestPending: 'Запит ставки відправлено',
  betRequestAccepted: 'Ставку прийнято',
  betRequestTimeout: 'Немає відповіді на запит ставки',
  betConnected: '✅BS Connected',
  ccpOtc: 'OTC',
  ccpForex: 'Forex',
  betLoginBtn: 'Увійти в PO',
  showBetting: 'Торгова панель',
  betHistory: 'Історія ставок',
  betHistoryLoading: 'Завантаження…',
  betHistoryEmpty: 'Немає ставок',
  betTrades: 'Угоди',
  betOpened: 'Відкриті',
  betClosed: 'Закриті',

  poChangePassword: 'Змінити пароль PO',
  poDeleteAccount: 'Вийти з акаунта PO',
  poDeleteConfirm: 'Вийти з акаунта PocketOption?',
  poDeleteWarning: 'Акаунт буде відв\'язано. Ставки перестануть працювати. Ця дія незворотна.',
  poPasswordChanged: 'Пароль PO акаунта змінено',

  webAppTitle: 'Веб-додаток',
  webAppMinimize: 'Згорнути',
  webAppMaximize: 'Розгорнути',
  webAppClose: 'Закрити',

  ctTitle: 'Копітрейдинг',
  ctNoTraders: 'Немає провайдерів',
  ctCopying: 'Копіюю',
  ctCopySettings: 'Налаштування копіювання',
  ctProportion: 'Пропорція копіювання',
  ctProportionHint: 'Ви копіюєте % від суми провайдера',
  ctStopBalance: 'Стоп-баланс',
  ctStopBalanceHint: 'Копіювання зупиниться при балансі нижче цієї суми',
  ctMinCopyAmount: 'Мін. сума копіювання',
  ctMinCopyHint: 'Угоди нижче цієї суми не копіюються',
  ctStartCopy: 'Почати копіювати',
  ctStopCopy: 'Припинити копіювання',
  ctUpdate: 'Оновити',
  ctNoAccount: 'Підключіть акаунт PocketOption',
  ctFollowers: 'Підписників',
  ctTabToday: 'Сьогодні',
  ctTabMonth: 'Місяць',
  ctTabAll: 'Весь час',
  ctNoStats: 'Немає статистики',
  ctStatTrades: 'Угоди:',
  ctStatProfitable: 'Прибуткові угоди:',
  ctStatTurnover: 'Торговий оборот:',
  ctStatProfit: 'Прибуток:',
  ctStatMaxTrade: 'Макс. угода:',
  ctStatMinTrade: 'Мін. угода:',
  ctStatMaxProfit: 'Макс. прибуток:',
  ctCopyBtn: 'Копіювати',
  ctBack: 'Назад',
  ctConfirm: 'Підтвердити',
  ctCurrency: 'Валюта',
  ctTradeRange: 'Діапазон угод',
  ctSummaryProportion: 'Ви будете копіювати',
  ctSummaryStop: 'Стоп при балансі нижче',
  ctSummaryMin: 'Мін. сума копійованої угоди',
  ctUnlimited: 'Без обмежень',
  ctAdminTab: 'Копітрейдинг',
  ctAdminCreate: 'Новий копітрейдер',
  ctAdminEdit: 'Редагувати',
  ctAdminName: "Ім'я",
  ctAdminAccountId: 'Акаунт',
  ctAdminSearchAccount: 'Пошук за email...',
  ctAdminNoAccounts: 'Акаунти не знайдено',
  ctAdminDescription: 'Опис',
  ctAdminActive: 'Активний',
  ctAdminAvatar: 'Аватар',
  ctStopAllCopy: 'Відключити всі підписки',
  ctAdminSubscribers: 'Підписники',
  ctAdminSubscribersHint: 'Керування активними підписниками цього трейдера',
  ctAdminNoSubscribers: 'Підписників не знайдено',
  ctAdminDisconnect: 'Відключити',
  ctAdminDisconnectAll: 'Відключити всіх',
  ctAdminOwnerScope: 'Доступний перегляд своїх трейдерів і керування своїми підписниками.',
  ctAdminEnableTrader: 'Увімкнути трейдера',
  ctAdminDisableTrader: 'Вимкнути трейдера',
  ctAdminTraderActivated: 'трейдера увімкнено',
  ctAdminTraderDeactivated: 'трейдера вимкнено',
  ctAdminSubscriptionsDeactivated: 'підписок відключено',
  adminQuotes: 'Котирування',
  adminQuotesHours: 'Період (години)',
  adminQuotesTicks: 'Тіки',
  adminQuotesCandles: 'Закриті свічки',
  adminQuotesNoData: 'Немає даних за обраний період',
  adminQuotesGap: 'Пропуск',
  adminWhitelist: 'Вайтліст',
  adminChats: 'Чати',
  adminChatsOnlyMissing: 'Тільки проблемні',
  adminChatsReload: 'Оновити',
  adminChatsSyncAll: 'Заповнити всі',
  adminChatsSyncSelected: 'Заповнити вибраний',
  adminChatsForceTitles: 'Перегенерувати titles',
  adminChatsForceCategory: 'Перегенерувати category',
  adminChatsForceTitleField: 'Перегенерувати title',
  adminChatsForceExpiration: 'Перегенерувати expiration',
  adminChatsNoChats: 'Чати не знайдено',
  adminChatsSelect: 'Виберіть чат зліва',
  adminChatsProblemCategory: 'Немає category',
  adminChatsProblemTitles: 'Немає titles',
  adminChatsVisible: 'Видимий',
  adminChatsHidden: 'Прихований',
  adminChatsTitle: 'Основна назва',
  adminChatsTitles: 'Переклади',
  adminChatsCategory: 'Категорія',
  adminChatsType: 'Тип',
  adminChatsSignalMode: 'Режим сигналу',
  adminChatsFilterMode: 'Фільтр режиму',
  adminChatsModeStandard: 'Стандарт',
  adminChatsModeAnalytics: 'Аналітика',
  adminChatsExpiration: 'Експірація',
  adminChatsChatId: 'Chat ID',
  adminChatsImagePath: 'Шлях до іконки',
  adminChatsAnalyticsPairs: 'Керування аналітикою пар',
  adminChatsAnalyticsPairSearch: 'Пошук пари з mapping',
  adminChatsAnalyticsHint: 'Пари можна швидко брати з mapping або вводити вручну. Таймфрейми задаються додатними цілими числами, а порожнє значення означає всі ТФ.',
  adminChatsAnalyticsAvailablePairs: 'Швидке додавання',
  adminChatsAnalyticsSelectedPairs: 'Обрані пари',
  adminChatsAnalyticsNoPairs: 'Для цього чату пари аналітики ще не налаштовані',
  adminChatsAnalyticsAllTimeframes: 'Усі ТФ',
  adminChatsAnalyticsPairInput: 'Пара, наприклад eurusd_otc',
  adminChatsAnalyticsTimeframesPlaceholder: 'Таймфрейми: 1, 3, 5. Порожньо = усі ТФ',
  adminChatsAnalyticsPairRequired: 'Вкажіть пару для аналітики',
  adminChatsAnalyticsTimeframesInvalid: 'Таймфрейми мають бути додатними цілими числами через кому або пробіл',
  adminChatsSaved: 'Чат оновлено',
  adminChatsSyncDone: 'Синхронізацію завершено',
  adminChatsConfirmDeleteIcon: 'Видалити іконку чату?',
  adminChatsNothingToUpdate: 'Немає змін для збереження',
  adminChatsUpdated: 'оновлено',
  adminChatsSkipped: 'пропущено',
  adminBlog: 'Статті',
  adminBlogCreate: 'Нова стаття',
  adminBlogReload: 'Оновити',
  adminBlogFilterAll: 'Усі статті',
  adminBlogFilterPublished: 'Опубліковані',
  adminBlogFilterDraft: 'Чернетки',
  adminBlogPage: 'Сторінка',
  adminBlogTotal: 'Усього',
  adminBlogNoArticles: 'Статті не знайдено',
  adminBlogSelect: 'Оберіть статтю ліворуч або створіть нову',
  adminBlogTitle: 'Назва',
  adminBlogSlug: 'Slug',
  adminBlogSlugHint: 'Залиште порожнім для автогенерації',
  adminBlogDescription: 'Короткий опис',
  adminBlogThumbnail: 'Thumbnail URL',
  adminBlogBanner: 'Banner URL',
  adminBlogTags: 'Теги',
  adminBlogTagsHint: 'новачкам, pocket-option, стратегії',
  adminBlogPublishedAt: 'Дата публікації',
  adminBlogCreatedAt: 'Створено',
  adminBlogUpdatedAt: 'Оновлено',
  adminBlogSections: 'Розділи',
  adminBlogSectionsCount: 'розділів',
  adminBlogAddSection: 'Додати розділ',
  adminBlogDeleteArticle: 'Видалити статтю',
  adminBlogConfirmDeleteArticle: 'Видалити статтю?',
  adminBlogSaveArticle: 'Зберегти статтю',
  adminBlogArticleSaved: 'Статтю оновлено',
  adminBlogArticleCreated: 'Статтю створено',
  adminBlogArticleDeleted: 'Статтю видалено',
  adminBlogSectionTitle: 'Заголовок розділу',
  adminBlogSectionContent: 'HTML-контент',
  adminBlogSectionDelete: 'Видалити розділ',
  adminBlogSectionMoveUp: 'Перемістити вгору',
  adminBlogSectionMoveDown: 'Перемістити вниз',
  adminBlogPreview: 'Preview',
  adminBlogNeedTitle: 'Вкажіть назву статті',
  adminBlogNeedSectionTitle: 'Кожен розділ має містити заголовок',
  adminBlogToolbarParagraph: 'P',
  adminBlogToolbarH3: 'H3',
  adminBlogToolbarH4: 'H4',
  adminBlogToolbarBold: 'B',
  adminBlogToolbarItalic: 'I',
  adminBlogToolbarBulletList: 'UL',
  adminBlogToolbarOrderedList: 'OL',
  adminBlogToolbarQuote: 'Quote',
  adminBlogToolbarLink: 'Link',
  adminBlogToolbarImage: 'Img',
  adminBlogToolbarUploadImage: 'Файл',
  adminBlogToolbarClear: 'Clear',
  adminBlogPromptLink: 'Введіть посилання. Порожнє значення видалить link.',
  adminBlogPromptImage: 'Введіть URL зображення',
  adminBlogUploadImage: 'Завантажити зображення',
  adminBlogImageUploaded: 'Зображення завантажено',
  adminBlogImageTooLarge: 'Зображення занадто велике (макс. 10 МБ)',
  adminBlogImageInvalidFormat: 'Допустимі формати: PNG, JPG, JPEG, WEBP, GIF, AVIF, SVG',
  adminBlogImageUploadNoUrl: 'Бекенд не повернув URL завантаженого зображення',
  adminBlogUntitled: 'Без назви',
  adminBlogDragHint: 'Розділи можна перетягувати або рухати стрілками.',
  adminTradingTop: 'Leaderboard',
  adminTradingTopAccounts: 'Реальні акаунти',
  adminTradingTopFakes: 'Fake entries',
  adminTradingTopSearchAccounts: 'Пошук за email, nickname або real_login',
  adminTradingTopNoAccounts: 'Акаунти для leaderboard не знайдені',
  adminTradingTopNoFakes: 'Fake entries поки немає',
  adminTradingTopSelectAccount: 'Оберіть акаунт ліворуч',
  adminTradingTopSelectFake: 'Оберіть fake entry ліворуч або створіть новий',
  adminTradingTopVisible: 'Видимий',
  adminTradingTopHidden: 'Прихований',
  adminTradingTopOverrideName: 'Публічне імʼя',
  adminTradingTopOverrideAvatar: 'Публічний avatar URL',
  adminTradingTopPublicName: 'Імʼя в leaderboard',
  adminTradingTopPublicAvatar: 'URL аватара в leaderboard',
  adminTradingTopCorrections: 'Корекції статистики',
  adminTradingTopResetCorrections: 'Скинути корекції',
  adminTradingTopApplyCorrections: 'Застосувати корекції',
  adminTradingTopCorrectionEmpty: 'Введіть хоча б одне значення корекції',
  adminTradingTopCorrectionsSaved: 'Корекції збережено',
  adminTradingTopCorrectionsReset: 'Корекції скинуто',
  adminTradingTopSaved: 'Зміни збережено',
  adminTradingTopName: 'Імʼя',
  adminTradingTopAvatarUrl: 'Avatar URL',
  adminTradingTopPoId: 'PO ID',
  adminTradingTopBalance: 'Баланс USD',
  adminTradingTopSave: 'Зберегти профіль',
  adminTradingTopTerminalAuth: 'Вхід під акаунтом',
  adminTradingTopOpenTerminal: 'Увійти під цим акаунтом',
  adminTradingTopTerminalUserId: 'Terminal user ID',
  adminTradingTopAccountActive: 'Акаунт активний',
  adminTradingTopTokenExpires: 'Токен спливає',
  adminTradingTopLastAuthAt: 'Остання авторизація',
  adminTradingTopTokenRefreshed: 'Токен оновлено',
  adminTradingTopAuthOpened: 'Термінал відкрито з токеном користувача',
  adminTradingTopCreateFake: 'Створити fake entry',
  adminTradingTopUpdateFake: 'Зберегти fake entry',
  adminTradingTopDeleteFake: 'Видалити fake entry',
  adminTradingTopNameRequired: 'Імʼя обовʼязкове',
  adminTradingTopFakeCreated: 'Fake entry створено',
  adminTradingTopFakeUpdated: 'Fake entry оновлено',
  adminTradingTopFakeDeleted: 'Fake entry видалено',
  adminWlPoUserId: 'PO User ID',
  adminWlEmail: 'Email',
  adminWlComment: 'Коментар',
  adminWlAdd: 'Додати',
  adminWlEmpty: 'Вайтліст порожній',
  adminWlDeleteConfirm: 'Видалити запис?',
  adminWlAddedBy: 'Додав',
  adminWlDuplicate: 'Запис вже існує',
  adminWlNeedIdOrEmail: 'Вкажіть PO User ID або Email',

  /* TMA */
  tmaRobot: 'Робот',
  tmaChats: 'Чати',
  tmaAnalytics: 'Аналітика',
  tmaAnalyticsEmptyTitle: 'Аналітика поки не налаштована',
  tmaAnalyticsEmptyText: 'Очікуйте на сигнали',
  tmaCalculator: 'Калькулятор',
  tmaCalendar: 'Календар',
  tmaSearchChats: 'Пошук по чатах',
  tmaNoChats: 'Немає чатів',
  tmaLoadMore: 'Завантажити ще',
  tmaNotifications: 'Сповіщення',
  tmaReadAll: 'Прочитати все',
  tmaCopied: 'Скопійовано',
  tmaPremiumClub: 'Premium club',
  tmaTapToJoin: 'Натисніть, щоб приєднатися',
  tmaSignalPreviewSignalTime: 'Повідомлення',
  tmaSignalPreviewLastBar: 'Остання свічка',
  tmaSignalPreviewLastTick: 'Останній тік',
  tmaRobotTitle: 'Робот',
  tmaWaitingForBet: 'Очікування ставки',
  tmaWaitingForOrder: 'Очікування ордера',
  tmaOrderAmount: 'Сума ордера',
  tmaTradingHistory: 'Історія торгівлі',
  tmaNoTrades: 'Немає угод',
  tmaVirtualTrading: 'ВІРТУАЛЬНА ТОРГІВЛЯ',
  tmaStartTrading: 'Почати торгівлю',
  tmaStopTrading: 'Зупинити торгівлю',
  tmaEnterDeposit: 'Введіть стартовий депозит',
  tmaInitialStake: 'Стартова угода',
  tmaStakeInfo: 'Після програшної серії розмір угоди збільшується за мартингейлом, щоб компенсувати збитки.',
  tmaMinDeposit: 'Мін. депозит',
  tmaConfirmStop: 'Ви впевнені що хочете зупинити торгівлю?',
  tmaDeposit: 'Депозит',
  tmaCurrentBalance: 'Поточний баланс',
  tmaTotalProfit: 'Загальний профіт',
  tmaTotalTrades: 'Всього угод',
  tmaWinRate: 'Відсоток перемог',
  tmaSessionDuration: 'Сесія',
  tmaActiveTrades: 'Активні угоди',
  tmaFailedLoadAutoTrading: 'Не вдалося завантажити статус авто-торгівлі',
  tmaSearchingSignalTitle: 'Пошук відповідного сигналу',
  tmaSignalFlowAnalyze: 'Аналізуємо ринок',
  tmaSignalFlowPair: 'Шукаємо сигнал по парі {pair}',
  tmaSignalFlowAwaitEntry: 'Очікуємо точку входу',
  tmaSignalFlowPairFallback: 'обраній',
  tmaCalcSafe: 'Безпечний',
  tmaCalcBasic: 'Базовий',
  tmaCalcProgressive: 'Прогресивний',
  tmaCalcSafeDesc: 'Мартингейл з коефіцієнтом ×2.3',
  tmaCalcBasicDesc: 'Мартингейл з коефіцієнтом ×2.5',
  tmaCalcProgressiveDesc: 'Мартингейл з коефіцієнтом ×2.7',
  tmaCalcDeposit: 'Депозит',
  tmaCalcCoefficient: 'Коефіцієнт',
  tmaCalcSummary: 'Мартингейл',
  tmaCalcBack: 'Назад',
  tmaCalendarTitle: 'Торговий щоденник',
  tmaDiaryStats: 'Статистика',
  tmaLast7Days: 'Останні 7 днів',
  tmaLast30Days: 'Останні 30 днів',
  tmaAllTime: 'За весь час',
  tmaNetProfit: 'Чистий прибуток',
  tmaTotalProfitStat: 'Загальний профіт',
  tmaTotalLoss: 'Загальний збиток',
  tmaPositiveDays: 'Позит. днів',
  tmaNegativeDays: 'Негат. днів',
  tmaProfit: 'Профіт',
  tmaLoss: 'Збиток',
  tmaComment: 'Коментар',
  tmaSaveDay: 'Зберегти',
  tmaPublicDiary: 'Публічний щоденник',
  tmaPrivateDiary: 'Приватний щоденник',
  tmaPublicDiaryShort: 'Публічний',
  tmaPrivateDiaryShort: 'Приватний',
  tmaSearchUser: 'ID користувача',
  tmaDiaryNotFound: 'Дані не знайдено',
  tmaRetry: 'Повторити',

  tmaBack: 'Назад',
  tmaBalance: 'Баланс',
  tmaHistory: 'Історія',
  tmaTrades: 'Угоди',
  tmaSuccessful: 'успішних',
  tmaStake: 'Ставка',
  tmaNoData: 'Немає даних',
  tmaTradingAsset: 'Торговий актив',
  tmaDayResult: 'Результат дня',
  tmaMartingale: 'Мартингейл',
  tmaCalcDescription: 'Калькулятор мартингейл-стратегії для торгівлі',
  tmaCalcValueDesc: 'Введіть початковий депозит для розрахунку',
  tmaCalcDep1: 'Депозит 1',
  tmaCalcDep2: 'Депозит 2',
  tmaCalcDep3: 'Депозит 3',
  tmaCalcDep4: 'Депозит 4',
  tmaCalcDep5: 'Депозит 5',
  tmaCalcDep6: 'Депозит 6',
  tmaCalcRequired: 'Необхідний депозит',
  tmaMon: 'Пн',
  tmaTue: 'Вт',
  tmaWed: 'Ср',
  tmaThu: 'Чт',
  tmaFri: 'Пт',
  tmaSat: 'Сб',
  tmaSun: 'Нд',
};

const en: Translations = {
  addChart: '+ Chart',
  charts: 'Charts',
  dragMode: 'Reorder',
  applyToAll: 'Apply to all',
  disableAll: 'Disable all',
  chartN: 'Chart',
  settings: 'Settings',
  remove: 'Remove',
  indicators: 'Indicators',
  tvIndicators: 'TV Indicators',
  searchIndicators: 'Search indicators...',
  activeStudies: 'Active',
  allIndicators: 'All indicators',
  noResults: 'No results',
  separatePane: 'sep. pane',
  indicatorsNotFound: 'No indicators found',
  cancel: 'Cancel',
  save: 'Save',
  reset: 'Reset',
  done: 'Done',
  selectCurrency: 'Select currency',
  timeframe: 'Timeframe',
  searchCurrency: 'Search currency...',
  all: 'All',
  favorites: 'Favorites',
  currenciesNotFound: 'No currencies found',
  ccpMinPayout: 'Min payout %',
  ccpPrevKey: 'Prev',
  ccpNextKey: 'Next',
  loading: 'Loading...',
  failedLoadCurrencies: 'Failed to load currencies',
  failedInitChart: 'Failed to initialize chart',
  tvNoSignalForPair: 'No signal for the requested pair',
  authRequired: 'Authorization required',
  authDescription: 'Please authorize via Telegram to access the platform.',
  profile: 'Profile',
  logout: 'Log out',
  language: 'Language',
  changePassword: 'Change Password',
  currentPassword: 'Current Password',
  newPassword: 'New Password',
  confirmPassword: 'Confirm Password',
  passwordChanged: 'Password changed successfully',
  passwordMismatch: 'Passwords do not match',
  passwordTooShort: 'Minimum 6 characters',
  deleteAccount: 'Delete Account',
  deleteAccountConfirm: 'Delete account permanently?',
  deleteAccountWarning: 'This action is irreversible. All data will be deleted.',
  deleteAccountPassword: 'Enter password to confirm',
  accountDeleted: 'Account deleted',
  confirm: 'Confirm',
  accountStats: 'Account stats',
  accountStatsNoData: 'Stats are not available yet',
  accountStatsUpdated: 'Updated',
  accountStatsLeaderboard: 'Leaderboard visibility',
  accountStatsLeaderboardVisible: 'This account is visible in the public Top 100 leaderboard',
  accountStatsLeaderboardHidden: 'This account is hidden from the public Top 100 leaderboard',
  accountStatsHideFromTop: 'Hide from leaderboard',
  accountStatsShowInTop: 'Show in leaderboard',
  top100Title: 'Top 100',
  top100Subtitle: 'Overall Better user leaderboard by trading stats',
  top100NoData: 'Leaderboard is not available yet',
  top100Updated: 'Updated',
  top100SortBy: 'Sort by',
  top100SortProfit: 'Profit',
  top100SortWinrate: 'Win rate',
  top100SortTurnover: 'Turnover',
  top100SortWins: 'Wins',
  top100WinsLabel: 'Wins:',
  top100BalanceLabel: 'Balance:',
  top100UserIdLabel: 'User ID:',
  top100AccountIdLabel: 'Account ID:',
  top100PoIdLabel: 'PO ID:',
  copyTraderMenu: 'Copy-trader menu',
  copyTraderAccessDenied: 'You do not have access to the copy-trader menu',
  affiliateMenu: 'Affiliate cabinet',
  affiliateAccessDenied: 'You do not have access to the affiliate cabinet',
  initializing: 'Initializing...',
  connectionLost: 'Connection lost',
  reconnecting: 'Reconnecting...',
  adminPanel: 'Admin Panel',
  search: 'Search...',
  adminCategories: 'Categories',
  adminCurrencies: 'Currencies',
  adminNoCategories: 'No categories',
  adminEmoji: 'Emoji',
  adminUploadFile: 'Upload file',
  adminChooseFile: 'Choose file',
  adminDeleteIcon: 'Delete icon',
  adminCurrentIcon: 'Current icon',
  adminNoIcon: 'No icon',
  adminFileTooLarge: 'File too large (max 512 KB)',
  adminInvalidFormat: 'Allowed formats: PNG, SVG, WEBP',
  adminUploadSuccess: 'Icon uploaded',
  adminDeleteConfirm: 'Delete icon?',
  adminDragOrClick: 'Drag & drop or click',

  adminIndicators: 'Indicators',

  adminMapping: 'Mapping',
  adminAutoMap: 'Auto-map',
  adminAutoMapForce: 'Force',
  adminAutoMapResult: 'Result',
  adminNotMapped: 'Not mapped',
  adminMappedCount: 'Mapped',
  adminMappingAll: 'All',
  adminMappingMapped: 'Mapped',
  adminMappingUnmapped: 'Unmapped',
  adminMappingClear: 'Clear',
  adminMappingNoAssets: 'No assets found',

  lowProfit: 'Low profitability',
  autoScroll: 'Auto-scroll',
  autoScrollOff: 'Off',
  disconnReason: 'Reason',
  disconnDetails: 'Details',
  disconnError: 'Error',
  disconnTime: 'Time',
  disconnAttempts: 'Attempts',
  disconnTransport: 'Transport',
  disconnUrl: 'Server',
  betterDisconnected: 'Trading server disconnected, reconnecting...',
  accountStatus: 'Account Status',
  statusStandard: 'Standard',
  statusMaster: 'Master',
  statusGuru: 'Guru',
  statusVip: 'VIP',
  statusVipElite: 'VIP Elite',

  betTime: 'Time',
  betAmount: 'Amount',
  betPayout: 'Payout',
  betProfit: 'Profit',
  betBuy: 'Buy',
  betSell: 'Sell',
  betPrevAsset: 'Previous pair',
  betNextAsset: 'Next pair',
  betActive: 'active',
  betClockAhead: 'Device clock is ahead by about',
  betClockBehind: 'Device clock lags by about',
  betNoAccount: 'No account',
  betNoAccounts: 'No PocketOption accounts',
  betAddAccount: 'Add account',
  betLoginTitle: 'PocketOption Login',
  betPassword: 'Password',
  betLogin: 'Log in',
  bet2faCode: '2FA Code',
  bet2faConfirm: 'Confirm',
  betLoginHint: 'Use your PocketOption account credentials',
  betLoginTimingHint: 'Authorization takes ~20–30 sec, then connecting to servers takes ~40 sec',
  betInvalidCredentials: 'Invalid login or password, please try again',
  betNotPartner: 'This account is not found among partner traders',
  betDepositRequired: 'A deposit is required on your PocketOption account to continue',
  tpMinDuration: 'Min. trade duration: 5 sec',
  tpFixedDuration: 'Fixed',
  tpByTime: 'By time',
  tpCurrentTime: 'Time',
  tpAutoTimeOffset: 'Auto Time Offset',
  tpExpiryPassed: 'The expiry time has already passed',
  betTradeError: 'Trade open failed',
  betRequestPending: 'Bet request sent',
  betRequestAccepted: 'Bet accepted',
  betRequestTimeout: 'No response for the bet request',
  betConnected: '✅ BS Connected',
  ccpOtc: 'OTC',
  ccpForex: 'Forex',
  betLoginBtn: 'Log in PO',
  showBetting: 'Trading panel',
  betHistory: 'Bet History',
  betHistoryLoading: 'Loading…',
  betHistoryEmpty: 'No bets yet',
  betTrades: 'Trades',
  betOpened: 'Opened',
  betClosed: 'Closed',

  poChangePassword: 'Change PO Password',
  poDeleteAccount: 'Logout PO Account',
  poDeleteConfirm: 'Logout PocketOption account?',
  poDeleteWarning: 'The account will be unlinked. Bets will stop working. This action is irreversible.',
  poPasswordChanged: 'PO account password changed',

  webAppTitle: 'Web App',
  webAppMinimize: 'Minimize',
  webAppMaximize: 'Maximize',
  webAppClose: 'Close',

  ctTitle: 'Copy Trading',
  ctNoTraders: 'No providers available',
  ctCopying: 'Copying',
  ctCopySettings: 'Copy Settings',
  ctProportion: 'Copy in proportion',
  ctProportionHint: 'You will copy % of provider\'s trade amount',
  ctStopBalance: 'Stop balance',
  ctStopBalanceHint: 'Copying will stop if balance falls below this amount',
  ctMinCopyAmount: 'Min. copy trade amount',
  ctMinCopyHint: 'Trades below this amount will not be copied',
  ctStartCopy: 'Start Copying',
  ctStopCopy: 'Stop Copying',
  ctUpdate: 'Update',
  ctNoAccount: 'Connect a PocketOption account first',
  ctFollowers: 'Followers',
  ctTabToday: 'Today',
  ctTabMonth: 'Month',
  ctTabAll: 'All time',
  ctNoStats: 'No statistics',
  ctStatTrades: 'Trades:',
  ctStatProfitable: 'Profitable trades:',
  ctStatTurnover: 'Trading turnover:',
  ctStatProfit: 'Trading profit:',
  ctStatMaxTrade: 'Max. trade:',
  ctStatMinTrade: 'Min. trade:',
  ctStatMaxProfit: 'Max. profit:',
  ctCopyBtn: 'Copy',
  ctBack: 'Back',
  ctConfirm: 'Confirm',
  ctCurrency: 'Currency',
  ctTradeRange: 'Trade range',
  ctSummaryProportion: 'You will copy',
  ctSummaryStop: 'Copying stops if balance less than',
  ctSummaryMin: 'Min. copied trade amount',
  ctUnlimited: 'Unlimited',
  ctAdminTab: 'Copy Trading',
  ctAdminCreate: 'New Trader',
  ctAdminEdit: 'Edit Trader',
  ctAdminName: 'Name',
  ctAdminAccountId: 'Account',
  ctAdminSearchAccount: 'Search by email...',
  ctAdminNoAccounts: 'No accounts found',
  ctAdminDescription: 'Description',
  ctAdminActive: 'Active',
  ctAdminAvatar: 'Avatar',
  ctStopAllCopy: 'Disable all subscriptions',
  ctAdminSubscribers: 'Subscribers',
  ctAdminSubscribersHint: 'Manage active subscribers for this trader',
  ctAdminNoSubscribers: 'No subscribers found',
  ctAdminDisconnect: 'Disconnect',
  ctAdminDisconnectAll: 'Disconnect all',
  ctAdminOwnerScope: 'You can view your traders and manage your subscribers.',
  ctAdminEnableTrader: 'Enable trader',
  ctAdminDisableTrader: 'Disable trader',
  ctAdminTraderActivated: 'trader enabled',
  ctAdminTraderDeactivated: 'trader disabled',
  ctAdminSubscriptionsDeactivated: 'subscriptions deactivated',
  adminQuotes: 'Quotes',
  adminQuotesHours: 'Period (hours)',
  adminQuotesTicks: 'Ticks',
  adminQuotesCandles: 'Closed candles',
  adminQuotesNoData: 'No data for selected period',
  adminQuotesGap: 'Gap',
  adminWhitelist: 'Whitelist',
  adminChats: 'Chats',
  adminChatsOnlyMissing: 'Only missing',
  adminChatsReload: 'Reload',
  adminChatsSyncAll: 'Sync all',
  adminChatsSyncSelected: 'Sync selected',
  adminChatsForceTitles: 'Force titles',
  adminChatsForceCategory: 'Force category',
  adminChatsForceTitleField: 'Force title field',
  adminChatsForceExpiration: 'Force expiration',
  adminChatsNoChats: 'No chats found',
  adminChatsSelect: 'Select a chat on the left',
  adminChatsProblemCategory: 'Missing category',
  adminChatsProblemTitles: 'Missing titles',
  adminChatsVisible: 'Visible',
  adminChatsHidden: 'Hidden',
  adminChatsTitle: 'Primary title',
  adminChatsTitles: 'Translations',
  adminChatsCategory: 'Category',
  adminChatsType: 'Type',
  adminChatsSignalMode: 'Signal mode',
  adminChatsFilterMode: 'Mode filter',
  adminChatsModeStandard: 'Standard',
  adminChatsModeAnalytics: 'Analytics',
  adminChatsExpiration: 'Expiration',
  adminChatsChatId: 'Chat ID',
  adminChatsImagePath: 'Icon path',
  adminChatsAnalyticsPairs: 'Analytics pairs management',
  adminChatsAnalyticsPairSearch: 'Search pair from mapping',
  adminChatsAnalyticsHint: 'Pairs can be taken from mapping or entered manually. Timeframes use positive integers, and an empty value means all TF.',
  adminChatsAnalyticsAvailablePairs: 'Quick add',
  adminChatsAnalyticsSelectedPairs: 'Selected pairs',
  adminChatsAnalyticsNoPairs: 'No analytics pairs are configured for this chat yet',
  adminChatsAnalyticsAllTimeframes: 'All TF',
  adminChatsAnalyticsPairInput: 'Pair, for example eurusd_otc',
  adminChatsAnalyticsTimeframesPlaceholder: 'Timeframes: 1, 3, 5. Empty = all TF',
  adminChatsAnalyticsPairRequired: 'Specify an analytics pair',
  adminChatsAnalyticsTimeframesInvalid: 'Timeframes must be positive integers separated by commas or spaces',
  adminChatsSaved: 'Chat updated',
  adminChatsSyncDone: 'Sync completed',
  adminChatsConfirmDeleteIcon: 'Delete chat icon?',
  adminChatsNothingToUpdate: 'No changes to save',
  adminChatsUpdated: 'updated',
  adminChatsSkipped: 'skipped',
  adminBlog: 'Articles',
  adminBlogCreate: 'New article',
  adminBlogReload: 'Reload',
  adminBlogFilterAll: 'All articles',
  adminBlogFilterPublished: 'Published',
  adminBlogFilterDraft: 'Drafts',
  adminBlogPage: 'Page',
  adminBlogTotal: 'Total',
  adminBlogNoArticles: 'No articles found',
  adminBlogSelect: 'Select an article on the left or create a new one',
  adminBlogTitle: 'Title',
  adminBlogSlug: 'Slug',
  adminBlogSlugHint: 'Leave empty for auto-generation',
  adminBlogDescription: 'Short description',
  adminBlogThumbnail: 'Thumbnail URL',
  adminBlogBanner: 'Banner URL',
  adminBlogTags: 'Tags',
  adminBlogTagsHint: 'beginners, pocket-option, strategy',
  adminBlogPublishedAt: 'Published at',
  adminBlogCreatedAt: 'Created at',
  adminBlogUpdatedAt: 'Updated at',
  adminBlogSections: 'Sections',
  adminBlogSectionsCount: 'sections',
  adminBlogAddSection: 'Add section',
  adminBlogDeleteArticle: 'Delete article',
  adminBlogConfirmDeleteArticle: 'Delete article?',
  adminBlogSaveArticle: 'Save article',
  adminBlogArticleSaved: 'Article updated',
  adminBlogArticleCreated: 'Article created',
  adminBlogArticleDeleted: 'Article deleted',
  adminBlogSectionTitle: 'Section title',
  adminBlogSectionContent: 'HTML content',
  adminBlogSectionDelete: 'Delete section',
  adminBlogSectionMoveUp: 'Move up',
  adminBlogSectionMoveDown: 'Move down',
  adminBlogPreview: 'Preview',
  adminBlogNeedTitle: 'Article title is required',
  adminBlogNeedSectionTitle: 'Each section must have a title',
  adminBlogToolbarParagraph: 'P',
  adminBlogToolbarH3: 'H3',
  adminBlogToolbarH4: 'H4',
  adminBlogToolbarBold: 'B',
  adminBlogToolbarItalic: 'I',
  adminBlogToolbarBulletList: 'UL',
  adminBlogToolbarOrderedList: 'OL',
  adminBlogToolbarQuote: 'Quote',
  adminBlogToolbarLink: 'Link',
  adminBlogToolbarImage: 'Img',
  adminBlogToolbarUploadImage: 'File',
  adminBlogToolbarClear: 'Clear',
  adminBlogPromptLink: 'Enter a link. Empty value removes the link.',
  adminBlogPromptImage: 'Enter image URL',
  adminBlogUploadImage: 'Upload image',
  adminBlogImageUploaded: 'Image uploaded',
  adminBlogImageTooLarge: 'Image is too large (max 10 MB)',
  adminBlogImageInvalidFormat: 'Allowed formats: PNG, JPG, JPEG, WEBP, GIF, AVIF, SVG',
  adminBlogImageUploadNoUrl: 'Backend did not return an uploaded image URL',
  adminBlogUntitled: 'Untitled',
  adminBlogDragHint: 'Sections can be reordered by drag-and-drop or arrows.',
  adminTradingTop: 'Leaderboard',
  adminTradingTopAccounts: 'Real accounts',
  adminTradingTopFakes: 'Fake entries',
  adminTradingTopSearchAccounts: 'Search by email, nickname or real_login',
  adminTradingTopNoAccounts: 'No leaderboard accounts found',
  adminTradingTopNoFakes: 'No fake entries yet',
  adminTradingTopSelectAccount: 'Select an account on the left',
  adminTradingTopSelectFake: 'Select a fake entry on the left or create a new one',
  adminTradingTopVisible: 'Visible',
  adminTradingTopHidden: 'Hidden',
  adminTradingTopOverrideName: 'Public name',
  adminTradingTopOverrideAvatar: 'Public avatar URL',
  adminTradingTopPublicName: 'Name in leaderboard',
  adminTradingTopPublicAvatar: 'Avatar URL in leaderboard',
  adminTradingTopCorrections: 'Stat corrections',
  adminTradingTopResetCorrections: 'Reset corrections',
  adminTradingTopApplyCorrections: 'Apply corrections',
  adminTradingTopCorrectionEmpty: 'Enter at least one correction value',
  adminTradingTopCorrectionsSaved: 'Corrections saved',
  adminTradingTopCorrectionsReset: 'Corrections reset',
  adminTradingTopSaved: 'Changes saved',
  adminTradingTopName: 'Name',
  adminTradingTopAvatarUrl: 'Avatar URL',
  adminTradingTopPoId: 'PO ID',
  adminTradingTopBalance: 'Balance USD',
  adminTradingTopSave: 'Save profile',
  adminTradingTopTerminalAuth: 'Login as account',
  adminTradingTopOpenTerminal: 'Login as this account',
  adminTradingTopTerminalUserId: 'Terminal user ID',
  adminTradingTopAccountActive: 'Account active',
  adminTradingTopTokenExpires: 'Token expires at',
  adminTradingTopLastAuthAt: 'Last authorization',
  adminTradingTopTokenRefreshed: 'Token refreshed',
  adminTradingTopAuthOpened: 'Terminal opened with user token',
  adminTradingTopCreateFake: 'Create fake entry',
  adminTradingTopUpdateFake: 'Save fake entry',
  adminTradingTopDeleteFake: 'Delete fake entry',
  adminTradingTopNameRequired: 'Name is required',
  adminTradingTopFakeCreated: 'Fake entry created',
  adminTradingTopFakeUpdated: 'Fake entry updated',
  adminTradingTopFakeDeleted: 'Fake entry deleted',
  adminWlPoUserId: 'PO User ID',
  adminWlEmail: 'Email',
  adminWlComment: 'Comment',
  adminWlAdd: 'Add',
  adminWlEmpty: 'Whitelist is empty',
  adminWlDeleteConfirm: 'Delete entry?',
  adminWlAddedBy: 'Added by',
  adminWlDuplicate: 'Entry already exists',
  adminWlNeedIdOrEmail: 'Provide PO User ID or Email',

  /* TMA */
  tmaRobot: 'Robot',
  tmaChats: 'Chats',
  tmaAnalytics: 'Analytics',
  tmaAnalyticsEmptyTitle: 'Analytics is not configured yet',
  tmaAnalyticsEmptyText: 'Please wait for signals',
  tmaCalculator: 'Calculator',
  tmaCalendar: 'Calendar',
  tmaSearchChats: 'Search chats',
  tmaNoChats: 'No chats',
  tmaLoadMore: 'Load more',
  tmaNotifications: 'Notifications',
  tmaReadAll: 'Read all',
  tmaCopied: 'Copied',
  tmaPremiumClub: 'Premium club',
  tmaTapToJoin: 'Tap to join',
  tmaSignalPreviewSignalTime: 'Message',
  tmaSignalPreviewLastBar: 'Last candle',
  tmaSignalPreviewLastTick: 'Last tick',
  tmaRobotTitle: 'Robot',
  tmaWaitingForBet: 'Waiting for bet',
  tmaWaitingForOrder: 'Waiting for order',
  tmaOrderAmount: 'Order amount',
  tmaTradingHistory: 'Trading history',
  tmaNoTrades: 'No trades',
  tmaVirtualTrading: 'VIRTUAL TRADING',
  tmaStartTrading: 'Start trading',
  tmaStopTrading: 'Stop trading',
  tmaEnterDeposit: 'Enter initial deposit',
  tmaInitialStake: 'Initial stake',
  tmaStakeInfo: 'After a losing streak, the stake size increases using martingale to compensate for losses.',
  tmaMinDeposit: 'Min. deposit',
  tmaConfirmStop: 'Are you sure you want to stop trading?',
  tmaDeposit: 'Deposit',
  tmaCurrentBalance: 'Current balance',
  tmaTotalProfit: 'Total profit',
  tmaTotalTrades: 'Total trades',
  tmaWinRate: 'Win rate',
  tmaSessionDuration: 'Session',
  tmaActiveTrades: 'Active trades',
  tmaFailedLoadAutoTrading: 'Failed to load auto trading status',
  tmaSearchingSignalTitle: 'Searching for a suitable signal',
  tmaSignalFlowAnalyze: 'Analyzing the market',
  tmaSignalFlowPair: 'Looking for a signal on pair {pair}',
  tmaSignalFlowAwaitEntry: 'Waiting for an entry point',
  tmaSignalFlowPairFallback: 'selected',
  tmaCalcSafe: 'Safe',
  tmaCalcBasic: 'Basic',
  tmaCalcProgressive: 'Progressive',
  tmaCalcSafeDesc: 'Martingale with ×2.3 coefficient',
  tmaCalcBasicDesc: 'Martingale with ×2.5 coefficient',
  tmaCalcProgressiveDesc: 'Martingale with ×2.7 coefficient',
  tmaCalcDeposit: 'Deposit',
  tmaCalcCoefficient: 'Coefficient',
  tmaCalcSummary: 'Martingale',
  tmaCalcBack: 'Back',
  tmaCalendarTitle: 'Trading Diary',
  tmaDiaryStats: 'Statistics',
  tmaLast7Days: 'Last 7 days',
  tmaLast30Days: 'Last 30 days',
  tmaAllTime: 'All time',
  tmaNetProfit: 'Net profit',
  tmaTotalProfitStat: 'Total profit',
  tmaTotalLoss: 'Total loss',
  tmaPositiveDays: 'Positive days',
  tmaNegativeDays: 'Negative days',
  tmaProfit: 'Profit',
  tmaLoss: 'Loss',
  tmaComment: 'Comment',
  tmaSaveDay: 'Save',
  tmaPublicDiary: 'Public diary',
  tmaPrivateDiary: 'Private diary',
  tmaPublicDiaryShort: 'Public',
  tmaPrivateDiaryShort: 'Private',
  tmaSearchUser: 'User ID',
  tmaDiaryNotFound: 'Data not found',
  tmaRetry: 'Retry',

  tmaBack: 'Back',
  tmaBalance: 'Balance',
  tmaHistory: 'History',
  tmaTrades: 'Trades',
  tmaSuccessful: 'successful',
  tmaStake: 'Stake',
  tmaNoData: 'No data',
  tmaTradingAsset: 'Trading asset',
  tmaDayResult: 'Day result',
  tmaMartingale: 'Martingale',
  tmaCalcDescription: 'Martingale strategy calculator for trading',
  tmaCalcValueDesc: 'Enter initial deposit to calculate',
  tmaCalcDep1: 'Deposit 1',
  tmaCalcDep2: 'Deposit 2',
  tmaCalcDep3: 'Deposit 3',
  tmaCalcDep4: 'Deposit 4',
  tmaCalcDep5: 'Deposit 5',
  tmaCalcDep6: 'Deposit 6',
  tmaCalcRequired: 'Required deposit',
  tmaMon: 'Mon',
  tmaTue: 'Tue',
  tmaWed: 'Wed',
  tmaThu: 'Thu',
  tmaFri: 'Fri',
  tmaSat: 'Sat',
  tmaSun: 'Sun',
};

const DICTIONARIES: Record<Locale, Translations> = { ru, uk, en };

/* ─── Indicator paramMeta label translations ─── */
/* Key = original label text, Value = translated label */

const indicatorLabelsRu: Record<string, string> = {
  "Старт SAR": "Старт SAR",
  "Шаг SAR": "Шаг SAR",
  "Макс. SAR": "Макс. SAR",
  "Расположение": "Расположение",
  "Режим отображения": "Режим отображения",
  "Бары для анализа": "Бары для анализа",
  "Количество строк (детализация)": "Количество строк (детализация)",
  "Ширина профиля (%)": "Ширина профиля (%)",
  "Прозрачность профиля": "Прозрачность профиля",
  "Прозрачность линий POC": "Прозрачность линий POC",
  "Цвет Покупок": "Цвет Покупок",
  "Цвет Продаж": "Цвет Продаж",
  "Выделять макс. объем (POC)": "Выделять макс. объем (POC)",
  "Цвет POC": "Цвет POC",
  "Линия POC на весь экран": "Линия POC на весь экран",
  "Минимум подряд свечей": "Минимум подряд свечей",
  "Текст метки BUY": "Текст метки BUY",
  "Текст метки SELL": "Текст метки SELL",
  "Сигналы: включить": "Сигналы: включить",
  "FVG: сигналы": "FVG: сигналы",
  "OG: сигналы": "OG: сигналы",
  "VI: сигналы": "VI: сигналы",
  "Глобальный кулдаун (баров)": "Глобальный кулдаун (баров)",
  "Цвет текста BUY": "Цвет текста BUY",
  "Цвет текста SELL": "Цвет текста SELL",
  "Статистика: включить": "Статистика: включить",
  "Экспирация N (баров)": "Экспирация N (баров)",
  "Догон, баров (0 = как N)": "Догон, баров (0 = как N)",
  "Кол-во догонов (0..7)": "Кол-во догонов (0..7)",
  "Окно статистики (баров)": "Окно статистики (баров)",
  "HUD: показывать": "HUD: показывать",
  "HUD: позиция": "HUD: позиция",
  "Чувствительность (ATR×)": "Чувствительность (ATR×)",
  "Цвет линии": "Цвет линии",
  "Показать точки": "Показать точки",
  "Цвет максимумов": "Цвет максимумов",
  "Цвет минимумов": "Цвет минимумов",
  "Размер точек": "Размер точек",
  "Показать метки": "Показать метки",
  "Размер меток": "Размер меток",
  "ATR Период": "ATR Период",
  "Множитель ATR": "Множитель ATR",
  "Язык текста (RU/EN)": "Язык текста (RU/EN)",
  "Линия ↑ (включить)": "Линия ↑ (включить)",
  "Цвет линии ↑": "Цвет линии ↑",
  "Толщина линии ↑": "Толщина линии ↑",
  "Линия ↓ (включить)": "Линия ↓ (включить)",
  "Цвет линии ↓": "Цвет линии ↓",
  "Толщина линии ↓": "Толщина линии ↓",
  "Показывать подписи": "Показывать подписи",
  "Текст BUY": "Текст BUY",
  "Текст SELL": "Текст SELL",
  "Цвет текста подписи": "Цвет текста подписи",
  "Смещение X подписи": "Смещение X подписи",
  "Смещение Y подписи": "Смещение Y подписи",
  "Скругление углов": "Скругление углов",
  "Внутренний отступ X": "Внутренний отступ X",
  "Внутренний отступ Y": "Внутренний отступ Y",
  "Подписи только на закрытии свечи": "Подписи только на закрытии свечи",
  "Показывать ZigZag": "Показывать ZigZag",
  "Цвет BUY": "Цвет BUY",
  "Цвет SELL": "Цвет SELL",
  "Показывать среднюю": "Показывать среднюю",
  "Период MA": "Период MA",
  "Цвет Up": "Цвет Up",
  "Цвет Down": "Цвет Down",
  "Цвет MA": "Цвет MA",
  "Толщина MA": "Толщина MA",
};

const indicatorLabelsUk: Record<string, string> = {
  /* RangeDetector */
  "Минимум баров (SMA)": "Мінімум барів (SMA)",
  "Ширина = ATR×": "Ширина = ATR×",
  "ATR период": "ATR період",
  "Скан истории (бары)": "Скан історії (бари)",
  "Продление": "Продовження",
  "N баров (для nBars)": "N барів (для nBars)",
  "Инвалидация": "Інвалідація",
  "Показывать сломанные": "Показувати зламані",
  "Макс. зон": "Макс. зон",
  "Шаг сканирования": "Крок сканування",
  "Анти-дубли (пропуск баров)": "Анти-дублі (пропуск барів)",
  "Прозрачность заливки": "Прозорість заливки",
  "Показывать рамку": "Показувати рамку",
  "Толщина рамки": "Товщина рамки",
  "Цвет: в диапазоне": "Колір: у діапазоні",
  "Цвет: пробой вверх": "Колір: пробій вгору",
  "Цвет: пробой вниз": "Колір: пробій вниз",
  "Цвет: сломанная": "Колір: зламана",

  /* OrderBlocks */
  "Сторона": "Сторона",
  "Пивот слева": "Півот зліва",
  "Пивот справа": "Півот справа",
  "Скан (бары)": "Скан (бари)",
  "BOS подтверждение": "BOS підтвердження",
  "OB поиск (бары назад)": "OB пошук (бари назад)",
  "Мин. импульс (×ATR)": "Мін. імпульс (×ATR)",
  "Метод зоны": "Метод зони",
  "N баров продления": "N барів продовження",
  "Митигейшн по": "Мітигейшн по",
  "Инвалидация по": "Інвалідація по",
  "Останов по событию": "Зупинка за подією",
  "Хранить митигированные": "Зберігати мітиговані",
  "Хранить сломанные": "Зберігати зламані",
  "TTL без касаний (0=off)": "TTL без дотиків (0=off)",
  "Анти-спам (пропуск баров)": "Анті-спам (пропуск барів)",
  "Макс. зон на сторону": "Макс. зон на сторону",
  "Сливать близкие": "Зливати близькі",
  "Слияние: допуск ×ATR": "Злиття: допуск ×ATR",
  "Слияние: разрыв (бары)": "Злиття: розрив (бари)",
  "Заливка (прозр.)": "Заливка (прозор.)",
  "Цвет Bull OB": "Колір Bull OB",
  "Цвет Bear OB": "Колір Bear OB",
  "Цвет Митиг.": "Колір Мітиг.",
  "Цвет Инвалид.": "Колір Інвалід.",

  /* ImbalanceSuite */
  "FVG: показывать": "FVG: показувати",
  "OG: показывать": "OG: показувати",
  "VI: показывать": "VI: показувати",
  "FVG: фильтр ширины": "FVG: фільтр ширини",
  "FVG: метод": "FVG: метод",
  "FVG: мин. ширина": "FVG: мін. ширина",
  "OG: фильтр ширины": "OG: фільтр ширини",
  "OG: метод": "OG: метод",
  "OG: мин. ширина": "OG: мін. ширина",
  "VI: фильтр ширины": "VI: фільтр ширини",
  "VI: метод": "VI: метод",
  "VI: мин. ширина": "VI: мін. ширина",
  "ATR период (для фильтра ATR)": "ATR період (для фільтра ATR)",
  "FVG: Extend (бары)": "FVG: Extend (бари)",
  "OG: Extend (бары)": "OG: Extend (бари)",
  "VI: Extend (бары)": "VI: Extend (бари)",
  "FVG Bull: заливка": "FVG Bull: заливка",
  "FVG Bear: заливка": "FVG Bear: заливка",
  "OG Bull: заливка": "OG Bull: заливка",
  "OG Bear: заливка": "OG Bear: заливка",

  /* Volume Profile */
  "Расположение": "Розташування",
  "Режим отображения": "Режим відображення",
  "Бары для анализа": "Бари для аналізу",
  "Количество строк (детализация)": "Кількість рядків (деталізація)",
  "Ширина профиля (%)": "Ширина профілю (%)",
  "Прозрачность профиля": "Прозорість профілю",
  "Прозрачность линий POC": "Прозорість ліній POC",
  "Цвет Покупок": "Колір Покупок",
  "Цвет Продаж": "Колір Продажів",
  "Выделять макс. объем (POC)": "Виділяти макс. об'єм (POC)",
  "Цвет POC": "Колір POC",
  "Линия POC на весь экран": "Лінія POC на весь екран",

  /* Streak Hunter */
  "Минимум подряд свечей": "Мінімум свічок підряд",
  "Текст метки BUY": "Текст мітки BUY",
  "Текст метки SELL": "Текст мітки SELL",

  /* Imbalance Signals */
  "Сигналы: включить": "Сигнали: увімкнути",
  "FVG: сигналы": "FVG: сигнали",
  "OG: сигналы": "OG: сигнали",
  "VI: сигналы": "VI: сигнали",
  "Глобальный кулдаун (баров)": "Глобальний кулдаун (барів)",
  "Цвет текста BUY": "Колір тексту BUY",
  "Цвет текста SELL": "Колір тексту SELL",
  "Статистика: включить": "Статистика: увімкнути",
  "Экспирация N (баров)": "Експірація N (барів)",
  "Догон, баров (0 = как N)": "Догін, барів (0 = як N)",
  "Кол-во догонов (0..7)": "К-сть догонів (0..7)",
  "Окно статистики (баров)": "Вікно статистики (барів)",
  "HUD: показывать": "HUD: показувати",
  "HUD: позиция": "HUD: позиція",

  /* RSIZones */
  "Период RSI": "Період RSI",
  "Уровень перекупленности": "Рівень перекупленості",
  "Уровень перепроданности": "Рівень перепроданості",
  "Цвет перекупленности": "Колір перекупленості",
  "Цвет перепроданности": "Колір перепроданості",
  "Цвет RSI": "Колір RSI",
  "Толщина линии": "Товщина лінії",
  "Динамический цвет": "Динамічний колір",
  "Линия 50": "Лінія 50",

  /* ZigZag */
  "Чувствительность (ATR×)": "Чутливість (ATR×)",
  "Цвет линии": "Колір лінії",
  "Показать точки": "Показати точки",
  "Цвет максимумов": "Колір максимумів",
  "Цвет минимумов": "Колір мінімумів",
  "Размер точек": "Розмір точок",
  "Показать метки": "Показати мітки",
  "Размер меток": "Розмір міток",

  /* SuperTrend */
  "ATR Период": "ATR Період",
  "Множитель ATR": "Множник ATR",
  "Язык текста (RU/EN)": "Мова тексту (RU/EN)",
  "Линия ↑ (включить)": "Лінія ↑ (увімкнути)",
  "Цвет линии ↑": "Колір лінії ↑",
  "Толщина линии ↑": "Товщина лінії ↑",
  "Линия ↓ (включить)": "Лінія ↓ (увімкнути)",
  "Цвет линии ↓": "Колір лінії ↓",
  "Толщина линии ↓": "Товщина лінії ↓",
  "Показывать подписи": "Показувати підписи",
  "Текст BUY": "Текст BUY",
  "Текст SELL": "Текст SELL",
  "Цвет текста подписи": "Колір тексту підпису",
  "Смещение X подписи": "Зсув X підпису",
  "Смещение Y подписи": "Зсув Y підпису",
  "Скругление углов": "Скруглення кутів",
  "Внутренний отступ X": "Внутрішній відступ X",
  "Внутренний отступ Y": "Внутрішній відступ Y",
  "Подписи только на закрытии свечи": "Підписи тільки на закритті свічки",

  /* Volumes */
  "Показывать среднюю": "Показувати середню",
  "Период MA": "Період MA",
  "Цвет Up": "Колір Up",
  "Цвет Down": "Колір Down",
  "Цвет MA": "Колір MA",
  "Толщина MA": "Товщина MA",

  /* ZigZagChannels */
  "Длина окна": "Довжина вікна",
  "Продлевать к последней свече": "Продовжувати до останньої свічки",
  "Показывать границы канала": "Показувати межі каналу",
  "Показывать точки": "Показувати точки",
  "Цвет ZigZag": "Колір ZigZag",
  "Цвет верхней границы": "Колір верхньої межі",
  "Цвет нижней границы": "Колір нижньої межі",
  "Толщина ZigZag": "Товщина ZigZag",
  "Толщина границ": "Товщина меж",
  "Стиль ZigZag": "Стиль ZigZag",
  "Стиль границ": "Стиль меж",
  "Ограничение истории": "Обмеження історії",

  /* AdaptiveTrendFinder — already English, Ukrainian translation */
  "Short Channel (20-200)": "Короткий канал (20-200)",
  "Short Color": "Колір короткого",
  "Long Channel (300-1200)": "Довгий канал (300-1200)",
  "Long Color": "Колір довгого",
  "Show Previous Channel": "Показувати попередній канал",
  "Previous Channel Color": "Колір попереднього каналу",
  "Show Midline": "Показувати середню лінію",
  "Midline Color": "Колір середньої лінії",
  "Deviation Mult": "Множник відхилення",
  "Log Scale": "Лог. шкала",
  "Line Width": "Товщина лінії",
  "Line Style": "Стиль лінії",
  "Auto Color (Strong Trend)": "Авто-колір (сильний тренд)",

  /* RegressionChannel */
  "Длина LinReg": "Довжина LinReg",
  "Источник": "Джерело",
  "Верхнее отклонение": "Верхнє відхилення",
  "Множитель верхнего": "Множник верхнього",
  "Нижнее отклонение": "Нижнє відхилення",
  "Множитель нижнего": "Множник нижнього",
  "Продлить влево": "Продовжити ліворуч",
  "Продлить вправо": "Продовжити праворуч",
  "Показывать R Пирсона": "Показувати R Пірсона",
  "Цвет верхней линии": "Колір верхньої лінії",
  "Цвет нижней линии": "Колір нижньої лінії",
  "Цвет базовой линии": "Колір базової лінії",
  "Алерт входа": "Сповіщення входу",
  "Алерт выхода": "Сповіщення виходу",
  "Период ретроспективы": "Період ретроспективи",
  "Показывать сигналы": "Показувати сигнали",

  /* SRZones */
  "Период поиска": "Період пошуку",
  "Фильтр дельты": "Фільтр дельти",
  "Ширина зоны (ATR)": "Ширина зони (ATR)",
  "Подсветка при касании": "Підсвітка при дотику",
  "Обычная прозрачность": "Звичайна прозорість",
  "Цвет BUY зоны": "Колір BUY зони",
  "Цвет SELL зоны": "Колір SELL зони",
  "Размер подписи": "Розмір підпису",
  "Старт SAR": "Старт SAR",
  "Шаг SAR": "Крок SAR",
  "Макс. SAR": "Макс. SAR",
  "Показывать ZigZag": "Показувати ZigZag",
  "Цвет BUY": "Колір BUY",
  "Цвет SELL": "Колір SELL",
};

const indicatorLabelsEn: Record<string, string> = {
  /* RangeDetector */
  "Минимум баров (SMA)": "Min bars (SMA)",
  "Ширина = ATR×": "Width = ATR×",
  "ATR период": "ATR period",
  "Скан истории (бары)": "History scan (bars)",
  "Продление": "Extension",
  "N баров (для nBars)": "N bars (for nBars)",
  "Инвалидация": "Invalidation",
  "Показывать сломанные": "Show broken",
  "Макс. зон": "Max zones",
  "Шаг сканирования": "Scan step",
  "Анти-дубли (пропуск баров)": "Anti-dupes (skip bars)",
  "Прозрачность заливки": "Fill opacity",
  "Показывать рамку": "Show border",
  "Толщина рамки": "Border width",
  "Цвет: в диапазоне": "Color: in range",
  "Цвет: пробой вверх": "Color: break up",
  "Цвет: пробой вниз": "Color: break down",
  "Цвет: сломанная": "Color: broken",

  /* OrderBlocks */
  "Сторона": "Side",
  "Пивот слева": "Left pivot",
  "Пивот справа": "Right pivot",
  "Скан (бары)": "Scan (bars)",
  "BOS подтверждение": "BOS confirmation",
  "OB поиск (бары назад)": "OB lookback (bars back)",
  "Мин. импульс (×ATR)": "Min impulse (×ATR)",
  "Метод зоны": "Zone method",
  "N баров продления": "N extension bars",
  "Митигейшн по": "Mitigation by",
  "Инвалидация по": "Invalidation by",
  "Останов по событию": "Stop on event",
  "Хранить митигированные": "Keep mitigated",
  "Хранить сломанные": "Keep broken",
  "TTL без касаний (0=off)": "TTL no touches (0=off)",
  "Анти-спам (пропуск баров)": "Anti-spam (skip bars)",
  "Макс. зон на сторону": "Max zones per side",
  "Сливать близкие": "Merge nearby",
  "Слияние: допуск ×ATR": "Merge: tolerance ×ATR",
  "Слияние: разрыв (бары)": "Merge: gap (bars)",
  "Заливка (прозр.)": "Fill (opacity)",
  "Цвет Bull OB": "Bull OB color",
  "Цвет Bear OB": "Bear OB color",
  "Цвет Митиг.": "Mitigated color",
  "Цвет Инвалид.": "Invalid color",

  /* ImbalanceSuite */
  "FVG: показывать": "FVG: show",
  "OG: показывать": "OG: show",
  "VI: показывать": "VI: show",
  "FVG: фильтр ширины": "FVG: width filter",
  "FVG: метод": "FVG: method",
  "FVG: мин. ширина": "FVG: min width",
  "OG: фильтр ширины": "OG: width filter",
  "OG: метод": "OG: method",
  "OG: мин. ширина": "OG: min width",
  "VI: фильтр ширины": "VI: width filter",
  "VI: метод": "VI: method",
  "VI: мин. ширина": "VI: min width",
  "ATR период (для фильтра ATR)": "ATR period (for ATR filter)",
  "FVG: Extend (бары)": "FVG: Extend (bars)",
  "OG: Extend (бары)": "OG: Extend (bars)",
  "VI: Extend (бары)": "VI: Extend (bars)",
  "FVG Bull: заливка": "FVG Bull: fill",
  "FVG Bear: заливка": "FVG Bear: fill",
  "OG Bull: заливка": "OG Bull: fill",
  "OG Bear: заливка": "OG Bear: fill",

  /* Volume Profile */
  "Расположение": "Position",
  "Режим отображения": "Display mode",
  "Бары для анализа": "Bars to analyze",
  "Количество строк (детализация)": "Row count (detail)",
  "Ширина профиля (%)": "Profile width (%)",
  "Прозрачность профиля": "Profile opacity",
  "Прозрачность линий POC": "POC line opacity",
  "Цвет Покупок": "Buy color",
  "Цвет Продаж": "Sell color",
  "Выделять макс. объем (POC)": "Highlight max volume (POC)",
  "Цвет POC": "POC color",
  "Линия POC на весь экран": "POC line across chart",

  /* Streak Hunter */
  "Минимум подряд свечей": "Minimum consecutive candles",
  "Текст метки BUY": "BUY label text",
  "Текст метки SELL": "SELL label text",

  /* Imbalance Signals */
  "Сигналы: включить": "Enable signals",
  "FVG: сигналы": "FVG: signals",
  "OG: сигналы": "OG: signals",
  "VI: сигналы": "VI: signals",
  "Глобальный кулдаун (баров)": "Global cooldown (bars)",
  "Цвет текста BUY": "BUY text color",
  "Цвет текста SELL": "SELL text color",
  "Статистика: включить": "Enable statistics",
  "Экспирация N (баров)": "Expiry N (bars)",
  "Догон, баров (0 = как N)": "Dogon bars (0 = use N)",
  "Кол-во догонов (0..7)": "Dogons count (0..7)",
  "Окно статистики (баров)": "Statistics window (bars)",
  "HUD: показывать": "Show HUD",
  "HUD: позиция": "HUD position",

  /* RSIZones */
  "Период RSI": "RSI period",
  "Уровень перекупленности": "Overbought level",
  "Уровень перепроданности": "Oversold level",
  "Цвет перекупленности": "Overbought color",
  "Цвет перепроданности": "Oversold color",
  "Цвет RSI": "RSI color",
  "Толщина линии": "Line width",
  "Динамический цвет": "Dynamic color",
  "Линия 50": "Line 50",

  /* ZigZag */
  "Чувствительность (ATR×)": "Sensitivity (ATR×)",
  "Цвет линии": "Line color",
  "Показать точки": "Show points",
  "Цвет максимумов": "High pivot color",
  "Цвет минимумов": "Low pivot color",
  "Размер точек": "Point size",
  "Показать метки": "Show labels",
  "Размер меток": "Label size",

  /* SuperTrend */
  "ATR Период": "ATR period",
  "Множитель ATR": "ATR multiplier",
  "Язык текста (RU/EN)": "Text language (RU/EN)",
  "Линия ↑ (включить)": "Enable up line",
  "Цвет линии ↑": "Up line color",
  "Толщина линии ↑": "Up line width",
  "Линия ↓ (включить)": "Enable down line",
  "Цвет линии ↓": "Down line color",
  "Толщина линии ↓": "Down line width",
  "Показывать подписи": "Show labels",
  "Текст BUY": "BUY text",
  "Текст SELL": "SELL text",
  "Цвет текста подписи": "Label text color",
  "Смещение X подписи": "Label X offset",
  "Смещение Y подписи": "Label Y offset",
  "Скругление углов": "Corner radius",
  "Внутренний отступ X": "Inner padding X",
  "Внутренний отступ Y": "Inner padding Y",
  "Подписи только на закрытии свечи": "Labels only on candle close",

  /* Volumes */
  "Показывать среднюю": "Show moving average",
  "Период MA": "MA period",
  "Цвет Up": "Up color",
  "Цвет Down": "Down color",
  "Цвет MA": "MA color",
  "Толщина MA": "MA width",

  /* ZigZagChannels */
  "Длина окна": "Window length",
  "Продлевать к последней свече": "Extend to last candle",
  "Показывать границы канала": "Show channel borders",
  "Показывать точки": "Show dots",
  "Цвет ZigZag": "ZigZag color",
  "Цвет верхней границы": "Upper border color",
  "Цвет нижней границы": "Lower border color",
  "Толщина ZigZag": "ZigZag width",
  "Толщина границ": "Border width",
  "Стиль ZigZag": "ZigZag style",
  "Стиль границ": "Border style",
  "Ограничение истории": "History limit",

  /* AdaptiveTrendFinder — already English */
  "Short Channel (20-200)": "Short Channel (20-200)",
  "Short Color": "Short Color",
  "Long Channel (300-1200)": "Long Channel (300-1200)",
  "Long Color": "Long Color",
  "Show Previous Channel": "Show Previous Channel",
  "Previous Channel Color": "Previous Channel Color",
  "Show Midline": "Show Midline",
  "Midline Color": "Midline Color",
  "Deviation Mult": "Deviation Mult",
  "Log Scale": "Log Scale",
  "Line Width": "Line Width",
  "Line Style": "Line Style",
  "Auto Color (Strong Trend)": "Auto Color (Strong Trend)",

  /* RegressionChannel */
  "Длина LinReg": "LinReg Length",
  "Источник": "Source",
  "Верхнее отклонение": "Upper Deviation",
  "Множитель верхнего": "Upper Mult",
  "Нижнее отклонение": "Lower Deviation",
  "Множитель нижнего": "Lower Mult",
  "Продлить влево": "Extend Left",
  "Продлить вправо": "Extend Right",
  "Показывать R Пирсона": "Show Pearson's R",
  "Цвет верхней линии": "Upper Line Color",
  "Цвет нижней линии": "Lower Line Color",
  "Цвет базовой линии": "Base Line Color",
  "Алерт входа": "Entry Alert",
  "Алерт выхода": "Exit Alert",
  "Период ретроспективы": "Lookback Period",
  "Показывать сигналы": "Show Signals",

  /* SRZones */
  "Период поиска": "Lookback Period",
  "Фильтр дельты": "Delta Filter",
  "Ширина зоны (ATR)": "Zone Width (ATR)",
  "Подсветка при касании": "Active Highlight",
  "Обычная прозрачность": "Idle Opacity",
  "Цвет BUY зоны": "BUY Zone Color",
  "Цвет SELL зоны": "SELL Zone Color",
  "Размер подписи": "Label Size",
  "Старт SAR": "SAR Start",
  "Шаг SAR": "SAR Step",
  "Макс. SAR": "SAR Max",
  "Показывать ZigZag": "Show ZigZag",
  "Цвет BUY": "BUY Color",
  "Цвет SELL": "SELL Color",
};

export const INDICATOR_LABEL_DICTS: Record<Locale, Record<string, string>> = {
  ru: indicatorLabelsRu,
  uk: indicatorLabelsUk,
  en: indicatorLabelsEn,
};

/* ─── Category name translations ─── */
/* Key = raw API category name (lowercase), Value = translated display name */

const categoryLabelsRu: Record<string, string> = {
  crypto: 'Крипто',
  cryptocurrency: 'Криптовалюты',
  forex: 'Форекс',
  currency: 'Валюты',
  stocks: 'Акции',
  stock: 'Акции',
  commodities: 'Сырьевые товары',
  commodity: 'Сырьевые товары',
  indices: 'Индексы',
  index: 'Индексы',
  metals: 'Металлы',
  energies: 'Энергия',
  shares: 'Акции',
  otc: 'OTC',
  futures: 'Фьючерсы',
  bonds: 'Облигации',
  etf: 'ETF',
  options: 'Опционы',
  cfd: 'CFD',
};

const categoryLabelsUk: Record<string, string> = {
  crypto: 'Крипто',
  cryptocurrency: 'Криптовалюти',
  forex: 'Форекс',
  currency: 'Валюти',
  stocks: 'Акції',
  stock: 'Акції',
  commodities: 'Сировинні товари',
  commodity: 'Сировинні товари',
  indices: 'Індекси',
  index: 'Індекси',
  metals: 'Метали',
  energies: 'Енергія',
  shares: 'Акції',
  otc: 'OTC',
  futures: "Ф'ючерси",
  bonds: 'Облігації',
  etf: 'ETF',
  options: 'Опціони',
  cfd: 'CFD',
};

const categoryLabelsEn: Record<string, string> = {
  crypto: 'Crypto',
  cryptocurrency: 'Cryptocurrency',
  forex: 'Forex',
  currency: 'Currency',
  stocks: 'Stocks',
  stock: 'Stocks',
  commodities: 'Commodities',
  commodity: 'Commodities',
  indices: 'Indices',
  index: 'Indices',
  metals: 'Metals',
  energies: 'Energies',
  shares: 'Shares',
  otc: 'OTC',
  futures: 'Futures',
  bonds: 'Bonds',
  etf: 'ETF',
  options: 'Options',
  cfd: 'CFD',
};

export const CATEGORY_LABEL_DICTS: Record<Locale, Record<string, string>> = {
  ru: categoryLabelsRu,
  uk: categoryLabelsUk,
  en: categoryLabelsEn,
};

/* ─── Context ─── */

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
  /** Translate indicator paramMeta label. Falls back to original. */
  tLabel: (label: string) => string;
  /** Translate category name. Falls back to original (capitalized). */
  tCategory: (name: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ru',
  setLocale: () => {},
  t: ru,
  tLabel: (l) => l,
  tCategory: (n) => n,
});

/* ─── Provider ─── */

const STORAGE_KEY = 'tc_locale';
const SETTINGS_STORAGE_KEY = 'tc_user_settings';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in DICTIONARIES;
}

function getStoredSettingsLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { locale?: unknown };
    return isLocale(parsed.locale) ? parsed.locale : null;
  } catch {
    return null;
  }
}

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;

    const settingsLocale = getStoredSettingsLocale();
    if (settingsLocale) return settingsLocale;
  } catch { /* SSR / privacy */ }
  return 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    if (l === locale) return;
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    void storageService.patchLocale(l);
  }, [locale]);

  const t = DICTIONARIES[locale];
  const labelDict = INDICATOR_LABEL_DICTS[locale];
  const tLabel = useCallback((label: string) => labelDict[label] || label, [labelDict]);
  const catDict = CATEGORY_LABEL_DICTS[locale];
  const tCategory = useCallback(
    (name: string) => catDict[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1),
    [catDict],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, tLabel, tCategory }}>
      {children}
    </I18nContext.Provider>
  );
}

/* ─── Hook ─── */

export function useI18n() {
  return useContext(I18nContext);
}
