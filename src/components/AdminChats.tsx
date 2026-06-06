import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useI18n, type Locale } from '../i18n';
import {
  ADMIN_CHAT_ICON_ACCEPT,
  ADMIN_CHAT_ICON_ALLOWED_TYPES,
  ADMIN_CHAT_ICON_MAX_SIZE,
  addAdminChatAnalyticsPairs,
  deleteAdminChatAnalyticsPairs,
  deleteAdminChatIcon,
  getAdminChat,
  getAdminChatAnalyticsPairs,
  listAdminChats,
  syncAdminChatsDefaults,
  updateAdminChat,
  uploadAdminChatIcon,
  type AdminChat,
  type AdminChatAnalyticsPairsConfig,
  type AdminChatUpdatePayload,
} from '../api/adminChats';
import { getCurrencyMapping } from '../api/admin';
import { resolveTmaMediaUrl } from '../tma/api';

interface AdminChatsProps {
  isActive: boolean;
  t: Record<string, string>;
}

const CHAT_LANGS = ['ru', 'en', 'uk'] as const;
const ANALYTICS_QUICK_TIMEFRAMES = [1, 2, 3] as const;

type ChatLang = typeof CHAT_LANGS[number];

interface ChatFormState {
  category: string;
  title: string;
  type: string;
  signal_mode: 'standard' | 'analytics';
  visible: boolean;
  img_path: string;
  expiration: string;
  titles: Record<ChatLang, string>;
}

function chatKey(chatId: string | number): string {
  return String(chatId);
}

function buildFormState(chat: AdminChat): ChatFormState {
  return {
    category: chat.category ?? '',
    title: chat.title ?? '',
    type: chat.type ?? '',
    signal_mode: chat.signal_mode === 'analytics' ? 'analytics' : 'standard',
    visible: Boolean(chat.visible),
    img_path: chat.img_path ?? '',
    expiration: chat.expiration == null ? '' : String(chat.expiration),
    titles: {
      ru: chat.titles?.ru ?? '',
      en: chat.titles?.en ?? '',
      uk: chat.titles?.uk ?? '',
    },
  };
}

function normalizeNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePairs(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  }

  if (typeof value === 'string') {
    return [...new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    )];
  }

  return [];
}

function normalizeAnalyticsTimeframes(
  value: Record<string, number[]> | null | undefined,
  selectedPairs: string[] | string | null | undefined,
): Record<string, number[]> {
  const pairs = new Set(normalizePairs(selectedPairs));

  if (value && typeof value === 'object') {
    Object.keys(value).forEach((pair) => {
      const normalized = pair.trim().toLowerCase();
      if (normalized) pairs.add(normalized);
    });
  }

  return Array.from(pairs)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, number[]>>((accumulator, pair) => {
      const raw = value?.[pair] ?? [];
      const timeframes = Array.isArray(raw)
        ? [...new Set(
          raw
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0),
        )].sort((left, right) => left - right)
        : [];
      accumulator[pair] = timeframes;
      return accumulator;
    }, {});
}

function parseAnalyticsTimeframesInput(value: string): { valid: boolean; timeframes: number[] } {
  const normalized = value.trim();
  if (!normalized) return { valid: true, timeframes: [] };

  const tokens = normalized
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { valid: true, timeframes: [] };

  const parsed = tokens.map((token) => Number(token));
  const valid = parsed.every((item) => Number.isInteger(item) && item > 0);
  if (!valid) return { valid: false, timeframes: [] };

  return {
    valid: true,
    timeframes: [...new Set(parsed)].sort((left, right) => left - right),
  };
}

function formatAnalyticsTimeframesInput(timeframes: number[]): string {
  return timeframes.join(', ');
}

function mergeAnalyticsChatConfig(chat: AdminChat, analyticsChat: AdminChatAnalyticsPairsConfig): AdminChat {
  return {
    ...chat,
    signal_mode: analyticsChat.signal_mode ?? chat.signal_mode,
    selected_pairs: analyticsChat.selected_pairs ?? chat.selected_pairs,
    analytics_timeframes: analyticsChat.analytics_timeframes ?? chat.analytics_timeframes,
  };
}

function getLocalizedTitle(chat: AdminChat, locale: Locale): string {
  return chat.titles?.[locale] || chat.titles?.ru || chat.titles?.en || chat.title || chatKey(chat.chat_id);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateIcon(file: File, t: Record<string, string>): string | null {
  if (!ADMIN_CHAT_ICON_ALLOWED_TYPES.includes(file.type)) return t.adminInvalidFormat;
  if (file.size > ADMIN_CHAT_ICON_MAX_SIZE) return t.adminFileTooLarge;
  return null;
}

function buildUpdatePayload(chat: AdminChat, form: ChatFormState): AdminChatUpdatePayload {
  const payload: AdminChatUpdatePayload = {};

  const nextCategory = normalizeNullableString(form.category);
  const currentCategory = normalizeNullableString(chat.category ?? '');
  if (nextCategory !== currentCategory) payload.category = nextCategory;

  const nextTitle = normalizeNullableString(form.title);
  const currentTitle = normalizeNullableString(chat.title ?? '');
  if (nextTitle !== currentTitle) payload.title = nextTitle;

  const nextType = normalizeNullableString(form.type);
  const currentType = normalizeNullableString(chat.type ?? '');
  if (nextType !== currentType) payload.type = nextType;

  const nextSignalMode = form.signal_mode === 'analytics' ? 'analytics' : 'standard';
  const currentSignalMode = chat.signal_mode === 'analytics' ? 'analytics' : 'standard';
  if (nextSignalMode !== currentSignalMode) payload.signal_mode = nextSignalMode;

  const nextImgPath = normalizeNullableString(form.img_path);
  const currentImgPath = normalizeNullableString(chat.img_path ?? '');
  if (nextImgPath !== currentImgPath) payload.img_path = nextImgPath;

  const nextVisible = Boolean(form.visible);
  if (nextVisible !== Boolean(chat.visible)) payload.visible = nextVisible;

  const normalizedExpiration = form.expiration.trim();
  const nextExpiration = normalizedExpiration ? Number(normalizedExpiration) : null;
  const currentExpiration = chat.expiration == null ? null : Number(chat.expiration);
  if (nextExpiration !== currentExpiration) payload.expiration = nextExpiration;

  const titlesPatch: Partial<Record<ChatLang, string>> = {};
  CHAT_LANGS.forEach((lang) => {
    const nextValue = normalizeNullableString(form.titles[lang]);
    const currentValue = normalizeNullableString(chat.titles?.[lang] ?? '');
    if (nextValue === currentValue || nextValue == null) return;
    titlesPatch[lang] = nextValue;
  });
  if (Object.keys(titlesPatch).length > 0) payload.titles = titlesPatch;

  return payload;
}

export function AdminChats({ isActive, t }: AdminChatsProps) {
  const { locale } = useI18n();
  const [chats, setChats] = useState<AdminChat[]>([]);
  const [mappedPairs, setMappedPairs] = useState<string[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<AdminChat | null>(null);
  const [form, setForm] = useState<ChatFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [syncing, setSyncing] = useState<'all' | 'selected' | null>(null);
  const [iconBusy, setIconBusy] = useState<'upload' | 'delete' | null>(null);
  const [search, setSearch] = useState('');
  const [signalModeFilter, setSignalModeFilter] = useState<'' | 'standard' | 'analytics'>('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [analyticsSearch, setAnalyticsSearch] = useState('');
  const [analyticsDraftPair, setAnalyticsDraftPair] = useState('');
  const [analyticsDraftTimeframes, setAnalyticsDraftTimeframes] = useState('');
  const [analyticsPairEditors, setAnalyticsPairEditors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncOptions, setSyncOptions] = useState({
    force_titles: false,
    force_category: false,
    force_title_field: false,
    force_expiration: false,
  });

  const loadChats = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    try {
      const data = await listAdminChats({
        onlyMissing,
        ...(signalModeFilter ? { signalMode: signalModeFilter } : {}),
      });
      setChats(data);
      setError(null);
      setSelectedChatId((prev) => {
        if (prev && data.some((chat) => chatKey(chat.chat_id) === prev)) return prev;
        return data[0] ? chatKey(data[0].chat_id) : null;
      });
    } catch (err) {
      setChats([]);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [isActive, onlyMissing, signalModeFilter]);

  const loadMappedPairs = useCallback(async () => {
    if (!isActive) return;
    setPairsLoading(true);
    try {
      const mapping = await getCurrencyMapping();
      const options = Array.from(
        new Set(
          mapping
            .map((item) => item.api_name?.trim().toLowerCase())
            .filter((item): item is string => Boolean(item)),
        ),
      ).sort((left, right) => left.localeCompare(right));
      setMappedPairs(options);
    } catch {
      setMappedPairs([]);
    } finally {
      setPairsLoading(false);
    }
  }, [isActive]);

  const applyUpdatedChat = useCallback((updated: AdminChat) => {
    setSelectedChat(updated);
    setForm(buildFormState(updated));
    setChats((prev) => prev.map((chat) => (chatKey(chat.chat_id) === chatKey(updated.chat_id) ? { ...chat, ...updated } : chat)));
  }, []);

  const loadChatDetails = useCallback(async (chatId: string) => {
    if (!isActive) return;
    setDetailLoading(true);
    try {
      const [chat, analyticsChat] = await Promise.all([
        getAdminChat(chatId),
        getAdminChatAnalyticsPairs(chatId),
      ]);
      const merged = mergeAnalyticsChatConfig(chat, analyticsChat);
      setSelectedChat(merged);
      setForm(buildFormState(merged));
      setError(null);
    } catch (err) {
      setSelectedChat(null);
      setForm(null);
      setError(formatError(err));
    } finally {
      setDetailLoading(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadChats();
  }, [isActive, loadChats]);

  useEffect(() => {
    if (!isActive) return;
    void loadMappedPairs();
  }, [isActive, loadMappedPairs]);

  useEffect(() => {
    if (selectedChatId || chats.length === 0) return;
    setSelectedChatId(chatKey(chats[0].chat_id));
  }, [chats, selectedChatId]);

  useEffect(() => {
    if (!isActive || !selectedChatId) {
      setSelectedChat(null);
      setForm(null);
      return;
    }
    void loadChatDetails(selectedChatId);
  }, [isActive, selectedChatId, loadChatDetails]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return chats;

    return chats.filter((chat) => {
      const haystack = [
        chatKey(chat.chat_id),
        chat.category ?? '',
        chat.title ?? '',
        chat.titles?.ru ?? '',
        chat.titles?.en ?? '',
        chat.titles?.uk ?? '',
        getLocalizedTitle(chat, locale),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [chats, locale, search]);

  const analyticsPairsMap = useMemo(() => {
    return normalizeAnalyticsTimeframes(selectedChat?.analytics_timeframes, selectedChat?.selected_pairs);
  }, [selectedChat]);

  const analyticsPairs = useMemo(() => Object.keys(analyticsPairsMap), [analyticsPairsMap]);

  useEffect(() => {
    setAnalyticsPairEditors(
      Object.fromEntries(
        Object.entries(analyticsPairsMap).map(([pair, timeframes]) => [pair, formatAnalyticsTimeframesInput(timeframes)]),
      ),
    );
  }, [analyticsPairsMap, selectedChatId]);

  const analyticsSuggestions = useMemo(() => {
    const query = analyticsSearch.trim().toLowerCase();
    const availablePairs = mappedPairs.filter((pair) => !analyticsPairs.includes(pair));
    const filtered = query ? availablePairs.filter((pair) => pair.includes(query)) : availablePairs;
    return filtered.slice(0, 12);
  }, [analyticsPairs, analyticsSearch, mappedPairs]);

  const handleFormField = useCallback(<K extends keyof Omit<ChatFormState, 'titles'>,>(field: K, value: ChatFormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const handleTitleField = useCallback((lang: ChatLang, value: string) => {
    setForm((prev) => (prev ? { ...prev, titles: { ...prev.titles, [lang]: value } } : prev));
  }, []);

  const handleSelectChat = useCallback((chat: AdminChat) => {
    setSelectedChatId(chatKey(chat.chat_id));
    setSuccess(null);
    setAnalyticsSearch('');
    setAnalyticsDraftPair('');
    setAnalyticsDraftTimeframes('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedChat || !form) return;

    const payload = buildUpdatePayload(selectedChat, form);
    if (Object.keys(payload).length === 0) {
      setError(t.adminChatsNothingToUpdate);
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminChat(selectedChat.chat_id, payload);
      applyUpdatedChat(updated);
      setSuccess(t.adminChatsSaved);
      await loadChats();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }, [applyUpdatedChat, form, loadChats, selectedChat, t.adminChatsNothingToUpdate, t.adminChatsSaved]);

  const handleSync = useCallback(async (scope: 'all' | 'selected') => {
    if (scope === 'selected' && !selectedChatId) return;

    setSyncing(scope);
    setError(null);
    setSuccess(null);
    try {
      const result = await syncAdminChatsDefaults({
        ...(scope === 'selected' && selectedChatId ? { chat_ids: [selectedChatId] } : {}),
        ...syncOptions,
      });
      setSuccess(`${t.adminChatsSyncDone}: ${t.adminChatsUpdated} ${result.updated}, ${t.adminChatsSkipped} ${result.skipped}`);
      await loadChats();
      if (selectedChatId) {
        await loadChatDetails(selectedChatId);
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSyncing(null);
    }
  }, [loadChatDetails, loadChats, selectedChatId, syncOptions, t.adminChatsSkipped, t.adminChatsSyncDone, t.adminChatsUpdated]);

  const handleIconUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedChat) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validationError = validateIcon(file, t);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIconBusy('upload');
    setError(null);
    setSuccess(null);
    try {
      const updated = await uploadAdminChatIcon(selectedChat.chat_id, file);
      applyUpdatedChat(updated);
      setSuccess(t.adminUploadSuccess);
      await loadChats();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIconBusy(null);
    }
  }, [applyUpdatedChat, loadChats, selectedChat, t]);

  const handleIconDelete = useCallback(async () => {
    if (!selectedChat || !selectedChat.img_path) return;
    if (!window.confirm(t.adminChatsConfirmDeleteIcon)) return;

    setIconBusy('delete');
    setError(null);
    setSuccess(null);
    try {
      const updated = await deleteAdminChatIcon(selectedChat.chat_id);
      applyUpdatedChat(updated);
      await loadChats();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIconBusy(null);
    }
  }, [applyUpdatedChat, loadChats, selectedChat, t.adminChatsConfirmDeleteIcon]);

  const handleRefreshAnalyticsConfig = useCallback(async (chatId: string | number) => {
    const [analyticsChat, fullChat] = await Promise.all([
      getAdminChatAnalyticsPairs(chatId),
      getAdminChat(chatId),
    ]);
    const merged = mergeAnalyticsChatConfig(fullChat, analyticsChat);
    applyUpdatedChat(merged);
    return merged;
  }, [applyUpdatedChat]);

  const handleAddAnalyticsPair = useCallback(async (
    pair: string,
    timeframes: number[],
    options?: { resetDraft?: boolean; resetSearch?: boolean },
  ) => {
    if (!selectedChat) return;
    const normalizedPair = pair.trim().toLowerCase();
    if (!normalizedPair) {
      setError(t.adminChatsAnalyticsPairRequired);
      setSuccess(null);
      return;
    }

    setAnalyticsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await addAdminChatAnalyticsPairs(selectedChat.chat_id, { [normalizedPair]: timeframes });
      await handleRefreshAnalyticsConfig(selectedChat.chat_id);
      await loadChats();
      if (options?.resetSearch) setAnalyticsSearch('');
      if (options?.resetDraft) {
        setAnalyticsDraftPair('');
        setAnalyticsDraftTimeframes('');
      }
      setSuccess(t.adminChatsSaved);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setAnalyticsBusy(false);
    }
  }, [handleRefreshAnalyticsConfig, loadChats, selectedChat, t.adminChatsAnalyticsPairRequired, t.adminChatsSaved]);

  const handleSaveAnalyticsDraft = useCallback(async () => {
    const parsed = parseAnalyticsTimeframesInput(analyticsDraftTimeframes);
    if (!parsed.valid) {
      setError(t.adminChatsAnalyticsTimeframesInvalid);
      setSuccess(null);
      return;
    }

    await handleAddAnalyticsPair(analyticsDraftPair, parsed.timeframes, { resetDraft: true, resetSearch: true });
  }, [analyticsDraftPair, analyticsDraftTimeframes, handleAddAnalyticsPair, t.adminChatsAnalyticsTimeframesInvalid]);

  const handleSaveExistingAnalyticsPair = useCallback(async (pair: string) => {
    const parsed = parseAnalyticsTimeframesInput(analyticsPairEditors[pair] ?? '');
    if (!parsed.valid) {
      setError(t.adminChatsAnalyticsTimeframesInvalid);
      setSuccess(null);
      return;
    }

    await handleAddAnalyticsPair(pair, parsed.timeframes);
  }, [analyticsPairEditors, handleAddAnalyticsPair, t.adminChatsAnalyticsTimeframesInvalid]);

  const handleRemoveAnalyticsPair = useCallback(async (pair: string) => {
    if (!selectedChat) return;
    setAnalyticsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminChatAnalyticsPairs(selectedChat.chat_id, [pair]);
      await handleRefreshAnalyticsConfig(selectedChat.chat_id);
      await loadChats();
      setSuccess(t.adminChatsSaved);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setAnalyticsBusy(false);
    }
  }, [handleRefreshAnalyticsConfig, loadChats, selectedChat, t.adminChatsSaved]);

  const selectedPreviewUrl = selectedChat?.img_path ? resolveTmaMediaUrl(selectedChat.img_path) : '';

  return (
    <div className="admin-chats">
      {error && <div className="admin-chats__message admin-chats__message--error">{error}</div>}
      {success && <div className="admin-chats__message admin-chats__message--success">{success}</div>}

      <div className="admin-chats__toolbar">
        <input
          className="admin-chats__search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.search}
        />

        <label className="admin-chats__field admin-chats__field--toolbar">
          <span>{t.adminChatsFilterMode}</span>
          <select
            className="admin-chats__input admin-chats__input--toolbar"
            value={signalModeFilter}
            onChange={(event) => setSignalModeFilter(event.target.value as '' | 'standard' | 'analytics')}
          >
            <option value="">{t.all}</option>
            <option value="standard">{t.adminChatsModeStandard}</option>
            <option value="analytics">{t.adminChatsModeAnalytics}</option>
          </select>
        </label>

        <label className="admin-chats__toggle">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(event) => setOnlyMissing(event.target.checked)}
          />
          <span>{t.adminChatsOnlyMissing}</span>
        </label>

        <button className="admin-chats__action-btn" type="button" onClick={() => void loadChats()} disabled={loading}>
          {loading ? '…' : t.adminChatsReload}
        </button>
        <button
          className="admin-chats__action-btn admin-chats__action-btn--primary"
          type="button"
          onClick={() => void handleSync('all')}
          disabled={syncing !== null}
        >
          {syncing === 'all' ? '…' : t.adminChatsSyncAll}
        </button>
        <button
          className="admin-chats__action-btn"
          type="button"
          onClick={() => void handleSync('selected')}
          disabled={syncing !== null || !selectedChatId}
        >
          {syncing === 'selected' ? '…' : t.adminChatsSyncSelected}
        </button>
      </div>

      <div className="admin-chats__sync-options">
        <label className="admin-chats__toggle">
          <input
            type="checkbox"
            checked={syncOptions.force_titles}
            onChange={(event) => setSyncOptions((prev) => ({ ...prev, force_titles: event.target.checked }))}
          />
          <span>{t.adminChatsForceTitles}</span>
        </label>
        <label className="admin-chats__toggle">
          <input
            type="checkbox"
            checked={syncOptions.force_category}
            onChange={(event) => setSyncOptions((prev) => ({ ...prev, force_category: event.target.checked }))}
          />
          <span>{t.adminChatsForceCategory}</span>
        </label>
        <label className="admin-chats__toggle">
          <input
            type="checkbox"
            checked={syncOptions.force_title_field}
            onChange={(event) => setSyncOptions((prev) => ({ ...prev, force_title_field: event.target.checked }))}
          />
          <span>{t.adminChatsForceTitleField}</span>
        </label>
        <label className="admin-chats__toggle">
          <input
            type="checkbox"
            checked={syncOptions.force_expiration}
            onChange={(event) => setSyncOptions((prev) => ({ ...prev, force_expiration: event.target.checked }))}
          />
          <span>{t.adminChatsForceExpiration}</span>
        </label>
      </div>

      <div className="admin-chats__layout">
        <div className="admin-chats__list">
          <div className="admin-chats__list-header">
            <span>{filteredChats.length} / {chats.length}</span>
          </div>

          {loading ? (
            <div className="admin-page__loading">
              <div className="loading__spinner" />
              {t.loading}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="admin-page__empty">{t.adminChatsNoChats}</div>
          ) : (
            filteredChats.map((chat) => {
              const isSelected = chatKey(chat.chat_id) === selectedChatId;
              const previewUrl = chat.img_path ? resolveTmaMediaUrl(chat.img_path) : '';
              return (
                <button
                  key={chatKey(chat.chat_id)}
                  type="button"
                  className={`admin-chats__card${isSelected ? ' admin-chats__card--selected' : ''}`}
                  onClick={() => handleSelectChat(chat)}
                >
                  <div className="admin-chats__card-thumb">
                    {previewUrl ? <img src={previewUrl} alt="" /> : <span>#</span>}
                  </div>
                  <div className="admin-chats__card-body">
                    <div className="admin-chats__card-top">
                      <div className="admin-chats__card-title">{getLocalizedTitle(chat, locale)}</div>
                      <span className={`admin-chats__visibility${chat.visible ? ' admin-chats__visibility--visible' : ' admin-chats__visibility--hidden'}`}>
                        {chat.visible ? t.adminChatsVisible : t.adminChatsHidden}
                      </span>
                    </div>
                    <div className="admin-chats__card-meta">{chatKey(chat.chat_id)}</div>
                    {chat.category && <div className="admin-chats__card-category">{chat.category}</div>}
                    <div className="admin-chats__badges">
                      {chat.has_missing_category && <span className="admin-chats__badge admin-chats__badge--warn">{t.adminChatsProblemCategory}</span>}
                      {chat.has_missing_titles && <span className="admin-chats__badge admin-chats__badge--warn">{t.adminChatsProblemTitles}</span>}
                      {chat.signal_mode === 'analytics' && <span className="admin-chats__badge admin-chats__badge--analytics">{t.adminChatsModeAnalytics}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="admin-chats__editor">
          {!selectedChatId ? (
            <div className="admin-page__empty">{t.adminChatsSelect}</div>
          ) : detailLoading || !selectedChat || !form ? (
            <div className="admin-page__loading">
              <div className="loading__spinner" />
              {t.loading}
            </div>
          ) : (
            <form
              className="admin-chats__form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div className="admin-chats__grid">
                <label className="admin-chats__field">
                  <span>{t.adminChatsChatId}</span>
                  <input className="admin-chats__input" type="text" value={chatKey(selectedChat.chat_id)} readOnly />
                </label>

                <label className="admin-chats__field">
                  <span>{t.adminChatsCategory}</span>
                  <input
                    className="admin-chats__input"
                    type="text"
                    value={form.category}
                    onChange={(event) => handleFormField('category', event.target.value)}
                  />
                </label>

                <label className="admin-chats__field">
                  <span>{t.adminChatsType}</span>
                  <input
                    className="admin-chats__input"
                    type="text"
                    value={form.type}
                    onChange={(event) => handleFormField('type', event.target.value)}
                  />
                </label>

                <label className="admin-chats__field">
                  <span>{t.adminChatsSignalMode}</span>
                  <select
                    className="admin-chats__input"
                    value={form.signal_mode}
                    onChange={(event) => handleFormField('signal_mode', event.target.value === 'analytics' ? 'analytics' : 'standard')}
                  >
                    <option value="standard">standard</option>
                    <option value="analytics">analytics</option>
                  </select>
                </label>

                <label className="admin-chats__field">
                  <span>{t.adminChatsExpiration}</span>
                  <input
                    className="admin-chats__input"
                    type="number"
                    min={1}
                    max={60}
                    value={form.expiration}
                    onChange={(event) => handleFormField('expiration', event.target.value)}
                  />
                </label>

                <label className="admin-chats__field admin-chats__field--wide">
                  <span>{t.adminChatsTitle}</span>
                  <input
                    className="admin-chats__input"
                    type="text"
                    value={form.title}
                    onChange={(event) => handleFormField('title', event.target.value)}
                  />
                </label>

                <label className="admin-chats__field admin-chats__field--wide">
                  <span>{t.adminChatsAnalyticsPairs}</span>
                  {form.signal_mode === 'analytics' ? (
                  <div className="admin-chats__analytics">
                    <div className="admin-chats__analytics-toolbar">
                      <input
                        className="admin-chats__input admin-chats__analytics-search"
                        type="text"
                        value={analyticsSearch}
                        onChange={(event) => setAnalyticsSearch(event.target.value)}
                        placeholder={t.adminChatsAnalyticsPairSearch}
                      />
                      <div className="admin-chats__analytics-inline">
                        <input
                          className="admin-chats__input admin-chats__analytics-inline-input"
                          type="text"
                          value={analyticsDraftPair}
                          onChange={(event) => setAnalyticsDraftPair(event.target.value)}
                          placeholder={t.adminChatsAnalyticsPairInput}
                        />
                        <input
                          className="admin-chats__input admin-chats__analytics-inline-input"
                          type="text"
                          value={analyticsDraftTimeframes}
                          onChange={(event) => setAnalyticsDraftTimeframes(event.target.value)}
                          placeholder={t.adminChatsAnalyticsTimeframesPlaceholder}
                        />
                        <button
                          className="admin-chats__action-btn admin-chats__action-btn--primary"
                          type="button"
                          disabled={analyticsBusy}
                          onClick={() => void handleSaveAnalyticsDraft()}
                        >
                          {analyticsBusy ? '…' : t.save}
                        </button>
                      </div>
                      <div className="admin-chats__analytics-hint">{t.adminChatsAnalyticsHint}</div>
                    </div>

                    <div className="admin-chats__analytics-block">
                      <div className="admin-chats__analytics-block-title">{t.adminChatsAnalyticsAvailablePairs}</div>
                      {pairsLoading ? (
                        <div className="admin-chats__analytics-empty">{t.loading}</div>
                      ) : analyticsSuggestions.length === 0 ? (
                        <div className="admin-chats__analytics-empty">{t.noResults}</div>
                      ) : (
                        <div className="admin-chats__analytics-list">
                          {analyticsSuggestions.map((pair) => (
                            <div key={pair} className="admin-chats__analytics-row admin-chats__analytics-row--available">
                              <div className="admin-chats__analytics-pair">{pair}</div>
                              <div className="admin-chats__analytics-actions">
                                <button
                                  className="admin-chats__analytics-chip"
                                  type="button"
                                  disabled={analyticsBusy}
                                  onClick={() => void handleAddAnalyticsPair(pair, [], { resetSearch: true })}
                                >
                                  {t.adminChatsAnalyticsAllTimeframes}
                                </button>
                                {ANALYTICS_QUICK_TIMEFRAMES.map((timeframe) => (
                                  <button
                                    key={`${pair}-${timeframe}`}
                                    className="admin-chats__analytics-chip"
                                    type="button"
                                    disabled={analyticsBusy}
                                    onClick={() => void handleAddAnalyticsPair(pair, [timeframe], { resetSearch: true })}
                                  >
                                    {timeframe}m
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="admin-chats__analytics-block">
                      <div className="admin-chats__analytics-block-title">{t.adminChatsAnalyticsSelectedPairs}</div>
                      {analyticsPairs.length === 0 ? (
                        <div className="admin-chats__analytics-empty">{t.adminChatsAnalyticsNoPairs}</div>
                      ) : (
                        <div className="admin-chats__analytics-list">
                          {analyticsPairs.map((pair) => {
                            const pairTimeframes = analyticsPairsMap[pair] ?? [];
                            return (
                              <div key={pair} className="admin-chats__analytics-row">
                                <div className="admin-chats__analytics-main">
                                  <div className="admin-chats__analytics-pair">{pair}</div>
                                  <div className="admin-chats__analytics-meta">
                                    {pairTimeframes.length === 0
                                      ? t.adminChatsAnalyticsAllTimeframes
                                      : `${t.adminChatsExpiration}: ${pairTimeframes.join(', ')}`}
                                  </div>
                                </div>
                                <input
                                  className="admin-chats__input admin-chats__analytics-inline-input admin-chats__analytics-timeframes"
                                  type="text"
                                  value={analyticsPairEditors[pair] ?? formatAnalyticsTimeframesInput(pairTimeframes)}
                                  onChange={(event) => setAnalyticsPairEditors((prev) => ({ ...prev, [pair]: event.target.value }))}
                                  placeholder={t.adminChatsAnalyticsTimeframesPlaceholder}
                                />
                                <div className="admin-chats__analytics-actions">
                                  <button
                                    className="admin-chats__analytics-chip admin-chats__analytics-chip--active"
                                    type="button"
                                    disabled={analyticsBusy}
                                    onClick={() => void handleAddAnalyticsPair(pair, [])}
                                  >
                                    {t.adminChatsAnalyticsAllTimeframes}
                                  </button>
                                  <button
                                    className="admin-chats__analytics-chip"
                                    type="button"
                                    disabled={analyticsBusy}
                                    onClick={() => void handleSaveExistingAnalyticsPair(pair)}
                                  >
                                    {t.save}
                                  </button>
                                  <button
                                    className="admin-chats__analytics-chip admin-chats__analytics-chip--danger"
                                    type="button"
                                    disabled={analyticsBusy}
                                    onClick={() => void handleRemoveAnalyticsPair(pair)}
                                  >
                                    {t.remove}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  ) : (
                    <div className="admin-chats__analytics-empty">{t.adminChatsModeStandard}</div>
                  )}
                </label>

                <label className="admin-chats__field admin-chats__field--wide admin-chats__checkbox-field">
                  <span>{form.visible ? t.adminChatsVisible : t.adminChatsHidden}</span>
                  <input
                    type="checkbox"
                    checked={form.visible}
                    onChange={(event) => handleFormField('visible', event.target.checked)}
                  />
                </label>

                <div className="admin-chats__field admin-chats__field--wide">
                  <span>{t.adminChatsTitles}</span>
                  <div className="admin-chats__lang-grid">
                    {CHAT_LANGS.map((lang) => (
                      <label key={lang} className="admin-chats__lang-field">
                        <span>{lang.toUpperCase()}</span>
                        <input
                          className="admin-chats__input"
                          type="text"
                          value={form.titles[lang]}
                          onChange={(event) => handleTitleField(lang, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <label className="admin-chats__field admin-chats__field--wide">
                  <span>{t.adminChatsImagePath}</span>
                  <input
                    className="admin-chats__input"
                    type="text"
                    value={form.img_path}
                    onChange={(event) => handleFormField('img_path', event.target.value)}
                  />
                </label>
              </div>

              <div className="admin-chats__media">
                <div className="admin-chats__preview">
                  {selectedPreviewUrl ? <img src={selectedPreviewUrl} alt="" /> : <span>{t.adminChatsImagePath}</span>}
                </div>

                <div className="admin-chats__media-actions">
                  <label className="admin-chats__file-btn">
                    <span>{iconBusy === 'upload' ? '…' : t.adminUploadFile}</span>
                    <input
                      type="file"
                      accept={ADMIN_CHAT_ICON_ACCEPT}
                      onChange={handleIconUpload}
                      disabled={iconBusy !== null}
                    />
                  </label>
                  <button
                    className="admin-chats__action-btn admin-chats__action-btn--danger"
                    type="button"
                    onClick={() => void handleIconDelete()}
                    disabled={!selectedChat.img_path || iconBusy !== null}
                  >
                    {iconBusy === 'delete' ? '…' : t.remove}
                  </button>
                </div>
              </div>

              <div className="admin-chats__actions">
                <button
                  className="admin-chats__action-btn"
                  type="button"
                  onClick={() => void handleSync('selected')}
                  disabled={syncing !== null}
                >
                  {syncing === 'selected' ? '…' : t.adminChatsSyncSelected}
                </button>
                <button className="admin-chats__action-btn admin-chats__action-btn--primary" type="submit" disabled={saving}>
                  {saving ? '…' : t.save}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}