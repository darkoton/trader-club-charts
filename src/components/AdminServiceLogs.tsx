import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  useMaterialReactTable,
} from 'material-react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAdminServiceLogs,
  getAdminServiceLogsText,
  type ServiceLogKind,
  type ServiceLogLevel,
  type ServiceLogItem,
} from '../api/adminServiceLogs';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminServiceLogsProps {
  isActive: boolean;
  t: Record<string, string>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCreatedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function AdminServiceLogs({ isActive, t }: AdminServiceLogsProps) {
  const [items, setItems] = useState<ServiceLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [service, setService] = useState('');
  const [level, setLevel] = useState<'' | ServiceLogLevel>('');
  const [kind, setKind] = useState<'' | ServiceLogKind>('');
  const [search, setSearch] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    service: '',
    level: '' as '' | ServiceLogLevel,
    kind: '' as '' | ServiceLogKind,
    search: '',
  });
  const [pagination, setPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const skip = pagination.pageIndex * pagination.pageSize;
  const limit = pagination.pageSize;

  const loadLogs = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminServiceLogs({
        ...(appliedFilters.service ? { service: appliedFilters.service } : {}),
        ...(appliedFilters.level ? { level: appliedFilters.level } : {}),
        ...(appliedFilters.kind ? { kind: appliedFilters.kind } : {}),
        ...(appliedFilters.search.trim() ? { search: appliedFilters.search.trim() } : {}),
        limit,
        skip,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters.kind, appliedFilters.level, appliedFilters.search, appliedFilters.service, isActive, limit, skip]);

  useEffect(() => {
    if (!isActive) return;
    void loadLogs();
  }, [isActive, loadLogs]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({
      service: service.trim(),
      level,
      kind,
      search: search.trim(),
    });
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [kind, level, search, service]);

  const handleCopyText = useCallback(async () => {
    setCopying(true);
    setError(null);
    setSuccess(null);
    try {
      const text = await getAdminServiceLogsText({
        ...(appliedFilters.service ? { service: appliedFilters.service } : {}),
        ...(appliedFilters.level ? { level: appliedFilters.level } : {}),
        ...(appliedFilters.kind ? { kind: appliedFilters.kind } : {}),
        ...(appliedFilters.search.trim() ? { search: appliedFilters.search.trim() } : {}),
        limit,
        skip,
      });
      await navigator.clipboard.writeText(text);
      setSuccess('Логи скопированы в буфер обмена');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setCopying(false);
    }
  }, [appliedFilters.kind, appliedFilters.level, appliedFilters.search, appliedFilters.service, limit, skip]);

  const columns = useMemo<MRT_ColumnDef<ServiceLogItem>[]>(() => [
    {
      accessorKey: 'created_at',
      header: 'Дата',
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{formatCreatedAt(row.original.created_at)}</Typography>
          <Typography color="text.secondary" variant="caption">{row.original.id}</Typography>
        </Stack>
      ),
      size: 210,
    },
    {
      accessorKey: 'service',
      header: 'Сервис',
      Cell: ({ row }) => (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={row.original.service || '—'} size="small" color="primary" variant="outlined" />
          <Chip label={row.original.level} size="small" color={row.original.level === 'CRITICAL' ? 'error' : row.original.level === 'ERROR' ? 'warning' : 'default'} variant={row.original.level === 'WARNING' ? 'outlined' : 'filled'} />
        </Stack>
      ),
      size: 180,
    },
    {
      id: 'kinds',
      header: 'Kinds',
      accessorFn: (row) => row.kinds?.join(', ') || '',
      Cell: ({ row }) => (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {row.original.kinds?.length ? row.original.kinds.map((item) => (
            <Chip key={item} label={item} size="small" variant="outlined" color="secondary" />
          )) : <Typography color="text.secondary" variant="caption">—</Typography>}
        </Stack>
      ),
      size: 180,
    },
    {
      accessorKey: 'message',
      header: 'Сообщение',
      Cell: ({ row }) => (
        <Stack spacing={0.5}>
          <Typography sx={{
            display: '-webkit-box',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            whiteSpace: 'normal',
          }} variant="body2">
            {row.original.message || '—'}
          </Typography>
          {row.original.copy_text ? (
            <Typography color="text.secondary" sx={{
              display: '-webkit-box',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 1,
              whiteSpace: 'normal',
            }} variant="caption">
              {row.original.copy_text}
            </Typography>
          ) : null}
        </Stack>
      ),
      size: 420,
    },
    {
      id: 'location',
      header: 'Локация',
      accessorFn: (row) => `${row.file || ''} ${row.function || ''}`.trim(),
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.file ? `${row.original.file}:${row.original.line ?? '—'}` : '—'}</Typography>
          <Typography color="text.secondary" variant="caption">{row.original.function || row.original.module || '—'}</Typography>
        </Stack>
      ),
      size: 260,
    },
  ], []);

  const table = useMaterialReactTable({
    columns,
    data: items,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableGlobalFilter: false,
    enableHiding: false,
    enableSorting: false,
    getRowId: (row) => row.id,
    initialState: {
      density: 'compact',
    },
    manualPagination: true,
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
    onPaginationChange: setPagination,
    renderDetailPanel: ({ row }) => (
      <Stack spacing={1.25} sx={{ p: 2 }}>
        <Typography variant="body2"><strong>Message:</strong> {row.original.message || '—'}</Typography>
        <Typography variant="body2"><strong>Copy text:</strong> {row.original.copy_text || '—'}</Typography>
        <Typography variant="body2"><strong>Hostname:</strong> {row.original.hostname || '—'}</Typography>
        <Typography variant="body2"><strong>Process / Thread:</strong> {row.original.process_id ?? '—'} / {row.original.thread_id ?? '—'}</Typography>
        <Typography variant="body2"><strong>Exception:</strong> {row.original.exception ? `${row.original.exception.type || '—'}: ${row.original.exception.value || '—'}` : '—'}</Typography>
        <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(row.original.extra ?? {}, null, 2)}</pre>
      </Stack>
    ),
    renderTopToolbarCustomActions: () => (
      <Stack spacing={1.5} sx={{ py: 0.5, width: '100%' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
          <TextField label="Service" size="small" value={service} onChange={(event) => setService(event.target.value)} sx={{ minWidth: 180 }} />
          <TextField label="Level" select size="small" value={level} onChange={(event) => setLevel(event.target.value as '' | ServiceLogLevel)} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="WARNING">WARNING</MenuItem>
            <MenuItem value="ERROR">ERROR</MenuItem>
            <MenuItem value="CRITICAL">CRITICAL</MenuItem>
          </TextField>
          <TextField label="Kind" select size="small" value={kind} onChange={(event) => setKind(event.target.value as '' | ServiceLogKind)} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="sync">sync</MenuItem>
            <MenuItem value="token">token</MenuItem>
          </TextField>
          <TextField label={t.search || 'Search'} size="small" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 240, flex: 1 }} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button disabled={loading} onClick={handleApplyFilters} startIcon={<RefreshIcon />} variant="outlined">
            {t.adminChatsReload || 'Обновить'}
          </Button>
          <Button disabled={copying || loading} onClick={() => void handleCopyText()} startIcon={<ContentCopyIcon />} variant="outlined">
            {copying ? '…' : 'Copy as Text'}
          </Button>
          <Typography color="text.secondary" sx={{ alignSelf: 'center' }} variant="body2">
            {total === 0 ? '0 / 0' : `${Math.min(skip + 1, total)}-${Math.min(skip + items.length, total)} / ${total}`}
          </Typography>
        </Stack>
      </Stack>
    ),
    rowCount: total,
    state: {
      isLoading: loading,
      pagination,
      showProgressBars: loading,
    },
  });

  if (!isActive) return null;

  return (
    <AdminMrtProvider>
      <Stack className="admin-logs-mrt" spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <MaterialReactTable table={table} />
      </Stack>
    </AdminMrtProvider>
  );
}
