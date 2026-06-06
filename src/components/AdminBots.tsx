import { useCallback, useEffect, useMemo, useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  MaterialReactTable,
  MRT_EditActionButtons,
  type MRT_ColumnDef,
  type MRT_TableInstance,
  type MRT_TableOptions,
  useMaterialReactTable,
} from 'material-react-table';
import {
  createAdminBot,
  clearAdminBotPartnerConfig,
  listAdminBots,
  updateAdminBot,
  updateAdminBotPartnerConfig,
  type AdminBot,
  type AdminBotCreatePayload,
  type AdminBotPartnerConfigPayload,
  type AdminBotUpdatePayload,
} from '../api/adminBots';
import routes from '../configs/routes';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminBotsProps {
  isActive: boolean;
  t: Record<string, string>;
}

interface PartnerConfigForm {
  ref_uid: string;
  partner_link_id: string;
  partner_login: string;
  partner_login_masked: string;
  partner_password: string;
  has_partner_password: boolean;
  affiliate_email: string;
  affiliate_name: string;
  affiliate_access_enabled: boolean;
  has_affiliate_api_key: boolean;
  affiliate_links_count: number;
}

interface CreateBotForm {
  bot_username: string;
  bot_token: string;
  channel_name: string;
  telegram_link: string;
  ref_code: string;
  is_active: boolean;
}

interface EditBotForm {
  channel_name: string;
  telegram_link: string;
  ref_code: string;
  is_active: boolean;
  technical_work_enabled: boolean;
  technical_banner_text: string;
}

interface RegistrationProbeResult {
  ok: boolean;
  status: number;
  requestBody: Record<string, unknown>;
  responseText: string;
}

type EditBotSaveArgs = Parameters<NonNullable<MRT_TableOptions<AdminBot>['onEditingRowSave']>>[0];
type CreateBotSaveArgs = Parameters<NonNullable<MRT_TableOptions<AdminBot>['onCreatingRowSave']>>[0];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDefaultForm(bot?: AdminBot | null): PartnerConfigForm {
  return {
    ref_uid: bot?.partner_config?.ref_uid ?? '',
    partner_link_id: bot?.partner_config?.partner_link_id ?? '',
    partner_login: '',
    partner_login_masked: bot?.partner_config?.partner_login_masked ?? '',
    partner_password: '',
    has_partner_password: bot?.partner_config?.has_partner_password ?? false,
    affiliate_email: bot?.partner_config?.affiliate_email ?? '',
    affiliate_name: bot?.partner_config?.affiliate_name ?? '',
    affiliate_access_enabled: bot?.partner_config?.affiliate_access_enabled ?? false,
    has_affiliate_api_key: bot?.partner_config?.has_affiliate_api_key ?? false,
    affiliate_links_count: bot?.partner_config?.affiliate_links_count ?? 0,
  };
}

function createDefaultCreateBotForm(): CreateBotForm {
  return {
    bot_username: '',
    bot_token: '',
    channel_name: '',
    telegram_link: '',
    ref_code: '',
    is_active: true,
  };
}

function createDefaultEditBotForm(bot?: AdminBot | null): EditBotForm {
  return {
    channel_name: bot?.channel_name ?? '',
    telegram_link: bot?.telegram_link ?? '',
    ref_code: bot?.ref_code ?? '',
    is_active: bot?.is_active ?? true,
    technical_work_enabled: bot?.technical_work_enabled ?? false,
    technical_banner_text: bot?.technical_banner_text ?? '',
  };
}

function normalizeBotUsername(value: string): string {
  return value.trim().replace(/^@+/, '');
}

function normalizeRefCode(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function randomString(len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function buildRandomTestCredentials(): { email: string; password: string } {
  const suffix = `${Date.now()}_${randomString(6)}`;
  return {
    email: `autotest_${suffix}@example.com`,
    password: `Tst_${randomString(10)}!A1`,
  };
}

function getPublicAuthApiBase(): string {
  return ((import.meta.env.VITE_PAGES_API_URL as string | undefined) ?? 'https://api.po-terminal.com').replace(/\/+$/, '');
}

function buildAdminBotReferralLink(
  refCode: string | null | undefined,
  partnerLinkId?: string | null,
): string {
  const normalizedRef = normalizeRefCode(refCode);
  if (!normalizedRef) return '';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = new URL(routes.Register, origin || 'http://localhost');
  url.searchParams.set('ref', normalizedRef);
  const normalizedAl = (partnerLinkId ?? '').trim();
  if (normalizedAl) {
    url.searchParams.set('al', normalizedAl);
  }
  return origin ? url.toString() : `${routes.Register}?${url.searchParams.toString()}`;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function getCreateBotPayload(form: CreateBotForm): AdminBotCreatePayload {
  const botUsername = normalizeBotUsername(form.bot_username);
  const payload: AdminBotCreatePayload = {
    bot_username: botUsername,
    is_active: form.is_active,
  };

  const botToken = form.bot_token.trim();
  const channelName = form.channel_name.trim();
  const telegramLink = form.telegram_link.trim();
  const refCode = form.ref_code.trim();

  if (botToken) payload.bot_token = botToken;
  if (channelName) payload.channel_name = channelName;
  if (telegramLink) payload.telegram_link = telegramLink;
  if (refCode) payload.ref_code = refCode;

  return payload;
}

function getPartnerConfigPayload(bot: AdminBot, form: PartnerConfigForm): AdminBotPartnerConfigPayload {
  const payload: AdminBotPartnerConfigPayload = {};
  const refUid = form.ref_uid.trim();
  const partnerLinkId = form.partner_link_id.trim();
  const partnerLogin = form.partner_login.trim();
  const partnerPassword = form.partner_password.trim();
  const affiliateEmail = form.affiliate_email.trim();
  const affiliateName = form.affiliate_name.trim();

  if (refUid !== (bot.partner_config.ref_uid ?? '')) payload.ref_uid = refUid;
  if (partnerLinkId !== (bot.partner_config.partner_link_id ?? '')) payload.partner_link_id = partnerLinkId;
  if (partnerLogin) payload.partner_login = partnerLogin;
  if (partnerPassword) payload.partner_password = partnerPassword;
  if (affiliateEmail !== (bot.partner_config.affiliate_email ?? '')) payload.affiliate_email = affiliateEmail;
  if (affiliateName !== (bot.partner_config.affiliate_name ?? '')) payload.affiliate_name = affiliateName;
  if (form.affiliate_access_enabled !== (bot.partner_config.affiliate_access_enabled ?? false)) {
    payload.affiliate_access_enabled = form.affiliate_access_enabled;
  }

  return payload;
}

function getEditBotPayload(bot: AdminBot, form: EditBotForm): AdminBotUpdatePayload {
  const payload: AdminBotUpdatePayload = {};
  const channelName = form.channel_name.trim();
  const telegramLink = form.telegram_link.trim();
  const refCode = normalizeRefCode(form.ref_code);
  const technicalBannerText = form.technical_banner_text.trim();

  if (channelName !== (bot.channel_name ?? '')) payload.channel_name = channelName;
  if (telegramLink !== (bot.telegram_link ?? '')) payload.telegram_link = telegramLink;
  if (refCode !== normalizeRefCode(bot.ref_code)) payload.ref_code = refCode;
  if (form.is_active !== bot.is_active) payload.is_active = form.is_active;
  if (form.technical_work_enabled !== bot.technical_work_enabled) payload.technical_work_enabled = form.technical_work_enabled;
  if (technicalBannerText !== (bot.technical_banner_text ?? '')) {
    payload.technical_banner_text = technicalBannerText || null;
  }

  return payload;
}

function renderBooleanChip(value: boolean, positive: string, negative: string) {
  return (
    <Chip
      color={value ? 'success' : 'default'}
      label={value ? positive : negative}
      size="small"
      variant={value ? 'filled' : 'outlined'}
    />
  );
}

function renderSecretChips(bot: AdminBot) {
  const chips = [
    bot.partner_config.ref_uid ? <Chip key="ref" color="primary" label={`ref_uid ${bot.partner_config.ref_uid}`} size="small" /> : null,
    bot.partner_config.partner_link_id ? <Chip key="plink" color="primary" label={`link_id ${bot.partner_config.partner_link_id}`} size="small" variant="outlined" /> : null,
    bot.partner_config.partner_login_masked ? <Chip key="login" label={bot.partner_config.partner_login_masked} size="small" variant="outlined" /> : null,
    bot.partner_config.affiliate_email ? <Chip key="affiliate-email" color="secondary" label={`affiliate ${bot.partner_config.affiliate_email}`} size="small" variant="outlined" /> : null,
    bot.partner_config.affiliate_name ? <Chip key="affiliate-name" color="secondary" label={bot.partner_config.affiliate_name} size="small" /> : null,
    bot.partner_config.affiliate_access_enabled ? <Chip key="affiliate-access" color="success" label="Affiliate access" size="small" /> : null,
    bot.partner_config.has_affiliate_api_key ? <Chip key="affiliate-api-key" color="secondary" label="API key" size="small" variant="outlined" /> : null,
    bot.partner_config.affiliate_links_count > 0 ? <Chip key="affiliate-links" color="secondary" label={`Links ${bot.partner_config.affiliate_links_count}`} size="small" variant="outlined" /> : null,
    bot.partner_config.has_partner_password ? <Chip key="pass" color="success" label="Пароль" size="small" /> : null,
  ].filter(Boolean);

  if (chips.length === 0) {
    return <Chip label="Не настроено" size="small" variant="outlined" />;
  }

  return <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>{chips}</Stack>;
}

function FieldInfoButton({ description }: { description: string }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        aria-label="Описание поля"
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="small"
      >
        <InfoOutlinedIcon fontSize="inherit" />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Typography sx={{ maxWidth: 280, px: 1.5, py: 1, whiteSpace: 'pre-line' }} variant="body2">
          {description}
        </Typography>
      </Popover>
    </>
  );
}

function fieldInfoAdornment(description: string) {
  return (
    <InputAdornment position="end">
      <FieldInfoButton description={description} />
    </InputAdornment>
  );
}

export function AdminBots({ isActive }: AdminBotsProps) {
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [form, setForm] = useState<PartnerConfigForm>(createDefaultForm());
  const [createForm, setCreateForm] = useState<CreateBotForm>(createDefaultCreateBotForm());
  const [editForm, setEditForm] = useState<EditBotForm>(createDefaultEditBotForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeOutput, setProbeOutput] = useState<string>('');

  const loadBots = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminBots();
      setBots(data);
    } catch (err) {
      setBots([]);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadBots();
  }, [isActive, loadBots]);

  const handleSaveBot: MRT_TableOptions<AdminBot>['onEditingRowSave'] = useCallback(
    async ({ exitEditingMode, row }: EditBotSaveArgs) => {
      const bot = row.original;
      const botPayload = getEditBotPayload(bot, editForm);
      const payload = getPartnerConfigPayload(bot, form);

      if (Object.keys(payload).length === 0 && Object.keys(botPayload).length === 0) {
        setError('Нет изменений для сохранения');
        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        let updated = bot;

        if (Object.keys(botPayload).length > 0) {
          updated = await updateAdminBot(bot.bot_username, botPayload);
        }

        if (Object.keys(payload).length > 0) {
          updated = await updateAdminBotPartnerConfig(bot.bot_username, payload);
        }

        setBots((prev) => prev.map((item) => (item.bot_username === updated.bot_username ? updated : item)));
        setEditForm(createDefaultEditBotForm(updated));
        setForm(createDefaultForm(updated));
        setSuccess(`Бот @${updated.bot_username} обновлён`);
        exitEditingMode();
      } catch (err) {
        setError(formatError(err));
      } finally {
        setSaving(false);
      }
    },
    [editForm, form],
  );

  const handleCreateBot: MRT_TableOptions<AdminBot>['onCreatingRowSave'] = useCallback(
    async ({ exitCreatingMode }: CreateBotSaveArgs) => {
      const normalizedUsername = normalizeBotUsername(createForm.bot_username);
      if (!normalizedUsername) {
        setError('Поле bot_username обязательно');
        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const payload = getCreateBotPayload(createForm);
        const created = await createAdminBot(payload);
        setBots((prev) => [created, ...prev]);
        setCreateForm(createDefaultCreateBotForm());
        setSuccess(`Бот @${created.bot_username} успешно создан`);
        exitCreatingMode();
      } catch (err) {
        setError(formatError(err));
      } finally {
        setSaving(false);
      }
    },
    [createForm],
  );

  const handleClearBot = useCallback(async (bot: AdminBot, table: MRT_TableInstance<AdminBot>) => {
    if (!window.confirm(`Очистить partner config для @${bot.bot_username}?`)) return;

    setClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await clearAdminBotPartnerConfig(bot.bot_username);
      setBots((prev) => prev.map((item) => (item.bot_username === updated.bot_username ? updated : item)));
      setEditForm(createDefaultEditBotForm(updated));
      setForm(createDefaultForm(updated));
      setSuccess(`Партнёрская конфигурация бота @${updated.bot_username} очищена`);
      table.setEditingRow(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setClearing(false);
    }
  }, []);

  const handleCopyReferralLink = useCallback(async (bot: AdminBot) => {
    const link = buildAdminBotReferralLink(bot.ref_code, bot.partner_config.partner_link_id);
    if (!link) {
      setError(`У бота @${bot.bot_username} нет ref_code`);
      return;
    }

    setError(null);
    try {
      await copyToClipboard(link);
      setSuccess(`Реферальная ссылка для @${bot.bot_username} скопирована`);
    } catch (err) {
      setError(formatError(err));
    }
  }, []);

  const handleProbeRegistration = useCallback(async (bot: AdminBot) => {
    const refCode = normalizeRefCode(editForm.ref_code || bot.ref_code);
    const al = (form.partner_link_id || bot.partner_config.partner_link_id || '').trim();

    if (!refCode) {
      setError('Невозможно выполнить тест: отсутствует ref_code');
      return;
    }

    if (!al) {
      setError('Невозможно выполнить тест: отсутствует partner_link_id (al)');
      return;
    }

    const creds = buildRandomTestCredentials();
    const requestBody: Record<string, unknown> = {
      email: creds.email,
      password: creds.password,
      ref_code: refCode,
      al,
    };

    setProbeLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getPublicAuthApiBase()}/api/terminal/v2/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const raw = await response.text();
      const result: RegistrationProbeResult = {
        ok: response.ok,
        status: response.status,
        requestBody,
        responseText: raw,
      };

      const prettyResponse = (() => {
        try {
          return JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          return raw || '<empty>';
        }
      })();

      setProbeOutput([
        `ok: ${result.ok}`,
        `status: ${result.status}`,
        '',
        'request:',
        JSON.stringify(result.requestBody, null, 2),
        '',
        'response:',
        prettyResponse,
      ].join('\n'));

      setSuccess(`Тест регистрации выполнен (status ${response.status})`);
    } catch (err) {
      setProbeOutput('');
      setError(formatError(err));
    } finally {
      setProbeLoading(false);
    }
  }, [editForm.ref_code, form.partner_link_id]);

  const columns = useMemo<MRT_ColumnDef<AdminBot>[]>(
    () => [
      {
        accessorKey: 'bot_username',
        header: 'Бот',
        enableEditing: false,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontWeight: 700 }}>@{row.original.bot_username}</Typography>
            <Typography color="text.secondary" variant="caption">
              {row.original.channel_name || 'Без названия канала'}
            </Typography>
          </Stack>
        ),
      },
      {
        accessorKey: 'ref_code',
        header: 'Ref code',
        enableEditing: false,
        Cell: ({ cell }) => cell.getValue<string | null>() || '—',
      },
      {
        id: 'referral_link',
        header: 'Referral link',
        accessorFn: (row) => buildAdminBotReferralLink(row.ref_code, row.partner_config.partner_link_id),
        enableEditing: false,
        enableColumnFilter: false,
        Cell: ({ row }) => {
          const link = buildAdminBotReferralLink(row.original.ref_code, row.original.partner_config.partner_link_id);
          if (!link) return '—';

          return (
            <Stack sx={{ alignItems: "center" }} direction="row" spacing={0.5}>
              <Tooltip title={link}>
                <Typography sx={{ maxWidth: 220 }} variant="caption">
                  {link.replace(/^https?:\/\//, '')}
                </Typography>
              </Tooltip>
              <Tooltip title="Копировать ссылку">
                <IconButton size="small" onClick={() => void handleCopyReferralLink(row.original)}>
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        },
        size: 280,
      },
      {
        id: 'partner_ref_uid',
        header: 'Partner ref_uid',
        accessorFn: (row) => row.partner_config.ref_uid || '—',
        enableEditing: false,
      },
      {
        id: 'partner_link_id',
        header: 'Partner link id',
        accessorFn: (row) => row.partner_config.partner_link_id || '—',
        enableEditing: false,
      },
      {
        accessorKey: 'telegram_link',
        header: 'Telegram link',
        enableEditing: false,
        Cell: ({ cell }) => {
          const value = cell.getValue<string | null>();
          if (!value) return '—';
          return (
            <Link color="primary" href={value} rel="noreferrer" target="_blank" underline="hover">
              {value.replace(/^https?:\/\//, '')}
            </Link>
          );
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Статус',
        enableEditing: false,
        Cell: ({ cell }) => renderBooleanChip(Boolean(cell.getValue<boolean>()), 'Активен', 'Выключен'),
      },
      {
        id: 'partner_config',
        header: 'Partner config',
        accessorFn: (row) => row.partner_config.partner_login_masked || row.partner_config.ref_uid || '',
        enableEditing: false,
        enableColumnFilter: false,
        Cell: ({ row }) => renderSecretChips(row.original),
        size: 320,
      },
    ],
    [handleCopyReferralLink],
  );

  const table = useMaterialReactTable({
    columns,
    data: bots,
    createDisplayMode: 'modal',
    editDisplayMode: 'modal',
    enableEditing: true,
    enableRowActions: true,
    getRowId: (row) => row.bot_username,
    initialState: {
      density: 'compact',
      pagination: { pageIndex: 0, pageSize: 10 },
      showGlobalFilter: true,
    },
    mrtTheme: {
      baseBackgroundColor: '#121923',
      menuBackgroundColor: '#17212d',
      pinnedRowBackgroundColor: 'rgba(46,189,133,0.10)',
      selectedRowBackgroundColor: 'rgba(46,189,133,0.16)',
      matchHighlightColor: 'rgba(255,193,7,0.18)',
    },
    muiSearchTextFieldProps: {
      placeholder: 'Поиск по bot username, ref code, channel...',
    },
    muiTableProps: {
      sx: {
        backgroundColor: '#121923',
      },
    },
    muiTableHeadProps: {
      sx: {
        backgroundColor: '#17212d',
      },
    },
    muiTableHeadCellProps: {
      sx: {
        backgroundColor: '#17212d',
        color: '#f4f7fb',
      },
    },
    muiTableBodyCellProps: {
      sx: {
        backgroundColor: '#121923',
        color: '#f4f7fb',
      },
    },
    muiTableBodyRowProps: {
      sx: {
        backgroundColor: '#121923',
        '&:hover td': {
          backgroundColor: 'rgba(255,255,255,0.03)',
        },
      },
    },
    muiTopToolbarProps: {
      sx: {
        backgroundColor: '#121923',
        color: '#f4f7fb',
      },
    },
    muiBottomToolbarProps: {
      sx: {
        backgroundColor: '#121923',
        color: '#f4f7fb',
      },
    },
    muiTableContainerProps: {
      sx: { maxHeight: '68vh' },
    },
    muiTablePaperProps: {
      elevation: 0,
      sx: {
        overflow: 'hidden',
        backgroundColor: '#121923',
      },
    },
    muiEditRowDialogProps: () => ({
      fullWidth: true,
      maxWidth: 'md',
      open: true,
    }),
    muiCreateRowModalProps: () => ({
      fullWidth: true,
      maxWidth: 'md',
      open: true,
    }),
    onCreatingRowCancel: () => {
      setError(null);
      setCreateForm(createDefaultCreateBotForm());
    },
    onCreatingRowSave: handleCreateBot,
    onEditingRowCancel: () => {
      setEditForm(createDefaultEditBotForm());
      setForm(createDefaultForm());
      setProbeOutput('');
      setError(null);
    },
    onEditingRowSave: handleSaveBot,
    positionActionsColumn: 'last',
    renderCreateRowDialogContent: ({ row, table }) => (
      <>
        <DialogTitle>Создать нового бота</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Alert severity="info">
              Поле `bot_username` обязательно. Если введёте имя с `@`, символ будет автоматически удалён перед отправкой.
            </Alert>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              }}
            >
              <TextField
                label="bot_username *"
                placeholder="my_new_bot"
                value={createForm.bot_username}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, bot_username: event.target.value }))}
                slotProps={{ input: { endAdornment: fieldInfoAdornment('Уникальный username Telegram-бота, без @.') } }}
              />
              <TextField
                label="bot_token"
                placeholder="7123456789:AAF..."
                value={createForm.bot_token}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, bot_token: event.target.value }))}
                slotProps={{ input: { endAdornment: fieldInfoAdornment('Токен бота из BotFather. Нужен для подключения API Telegram.') } }}
              />
              <TextField
                label="channel_name"
                value={createForm.channel_name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, channel_name: event.target.value }))}
                slotProps={{ input: { endAdornment: fieldInfoAdornment('Имя/алиас канала, который связан с этим ботом.') } }}
              />
              <TextField
                label="ref_code"
                value={createForm.ref_code}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, ref_code: event.target.value }))}
                slotProps={{ input: { endAdornment: fieldInfoAdornment('Код рефералки. Используется для генерации ссылки регистрации.') } }}
              />
              <TextField
                label="telegram_link"
                value={createForm.telegram_link}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, telegram_link: event.target.value }))}
                slotProps={{ input: { endAdornment: fieldInfoAdornment('Ссылка на Telegram-бота или канал (например, https://t.me/...).') } }}
              />
            </Box>
            <Box>
              <Chip
                color={createForm.is_active ? 'success' : 'default'}
                label={createForm.is_active ? 'Бот будет активным' : 'Бот будет неактивным'}
                size="small"
                variant={createForm.is_active ? 'filled' : 'outlined'}
                sx={{ mb: 1.5 }}
              />
              <Button
                onClick={() => setCreateForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                variant="outlined"
              >
                Переключить is_active
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <MRT_EditActionButtons row={row} table={table} variant="text" />
        </DialogActions>
      </>
    ),
    renderEditRowDialogContent: ({ row, table }) => {
      const bot = row.original;

      return (
        <>
          <DialogTitle>Редактирование бота @{bot.bot_username}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <Alert severity="info">
                Здесь можно редактировать как общие поля существующего бота, так и его partner config. Для создания нового бота используйте кнопку «Добавить бота» в тулбаре.
              </Alert>

              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                }}
              >
                <TextField
                  label="Bot username"
                  value={bot.bot_username}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: fieldInfoAdornment('Уникальный идентификатор бота в Telegram. Это поле только для чтения.'),
                    },
                  }}
                />
                <TextField
                  label="Ref code"
                  value={editForm.ref_code}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, ref_code: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Реферальный код для генерации ссылки регистрации.') } }}
                />
                <TextField
                  label="Referral link"
                  value={buildAdminBotReferralLink(editForm.ref_code, form.partner_link_id || bot.partner_config.partner_link_id)}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: fieldInfoAdornment('Полная ссылка регистрации с текущим ref_code. Автоматически пересчитывается.'),
                    },
                  }}
                />
                <TextField
                  label="Channel name"
                  value={editForm.channel_name}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, channel_name: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Отображаемое имя канала/источника сигналов.') } }}
                />
                <TextField
                  label="Telegram link"
                  value={editForm.telegram_link}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, telegram_link: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Публичная ссылка на Telegram-бота или канал.') } }}
                />
                <TextField
                  label="technical_banner_text"
                  value={editForm.technical_banner_text}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, technical_banner_text: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Текст баннера при включенных тех. работах. Показывается пользователям.') } }}
                />
                <TextField
                  label="ref_uid"
                  value={form.ref_uid}
                  onChange={(event) => setForm((prev) => ({ ...prev, ref_uid: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('ID партнёрской ссылки в системе партнёрки.') } }}
                />
                <TextField
                  label="partner_link_id"
                  value={form.partner_link_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, partner_link_id: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Дополнительный ID партнёрской кампании/ссылки.') } }}
                />
                <TextField
                  label="partner_login"
                  value={form.partner_login}
                  onChange={(event) => setForm((prev) => ({ ...prev, partner_login: event.target.value }))}
                  placeholder={form.partner_login_masked || 'partner login'}
                  helperText={form.partner_login_masked ? `Текущее значение: ${form.partner_login_masked}` : 'Текущее значение не задано'}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Логин партнёрского кабинета. Используется для интеграции. Если поле не менять, текущее masked-значение не будет перезаписано.') } }}
                />
                <TextField
                  label="affiliate_email"
                  value={form.affiliate_email}
                  onChange={(event) => setForm((prev) => ({ ...prev, affiliate_email: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Email пользователя, которому автоматически откроется affiliate-доступ через /api/user/me.') } }}
                />
                <TextField
                  label="affiliate_name"
                  value={form.affiliate_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, affiliate_name: event.target.value }))}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Отображаемое имя affiliate-партнёра в affiliate profile и cabinet.') } }}
                />
                <TextField
                  label="partner_password"
                  type="password"
                  value={form.partner_password}
                  onChange={(event) => setForm((prev) => ({ ...prev, partner_password: event.target.value }))}
                  placeholder={form.has_partner_password ? 'Сохранён на сервере' : 'Не задан'}
                  helperText={form.has_partner_password ? 'Текущее значение сохранено. Будет заменено только если ввести новый пароль.' : 'Пароль пока не сохранён'}
                  slotProps={{ input: { endAdornment: fieldInfoAdornment('Пароль партнёрского кабинета. Отправляется только при заполнении.') } }}
                />
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Button
                  onClick={() => setEditForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                  variant={editForm.is_active ? 'contained' : 'outlined'}
                >
                  {editForm.is_active ? 'Бот активен' : 'Бот выключен'}
                </Button>
                <Button
                  color={editForm.technical_work_enabled ? 'warning' : 'inherit'}
                  onClick={() => setEditForm((prev) => ({ ...prev, technical_work_enabled: !prev.technical_work_enabled }))}
                  variant={editForm.technical_work_enabled ? 'contained' : 'outlined'}
                >
                  {editForm.technical_work_enabled ? 'Тех. работы включены' : 'Тех. работы выключены'}
                </Button>
                <Button
                  color={form.affiliate_access_enabled ? 'success' : 'inherit'}
                  onClick={() => setForm((prev) => ({ ...prev, affiliate_access_enabled: !prev.affiliate_access_enabled }))}
                  variant={form.affiliate_access_enabled ? 'contained' : 'outlined'}
                >
                  {form.affiliate_access_enabled ? 'Affiliate access включён' : 'Affiliate access выключен'}
                </Button>
              </Box>

              <Box>
                <Typography gutterBottom sx={{ fontWeight: 700 }} variant="body2">
                  Текущий summary
                </Typography>
                {renderSecretChips(bot)}
              </Box>
              <Box>
                <Button
                  disabled={!bot.ref_code}
                  onClick={() => void handleCopyReferralLink(bot)}
                  startIcon={<ContentCopyIcon />}
                  variant="outlined"
                >
                  Копировать полную ссылку с рефкой
                </Button>
              </Box>
              <Box>
                <Button
                  disabled={probeLoading}
                  onClick={() => void handleProbeRegistration(bot)}
                  variant="outlined"
                >
                  {probeLoading ? 'Тест регистрации...' : 'Тест регистрации (random)'}
                </Button>
              </Box>
              {probeOutput ? (
                <TextField
                  label="Raw response"
                  multiline
                  minRows={10}
                  value={probeOutput}
                  slotProps={{
                    input: {
                      readOnly: true,
                      sx: {
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                      },
                    },
                  }}
                />
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
            <Button
              color="error"
              disabled={saving || clearing}
              onClick={() => void handleClearBot(bot, table)}
              variant="outlined"
            >
              Очистить конфиг
            </Button>
            <MRT_EditActionButtons row={row} table={table} variant="text" />
          </DialogActions>
        </>
      );
    },
    renderRowActions: ({ row, table }) => (
      <Tooltip title="Редактировать">
        <IconButton
          color="primary"
          onClick={() => {
            setEditForm(createDefaultEditBotForm(row.original));
            setForm(createDefaultForm(row.original));
            setProbeOutput('');
            setError(null);
            setSuccess(null);
            table.setEditingRow(row);
          }}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
    ),
    renderTopToolbarCustomActions: () => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          startIcon={<PersonAddAlt1Icon />}
          variant="contained"
          onClick={() => {
            setError(null);
            setSuccess(null);
            setCreateForm(createDefaultCreateBotForm());
            table.setCreatingRow(true);
          }}
        >
          Добавить бота
        </Button>
        <Button disabled={loading} onClick={() => void loadBots()} startIcon={<RefreshIcon />} variant="outlined">
          Обновить
        </Button>
      </Stack>
    ),
    state: {
      isLoading: loading,
      isSaving: saving || clearing,
      showProgressBars: loading,
    },
  });

  if (!isActive) return null;

  return (
    <AdminMrtProvider>
      <Stack className="admin-bots" spacing={2}>
        <Alert severity="info">
          Раздел переведён на Material React Table. Создание и редактирование ботов выполняются через штатные modal popup MRT.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <MaterialReactTable table={table} />
      </Stack>
    </AdminMrtProvider>
  );
}
