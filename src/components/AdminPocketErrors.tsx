import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
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
  getAdminPocketError,
  getAdminPocketErrorOccurrences,
  getAdminPocketErrors,
  patchAdminPocketError,
  type PocketErrorCatalogItem,
  type PocketErrorOccurrencesResponse,
  type PocketErrorTranslationStatus,
} from '../api/adminPocketErrors';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminPocketErrorsProps {
  isActive: boolean;
  t: Record<string, string>;
}

interface PocketErrorDraft {
  translation_ru: string;
  translation_en: string;
  translation_uk: string;
  translation_status: PocketErrorTranslationStatus;
  admin_note: string;
}

const TRANSLATION_STATUS_OPTIONS: Array<{ value: PocketErrorTranslationStatus; label: string }> = [
  { value: 'new', label: 'new' },
  { value: 'partial', label: 'partial' },
  { value: 'translated', label: 'translated' },
  { value: 'ignored', label: 'ignored' },
];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCreatedAt(value?: string | null): string {
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

function createDraft(item: PocketErrorCatalogItem): PocketErrorDraft {
  return {
    translation_ru: item.translation_ru || item.translations?.ru || '',
    translation_en: item.translation_en || item.translations?.en || '',
    translation_uk: item.translation_uk || item.translations?.uk || '',
    translation_status: item.translation_status || 'new',
    admin_note: item.admin_note || '',
  };
}

function getTranslationStatusColor(status: PocketErrorTranslationStatus): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'translated') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'ignored') return 'error';
  return 'default';
}

export function AdminPocketErrors({ isActive, t }: AdminPocketErrorsProps) {
  const [items, setItems] = useState<PocketErrorCatalogItem[]>([]);
  const [details, setDetails] = useState<Record<string, PocketErrorCatalogItem>>({});
  const [occurrences, setOccurrences] = useState<Record<string, PocketErrorOccurrencesResponse>>({});
  const [drafts, setDrafts] = useState<Record<string, PocketErrorDraft>>({});
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [translationStatus, setTranslationStatus] = useState<PocketErrorTranslationStatus | ''>('');
  const [search, setSearch] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    source: '',
    stage: '',
    status: '',
    translationStatus: '' as PocketErrorTranslationStatus | '',
    search: '',
  });
  const [pagination, setPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 100 });
  const [loading, setLoading] = useState(false);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const skip = pagination.pageIndex * pagination.pageSize;
  const limit = pagination.pageSize;

  const queryParams = useMemo(() => ({
    ...(appliedFilters.source ? { source: appliedFilters.source } : {}),
    ...(appliedFilters.stage ? { stage: appliedFilters.stage } : {}),
    ...(appliedFilters.status ? { status: appliedFilters.status } : {}),
    ...(appliedFilters.translationStatus ? { translation_status: appliedFilters.translationStatus } : {}),
    ...(appliedFilters.search ? { search: appliedFilters.search } : {}),
    limit,
    skip,
  }), [appliedFilters.search, appliedFilters.source, appliedFilters.stage, appliedFilters.status, appliedFilters.translationStatus, limit, skip]);

  const loadCatalog = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminPocketErrors(queryParams);
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
    void loadCatalog();
  }, [isActive, loadCatalog]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({
      source: source.trim(),
      stage: stage.trim(),
      status: status.trim(),
      translationStatus,
      search: search.trim(),
    });
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [search, source, stage, status, translationStatus]);

  const loadDetails = useCallback(async (item: PocketErrorCatalogItem) => {
    if (details[item.id] && occurrences[item.id]) return;

    setLoadingDetailsId(item.id);
    setError(null);
    try {
      const [detail, occurrenceData] = await Promise.all([
        getAdminPocketError(item.id),
        getAdminPocketErrorOccurrences(item.id, { limit: 50, skip: 0 }),
      ]);
      setDetails((prev) => ({ ...prev, [item.id]: detail }));
      setOccurrences((prev) => ({ ...prev, [item.id]: occurrenceData }));
      setDrafts((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: createDraft(detail) }));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoadingDetailsId(null);
    }
  }, [details, occurrences]);

  const updateDraft = useCallback((itemId: string, patch: Partial<PocketErrorDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || createDraft(details[itemId] || items.find((item) => item.id === itemId) || {
          id: itemId,
          signature: '',
          canonical_message: '',
          occurrences_count: 0,
          translation_status: 'new',
          created_at: new Date().toISOString(),
        } as PocketErrorCatalogItem)),
        ...patch,
      },
    }));
  }, [details, items]);

  const handleSave = useCallback(async (itemId: string) => {
    const draft = drafts[itemId];
    if (!draft) return;

    setSavingId(itemId);
    setError(null);
    setSuccess(null);
    try {
      const updated = await patchAdminPocketError(itemId, {
        translation_ru: draft.translation_ru.trim() || null,
        translation_en: draft.translation_en.trim() || null,
        translation_uk: draft.translation_uk.trim() || null,
        translation_status: draft.translation_status,
        admin_note: draft.admin_note.trim() || null,
      });
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
      setDetails((prev) => ({ ...prev, [itemId]: updated }));
      setDrafts((prev) => ({ ...prev, [itemId]: createDraft(updated) }));
      setSuccess('Pocket error translations saved');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSavingId(null);
    }
  }, [drafts]);

  const columns = useMemo<MRT_ColumnDef<PocketErrorCatalogItem>[]>(() => [
    {
      accessorKey: 'last_seen_at',
      header: 'Последний случай',
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{formatCreatedAt(row.original.last_seen_at || row.original.created_at)}</Typography>
          <Typography color="text.secondary" variant="caption">First seen: {formatCreatedAt(row.original.first_seen_at || row.original.created_at)}</Typography>
        </Stack>
      ),
      size: 220,
    },
    {
      id: 'signature',
      header: 'Ошибка',
      accessorFn: (row) => `${row.signature} ${row.canonical_message}`,
      Cell: ({ row }) => (
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {row.original.source ? <Chip label={row.original.source} size="small" color="primary" variant="outlined" /> : null}
            {row.original.stage ? <Chip label={row.original.stage} size="small" variant="outlined" /> : null}
            {typeof row.original.status === 'number' ? <Chip label={`HTTP ${row.original.status}`} size="small" color="secondary" variant="outlined" /> : null}
          </Stack>
          <Typography sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }} variant="body2">{row.original.canonical_message}</Typography>
          <Typography color="text.secondary" variant="caption">{row.original.signature}</Typography>
        </Stack>
      ),
      size: 420,
    },
    {
      accessorKey: 'translation_status',
      header: 'Перевод',
      Cell: ({ row }) => (
        <Stack spacing={0.5}>
          <Chip color={getTranslationStatusColor(row.original.translation_status)} label={row.original.translation_status} size="small" variant="filled" />
          <Typography color="text.secondary" variant="caption">Occurrences: {row.original.occurrences_count}</Typography>
        </Stack>
      ),
      size: 140,
    },
    {
      id: 'translations',
      header: 'Локали',
      accessorFn: (row) => `${row.translation_ru || ''} ${row.translation_en || ''} ${row.translation_uk || ''}`,
      Cell: ({ row }) => (
        <Stack spacing={0.25}>
          <Typography variant="caption">RU: {row.original.translation_ru || '—'}</Typography>
          <Typography variant="caption">EN: {row.original.translation_en || '—'}</Typography>
          <Typography variant="caption">UK: {row.original.translation_uk || '—'}</Typography>
        </Stack>
      ),
      size: 300,
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
      const occurrenceData = occurrences[row.original.id];
      const draft = drafts[row.original.id] ?? createDraft(detail);
      return (
        <Stack spacing={1.5} sx={{ p: 2 }}>
          {loadingDetailsId === row.original.id ? <Typography color="text.secondary" variant="body2">{t.loading}</Typography> : null}
          <Typography variant="body2"><strong>Normalized:</strong> {detail.normalized_message || '—'}</Typography>
          <Typography variant="body2"><strong>Endpoint:</strong> {detail.endpoint || detail.endpoint_path || '—'}</Typography>
          <TextField
            label="Translation RU"
            multiline
            minRows={2}
            value={draft.translation_ru}
            onChange={(event) => updateDraft(row.original.id, { translation_ru: event.target.value })}
          />
          <TextField
            label="Translation EN"
            multiline
            minRows={2}
            value={draft.translation_en}
            onChange={(event) => updateDraft(row.original.id, { translation_en: event.target.value })}
          />
          <TextField
            label="Translation UK"
            multiline
            minRows={2}
            value={draft.translation_uk}
            onChange={(event) => updateDraft(row.original.id, { translation_uk: event.target.value })}
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
            <TextField
              select
              label="Translation status"
              sx={{ minWidth: 180 }}
              value={draft.translation_status}
              onChange={(event) => updateDraft(row.original.id, { translation_status: event.target.value as PocketErrorTranslationStatus })}
            >
              {TRANSLATION_STATUS_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </TextField>
            <Button
              disabled={savingId === row.original.id}
              onClick={() => void handleSave(row.original.id)}
              startIcon={<SaveIcon />}
              variant="contained"
              sx={{ alignSelf: { xs: 'stretch', md: 'center' } }}
            >
              {savingId === row.original.id ? '…' : 'Save'}
            </Button>
          </Stack>
          <TextField
            label="Admin note"
            multiline
            minRows={2}
            value={draft.admin_note}
            onChange={(event) => updateDraft(row.original.id, { admin_note: event.target.value })}
          />
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(detail.response_payload_sample)}</pre>
          <Stack spacing={0.75}>
            <Typography variant="subtitle2">Raw occurrences</Typography>
            {occurrenceData?.items?.length ? occurrenceData.items.map((occurrence) => (
              <Stack key={occurrence.id} spacing={0.35} sx={{ p: 1.25, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <Typography variant="caption">{formatCreatedAt(occurrence.created_at)}</Typography>
                <Typography variant="body2">{occurrence.error_message || '—'}</Typography>
                <Typography color="text.secondary" variant="caption">{occurrence.email || '—'} · account {occurrence.account_id || '—'} · terminal {occurrence.terminal_user_id || '—'}</Typography>
              </Stack>
            )) : (
              <Typography color="text.secondary" variant="body2">No occurrences loaded</Typography>
            )}
          </Stack>
        </Stack>
      );
    },
    renderTopToolbarCustomActions: () => (
      <Stack spacing={1.5} sx={{ py: 0.5, width: '100%' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} sx={{ flexWrap: 'wrap' }}>
          <TextField label="Source" size="small" value={source} onChange={(event) => setSource(event.target.value)} sx={{ minWidth: 160 }} />
          <TextField label="Stage" size="small" value={stage} onChange={(event) => setStage(event.target.value)} sx={{ minWidth: 180 }} />
          <TextField label="HTTP status" size="small" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 140 }} />
          <TextField
            select
            label="Translation status"
            size="small"
            value={translationStatus}
            onChange={(event) => setTranslationStatus(event.target.value as PocketErrorTranslationStatus | '')}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All</MenuItem>
            {TRANSLATION_STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
          <TextField label={t.search || 'Search'} size="small" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 240, flex: 1 }} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button disabled={loading} onClick={handleApplyFilters} startIcon={<RefreshIcon />} variant="outlined">
            {t.adminChatsReload || 'Обновить'}
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
