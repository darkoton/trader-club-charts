import RefreshIcon from '@mui/icons-material/Refresh';
import KeyIcon from '@mui/icons-material/Key';
import LoginIcon from '@mui/icons-material/Login';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArticleIcon from '@mui/icons-material/Article';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  useMaterialReactTable,
} from 'material-react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminBetterAuthEvents, type BetterAuthEventItem } from '../api/adminBetterAuthEvents';
import { getAdminServiceLogs, type ServiceLogItem } from '../api/adminServiceLogs';
import {
  AdminTerminalUsersApiError,
  getAdminTerminalUser,
  getAdminTerminalUsers,
  repairAdminTerminalUsersMissingRefresh,
  refreshAdminTerminalUserToken,
  reloginAdminTerminalUser,
  revealAdminTerminalUserPassword,
  type AdminTerminalUserItem,
  type AdminTerminalUserRecentPasswordView,
} from '../api/adminTerminalUsers';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminTerminalUsersProps {
  isActive: boolean;
  t: Record<string, string>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMoney(value?: number | null, currency?: string | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const suffix = currency ? ` ${currency}` : '';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

function formatJson(value: unknown): string {
  if (value == null) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function viewerLabel(view: AdminTerminalUserRecentPasswordView): string {
  const name = [view.admin_first_name, view.admin_last_name].filter(Boolean).join(' ').trim();
  if (view.admin_label) return view.admin_label;
  if (name) return name;
  if (view.admin_username) return `@${view.admin_username}`;
  if (view.admin_terminal_user_id) return `terminal:${view.admin_terminal_user_id}`;
  if (view.admin_user_id != null) return `user:${view.admin_user_id}`;
  return 'unknown';
}

function getRelatedSearchTerms(item: AdminTerminalUserItem): string[] {
  return Array.from(new Set([
    item.email,
    item.terminal_user_id,
    item.real_login,
    item.po_user_id != null ? String(item.po_user_id) : null,
  ].map((value) => String(value || '').trim()).filter(Boolean)));
}

function sortByDateDesc<T extends { created_at?: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTs = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTs = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTs - leftTs;
  });
}

function renderJsonPanel(value: unknown) {
  return (
    <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(value)}</pre>
  );
}

function getActionResponsePayload(error: unknown): unknown {
  if (error instanceof AdminTerminalUsersApiError) {
    return error.responseData;
  }
  return null;
}

export function AdminTerminalUsers({ isActive, t }: AdminTerminalUsersProps) {
  const [items, setItems] = useState<AdminTerminalUserItem[]>([]);
  const [details, setDetails] = useState<Record<string, AdminTerminalUserItem>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkRepairLoading, setBulkRepairLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [passwordDialog, setPasswordDialog] = useState<{
    open: boolean;
    accountId: string | null;
    email: string;
    password: string;
    recentViews: AdminTerminalUserRecentPasswordView[];
  }>({
    open: false,
    accountId: null,
    email: '',
    password: '',
    recentViews: [],
  });
  const [actionResponseDialog, setActionResponseDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    response: unknown;
    severity: 'success' | 'error';
  }>({
    open: false,
    title: '',
    message: '',
    response: null,
    severity: 'success',
  });
  const [relatedServiceLogsDialog, setRelatedServiceLogsDialog] = useState<{
    open: boolean;
    title: string;
    loading: boolean;
    error: string | null;
    items: ServiceLogItem[];
  }>({
    open: false,
    title: '',
    loading: false,
    error: null,
    items: [],
  });
  const [relatedAuthEventsDialog, setRelatedAuthEventsDialog] = useState<{
    open: boolean;
    title: string;
    loading: boolean;
    error: string | null;
    items: BetterAuthEventItem[];
  }>({
    open: false,
    title: '',
    loading: false,
    error: null,
    items: [],
  });

  const mergeItem = useCallback((nextItem: AdminTerminalUserItem) => {
    setItems((prev) => prev.map((item) => (item.id === nextItem.id ? nextItem : item)));
    setDetails((prev) => ({ ...prev, [nextItem.id]: nextItem }));
  }, []);

  const loadItems = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminTerminalUsers();
      setItems(data.items || []);
      setDetails({});
    } catch (err) {
      setItems([]);
      setDetails({});
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadItems();
  }, [isActive, loadItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.search_blob.includes(q));
  }, [items, search]);

  const loadDetails = useCallback(async (item: AdminTerminalUserItem) => {
    if (details[item.id]?.recent_password_views) return;
    setLoadingDetailsId(item.id);
    try {
      const detail = await getAdminTerminalUser(item.id);
      setDetails((prev) => ({ ...prev, [item.id]: detail }));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoadingDetailsId(null);
    }
  }, [details]);

  const runRowAction = useCallback(async (accountId: string, action: string, run: () => Promise<void>) => {
    setActionLoading((prev) => ({ ...prev, [accountId]: action }));
    setError(null);
    setSuccess(null);
    try {
      await run();
    } catch (err) {
      setError(formatError(err));
      const payload = getActionResponsePayload(err);
      if (payload) {
        const data = payload as { upstream_response?: unknown; message?: string; error?: string };
        setActionResponseDialog({
          open: true,
          title: `Pocket response: ${action}`,
          message: String(data.message || data.error || formatError(err)),
          response: data.upstream_response ?? payload,
          severity: 'error',
        });
      }
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    }
  }, []);

  const handleRefreshToken = useCallback(async (item: AdminTerminalUserItem) => {
    await runRowAction(item.id, 'refresh-token', async () => {
      const response = await refreshAdminTerminalUserToken(item.id);
      mergeItem(response.item);
      setSuccess(response.message || `Refresh token выполнен для ${item.email}`);
      setActionResponseDialog({
        open: true,
        title: `Pocket response: refresh ${item.email}`,
        message: response.message || `Refresh token выполнен для ${item.email}`,
        response: response.pocket_response ?? null,
        severity: 'success',
      });
    });
  }, [mergeItem, runRowAction]);

  const handleRelogin = useCallback(async (item: AdminTerminalUserItem) => {
    await runRowAction(item.id, 'relogin', async () => {
      const response = await reloginAdminTerminalUser(item.id);
      mergeItem(response.item);
      setSuccess(response.message || `Re-login выполнен для ${item.email}`);
      setActionResponseDialog({
        open: true,
        title: `Pocket response: re-login ${item.email}`,
        message: response.message || `Re-login выполнен для ${item.email}`,
        response: response.pocket_response ?? null,
        severity: 'success',
      });
    });
  }, [mergeItem, runRowAction]);

  const handleRepairMissingRefresh = useCallback(async () => {
    setBulkRepairLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await repairAdminTerminalUsersMissingRefresh();
      await loadItems();
      setSuccess(response.message || 'Repair missing refresh token completed');
      setActionResponseDialog({
        open: true,
        title: 'Bulk repair missing refresh',
        message: response.message || 'Repair missing refresh token completed',
        response: response.summary,
        severity: 'success',
      });
    } catch (err) {
      setError(formatError(err));
      const payload = getActionResponsePayload(err);
      if (payload) {
        const data = payload as { summary?: unknown; message?: string; error?: string };
        setActionResponseDialog({
          open: true,
          title: 'Bulk repair missing refresh',
          message: String(data.message || data.error || formatError(err)),
          response: data.summary ?? payload,
          severity: 'error',
        });
      }
    } finally {
      setBulkRepairLoading(false);
    }
  }, [loadItems]);

  const handleCopyActionResponse = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatJson(actionResponseDialog.response));
      setSuccess('Pocket response скопирован в буфер обмена');
    } catch (err) {
      setError(formatError(err));
    }
  }, [actionResponseDialog.response]);

  const handleOpenRelatedServiceLogs = useCallback(async (item: AdminTerminalUserItem) => {
    const searchTerms = getRelatedSearchTerms(item);
    setRelatedServiceLogsDialog({
      open: true,
      title: `Service Logs: ${item.email}`,
      loading: true,
      error: null,
      items: [],
    });

    try {
      const responses = await Promise.all(
        (searchTerms.length ? searchTerms : [item.email]).map((searchTerm) => getAdminServiceLogs({
          service: 'better',
          search: searchTerm,
          limit: 50,
          skip: 0,
        })),
      );
      const merged = new Map<string, ServiceLogItem>();
      responses.forEach((response) => {
        response.items.forEach((entry) => {
          if (!merged.has(entry.id)) {
            merged.set(entry.id, entry);
          }
        });
      });
      setRelatedServiceLogsDialog({
        open: true,
        title: `Service Logs: ${item.email}`,
        loading: false,
        error: null,
        items: sortByDateDesc(Array.from(merged.values())),
      });
    } catch (err) {
      setRelatedServiceLogsDialog({
        open: true,
        title: `Service Logs: ${item.email}`,
        loading: false,
        error: formatError(err),
        items: [],
      });
    }
  }, []);

  const handleOpenRelatedAuthEvents = useCallback(async (item: AdminTerminalUserItem) => {
    const requests = [
      item.email ? getAdminBetterAuthEvents({ email: item.email, limit: 50, skip: 0 }) : null,
      item.id ? getAdminBetterAuthEvents({ account_id: item.id, limit: 50, skip: 0 }) : null,
      item.terminal_user_id ? getAdminBetterAuthEvents({ terminal_user_id: item.terminal_user_id, limit: 50, skip: 0 }) : null,
    ].filter(Boolean) as Array<Promise<{ items: BetterAuthEventItem[] }>>;

    setRelatedAuthEventsDialog({
      open: true,
      title: `Better Auth Events: ${item.email}`,
      loading: true,
      error: null,
      items: [],
    });

    try {
      const responses = await Promise.all(requests.length ? requests : [getAdminBetterAuthEvents({ search: item.email, limit: 50, skip: 0 })]);
      const merged = new Map<string, BetterAuthEventItem>();
      responses.forEach((response) => {
        response.items.forEach((entry) => {
          if (!merged.has(entry.id)) {
            merged.set(entry.id, entry);
          }
        });
      });
      setRelatedAuthEventsDialog({
        open: true,
        title: `Better Auth Events: ${item.email}`,
        loading: false,
        error: null,
        items: sortByDateDesc(Array.from(merged.values())),
      });
    } catch (err) {
      setRelatedAuthEventsDialog({
        open: true,
        title: `Better Auth Events: ${item.email}`,
        loading: false,
        error: formatError(err),
        items: [],
      });
    }
  }, []);

  const handleRevealPassword = useCallback(async (item: AdminTerminalUserItem) => {
    await runRowAction(item.id, 'password', async () => {
      const response = await revealAdminTerminalUserPassword(item.id);
      setItems((prev) => prev.map((entry) => (
        entry.id === item.id
          ? { ...entry, password_audit: response.password_audit }
          : entry
      )));
      setDetails((prev) => ({
        ...prev,
        [item.id]: prev[item.id]
          ? {
              ...prev[item.id],
              password_audit: response.password_audit,
              recent_password_views: response.recent_password_views,
            }
          : prev[item.id],
      }));
      setPasswordDialog({
        open: true,
        accountId: item.id,
        email: item.email,
        password: response.password,
        recentViews: response.recent_password_views,
      });
      setSuccess(`Пароль для ${item.email} показан и записан в аудит`);
    });
  }, [runRowAction]);

  const handleCopyPassword = useCallback(async () => {
    if (!passwordDialog.password) return;
    try {
      await navigator.clipboard.writeText(passwordDialog.password);
      setSuccess('Пароль скопирован в буфер обмена');
    } catch (err) {
      setError(formatError(err));
    }
  }, [passwordDialog.password]);

  const columns = useMemo<MRT_ColumnDef<AdminTerminalUserItem>[]>(() => [
    {
      accessorKey: 'email',
      header: 'Email',
      size: 220,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.email}</Typography>
          <Typography color="text.secondary" variant="caption">{row.original.nickname || '—'}</Typography>
        </Stack>
      ),
    },
    {
      id: 'identity',
      header: 'Идентификаторы',
      accessorFn: (row) => `${row.po_user_id || ''} ${row.terminal_user_id || ''} ${row.real_login || ''}`,
      size: 260,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">PO ID: {row.original.po_user_id ?? '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Terminal: {row.original.terminal_user_id || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Real login: {row.original.real_login || '—'}</Typography>
        </Stack>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Статус',
      size: 220,
      Cell: ({ row }) => (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip color={row.original.is_active ? 'success' : 'default'} label={row.original.is_active ? 'active' : 'inactive'} size="small" variant={row.original.is_active ? 'filled' : 'outlined'} />
          <Chip color={row.original.access_token_present ? 'success' : 'default'} label={row.original.access_token_present ? 'access' : 'no access'} size="small" variant="outlined" />
          <Chip color={row.original.refresh_token_present ? 'primary' : 'default'} label={row.original.refresh_token_present ? 'refresh' : 'no refresh'} size="small" variant="outlined" />
          {row.original.can_trade === false ? <Chip color="warning" label="trade off" size="small" variant="outlined" /> : null}
        </Stack>
      ),
    },
    {
      id: 'balances',
      header: 'Балансы',
      accessorFn: (row) => `${row.real_balance || ''} ${row.real_currency || ''} ${row.demo_balance || ''} ${row.demo_currency || ''}`,
      size: 220,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">Real: {formatMoney(row.original.real_balance, row.original.real_currency)}</Typography>
          <Typography color="text.secondary" variant="caption">Demo: {formatMoney(row.original.demo_balance, row.original.demo_currency)}</Typography>
        </Stack>
      ),
    },
    {
      id: 'partner',
      header: 'Партнёр',
      accessorFn: (row) => `${row.partner_ref_code || ''} ${row.partner_bot_username || ''} ${row.partner_link_id || ''}`,
      size: 220,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.partner_ref_code || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">{row.original.partner_bot_username || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Link: {row.original.partner_link_id || '—'}</Typography>
        </Stack>
      ),
    },
    {
      id: 'limits',
      header: 'Лимиты',
      accessorFn: (row) => `${row.user_level || ''} ${row.min_trade_amount || ''} ${row.max_trade_amount || ''} ${row.payout_max || ''}`,
      size: 230,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">Level: {row.original.user_level ?? '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Trade: {row.original.min_trade_amount ?? '—'} - {row.original.max_trade_amount ?? '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Payout max: {row.original.payout_max ?? '—'}%</Typography>
        </Stack>
      ),
    },
    {
      id: 'audit',
      header: 'Пароль / Аудит',
      accessorFn: (row) => `${row.password_audit.last_viewed_by || ''} ${row.password_audit.last_viewed_at || ''} ${row.password_audit.view_count}`,
      size: 220,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">Просмотров: {row.original.password_audit.view_count}</Typography>
          <Typography color="text.secondary" variant="caption">Последний: {row.original.password_audit.last_viewed_by || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">{formatDateTime(row.original.password_audit.last_viewed_at)}</Typography>
        </Stack>
      ),
    },
    {
      id: 'updated',
      header: 'Обновлено',
      accessorFn: (row) => `${row.updated_at || ''} ${row.last_auth_at || ''} ${row.ws_connected_at || ''}`,
      size: 210,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{formatDateTime(row.original.updated_at)}</Typography>
          <Typography color="text.secondary" variant="caption">Auth: {formatDateTime(row.original.last_auth_at)}</Typography>
          <Typography color="text.secondary" variant="caption">WS: {formatDateTime(row.original.ws_connected_at)}</Typography>
        </Stack>
      ),
    },
  ], []);

  const table = useMaterialReactTable({
    columns,
    data: filteredItems,
    enableColumnActions: false,
    enableColumnFilters: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableGlobalFilter: false,
    enableHiding: false,
    enableRowActions: true,
    getRowId: (row) => row.id,
    initialState: {
      density: 'compact',
      pagination: { pageIndex: 0, pageSize: 25 },
    },
    muiExpandButtonProps: ({ row, table }) => ({
      onClick: () => {
        const nextExpanded = !row.getIsExpanded();
        table.setExpanded(nextExpanded ? { [row.id]: true } : {});
        if (nextExpanded) void loadDetails(row.original);
      },
    }),
    muiTableBodyRowProps: {
      sx: {
        backgroundColor: '#121923',
        '&:hover td': { backgroundColor: 'rgba(255,255,255,0.03)' },
      },
    },
    muiTableContainerProps: { sx: { maxHeight: '68vh' } },
    muiTableHeadCellProps: { sx: { backgroundColor: '#17212d', color: '#f4f7fb' } },
    muiTablePaperProps: { elevation: 0, sx: { overflow: 'hidden', backgroundColor: '#121923' } },
    muiTopToolbarProps: { sx: { backgroundColor: '#121923', color: '#f4f7fb' } },
    muiBottomToolbarProps: { sx: { backgroundColor: '#121923', color: '#f4f7fb' } },
    mrtTheme: {
      baseBackgroundColor: '#121923',
      menuBackgroundColor: '#17212d',
      matchHighlightColor: 'rgba(255,193,7,0.18)',
      pinnedRowBackgroundColor: 'rgba(46,189,133,0.10)',
      selectedRowBackgroundColor: 'rgba(46,189,133,0.16)',
    },
    positionActionsColumn: 'last',
    renderDetailPanel: ({ row }) => {
      const detail = details[row.original.id] ?? row.original;
      const payoutMap = detail.details.payout_cache.full_map || detail.details.payout_cache.preview;
      return (
        <Stack spacing={1.25} sx={{ p: 2 }}>
          {loadingDetailsId === row.original.id ? <Typography color="text.secondary" variant="body2">{t.loading}</Typography> : null}
          <Typography variant="body2"><strong>Auth error:</strong> {detail.auth_error_reason || '—'}</Typography>
          <Typography variant="body2"><strong>Password views:</strong> {detail.password_audit.view_count} / last {detail.password_audit.last_viewed_by || '—'} at {formatDateTime(detail.password_audit.last_viewed_at)}</Typography>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.details.identity)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.details.auth)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.details.balances)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.details.partner)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.details.restrictions)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(payoutMap)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson((detail.details as AdminTerminalUserItem['details'] & { raw_db?: unknown }).raw_db)}</pre>
          {detail.recent_password_views?.length ? (
            <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.recent_password_views)}</pre>
          ) : null}
        </Stack>
      );
    },
    renderRowActions: ({ row }) => {
      const busy = actionLoading[row.original.id];
      return (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Связанные service logs">
            <span>
              <IconButton disabled={Boolean(busy)} onClick={() => void handleOpenRelatedServiceLogs(row.original)}>
                <ArticleIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Связанные better auth events">
            <span>
              <IconButton disabled={Boolean(busy)} onClick={() => void handleOpenRelatedAuthEvents(row.original)}>
                <AdminPanelSettingsIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Refresh token">
            <span>
              <IconButton disabled={Boolean(busy) || !row.original.refresh_token_present} onClick={() => void handleRefreshToken(row.original)}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Re-login по email/password">
            <span>
              <IconButton disabled={Boolean(busy) || !row.original.has_encrypted_password} onClick={() => void handleRelogin(row.original)}>
                <LoginIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Показать пароль с аудитом">
            <span>
              <IconButton disabled={Boolean(busy) || !row.original.has_encrypted_password} onClick={() => void handleRevealPassword(row.original)}>
                <VisibilityIcon />
              </IconButton>
            </span>
          </Tooltip>
          {busy ? <Chip label={busy} size="small" variant="outlined" /> : null}
        </Stack>
      );
    },
    renderTopToolbarCustomActions: () => (
      <Stack spacing={1.5} sx={{ py: 0.5, width: '100%' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25}>
          <TextField
            label={t.search || 'Search'}
            size="small"
            sx={{ minWidth: 260, flex: 1 }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="email, terminal_user_id, po_user_id, balances, partner..."
          />
          <Button disabled={loading} onClick={() => void loadItems()} startIcon={<RefreshIcon />} variant="outlined">
            {t.adminChatsReload || 'Обновить'}
          </Button>
          <Button disabled={loading || bulkRepairLoading} onClick={() => void handleRepairMissingRefresh()} startIcon={<LoginIcon />} variant="contained">
            {bulkRepairLoading ? 'Repair...' : 'Repair no refresh'}
          </Button>
        </Stack>
        <Typography color="text.secondary" variant="body2">
          {filteredItems.length} / {items.length} accounts
        </Typography>
      </Stack>
    ),
    state: {
      isLoading: loading,
      showProgressBars: loading,
    },
  });

  if (!isActive) return null;

  return (
    <AdminMrtProvider>
      <Stack className="admin-logs-mrt" spacing={2}>
        <Alert severity="info">
          Раздел показывает terminal-auth аккаунты из better_accounts в структурированном виде: балансы, токены, партнёрские поля, лимиты, ограничения и payout cache. Поиск идёт по скрытому search blob, собранному из всех этих полей.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <MaterialReactTable table={table} />
      </Stack>

      <Dialog fullWidth maxWidth="md" open={passwordDialog.open} onClose={() => setPasswordDialog({ open: false, accountId: null, email: '', password: '', recentViews: [] })}>
        <DialogTitle>Пароль PocketOption: {passwordDialog.email || '—'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Пароль"
              slotProps={{ input: { readOnly: true } }}
              type="text"
              value={passwordDialog.password}
            />
            <Typography color="text.secondary" variant="body2">
              Каждый просмотр логируется с администратором и временем.
            </Typography>
            <Stack spacing={1}>
              {passwordDialog.recentViews.length === 0 ? (
                <Typography color="text.secondary" variant="body2">История просмотров пока пуста.</Typography>
              ) : (
                passwordDialog.recentViews.map((view) => (
                  <Stack key={view.id} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)', pb: 1 }}>
                    <Typography sx={{ minWidth: 220 }} variant="body2">{viewerLabel(view)}</Typography>
                    <Typography color="text.secondary" variant="body2">{formatDateTime(view.viewed_at)}</Typography>
                    <Typography color="text.secondary" variant="body2">{view.ip || '—'}</Typography>
                  </Stack>
                ))
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void handleCopyPassword()} startIcon={<ContentCopyIcon />} variant="outlined">Скопировать</Button>
          <Button onClick={() => setPasswordDialog({ open: false, accountId: null, email: '', password: '', recentViews: [] })} startIcon={<KeyIcon />} variant="contained">Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog fullWidth maxWidth="md" open={actionResponseDialog.open} onClose={() => setActionResponseDialog({ open: false, title: '', message: '', response: null, severity: 'success' })}>
        <DialogTitle>{actionResponseDialog.title || 'Pocket response'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity={actionResponseDialog.severity}>{actionResponseDialog.message}</Alert>
            <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(actionResponseDialog.response)}</pre>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void handleCopyActionResponse()} startIcon={<ContentCopyIcon />} variant="outlined">Скопировать JSON</Button>
          <Button onClick={() => setActionResponseDialog({ open: false, title: '', message: '', response: null, severity: 'success' })} variant="contained">Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog fullWidth maxWidth="lg" open={relatedServiceLogsDialog.open} onClose={() => setRelatedServiceLogsDialog({ open: false, title: '', loading: false, error: null, items: [] })}>
        <DialogTitle>{relatedServiceLogsDialog.title || 'Related Service Logs'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Показываются связанные service logs из Better, найденные по email, terminal_user_id, real_login и po_user_id.</Alert>
            {relatedServiceLogsDialog.loading ? <Typography color="text.secondary" variant="body2">{t.loading}</Typography> : null}
            {relatedServiceLogsDialog.error ? <Alert severity="error">{relatedServiceLogsDialog.error}</Alert> : null}
            {!relatedServiceLogsDialog.loading && !relatedServiceLogsDialog.error && relatedServiceLogsDialog.items.length === 0 ? (
              <Alert severity="warning">Связанные service logs не найдены.</Alert>
            ) : null}
            {relatedServiceLogsDialog.items.map((entry) => (
              <Box key={entry.id} sx={{ background: 'linear-gradient(180deg, rgba(23,33,45,0.96) 0%, rgba(18,25,35,0.96) 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, p: 2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip label={entry.service || '—'} size="small" color="primary" variant="outlined" />
                      <Chip label={entry.level} size="small" color={entry.level === 'CRITICAL' ? 'error' : entry.level === 'ERROR' ? 'warning' : 'default'} variant={entry.level === 'WARNING' ? 'outlined' : 'filled'} />
                      {(entry.kinds || []).map((kind) => <Chip key={kind} label={kind} size="small" variant="outlined" color="secondary" />)}
                      {entry.occurrences_count && entry.occurrences_count > 1 ? <Chip label={`x${entry.occurrences_count}`} size="small" variant="outlined" /> : null}
                    </Stack>
                    <Typography color="text.secondary" variant="body2">{formatDateTime(entry.last_seen_at || entry.created_at)}</Typography>
                  </Stack>
                  <Typography variant="body1">{entry.message || '—'}</Typography>
                  <Typography color="text.secondary" variant="body2">{entry.copy_text || '—'}</Typography>
                  <Typography color="text.secondary" variant="body2">{entry.file ? `${entry.file}:${entry.line ?? '—'} • ${entry.function || entry.module || '—'}` : '—'}</Typography>
                  {entry.exception?.type || entry.exception?.value ? (
                    <Alert severity="error">{`${entry.exception?.type || 'Exception'}: ${entry.exception?.value || '—'}`}</Alert>
                  ) : null}
                  {renderJsonPanel(entry.extra ?? {})}
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRelatedServiceLogsDialog({ open: false, title: '', loading: false, error: null, items: [] })} variant="contained">Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog fullWidth maxWidth="lg" open={relatedAuthEventsDialog.open} onClose={() => setRelatedAuthEventsDialog({ open: false, title: '', loading: false, error: null, items: [] })}>
        <DialogTitle>{relatedAuthEventsDialog.title || 'Related Better Auth Events'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Показываются связанные better-auth события по email, account_id и terminal_user_id.</Alert>
            {relatedAuthEventsDialog.loading ? <Typography color="text.secondary" variant="body2">{t.loading}</Typography> : null}
            {relatedAuthEventsDialog.error ? <Alert severity="error">{relatedAuthEventsDialog.error}</Alert> : null}
            {!relatedAuthEventsDialog.loading && !relatedAuthEventsDialog.error && relatedAuthEventsDialog.items.length === 0 ? (
              <Alert severity="warning">Связанные better-auth события не найдены.</Alert>
            ) : null}
            {relatedAuthEventsDialog.items.map((entry) => (
              <Box key={entry.id} sx={{ background: 'linear-gradient(180deg, rgba(23,33,45,0.96) 0%, rgba(18,25,35,0.96) 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, p: 2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip label={entry.event_type} size="small" color="primary" variant="outlined" />
                      {entry.action ? <Chip label={entry.action} size="small" color="secondary" variant="outlined" /> : null}
                      {entry.source ? <Chip label={entry.source} size="small" variant="outlined" /> : null}
                      {typeof entry.status === 'number' ? <Chip label={`HTTP ${entry.status}`} size="small" color={entry.status >= 500 ? 'error' : entry.status >= 400 ? 'warning' : 'default'} variant="outlined" /> : null}
                    </Stack>
                    <Typography color="text.secondary" variant="body2">{formatDateTime(entry.created_at)}</Typography>
                  </Stack>
                  <Typography variant="body1">{entry.message || entry.copy_text || '—'}</Typography>
                  <Typography color="text.secondary" variant="body2">{entry.email || '—'} • account {entry.account_id || '—'} • terminal {entry.terminal_user_id || '—'}</Typography>
                  <Typography color="text.secondary" variant="body2">{entry.stage || '—'} • {entry.endpoint || '—'}</Typography>
                  {renderJsonPanel(entry.response_payload)}
                  {renderJsonPanel(entry.extra)}
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRelatedAuthEventsDialog({ open: false, title: '', loading: false, error: null, items: [] })} variant="contained">Закрыть</Button>
        </DialogActions>
      </Dialog>
    </AdminMrtProvider>
  );
}