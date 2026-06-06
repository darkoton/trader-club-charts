import { useCallback, useEffect, useMemo, useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
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
  createAdmin,
  deleteAdmin,
  listAdmins,
  searchAdminUsers,
  updateAdmin,
  type AdminCreatePayload,
  type AdminSearchUser,
  type AdminUpdatePayload,
  type AdminUser,
} from '../api/adminAdmins';
import { AdminMrtProvider } from './AdminMrtProvider';

interface AdminAdminsProps {
  isActive: boolean;
  t: Record<string, string>;
}

type CreateRowSaveArgs = Parameters<NonNullable<MRT_TableOptions<AdminUser>['onCreatingRowSave']>>[0];
type EditRowSaveArgs = Parameters<NonNullable<MRT_TableOptions<AdminUser>['onEditingRowSave']>>[0];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCreatedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getAdminDisplayName(admin: AdminUser): string {
  const fullName = [admin.first_name, admin.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (admin.username) return `@${admin.username}`;
  if (admin.user_id) return `TG ${admin.user_id}`;
  if (admin.terminal_user_id) return admin.terminal_user_id;
  return admin.id;
}

function getCandidateLabel(user: AdminSearchUser): string {
  if (user.type === 'tg') {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (fullName && user.username) return `${fullName} (@${user.username})`;
    if (fullName) return fullName;
    if (user.username) return `@${user.username}`;
    return `TG ${user.user_id}`;
  }

  return user.email;
}

function samePermissions(left: string[], right: string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function togglePermission(current: string[], permission: string, enabled: boolean): string[] {
  if (enabled) {
    return [...new Set([...current, permission])];
  }

  return current.filter((item) => item !== permission);
}

function renderPermissions(permissions: string[]) {
  if (permissions.length === 0) {
    return <Chip label="Нет прав" size="small" variant="outlined" />;
  }

  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
      {permissions.map((permission) => (
        <Chip key={permission} color="primary" label={permission} size="small" variant="outlined" />
      ))}
    </Stack>
  );
}

export function AdminAdmins({ isActive }: AdminAdminsProps) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [addSearch, setAddSearch] = useState('');
  const [searchType, setSearchType] = useState<'' | 'tg' | 'terminal'>('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTouched, setSearchTouched] = useState(false);
  const [searchResults, setSearchResults] = useState<AdminSearchUser[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<AdminSearchUser | null>(null);
  const [newAdminSource, setNewAdminSource] = useState<'tg' | 'terminal'>('terminal');
  const [newAdminTgUserId, setNewAdminTgUserId] = useState('');
  const [newAdminTerminalUserId, setNewAdminTerminalUserId] = useState('');
  const [newAdminPermissions, setNewAdminPermissions] = useState<string[]>(['basic']);

  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [editingActive, setEditingActive] = useState(false);

  const resetCreateState = useCallback(() => {
    setAddSearch('');
    setSearchType('');
    setSearchTouched(false);
    setSearchResults([]);
    setSelectedCandidate(null);
    setNewAdminSource('terminal');
    setNewAdminTgUserId('');
    setNewAdminTerminalUserId('');
    setNewAdminPermissions(['basic']);
  }, []);

  const loadAdmins = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAdmins();
      setAdmins(data);
    } catch (err) {
      setAdmins([]);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadAdmins();
  }, [isActive, loadAdmins]);

  const handleSearchUsers = useCallback(async () => {
    if (!addSearch.trim()) {
      setSearchTouched(true);
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setSearchTouched(true);
    setError(null);
    try {
      const result = await searchAdminUsers(addSearch.trim(), searchType || undefined, 20);
      setSearchResults([...result.tg, ...result.terminal]);
    } catch (err) {
      setSearchResults([]);
      setError(formatError(err));
    } finally {
      setSearchLoading(false);
    }
  }, [addSearch, searchType]);

  const handlePrefillCandidate = useCallback((user: AdminSearchUser) => {
    setSelectedCandidate(user);
    if (user.type === 'tg') {
      setNewAdminSource('tg');
      setNewAdminTgUserId(String(user.user_id));
      setNewAdminTerminalUserId('');
    } else {
      setNewAdminSource('terminal');
      setNewAdminTerminalUserId(user.terminal_user_id);
      setNewAdminTgUserId('');
    }
    setError(null);
    setSuccess('ID пользователя подставлен в форму создания');
  }, []);

  const handleCreateAdmin: MRT_TableOptions<AdminUser>['onCreatingRowSave'] = useCallback(
    async ({ exitCreatingMode }: CreateRowSaveArgs) => {
      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
        if (newAdminPermissions.length === 0) {
          setError('Выберите хотя бы одно право');
          return;
        }

        const payload: AdminCreatePayload = {
          permissions: newAdminPermissions,
        };

        if (newAdminSource === 'tg') {
          const userId = Number(newAdminTgUserId.trim());
          if (!Number.isFinite(userId) || userId <= 0) {
            setError('Введите корректный Telegram user_id');
            return;
          }
          payload.user_id = userId;
        } else {
          const terminalId = newAdminTerminalUserId.trim();
          if (!terminalId) {
            setError('Введите корректный terminal_user_id');
            return;
          }
          payload.terminal_user_id = terminalId;
        }

        const created = await createAdmin(payload);
        setAdmins((prev) => [created, ...prev]);
        setSuccess(`Администратор ${getAdminDisplayName(created)} добавлен`);
        resetCreateState();
        exitCreatingMode();
      } catch (err) {
        setError(formatError(err));
      } finally {
        setSaving(false);
      }
    },
    [newAdminPermissions, newAdminSource, newAdminTerminalUserId, newAdminTgUserId, resetCreateState],
  );

  const handleUpdateAdmin: MRT_TableOptions<AdminUser>['onEditingRowSave'] = useCallback(
    async ({ exitEditingMode, row }: EditRowSaveArgs) => {
      const admin = row.original;
      const payload: AdminUpdatePayload = {};

      if (!samePermissions(editingPermissions, admin.permissions)) {
        payload.permissions = editingPermissions;
      }
      if (editingActive !== admin.is_active) {
        payload.is_active = editingActive;
      }

      if (Object.keys(payload).length === 0) {
        setError('Нет изменений для сохранения');
        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const updated = await updateAdmin(admin.id, payload);
        setAdmins((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setSuccess(`Права администратора ${getAdminDisplayName(updated)} обновлены`);
        exitEditingMode();
      } catch (err) {
        setError(formatError(err));
      } finally {
        setSaving(false);
      }
    },
    [editingActive, editingPermissions],
  );

  const handleDeleteAdmin = useCallback(async (admin: AdminUser, table: MRT_TableInstance<AdminUser>) => {
    if (!window.confirm(`Удалить администратора ${getAdminDisplayName(admin)}?`)) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdmin(admin.id);
      setAdmins((prev) => prev.filter((item) => item.id !== admin.id));
      setSuccess(`Администратор ${getAdminDisplayName(admin)} удалён`);
      table.setEditingRow(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setDeleting(false);
    }
  }, []);

  const columns = useMemo<MRT_ColumnDef<AdminUser>[]>(
    () => [
      {
        id: 'display_name',
        header: 'Администратор',
        accessorFn: (row) => getAdminDisplayName(row),
        enableEditing: false,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontWeight: 700 }}>{getAdminDisplayName(row.original)}</Typography>
            <Typography color="text.secondary" variant="caption">
              {row.original.username
                ? `@${row.original.username}`
                : row.original.user_id
                  ? `TG ${row.original.user_id}`
                  : 'Terminal user'}
            </Typography>
          </Stack>
        ),
      },
      {
        id: 'source',
        header: 'Источник',
        accessorFn: (row) => (row.user_id ? 'Telegram' : 'Terminal'),
        enableEditing: false,
        Cell: ({ row }) => (
          <Chip
            color={row.original.user_id ? 'primary' : 'default'}
            label={row.original.user_id ? 'Telegram' : 'Terminal'}
            size="small"
            variant={row.original.user_id ? 'filled' : 'outlined'}
          />
        ),
      },
      {
        id: 'identifier',
        header: 'ID',
        accessorFn: (row) => row.user_id?.toString() || row.terminal_user_id || '—',
        enableEditing: false,
        Cell: ({ row }) => (
          <Typography sx={{ fontFamily: 'Monaco, Menlo, monospace' }} variant="body2">
            {row.original.user_id || row.original.terminal_user_id || '—'}
          </Typography>
        ),
      },
      {
        id: 'permissions',
        header: 'Права',
        accessorFn: (row) => row.permissions.join(', '),
        enableEditing: false,
        Cell: ({ row }) => renderPermissions(row.original.permissions),
        size: 220,
      },
      {
        accessorKey: 'is_active',
        header: 'Статус',
        enableEditing: false,
        Cell: ({ cell }) => (
          <Chip
            color={cell.getValue<boolean>() ? 'success' : 'default'}
            label={cell.getValue<boolean>() ? 'Активен' : 'Отключён'}
            size="small"
            variant={cell.getValue<boolean>() ? 'filled' : 'outlined'}
          />
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Создан',
        enableEditing: false,
        Cell: ({ cell }) => formatCreatedAt(cell.getValue<string>()),
      },
    ],
    [],
  );

  const table = useMaterialReactTable({
    columns,
    data: admins,
    createDisplayMode: 'modal',
    editDisplayMode: 'modal',
    enableEditing: true,
    enableRowActions: true,
    getRowId: (row) => row.id,
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
    muiCreateRowModalProps: () => ({
      fullWidth: true,
      maxWidth: 'md',
      open: true,
    }),
    muiEditRowDialogProps: () => ({
      fullWidth: true,
      maxWidth: 'md',
      open: true,
    }),
    muiSearchTextFieldProps: {
      placeholder: 'Фильтр по имени, username, ID...',
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
    onCreatingRowCancel: () => {
      setError(null);
      resetCreateState();
    },
    onCreatingRowSave: handleCreateAdmin,
    onEditingRowCancel: () => {
      setError(null);
      setEditingPermissions([]);
      setEditingActive(false);
    },
    onEditingRowSave: handleUpdateAdmin,
    positionActionsColumn: 'last',
    renderCreateRowDialogContent: ({ row, table }) => (
      <>
        <DialogTitle>Добавить администратора</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Alert severity="info">
              Поиск понимает имя и username, числовые user_id или trader_id, а для terminal-пользователей принимает точный `_id`. Нажмите «Подставить», чтобы не ошибиться с ID.
            </Alert>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                label="Поисковый запрос"
                onChange={(event) => setAddSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSearchUsers();
                  }
                }}
                placeholder="john, 123456789, 664a1f9afe908015dcc74f"
                value={addSearch}
              />
              <TextField
                label="Источник"
                onChange={(event) => setSearchType(event.target.value as '' | 'tg' | 'terminal')}
                select
                sx={{ minWidth: { md: 180 } }}
                value={searchType}
              >
                <MenuItem value="">Все источники</MenuItem>
                <MenuItem value="tg">Telegram</MenuItem>
                <MenuItem value="terminal">Terminal</MenuItem>
              </TextField>
              <Button
                disabled={searchLoading || !addSearch.trim()}
                onClick={() => void handleSearchUsers()}
                startIcon={<SearchIcon />}
                variant="contained"
              >
                Найти
              </Button>
            </Stack>

            <Stack spacing={1}>
              {searchResults.map((user) => (
                <Box
                  key={user.type === 'tg' ? `tg-${user.user_id}` : `terminal-${user.terminal_user_id}`}
                  sx={{
                    alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 2,
                    display: 'flex',
                    gap: 2,
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 1.25,
                  }}
                >
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{getCandidateLabel(user)}</Typography>
                    <Typography color="text.secondary" variant="body2">
                      {user.type === 'tg'
                        ? `Telegram user_id ${user.user_id}${user.trader_id ? ` • trader_id ${user.trader_id}` : ''}`
                        : `Terminal _id ${user.terminal_user_id}${user.trader_id ? ` • trader_id ${user.trader_id}` : ''}`}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    {user.is_admin && <Chip color="warning" label="Уже админ" size="small" />}
                    <Button
                      disabled={user.is_admin}
                      onClick={() => handlePrefillCandidate(user)}
                      variant="outlined"
                    >
                      Подставить
                    </Button>
                  </Stack>
                </Box>
              ))}

              {searchTouched && !searchLoading && searchResults.length === 0 && addSearch.trim() && (
                <Alert severity="warning">Совпадений не найдено</Alert>
              )}
            </Stack>

            {selectedCandidate && (
              <Alert severity="success">Выбран пользователь: {getCandidateLabel(selectedCandidate)}</Alert>
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                label="Тип администратора"
                onChange={(event) => setNewAdminSource(event.target.value as 'tg' | 'terminal')}
                select
                sx={{ minWidth: { md: 220 } }}
                value={newAdminSource}
              >
                <MenuItem value="terminal">Terminal</MenuItem>
                <MenuItem value="tg">Telegram</MenuItem>
              </TextField>

              {newAdminSource === 'tg' ? (
                <TextField
                  fullWidth
                  label="Telegram user_id"
                  onChange={(event) => setNewAdminTgUserId(event.target.value)}
                  value={newAdminTgUserId}
                />
              ) : (
                <TextField
                  fullWidth
                  label="Terminal user _id"
                  onChange={(event) => setNewAdminTerminalUserId(event.target.value)}
                  value={newAdminTerminalUserId}
                />
              )}
            </Stack>

            <Box>
              <Typography gutterBottom sx={{ fontWeight: 700 }} variant="body2">
                Права доступа
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={newAdminPermissions.includes('basic')}
                      onChange={(event) => {
                        setNewAdminPermissions((prev) => togglePermission(prev, 'basic', event.target.checked));
                      }}
                    />
                  }
                  label="basic"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={newAdminPermissions.includes('super')}
                      onChange={(event) => {
                        setNewAdminPermissions((prev) => togglePermission(prev, 'super', event.target.checked));
                      }}
                    />
                  }
                  label="super"
                />
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <MRT_EditActionButtons row={row} table={table} variant="text" />
        </DialogActions>
      </>
    ),
    renderEditRowDialogContent: ({ row, table }) => {
      const admin = row.original;

      return (
        <>
          <DialogTitle>Редактирование администратора</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}

              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                }}
              >
                <TextField label="Имя" value={getAdminDisplayName(admin)} slotProps={{ input: { readOnly: true } }} />
                <TextField
                  label="Источник"
                  value={admin.user_id ? 'Telegram' : 'Terminal'}
                  slotProps={{ input: { readOnly: true } }}
                />
                <TextField label="Admin ID" value={admin.id} slotProps={{ input: { readOnly: true } }} />
                <TextField
                  label={admin.user_id ? 'Telegram user_id' : 'Terminal user_id'}
                  value={admin.user_id || admin.terminal_user_id || ''}
                  slotProps={{ input: { readOnly: true } }}
                />
                <TextField label="Username" value={admin.username || ''} slotProps={{ input: { readOnly: true } }} />
                <TextField label="Создан" value={formatCreatedAt(admin.created_at)} slotProps={{ input: { readOnly: true } }} />
              </Box>

              <Box>
                <Typography gutterBottom sx={{ fontWeight: 700 }} variant="body2">
                  Права доступа
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editingPermissions.includes('basic')}
                        onChange={(event) => {
                          setEditingPermissions((prev) => togglePermission(prev, 'basic', event.target.checked));
                        }}
                      />
                    }
                    label="basic"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editingPermissions.includes('super')}
                        onChange={(event) => {
                          setEditingPermissions((prev) => togglePermission(prev, 'super', event.target.checked));
                        }}
                      />
                    }
                    label="super"
                  />
                </Stack>
              </Box>

              <FormControlLabel
                control={<Switch checked={editingActive} onChange={(event) => setEditingActive(event.target.checked)} />}
                label="Администратор активен"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
            <Button
              color="error"
              disabled={saving || deleting}
              onClick={() => void handleDeleteAdmin(admin, table)}
              variant="outlined"
            >
              Удалить
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
            setEditingPermissions(row.original.permissions);
            setEditingActive(row.original.is_active);
            setError(null);
            setSuccess(null);
            table.setEditingRow(row);
          }}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
    ),
    renderTopToolbarCustomActions: ({ table }) => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          onClick={() => {
            resetCreateState();
            setError(null);
            setSuccess(null);
            table.setCreatingRow(true);
          }}
          startIcon={<PersonAddAlt1Icon />}
          variant="contained"
        >
          Добавить админа
        </Button>
        <Button disabled={loading} onClick={() => void loadAdmins()} startIcon={<RefreshIcon />} variant="outlined">
          Обновить
        </Button>
      </Stack>
    ),
    state: {
      isLoading: loading,
      isSaving: saving || deleting,
      showProgressBars: loading,
    },
  });

  if (!isActive) return null;

  return (
    <AdminMrtProvider>
      <Stack className="admin-admins" spacing={2}>
        <Alert severity="info">
          Раздел переведён на Material React Table. Создание и редактирование администраторов идут через штатные modal popup MRT, а поиск terminal/TG пользователей встроен прямо в create-модалку.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <MaterialReactTable table={table} />
      </Stack>
    </AdminMrtProvider>
  );
}