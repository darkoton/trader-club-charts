/**
 * AdminPanel — Full-screen modal for admin users.
 *
 * Two tabs:
 *  1. Category Icons — set emoji or upload file for each category
 *  2. Currency Icons — set emoji or upload file for each currency
 *
 * Supports two icon types:
 *  - Emoji — typed into an input field (1-8 chars)
 *  - File  — PNG / SVG / WEBP upload (max 512 KB)
 */

import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent, type DragEvent } from 'react';
import { useI18n } from '../i18n';
import { getCurrencies, getCategories, type Currency, type CategoryInfo } from '../api/currencies';
import { AdminIndicatorEditor } from './AdminIndicatorEditor';
import { AdminCopyTraders } from './AdminCopyTraders';
import {
  getIconOverrides,
  setCategoryIcon,
  setCurrencyIcon,
  uploadCategoryIcon,
  uploadCurrencyIcon,
  removeCategoryIcon,
  removeCurrencyIcon,
  isIconUrl,
  getIconFullUrl,
  ICON_ACCEPT,
  ICON_MAX_SIZE,
  type IconOverrides,
  getCurrencyMapping,
  patchCurrencyMapping,
  autoMapCurrencies,
  type CurrencyMappingItem,
  type AutoMapResult,
} from '../api/admin';
import { getPoAssets, getAccounts, getCandleStats, type PoAsset, type CandleStatPoint } from '../api/better';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'categories' | 'currencies' | 'indicators' | 'mapping' | 'copyTraders' | 'quotes';
type IconMode = 'emoji' | 'file';

/* ─── Validate dropped / selected file ─── */
const ALLOWED_TYPES = ['image/png', 'image/svg+xml', 'image/webp'];

function validateFile(file: File, t: Record<string, string>): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return t.adminInvalidFormat;
  if (file.size > ICON_MAX_SIZE) return t.adminFileTooLarge;
  return null;
}

/* ─── Icon preview helper ─── */
function IconPreview({ value }: { value: string | undefined }) {
  if (!value) return <span className="admin-icon-preview admin-icon-preview--empty">—</span>;
  if (isIconUrl(value)) {
    return (
      <img
        className="admin-icon-preview admin-icon-preview--img"
        src={getIconFullUrl(value)}
        alt="icon"
        loading="lazy"
      />
    );
  }
  return <span className="admin-icon-preview admin-icon-preview--emoji">{value}</span>;
}

/* ─── Single row: icon editor ─── */
interface IconRowProps {
  name: string;
  displayName?: string;
  subtitle?: string;
  savedIcon: string | undefined;
  onSaveEmoji: (name: string, emoji: string) => Promise<void>;
  onUploadFile: (name: string, file: File) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  saving: string | null;
  t: Record<string, string>;
}

export function IconRow({ name, displayName, subtitle, savedIcon, onSaveEmoji, onUploadFile, onDelete, saving, t }: IconRowProps) {
  const [mode, setMode] = useState<IconMode>('emoji');
  const [emojiVal, setEmojiVal] = useState(savedIcon && !isIconUrl(savedIcon) ? savedIcon : '');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isSaving = saving === name;

  // Sync emoji input when savedIcon changes externally
  useEffect(() => {
    if (savedIcon && !isIconUrl(savedIcon)) {
      setEmojiVal(savedIcon);
    } else if (!savedIcon) {
      setEmojiVal('');
    }
  }, [savedIcon]);

  const isEmojiChanged = emojiVal.trim() !== '' && emojiVal.trim() !== (savedIcon && !isIconUrl(savedIcon) ? savedIcon : '');

  /* ─── File handling ─── */
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const err = validateFile(file, t);
    if (err) { setError(err); return; }

    // Show local preview instantly
    const url = URL.createObjectURL(file);
    setLocalPreview(url);

    try {
      await onUploadFile(name, file);
    } catch {
      setError('Upload failed');
      setLocalPreview(null);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [name, onUploadFile, t]);

  const handleFileInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  }, [handleFile]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);

  /* ─── Emoji save ─── */
  const handleSaveEmoji = useCallback(async () => {
    setError(null);
    try {
      await onSaveEmoji(name, emojiVal.trim());
      setLocalPreview(null);
    } catch {
      setError('Save failed');
    }
  }, [name, emojiVal, onSaveEmoji]);

  /* ─── Delete ─── */
  const handleDelete = useCallback(async () => {
    setError(null);
    try {
      await onDelete(name);
      setEmojiVal('');
      setLocalPreview(null);
    } catch {
      setError('Delete failed');
    }
  }, [name, onDelete]);

  // Determine preview: local preview (right after upload) → saved icon
  const previewValue = localPreview
    ? undefined // we'll show localPreview via img directly
    : savedIcon;

  return (
    <div className="admin-panel__row">
      {/* Info */}
      <div className="admin-panel__row-info">
        {subtitle && <span className="admin-panel__row-cat">{subtitle}</span>}
        <span className="admin-panel__row-name">{displayName || name}</span>
      </div>

      {/* Current icon preview */}
      <div className="admin-panel__row-preview">
        {localPreview ? (
          <img className="admin-icon-preview admin-icon-preview--img" src={localPreview} alt="preview" />
        ) : (
          <IconPreview value={previewValue} />
        )}
      </div>

      {/* Mode toggle */}
      <div className="admin-panel__mode-toggle">
        <button
          className={`admin-panel__mode-btn${mode === 'emoji' ? ' admin-panel__mode-btn--active' : ''}`}
          onClick={() => { setMode('emoji'); setError(null); }}
          title={t.adminEmoji}
        >
          😀
        </button>
        <button
          className={`admin-panel__mode-btn${mode === 'file' ? ' admin-panel__mode-btn--active' : ''}`}
          onClick={() => { setMode('file'); setError(null); }}
          title={t.adminUploadFile}
        >
          📁
        </button>
      </div>

      {/* Input area */}
      <div className="admin-panel__row-input">
        {mode === 'emoji' ? (
          <div className="admin-panel__emoji-row">
            <input
              className="admin-panel__icon-input"
              type="text"
              value={emojiVal}
              onChange={(e) => { setEmojiVal(e.target.value); setError(null); }}
              placeholder="😀"
              maxLength={8}
            />
            <button
              className={`admin-panel__save-btn${isEmojiChanged ? ' admin-panel__save-btn--changed' : ''}`}
              onClick={handleSaveEmoji}
              disabled={isSaving || !isEmojiChanged}
            >
              {isSaving ? '…' : t.save}
            </button>
          </div>
        ) : (
          <div
            className={`admin-panel__drop-zone${dragOver ? ' admin-panel__drop-zone--active' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ICON_ACCEPT}
              onChange={handleFileInput}
              className="admin-panel__file-input"
            />
            <span className="admin-panel__drop-label">
              {isSaving ? '…' : t.adminDragOrClick}
            </span>
            <span className="admin-panel__drop-hint">PNG / SVG / WEBP · 512 KB</span>
          </div>
        )}
      </div>

      {/* Delete button */}
      {savedIcon && (
        <button
          className="admin-panel__delete-btn"
          onClick={handleDelete}
          disabled={isSaving}
          title={t.adminDeleteIcon}
        >
          🗑
        </button>
      )}

      {/* Error toast */}
      {error && <div className="admin-panel__row-error">{error}</div>}
    </div>
  );
}

/* ════════════════════════════════════════
   MappingRow — single currency → PO asset selector
   ════════════════════════════════════════ */

interface MappingRowProps {
  item: CurrencyMappingItem;
  poAssets: PoAsset[];
  saving: boolean;
  onPatch: (currency: string, apiName: string | null) => Promise<void>;
  t: Record<string, string>;
}

function MappingRow({ item, poAssets, saving, onPatch, t }: MappingRowProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return poAssets.slice(0, 50);
    return poAssets.filter((a) =>
      a.symbol.toLowerCase().includes(q) ||
      (a.label && a.label.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [poAssets, search]);

  const handleSelect = useCallback((symbol: string) => {
    setOpen(false);
    setSearch('');
    onPatch(item.currency, symbol);
  }, [item.currency, onPatch]);

  const handleClear = useCallback(() => {
    onPatch(item.currency, null);
  }, [item.currency, onPatch]);

  return (
    <div className="admin-mapping__row">
      <div className="admin-mapping__currency">
        <span className="admin-mapping__currency-name">{item.currency}</span>
        <span className="admin-mapping__currency-cat">{item.category}</span>
      </div>

      <div className="admin-mapping__arrow">→</div>

      <div className="admin-mapping__selector" ref={ref}>
        {item.api_name ? (
          <div className="admin-mapping__mapped">
            <span className="admin-mapping__mapped-name">{item.api_name}</span>
            <button
              className="admin-mapping__clear-btn"
              onClick={handleClear}
              disabled={saving}
              title={t.adminMappingClear || 'Clear'}
            >✕</button>
          </div>
        ) : (
          <button
            className="admin-mapping__select-btn"
            onClick={() => setOpen(!open)}
            disabled={saving}
          >
            {t.adminNotMapped}
          </button>
        )}

        {!item.api_name && open && (
          <div className="admin-mapping__dropdown">
            <input
              className="admin-mapping__dropdown-search"
              type="text"
              placeholder={t.search || 'Search…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="admin-mapping__dropdown-list">
              {filtered.map((a) => (
                <button
                  key={a.symbol}
                  className="admin-mapping__dropdown-item"
                  onClick={() => handleSelect(a.symbol)}
                >
                  <span className="admin-mapping__dropdown-symbol">{a.symbol}</span>
                  {a.label && <span className="admin-mapping__dropdown-label">{a.label}</span>}
                  <span className="admin-mapping__dropdown-payout">{a.payout}%</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="admin-mapping__dropdown-empty">{t.adminMappingNoAssets || 'No assets found'}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {saving && <span className="admin-mapping__saving">…</span>}
    </div>
  );
}

/* ════════════════════════════════════════
   MappingTab — auto-map + manual mapping for all currencies
   ════════════════════════════════════════ */

interface MappingTabProps {
  isActive: boolean;
  t: Record<string, string>;
}

export function MappingTab({ isActive, t }: MappingTabProps) {
  const [mapping, setMapping] = useState<CurrencyMappingItem[]>([]);
  const [poAssets, setPoAssets] = useState<PoAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [autoMapResult, setAutoMapResult] = useState<AutoMapResult | null>(null);
  const [autoMapping, setAutoMapping] = useState(false);

  /* ─── Load ─── */
  useEffect(() => {
    if (!isActive) return;
    setLoading(true);
    Promise.all([
      getCurrencyMapping().catch(() => [] as CurrencyMappingItem[]),
      getAccounts().then((accs) => {
        const active = accs.find((a) => a.is_active && a.has_tokens);
        return active ? getPoAssets(active.id) : [];
      }).catch(() => [] as PoAsset[]),
    ])
      .then(([map, assets]) => {
        setMapping(map);
        setPoAssets(Array.isArray(assets) ? assets : []);
      })
      .finally(() => setLoading(false));
  }, [isActive]);

  /* ─── Auto-map ─── */
  const handleAutoMap = useCallback(async (force: boolean) => {
    setAutoMapping(true);
    setAutoMapResult(null);
    try {
      const result = await autoMapCurrencies(force);
      setAutoMapResult(result);
      // Reload mapping
      const newMapping = await getCurrencyMapping().catch(() => [] as CurrencyMappingItem[]);
      setMapping(newMapping);
    } catch {
      // silent
    }
    setAutoMapping(false);
  }, []);

  /* ─── Patch single ─── */
  const handlePatch = useCallback(async (currency: string, apiName: string | null) => {
    setSaving(currency);
    try {
      await patchCurrencyMapping(currency, apiName);
      setMapping((prev) =>
        prev.map((m) => m.currency === currency ? { ...m, api_name: apiName } : m)
      );
    } catch {
      // silent
    }
    setSaving(null);
  }, []);

  /* ─── Filter ─── */
  const filtered = useMemo(() => {
    let list = mapping;
    if (filterMode === 'mapped') list = list.filter((m) => m.api_name);
    if (filterMode === 'unmapped') list = list.filter((m) => !m.api_name);
    const q = search.toLowerCase().trim();
    if (q) list = list.filter((m) => m.currency.toLowerCase().includes(q) || (m.api_name?.toLowerCase().includes(q)));
    return list;
  }, [mapping, filterMode, search]);

  const mappedCount = useMemo(() => mapping.filter((m) => m.api_name).length, [mapping]);
  const total = mapping.length;

  if (loading) {
    return (
      <div className="admin-panel__loading">
        <div className="loading__spinner" />
        {t.loading}
      </div>
    );
  }

  return (
    <div className="admin-mapping">
      {/* Stats + auto-map */}
      <div className="admin-mapping__toolbar">
        <div className="admin-mapping__stats">
          <span className="admin-mapping__stats-text">
            {t.adminMappedCount}: <strong>{mappedCount}</strong> / {total}
          </span>
        </div>
        <div className="admin-mapping__actions">
          <button
            className="admin-mapping__auto-btn"
            onClick={() => handleAutoMap(false)}
            disabled={autoMapping}
          >
            {autoMapping ? '…' : t.adminAutoMap}
          </button>
          <button
            className="admin-mapping__auto-btn admin-mapping__auto-btn--force"
            onClick={() => handleAutoMap(true)}
            disabled={autoMapping}
          >
            {t.adminAutoMapForce}
          </button>
        </div>
      </div>

      {/* Auto-map result banner */}
      {autoMapResult && (
        <div className="admin-mapping__result">
          ✅ {t.adminAutoMapResult}: {autoMapResult.mapped} mapped, {autoMapResult.skipped} skipped, {autoMapResult.not_found} not found
        </div>
      )}

      {/* Search + filter */}
      <div className="admin-mapping__filters">
        <input
          className="admin-panel__search-input"
          type="text"
          placeholder={t.searchCurrency}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="admin-mapping__filter-btns">
          {(['all', 'mapped', 'unmapped'] as const).map((mode) => (
            <button
              key={mode}
              className={`admin-mapping__filter-btn${filterMode === mode ? ' admin-mapping__filter-btn--active' : ''}`}
              onClick={() => setFilterMode(mode)}
            >
              {mode === 'all' ? t.adminMappingAll : mode === 'mapped' ? t.adminMappingMapped : t.adminMappingUnmapped}
            </button>
          ))}
        </div>
      </div>

      {/* Mapping list */}
      <div className="admin-mapping__list">
        {filtered.map((item) => (
          <MappingRow
            key={item.currency}
            item={item}
            poAssets={poAssets}
            saving={saving === item.currency}
            onPatch={handlePatch}
            t={t}
          />
        ))}
        {filtered.length === 0 && (
          <div className="admin-panel__empty">{t.currenciesNotFound}</div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   AdminCandleStats — quote monitoring chart
   ════════════════════════════════════════ */

const HOURS_PRESETS = [1, 3, 6, 12, 24, 48, 72, 168] as const;

interface FilledPoint {
  minute: string;
  ticks: number;
  closed_candles: number;
  isGap: boolean;
}

/** Fill missing minutes in time series */
function fillGaps(raw: CandleStatPoint[]): FilledPoint[] {
  if (raw.length === 0) return [];
  const result: FilledPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    result.push({ ...raw[i], isGap: false });
    if (i < raw.length - 1) {
      const cur = new Date(raw[i].minute).getTime();
      const next = new Date(raw[i + 1].minute).getTime();
      const diffMin = Math.round((next - cur) / 60000);
      for (let m = 1; m < diffMin; m++) {
        const ts = new Date(cur + m * 60000);
        const iso = ts.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
        result.push({ minute: iso, ticks: 0, closed_candles: 0, isGap: true });
      }
    }
  }
  return result;
}

export function AdminCandleStats({ t, isActive }: { t: Record<string, string>; isActive: boolean }) {
  const [hours, setHours] = useState(1);
  const [data, setData] = useState<CandleStatPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const filledRef = useRef<FilledPoint[]>([]);
  const layoutRef = useRef<{ padLeft: number; padRight: number; padTop: number; padBottom: number; chartW: number; chartH: number; barW: number; W: number; H: number; maxVal: number } | null>(null);

  /* ─── Fetch data ─── */
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCandleStats(hours)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [isActive, hours]);

  /* ─── Draw chart on canvas ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const filled = fillGaps(data);
    filledRef.current = filled;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD_TOP = 30;
    const PAD_BOTTOM = 50;
    const PAD_LEFT = 55;
    const PAD_RIGHT = 20;
    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const chartH = H - PAD_TOP - PAD_BOTTOM;
    const maxTicks = Math.max(...filled.map((d) => d.ticks), 1);
    const maxCandles = Math.max(...filled.map((d) => d.closed_candles), 1);
    const maxVal = Math.max(maxTicks, maxCandles);
    const barW = chartW / filled.length;

    layoutRef.current = { padLeft: PAD_LEFT, padRight: PAD_RIGHT, padTop: PAD_TOP, padBottom: PAD_BOTTOM, chartW, chartH, barW, W, H, maxVal };

    const xFor = (i: number) => PAD_LEFT + i * barW + barW / 2;
    const yFor = (val: number) => PAD_TOP + chartH * (1 - val / maxVal);

    ctx.clearRect(0, 0, W, H);

    // Grid
    const gridSteps = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const y = PAD_TOP + (chartH / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(W - PAD_RIGHT, y);
      ctx.stroke();
      const val = Math.round(maxVal * (1 - i / gridSteps));
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), PAD_LEFT - 8, y + 4);
    }

    // Red gap zones
    let gapStart: number | null = null;
    for (let i = 0; i <= filled.length; i++) {
      const isGap = i < filled.length && filled[i].isGap;
      if (isGap && gapStart === null) gapStart = i;
      if ((!isGap || i === filled.length) && gapStart !== null) {
        const x1 = PAD_LEFT + gapStart * barW;
        const x2 = PAD_LEFT + i * barW;
        ctx.fillStyle = 'rgba(239, 83, 80, 0.15)';
        ctx.fillRect(x1, PAD_TOP, x2 - x1, chartH);
        // Red dashed border
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x1, PAD_TOP, x2 - x1, chartH);
        ctx.setLineDash([]);
        gapStart = null;
      }
    }

    // Ticks area fill (skip gap points)
    ctx.beginPath();
    let started = false;
    let lastNonGapI = -1;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].isGap) continue;
      if (!started) { ctx.moveTo(xFor(i), yFor(0)); started = true; }
      ctx.lineTo(xFor(i), yFor(filled[i].ticks));
      lastNonGapI = i;
    }
    if (lastNonGapI >= 0) {
      ctx.lineTo(xFor(lastNonGapI), yFor(0));
      ctx.closePath();
      ctx.fillStyle = 'rgba(46, 189, 133, 0.12)';
      ctx.fill();
    }

    // Ticks line
    ctx.beginPath();
    started = false;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].isGap) { started = false; continue; }
      const x = xFor(i); const y = yFor(filled[i].ticks);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#2ebd85';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Candles area fill
    ctx.beginPath();
    started = false;
    lastNonGapI = -1;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].isGap) continue;
      if (!started) { ctx.moveTo(xFor(i), yFor(0)); started = true; }
      ctx.lineTo(xFor(i), yFor(filled[i].closed_candles));
      lastNonGapI = i;
    }
    if (lastNonGapI >= 0) {
      ctx.lineTo(xFor(lastNonGapI), yFor(0));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 171, 0, 0.10)';
      ctx.fill();
    }

    // Candles line
    ctx.beginPath();
    started = false;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i].isGap) { started = false; continue; }
      const x = xFor(i); const y = yFor(filled[i].closed_candles);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#ffab00';
    ctx.lineWidth = 2;
    ctx.stroke();

    // X-axis labels
    const labelEvery = Math.max(1, Math.floor(filled.length / 12));
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < filled.length; i += labelEvery) {
      const label = filled[i].minute;
      const short = label.includes('T') ? label.split('T')[1]?.slice(0, 5) ?? label.slice(-5) : label.slice(-5);
      ctx.fillText(short, xFor(i), H - PAD_BOTTOM + 16);
    }

    // Legend
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2ebd85';
    ctx.fillRect(PAD_LEFT, 6, 14, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(t.adminQuotesTicks, PAD_LEFT + 20, 15);
    const tickLabelW = ctx.measureText(t.adminQuotesTicks).width;
    ctx.fillStyle = '#ffab00';
    ctx.fillRect(PAD_LEFT + 30 + tickLabelW, 6, 14, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(t.adminQuotesCandles, PAD_LEFT + 50 + tickLabelW, 15);
    // Gap legend
    const candleLabelW = ctx.measureText(t.adminQuotesCandles).width;
    const gapX = PAD_LEFT + 60 + tickLabelW + candleLabelW;
    ctx.fillStyle = 'rgba(239, 83, 80, 0.4)';
    ctx.fillRect(gapX, 6, 14, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(t.adminQuotesGap || 'Gap', gapX + 20, 15);
  }, [data, t]);

  /* ─── Hover tooltip ─── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    const layout = layoutRef.current;
    const filled = filledRef.current;
    if (!canvas || !tooltip || !layout || filled.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    const idx = Math.floor((mx - layout.padLeft) / layout.barW);
    if (idx < 0 || idx >= filled.length) {
      tooltip.style.display = 'none';
      return;
    }

    const pt = filled[idx];
    const time = pt.minute.includes('T') ? pt.minute.replace('T', ' ') : pt.minute;

    tooltip.style.display = 'block';
    if (pt.isGap) {
      tooltip.innerHTML = `<div style="color:#ef5350;font-weight:600">${t.adminQuotesGap || 'GAP'}</div><div>${time}</div>`;
    } else {
      tooltip.innerHTML =
        `<div style="color:rgba(255,255,255,0.5);margin-bottom:2px">${time}</div>` +
        `<div><span style="color:#2ebd85">●</span> ${t.adminQuotesTicks}: <b>${pt.ticks.toLocaleString()}</b></div>` +
        `<div><span style="color:#ffab00">●</span> ${t.adminQuotesCandles}: <b>${pt.closed_candles.toLocaleString()}</b></div>`;
    }

    // Position tooltip
    const tx = layout.padLeft + idx * layout.barW + layout.barW / 2;
    const tooltipW = tooltip.offsetWidth;
    let left = tx - tooltipW / 2;
    if (left < 4) left = 4;
    if (left + tooltipW > rect.width - 4) left = rect.width - tooltipW - 4;
    tooltip.style.left = left + 'px';
    tooltip.style.top = '32px';
  }, [t]);

  const handleMouseLeave = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (tooltip) tooltip.style.display = 'none';
  }, []);

  return (
    <div className="admin-candle-stats">
      {/* Period selector */}
      <div className="admin-candle-stats__controls">
        <span className="admin-candle-stats__label">{t.adminQuotesHours}:</span>
        <div className="admin-candle-stats__presets">
          {HOURS_PRESETS.map((h) => (
            <button
              key={h}
              className={`admin-candle-stats__preset${hours === h ? ' admin-candle-stats__preset--active' : ''}`}
              onClick={() => setHours(h)}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="admin-candle-stats__chart-wrap">
        {loading ? (
          <div className="admin-panel__loading">
            <div className="loading__spinner" />
          </div>
        ) : error ? (
          <div className="admin-panel__empty" style={{ color: '#ef5350' }}>{error}</div>
        ) : data.length === 0 ? (
          <div className="admin-panel__empty">{t.adminQuotesNoData}</div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="admin-candle-stats__canvas"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
            <div ref={tooltipRef} className="admin-candle-stats__tooltip" />
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   AdminPanel (main component)
   ════════════════════════════════════════ */

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const { t, tCategory } = useI18n();
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [icons, setIcons] = useState<IconOverrides>({ categories: {}, currencies: {} });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  /* ─── Load data ─── */
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      getCategories(),
      getCurrencies(undefined, true),
      getIconOverrides().catch(() => ({ categories: {}, currencies: {} } as IconOverrides)),
    ])
      .then(([cats, curs, iconData]) => {
        setCategories(cats);
        setCurrencies(curs);
        setIcons(iconData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  /* ─── Save emoji: category ─── */
  const handleSaveCatEmoji = useCallback(async (cat: string, emoji: string) => {
    setSaving(cat);
    try {
      await setCategoryIcon(cat, emoji);
      setIcons((prev) => ({ ...prev, categories: { ...prev.categories, [cat]: emoji } }));
    } finally {
      setSaving(null);
    }
  }, []);

  /* ─── Upload file: category ─── */
  const handleUploadCatFile = useCallback(async (cat: string, file: File) => {
    setSaving(cat);
    try {
      const result = await uploadCategoryIcon(cat, file);
      setIcons((prev) => ({ ...prev, categories: { ...prev.categories, [cat]: result.icon_url } }));
    } finally {
      setSaving(null);
    }
  }, []);

  /* ─── Delete: category ─── */
  const handleDeleteCat = useCallback(async (cat: string) => {
    setSaving(cat);
    try {
      await removeCategoryIcon(cat);
      setIcons((prev) => {
        const next = { ...prev.categories };
        delete next[cat];
        return { ...prev, categories: next };
      });
    } finally {
      setSaving(null);
    }
  }, []);

  /* ─── Save emoji: currency ─── */
  const handleSaveCurEmoji = useCallback(async (cur: string, emoji: string) => {
    setSaving(cur);
    try {
      await setCurrencyIcon(cur, emoji);
      setIcons((prev) => ({ ...prev, currencies: { ...prev.currencies, [cur]: emoji } }));
    } finally {
      setSaving(null);
    }
  }, []);

  /* ─── Upload file: currency ─── */
  const handleUploadCurFile = useCallback(async (cur: string, file: File) => {
    setSaving(cur);
    try {
      const result = await uploadCurrencyIcon(cur, file);
      setIcons((prev) => ({ ...prev, currencies: { ...prev.currencies, [cur]: result.icon_url } }));
    } finally {
      setSaving(null);
    }
  }, []);

  /* ─── Delete: currency ─── */
  const handleDeleteCur = useCallback(async (cur: string) => {
    setSaving(cur);
    try {
      await removeCurrencyIcon(cur);
      setIcons((prev) => {
        const next = { ...prev.currencies };
        delete next[cur];
        return { ...prev, currencies: next };
      });
    } finally {
      setSaving(null);
    }
  }, []);

  /* ─── Filtered currencies ─── */
  const filteredCurrencies = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return currencies;
    return currencies.filter((c) => c.currency.toLowerCase().includes(q));
  }, [currencies, search]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-panel__header">
          <h2 className="admin-panel__title">
            <span className="admin-panel__title-icon">⚙</span>
            {t.adminPanel}
          </h2>
          <button className="admin-panel__close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="admin-panel__tabs">
          <button
            className={`admin-panel__tab${tab === 'categories' ? ' admin-panel__tab--active' : ''}`}
            onClick={() => { setTab('categories'); setSearch(''); }}
          >
            {t.adminCategories}
          </button>
          <button
            className={`admin-panel__tab${tab === 'currencies' ? ' admin-panel__tab--active' : ''}`}
            onClick={() => { setTab('currencies'); setSearch(''); }}
          >
            {t.adminCurrencies}
          </button>
          <button
            className={`admin-panel__tab${tab === 'indicators' ? ' admin-panel__tab--active' : ''}`}
            onClick={() => { setTab('indicators'); setSearch(''); }}
          >
            {t.adminIndicators}
          </button>
          <button
            className={`admin-panel__tab${tab === 'mapping' ? ' admin-panel__tab--active' : ''}`}
            onClick={() => { setTab('mapping'); setSearch(''); }}
          >
            {t.adminMapping}
          </button>
          <button
            className={`admin-panel__tab${tab === 'copyTraders' ? ' admin-panel__tab--active' : ''}`}
            onClick={() => { setTab('copyTraders'); setSearch(''); }}
          >
            {t.ctAdminTab}
          </button>
          <button
            className={`admin-panel__tab${tab === 'quotes' ? ' admin-panel__tab--active' : ''}`}
            onClick={() => { setTab('quotes'); setSearch(''); }}
          >
            {t.adminQuotes}
          </button>
        </div>

        {/* Content */}
        <div className="admin-panel__content">
          {tab === 'quotes' ? (
            <AdminCandleStats t={t as unknown as Record<string, string>} isActive={isOpen && tab === 'quotes'} />
          ) : tab === 'indicators' ? (
            <AdminIndicatorEditor t={t as unknown as Record<string, string>} onRequestHideModal={onClose} />
          ) : tab === 'mapping' ? (
            <MappingTab isActive={isOpen} t={t as unknown as Record<string, string>} />
          ) : tab === 'copyTraders' ? (
            <AdminCopyTraders isActive={isOpen} t={t as unknown as Record<string, string>} isAdmin={true} />
          ) : loading ? (
            <div className="admin-panel__loading">
              <div className="loading__spinner" />
              {t.loading}
            </div>
          ) : tab === 'categories' ? (
            /* ─── Categories tab ─── */
            <div className="admin-panel__list">
              {categories.map((cat) => (
                <IconRow
                  key={cat.name}
                  name={cat.name}
                  displayName={tCategory(cat.name)}
                  savedIcon={icons.categories[cat.name]}
                  onSaveEmoji={handleSaveCatEmoji}
                  onUploadFile={handleUploadCatFile}
                  onDelete={handleDeleteCat}
                  saving={saving}
                  t={t as unknown as Record<string, string>}
                />
              ))}
              {categories.length === 0 && (
                <div className="admin-panel__empty">{t.adminNoCategories}</div>
              )}
            </div>
          ) : (
            /* ─── Currencies tab ─── */
            <>
              <div className="admin-panel__search">
                <input
                  className="admin-panel__search-input"
                  type="text"
                  placeholder={t.searchCurrency}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="admin-panel__list">
                {filteredCurrencies.map((cur) => (
                  <IconRow
                    key={cur.currency}
                    name={cur.currency}
                    subtitle={cur.category}
                    savedIcon={icons.currencies[cur.currency]}
                    onSaveEmoji={handleSaveCurEmoji}
                    onUploadFile={handleUploadCurFile}
                    onDelete={handleDeleteCur}
                    saving={saving}
                    t={t as unknown as Record<string, string>}
                  />
                ))}
                {filteredCurrencies.length === 0 && (
                  <div className="admin-panel__empty">{t.currenciesNotFound}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
