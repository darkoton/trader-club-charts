import { useCallback, useEffect, useMemo, useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Button,
  Chip,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  useMaterialReactTable,
} from 'material-react-table';
import {
  getAutobotAdminStatus,
  listAutobotAdminStatuses,
  resetAutobotAdminMartin,
  unblockAutobotAdminBot,
  type AutobotAdminStatus,
} from '../api/adminBots';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminAutobotMonitorProps {
  isActive: boolean;
  t: Record<string, string>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMinutesAgo(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1) return '< 1 мин';
  return `${value.toFixed(value >= 10 ? 0 : 1)} мин`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
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

function renderBotResultChip(value: AutobotAdminStatus['last_bet_result']) {
  if (!value) return <Chip label="—" size="small" variant="outlined" />;
  const map: Record<NonNullable<AutobotAdminStatus['last_bet_result']>, { color: 'success' | 'error' | 'warning' | 'default'; label: string }> = {
    win: { color: 'success', label: 'win' },
    loss: { color: 'error', label: 'loss' },
    draw: { color: 'warning', label: 'draw' },
    timeout: { color: 'default', label: 'timeout' },
  };
  const config = map[value];
  return <Chip color={config.color} label={config.label} size="small" variant={config.color === 'default' ? 'outlined' : 'filled'} />;
}

export function AdminAutobotMonitor({ isActive }: AdminAutobotMonitorProps) {
  const [statuses, setStatuses] = useState<AutobotAdminStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [unblockingBotId, setUnblockingBotId] = useState<string | null>(null);
  const [resettingBotId, setResettingBotId] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAutobotAdminStatuses();
      setStatuses(data);
    } catch (err) {
      setStatuses([]);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadStatuses();
  }, [isActive, loadStatuses]);

  const handleManualUnblock = useCallback(async (bot: AutobotAdminStatus) => {
    setUnblockingBotId(bot.account_id);
    setError(null);
    setSuccess(null);
    try {
      const result = await unblockAutobotAdminBot(bot.account_id);
      const nextBot = result.bot ?? await getAutobotAdminStatus(bot.account_id);
      setStatuses((prev) => prev.map((item) => item.account_id === nextBot.account_id ? nextBot : item));
      setSuccess(result.success
        ? `Бот ${bot.account_id} разблокирован`
        : (result.message || `У бота ${bot.account_id} не было активной блокировки`));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setUnblockingBotId(null);
    }
  }, []);

  const handleResetMartin = useCallback(async (bot: AutobotAdminStatus) => {
    setResettingBotId(bot.account_id);
    setError(null);
    setSuccess(null);
    try {
      const result = await resetAutobotAdminMartin(bot.account_id);
      const nextBot = result.bot ?? await getAutobotAdminStatus(bot.account_id);
      setStatuses((prev) => prev.map((item) => item.account_id === nextBot.account_id ? nextBot : item));
      setSuccess(result.success
        ? `Martin для ${bot.account_id} сброшен`
        : (result.message || `Не удалось сбросить Martin для ${bot.account_id}`));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setResettingBotId(null);
    }
  }, []);

  const columns = useMemo<MRT_ColumnDef<AutobotAdminStatus>[]>(() => [
    {
      accessorKey: 'account_id',
      header: 'Bot account',
      enableEditing: false,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontWeight: 700 }} variant="body2">{row.original.account_id}</Typography>
          <Typography color="text.secondary" variant="caption">
            {row.original.better_email || row.original.better_account_id || '—'}
          </Typography>
        </Stack>
      ),
      size: 220,
    },
    {
      accessorKey: 'status',
      header: 'Статус',
      enableEditing: false,
      Cell: ({ row }) => (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={row.original.status || '—'} size="small" color={row.original.status === 'active' ? 'success' : 'default'} variant={row.original.status === 'active' ? 'filled' : 'outlined'} />
          {renderBooleanChip(row.original.is_demo, 'Demo', 'Real')}
          {renderBooleanChip(row.original.martin_active, 'Martin on', 'Martin off')}
        </Stack>
      ),
      size: 240,
    },
    {
      id: 'balance',
      header: 'Баланс',
      accessorFn: (row) => row.balance,
      enableEditing: false,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{formatNumber(row.original.balance)}</Typography>
          <Typography color="text.secondary" variant="caption">
            updated: {formatMinutesAgo(row.original.balance_minutes_ago)}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            at: {formatDateTime(row.original.balance_updated_at)}
          </Typography>
          {row.original.balance_error ? (
            <Typography color="error.main" variant="caption">{row.original.balance_error}</Typography>
          ) : null}
        </Stack>
      ),
      size: 180,
    },
    {
      id: 'last_bet',
      header: 'Последняя ставка',
      accessorFn: (row) => row.last_bet_at,
      enableEditing: false,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.last_bet_symbol || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">
            {row.original.last_bet_amount != null ? `${formatNumber(row.original.last_bet_amount)} / ${row.original.last_bet_expiration ?? '—'}m` : '—'}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            order: {row.original.last_bet_order_id || '—'}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            profit / payout: {row.original.last_bet_profit != null ? formatNumber(row.original.last_bet_profit) : '—'} / {row.original.last_bet_payout != null ? formatNumber(row.original.last_bet_payout) : '—'}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {renderBotResultChip(row.original.last_bet_result)}
            <Typography color="text.secondary" variant="caption">{formatMinutesAgo(row.original.last_bet_minutes_ago)}</Typography>
          </Stack>
          <Typography color="text.secondary" variant="caption">{formatDateTime(row.original.last_bet_at)}</Typography>
        </Stack>
      ),
      size: 220,
    },
    {
      id: 'block_state',
      header: 'Блокировка пары',
      accessorFn: (row) => row.blocked_pair || '',
      enableEditing: false,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.blocked_pair || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">
            blocked at: {formatDateTime(row.original.blocked_at)}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            blocked: {formatMinutesAgo(row.original.blocked_minutes_ago)}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            auto-unblock in: {formatMinutesAgo(row.original.minutes_until_auto_unblock)}
          </Typography>
          <Typography color="text.secondary" variant="caption">{formatDateTime(row.original.blocked_until)}</Typography>
        </Stack>
      ),
      size: 220,
    },
    {
      id: 'technical',
      header: 'Тех. детали',
      accessorFn: (row) => row.pocket_id,
      enableEditing: false,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">Pocket: {row.original.pocket_id ?? '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Exp: {row.original.expiration ?? '—'}m</Typography>
          <Typography color="text.secondary" variant="caption">Martin step: {row.original.martin_step ?? '—'}</Typography>
        </Stack>
      ),
      size: 180,
    },
  ], []);

  const table = useMaterialReactTable({
    columns,
    data: statuses,
    enableEditing: false,
    enableRowActions: true,
    getRowId: (row) => row.account_id,
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
      placeholder: 'Поиск по account_id, email, pair...',
    },
    muiTableProps: { sx: { backgroundColor: '#121923' } },
    muiTableHeadProps: { sx: { backgroundColor: '#17212d' } },
    muiTableHeadCellProps: { sx: { backgroundColor: '#17212d', color: '#f4f7fb' } },
    muiTableBodyCellProps: { sx: { backgroundColor: '#121923', color: '#f4f7fb' } },
    muiTableBodyRowProps: {
      sx: {
        backgroundColor: '#121923',
        '&:hover td': { backgroundColor: 'rgba(255,255,255,0.03)' },
      },
    },
    muiTopToolbarProps: { sx: { backgroundColor: '#121923', color: '#f4f7fb' } },
    muiBottomToolbarProps: { sx: { backgroundColor: '#121923', color: '#f4f7fb' } },
    muiTableContainerProps: { sx: { maxHeight: '68vh' } },
    muiTablePaperProps: { elevation: 0, sx: { overflow: 'hidden', backgroundColor: '#121923' } },
    positionActionsColumn: 'last',
    renderRowActions: ({ row }) => (
      <Stack direction="row" spacing={1}>
        <Tooltip title={row.original.can_manual_unblock ? 'Снять блокировку пары' : 'Нет активной ручной блокировки'}>
          <span>
            <Button
              color="warning"
              disabled={!row.original.can_manual_unblock || unblockingBotId === row.original.account_id || resettingBotId === row.original.account_id}
              onClick={() => void handleManualUnblock(row.original)}
              size="small"
              variant="outlined"
            >
              {unblockingBotId === row.original.account_id ? '...' : 'Unblock'}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Сбросить martin_step в 0 и очистить блокировки">
          <span>
            <Button
              color="secondary"
              disabled={resettingBotId === row.original.account_id || unblockingBotId === row.original.account_id}
              onClick={() => void handleResetMartin(row.original)}
              size="small"
              variant="outlined"
            >
              {resettingBotId === row.original.account_id ? '...' : 'Reset Martin'}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    ),
    renderTopToolbarCustomActions: () => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button disabled={loading} onClick={() => void loadStatuses()} startIcon={<RefreshIcon />} variant="outlined">
          Обновить статусы
        </Button>
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
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <MaterialReactTable table={table} />
      </Stack>
    </AdminMrtProvider>
  );
}