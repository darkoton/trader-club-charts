import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Button,
  Chip,
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
  decodeAdminBetterJwt,
  getAdminBetterAuthEvent,
  getAdminBetterAuthEvents,
  getAdminBetterAuthEventsText,
  type BetterJwtDecodeResponse,
  type BetterAuthEventItem,
} from '../api/adminBetterAuthEvents';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminBetterAuthEventsProps {
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

function formatJson(value: unknown): string {
  if (value == null) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminBetterAuthEvents({ isActive, t }: AdminBetterAuthEventsProps) {
  const [items, setItems] = useState<BetterAuthEventItem[]>([]);
  const [details, setDetails] = useState<Record<string, BetterAuthEventItem>>({});
  const [total, setTotal] = useState(0);
  const [eventType, setEventType] = useState('');
  const [action, setAction] = useState('');
  const [source, setSource] = useState('');
  const [stage, setStage] = useState('');
  const [email, setEmail] = useState('');
  const [accountId, setAccountId] = useState('');
  const [terminalUserId, setTerminalUserId] = useState('');
  const [search, setSearch] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    eventType: '',
    action: '',
    source: '',
    stage: '',
    email: '',
    accountId: '',
    terminalUserId: '',
    search: '',
  });
  const [pagination, setPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [jwtInput, setJwtInput] = useState('');
  const [jwtDecoding, setJwtDecoding] = useState(false);
  const [jwtDecodeResult, setJwtDecodeResult] = useState<BetterJwtDecodeResponse | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const skip = pagination.pageIndex * pagination.pageSize;
  const limit = pagination.pageSize;

  const queryParams = useMemo(() => ({
    ...(appliedFilters.eventType ? { event_type: appliedFilters.eventType } : {}),
    ...(appliedFilters.action ? { action: appliedFilters.action } : {}),
    ...(appliedFilters.source ? { source: appliedFilters.source } : {}),
    ...(appliedFilters.stage ? { stage: appliedFilters.stage } : {}),
    ...(appliedFilters.email ? { email: appliedFilters.email } : {}),
    ...(appliedFilters.accountId ? { account_id: appliedFilters.accountId } : {}),
    ...(appliedFilters.terminalUserId ? { terminal_user_id: appliedFilters.terminalUserId } : {}),
    ...(appliedFilters.search ? { search: appliedFilters.search } : {}),
    limit,
    skip,
  }), [appliedFilters.accountId, appliedFilters.action, appliedFilters.email, appliedFilters.eventType, appliedFilters.search, appliedFilters.source, appliedFilters.stage, appliedFilters.terminalUserId, limit, skip]);

  const loadEvents = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminBetterAuthEvents(queryParams);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [isActive, queryParams]);

  useEffect(() => {
    if (!isActive) return;
    void loadEvents();
  }, [isActive, loadEvents]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({
      eventType: eventType.trim(),
      action: action.trim(),
      source: source.trim(),
      stage: stage.trim(),
      email: email.trim(),
      accountId: accountId.trim(),
      terminalUserId: terminalUserId.trim(),
      search: search.trim(),
    });
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [accountId, action, email, eventType, search, source, stage, terminalUserId]);

  const handleCopyText = useCallback(async () => {
    setCopying(true);
    setError(null);
    setSuccess(null);
    try {
      const text = await getAdminBetterAuthEventsText(queryParams);
      await navigator.clipboard.writeText(text);
      setSuccess('Auth events copied to clipboard');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setCopying(false);
    }
  }, [queryParams]);

  const handleDecodeJwt = useCallback(async () => {
    const token = jwtInput.trim();
    if (!token) {
      setError('JWT is required');
      return;
    }
    setJwtDecoding(true);
    setError(null);
    setSuccess(null);
    try {
      const decoded = await decodeAdminBetterJwt(token);
      setJwtDecodeResult(decoded);
      setSuccess(decoded.verified ? 'JWT decoded and verified' : 'JWT decoded');
    } catch (err) {
      setJwtDecodeResult(null);
      setError(formatError(err));
    } finally {
      setJwtDecoding(false);
    }
  }, [jwtInput]);

  const loadDetails = useCallback(async (item: BetterAuthEventItem) => {
    if (details[item.id]) return;

    setLoadingDetailsId(item.id);
    try {
      const detail = await getAdminBetterAuthEvent(item.id);
      setDetails((prev) => ({ ...prev, [item.id]: detail }));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoadingDetailsId(null);
    }
  }, [details]);

  const columns = useMemo<MRT_ColumnDef<BetterAuthEventItem>[]>(() => [
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
      accessorKey: 'event_type',
      header: 'Event',
      Cell: ({ row }) => (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={row.original.event_type} size="small" color="primary" variant="outlined" />
          {row.original.action ? <Chip label={row.original.action} size="small" color="secondary" variant="outlined" /> : null}
          {row.original.source ? <Chip label={row.original.source} size="small" variant="outlined" /> : null}
        </Stack>
      ),
      size: 280,
    },
    {
      id: 'identity',
      header: 'Пользователь',
      accessorFn: (row) => `${row.email || ''} ${row.account_id || ''} ${row.terminal_user_id || ''}`,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.email || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Account: {row.original.account_id || '—'}</Typography>
          <Typography color="text.secondary" variant="caption">Terminal: {row.original.terminal_user_id || '—'}</Typography>
        </Stack>
      ),
      size: 260,
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
            {row.original.message || row.original.copy_text || '—'}
          </Typography>
          {typeof row.original.status === 'number' ? (
            <Typography color="text.secondary" variant="caption">HTTP status: {row.original.status}</Typography>
          ) : null}
        </Stack>
      ),
      size: 420,
    },
    {
      id: 'stage',
      header: 'Stage',
      accessorFn: (row) => `${row.stage || ''} ${row.endpoint || ''}`.trim(),
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{row.original.stage || '—'}</Typography>
          <Typography color="text.secondary" sx={{
            display: '-webkit-box',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 1,
            whiteSpace: 'normal',
          }} variant="caption">
            {row.original.endpoint || '—'}
          </Typography>
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
    onPaginationChange: setPagination,
    renderDetailPanel: ({ row }) => {
      const detail = details[row.original.id] ?? row.original;
      return (
        <Stack spacing={1.25} sx={{ p: 2 }}>
          {loadingDetailsId === row.original.id ? <Typography color="text.secondary" variant="body2">{t.loading}</Typography> : null}
          <Typography variant="body2"><strong>Copy text:</strong> {detail.copy_text || row.original.copy_text || '—'}</Typography>
          <Typography variant="body2"><strong>PO user ID:</strong> {detail.po_user_id ?? '—'}</Typography>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.response_payload)}</pre>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.extra)}</pre>
        </Stack>
      );
    },
    renderTopToolbarCustomActions: () => (
      <Stack spacing={1.5} sx={{ py: 0.5, width: '100%' }}>
        <Stack spacing={1} sx={{ p: 1.25, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <Typography variant="body2">JWT Decoder</Typography>
          <TextField
            label="JWT"
            minRows={3}
            multiline
            size="small"
            value={jwtInput}
            onChange={(event) => setJwtInput(event.target.value)}
            placeholder="Paste JWT from auth popup here"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Button disabled={jwtDecoding} onClick={() => void handleDecodeJwt()} startIcon={<RefreshIcon />} variant="contained">
              {jwtDecoding ? 'Decoding…' : 'Decode JWT'}
            </Button>
            <Button disabled={jwtDecoding || !jwtInput.trim()} onClick={() => { setJwtInput(''); setJwtDecodeResult(null); }} variant="outlined">
              Clear
            </Button>
          </Stack>
          {jwtDecodeResult ? (
            <Stack spacing={1}>
              <Typography color="text.secondary" variant="body2">
                Kind: {jwtDecodeResult.subject_kind} • Verified: {jwtDecodeResult.verified ? 'yes' : 'no'} • Expired: {jwtDecodeResult.is_expired == null ? 'unknown' : (jwtDecodeResult.is_expired ? 'yes' : 'no')}
              </Typography>
              {jwtDecodeResult.expires_at ? (
                <Typography color="text.secondary" variant="body2">Expires at: {formatCreatedAt(jwtDecodeResult.expires_at)}</Typography>
              ) : null}
              {jwtDecodeResult.parse_error ? <Alert severity="warning">{jwtDecodeResult.parse_error}</Alert> : null}
              {jwtDecodeResult.verify_error ? <Alert severity="warning">{jwtDecodeResult.verify_error}</Alert> : null}
              <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(jwtDecodeResult.header)}</pre>
              <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(jwtDecodeResult.payload)}</pre>
            </Stack>
          ) : null}
        </Stack>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} sx={{ flexWrap: 'wrap' }}>
          <TextField label="Event type" size="small" value={eventType} onChange={(event) => setEventType(event.target.value)} sx={{ minWidth: 160 }} />
          <TextField label="Action" size="small" value={action} onChange={(event) => setAction(event.target.value)} sx={{ minWidth: 140 }} />
          <TextField label="Source" size="small" value={source} onChange={(event) => setSource(event.target.value)} sx={{ minWidth: 140 }} />
          <TextField label="Stage" size="small" value={stage} onChange={(event) => setStage(event.target.value)} sx={{ minWidth: 160 }} />
          <TextField label="Email" size="small" value={email} onChange={(event) => setEmail(event.target.value)} sx={{ minWidth: 220 }} />
          <TextField label="Account ID" size="small" value={accountId} onChange={(event) => setAccountId(event.target.value)} sx={{ minWidth: 180 }} />
          <TextField label="Terminal user ID" size="small" value={terminalUserId} onChange={(event) => setTerminalUserId(event.target.value)} sx={{ minWidth: 180 }} />
          <TextField label={t.search || 'Search'} size="small" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 220, flex: 1 }} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button disabled={loading} onClick={handleApplyFilters} startIcon={<RefreshIcon />} variant="outlined">
            {t.adminChatsReload || 'Обновить'}
          </Button>
          <Button disabled={loading || copying} onClick={() => void handleCopyText()} startIcon={<ContentCopyIcon />} variant="outlined">
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