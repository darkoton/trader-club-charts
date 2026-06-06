/**
 * ═══════════════════════════════════════════════════════════════
 *  AdminIndicatorEditor — CRUD UI for custom indicators
 * ═══════════════════════════════════════════════════════════════
 *
 * Admin tab for creating, editing, testing, and deleting
 * custom JavaScript indicators.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '../i18n';
import {
  listCustomIndicators,
  createCustomIndicator,
  updateCustomIndicator,
  deleteCustomIndicator,
  listIndicatorVersions,
  restoreIndicatorVersion,
  resetIndicatorUserParams,
  type CustomIndicatorDTO,
  type CustomIndicatorCreate,
  type IndicatorVersionDTO,
  type IndicatorVisibility,
} from '../api/customIndicators';
import { validateIndicatorCode, executeIndicatorCode, type DebugTrace } from '../services/indicatorSandbox';
import { reloadCustomIndicators } from '../services/customIndicatorRegistry';
import type { IndicatorParamMeta } from '../types/chart';

/* ─── Default code template ─── */
const DEFAULT_CODE = `/**
 * Custom Indicator
 *
 * @param {Array<{time, open, high, low, close, volume}>} bars — OHLCV свечи (time в мс)
 * @param {Object} params — настройки пользователя
 * @param {Object} helpers — математические функции
 * @returns {{ shapes: Array }} — фигуры для отрисовки
 *
 * Доступные helpers:
 *   helpers.sma(values, period)          — Simple Moving Average
 *   helpers.ema(values, period)          — Exponential MA
 *   helpers.rma(values, period)          — Running MA (Wilder's)
 *   helpers.atr(bars, period)            — Average True Range
 *   helpers.rsi(closes, period)          — RSI
 *   helpers.macd(closes, fast, slow, sig)— MACD {macd, signal, histogram}
 *   helpers.bollingerBands(closes, p, m) — BB {upper, middle, lower}
 *   helpers.stochastic(bars, k, d)       — Stoch {k, d}
 *   helpers.pivotHigh(values, left, right) — Pivot highs
 *   helpers.pivotLow(values, left, right)  — Pivot lows
 *   helpers.highest(values, period)      — Highest value in window
 *   helpers.lowest(values, period)       — Lowest value in window
 *   helpers.crossover(a, b)             — Boolean array: a crosses above b
 *   helpers.crossunder(a, b)            — Boolean array: a crosses below b
 *   helpers.linreg(values, period)      — Linear regression
 *   helpers.stdev(values, period)       — Standard deviation
 *   helpers.trueRange(bars)             — True Range array
 *   helpers.hexToRgba(hex, alpha)       — "#ff0000" → "rgba(255,0,0,0.3)"
 *   helpers.toSec(ms)                   — Milliseconds → seconds (для time в shapes)
 *
 * Типы фигур (shapes):
 *   'rectangle'   — прямоугольник (2 точки: левый-верх, правый-низ)
 *   'trend_line'  — линия (2 точки)
 *   'arrow_up'    — стрелка вверх (1 точка, singlePoint: true)
 *   'arrow_down'  — стрелка вниз (1 точка, singlePoint: true)
 *   'text'        — текст (1 точка, singlePoint: true)
 */
function compute(bars, params, helpers) {
  const shapes = [];

  // Пример: рисуем зоны поддержки на пивот-лоу
  const closes = bars.map(b => b.close);
  const pivots = helpers.pivotLow(closes, params.leftBars, params.rightBars);
  const atrVals = helpers.atr(bars, params.atrPeriod);
  const lastIdx = bars.length - 1;

  for (let i = 0; i < pivots.length; i++) {
    if (pivots[i] === null) continue;

    const curAtr = atrVals[i] || atrVals[lastIdx] || 1;
    const top = pivots[i];
    const bot = top - curAtr * params.zoneWidth;

    shapes.push({
      type: 'rectangle',
      points: [
        { time: helpers.toSec(bars[i].time), price: top },
        { time: helpers.toSec(bars[Math.min(i + 50, lastIdx)].time), price: bot },
      ],
      overrides: {
        backgroundColor: helpers.hexToRgba(params.zoneColor, 0.2),
        color: params.zoneColor,
        linewidth: 1,
        fillBackground: true,
      },
      zOrder: 'bottom',
    });
  }

  return { shapes };
}`;

const DEFAULT_PARAMS: Record<string, unknown> = {
  leftBars: 5,
  rightBars: 5,
  atrPeriod: 14,
  zoneWidth: 1.0,
  zoneColor: '#2ebd85',
};

const DEFAULT_PARAM_META: Record<string, IndicatorParamMeta> = {
  leftBars:   { label: 'Пивот слева',       type: 'number', min: 1, max: 20 },
  rightBars:  { label: 'Пивот справа',       type: 'number', min: 1, max: 20 },
  atrPeriod:  { label: 'ATR период',         type: 'number', min: 1, max: 200 },
  zoneWidth:  { label: 'Ширина зоны (ATR×)', type: 'number', min: 0.1, max: 5, step: 0.1 },
  zoneColor:  { label: 'Цвет зоны',          type: 'color' },
};

/* ─── ParamMeta Editor ─── */

interface ParamMetaEditorProps {
  paramMeta: Record<string, IndicatorParamMeta>;
  defaultParams: Record<string, unknown>;
  onChange: (meta: Record<string, IndicatorParamMeta>, defaults: Record<string, unknown>) => void;
  t: Record<string, string>;
}

/** Validate paramMeta JSON structure */
function validateParamMetaJSON(obj: unknown): obj is Record<string, IndicatorParamMeta> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const validTypes = ['number', 'boolean', 'color', 'select', 'text'];
  for (const [, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') return false;
    const m = v as Record<string, unknown>;
    if (typeof m.label !== 'string') return false;
    if (!validTypes.includes(m.type as string)) return false;
  }
  return true;
}

/** Validate defaultParams JSON structure */
function validateDefaultParamsJSON(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return true;
}

function ParamMetaEditor({ paramMeta, defaultParams, onChange, t }: ParamMetaEditorProps) {
  const entries = Object.entries(paramMeta);
  const [mode, setMode] = useState<'constructor' | 'json'>('constructor');
  const [jsonMeta, setJsonMeta] = useState('');
  const [jsonDefaults, setJsonDefaults] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  /* ─── Sync constructor → JSON when switching to JSON mode ─── */
  const switchToJson = () => {
    setJsonMeta(JSON.stringify(paramMeta, null, 2));
    setJsonDefaults(JSON.stringify(defaultParams, null, 2));
    setJsonError(null);
    setMode('json');
  };

  const switchToConstructor = () => {
    // Try to apply JSON before switching
    applyJson(jsonMeta, jsonDefaults);
    setMode('constructor');
  };

  /* ─── Apply JSON → state ─── */
  const applyJson = (metaStr: string, defaultsStr: string) => {
    try {
      const metaObj = JSON.parse(metaStr);
      const defaultsObj = JSON.parse(defaultsStr);
      if (!validateParamMetaJSON(metaObj)) {
        setJsonError(t.ciJsonInvalidMeta || 'Невалидная структура paramMeta. Каждый параметр: { label, type }');
        return false;
      }
      if (!validateDefaultParamsJSON(defaultsObj)) {
        setJsonError(t.ciJsonInvalidDefaults || 'Невалидная структура defaultParams. Ожидается { key: value }');
        return false;
      }
      setJsonError(null);
      onChange(metaObj, defaultsObj);
      return true;
    } catch (e) {
      setJsonError(`JSON: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };

  const handleJsonMetaChange = (val: string) => {
    setJsonMeta(val);
    try { JSON.parse(val); setJsonError(null); } catch { /* defer */ }
  };

  const handleJsonDefaultsChange = (val: string) => {
    setJsonDefaults(val);
    try { JSON.parse(val); setJsonError(null); } catch { /* defer */ }
  };

  const handleJsonApply = () => {
    applyJson(jsonMeta, jsonDefaults);
  };

  /* ─── Constructor helpers ─── */
  const addParam = () => {
    const key = `param_${Date.now()}`;
    onChange(
      { ...paramMeta, [key]: { label: 'New Param', type: 'number', min: 0, max: 100 } },
      { ...defaultParams, [key]: 0 },
    );
  };

  const removeParam = (key: string) => {
    const newMeta = { ...paramMeta };
    delete newMeta[key];
    const newDefaults = { ...defaultParams };
    delete newDefaults[key];
    onChange(newMeta, newDefaults);
  };

  const updateMeta = (key: string, field: string, value: unknown) => {
    const updated = { ...paramMeta[key], [field]: value } as IndicatorParamMeta;

    // Reset default based on type change
    const newDefaults = { ...defaultParams };
    if (field === 'type') {
      switch (value) {
        case 'number': newDefaults[key] = 0; break;
        case 'boolean': newDefaults[key] = false; break;
        case 'color': newDefaults[key] = '#808080'; break;
        case 'select': newDefaults[key] = ''; updated.options = updated.options || ['option1']; break;
        case 'text': newDefaults[key] = ''; break;
      }
    }

    onChange({ ...paramMeta, [key]: updated }, newDefaults);
  };

  const updateKey = (oldKey: string, newKey: string) => {
    if (newKey === oldKey || !newKey.trim()) return;
    const sanitized = newKey.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (paramMeta[sanitized]) return; // duplicate

    const newMeta: Record<string, IndicatorParamMeta> = {};
    const newDefaults: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(paramMeta)) {
      const nk = k === oldKey ? sanitized : k;
      newMeta[nk] = v;
      newDefaults[nk] = defaultParams[k];
    }
    onChange(newMeta, newDefaults);
  };

  const updateDefault = (key: string, value: unknown) => {
    onChange(paramMeta, { ...defaultParams, [key]: value });
  };

  return (
    <div className="ci-params">
      <div className="ci-params__header">
        <span className="ci-params__title">{t.ciParams || 'Параметры'}</span>
        <div className="ci-params__header-actions">
          <div className="ci-params__mode-toggle">
            <button
              className={`ci-params__mode-btn${mode === 'constructor' ? ' ci-params__mode-btn--active' : ''}`}
              onClick={() => mode === 'json' ? switchToConstructor() : undefined}
            >
              {t.ciModeConstructor || 'Конструктор'}
            </button>
            <button
              className={`ci-params__mode-btn${mode === 'json' ? ' ci-params__mode-btn--active' : ''}`}
              onClick={() => mode === 'constructor' ? switchToJson() : undefined}
            >
              JSON
            </button>
          </div>
          {mode === 'constructor' && (
            <button className="btn btn--ghost btn--sm" onClick={addParam}>+ {t.ciAddParam || 'Добавить'}</button>
          )}
        </div>
      </div>

      {/* ─── JSON mode ─── */}
      {mode === 'json' && (
        <div className="ci-params__json">
          <div className="ci-params__json-field">
            <label className="ci-params__json-label">paramMeta</label>
            <textarea
              className={`ci-params__json-textarea${jsonError ? ' ci-params__json-textarea--error' : ''}`}
              value={jsonMeta}
              onChange={(e) => handleJsonMetaChange(e.target.value)}
              spellCheck={false}
              wrap="off"
              placeholder='{\n  "length": { "label": "Period", "type": "number", "min": 1, "max": 200 }\n}'
            />
          </div>
          <div className="ci-params__json-field">
            <label className="ci-params__json-label">defaultParams</label>
            <textarea
              className={`ci-params__json-textarea${jsonError ? ' ci-params__json-textarea--error' : ''}`}
              value={jsonDefaults}
              onChange={(e) => handleJsonDefaultsChange(e.target.value)}
              spellCheck={false}
              wrap="off"
              placeholder='{\n  "length": 14\n}'
            />
          </div>
          {jsonError && <div className="ci-params__json-error">{jsonError}</div>}
          <button className="btn btn--primary btn--sm" onClick={handleJsonApply}>
            {t.ciJsonApply || 'Применить JSON'}
          </button>
        </div>
      )}

      {/* ─── Constructor mode ─── */}
      {mode === 'constructor' && (
        <>
          {entries.length === 0 && (
            <div className="ci-params__empty">{t.ciNoParams || 'Нет параметров'}</div>
          )}
          {entries.map(([key, meta]) => (
            <div key={key} className="ci-param-row">
              <div className="ci-param-row__top">
                <input
                  className="ci-param-row__key"
                  value={key}
                  onChange={(e) => updateKey(key, e.target.value)}
                  placeholder="paramKey"
                />
                <input
                  className="ci-param-row__label"
                  value={meta.label}
                  onChange={(e) => updateMeta(key, 'label', e.target.value)}
                  placeholder="Label"
                />
                <select
                  className="ci-param-row__type"
                  value={meta.type}
                  onChange={(e) => updateMeta(key, 'type', e.target.value)}
                >
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="color">color</option>
                  <option value="select">select</option>
                  <option value="text">text</option>
                </select>
                <button className="ci-param-row__del" onClick={() => removeParam(key)} title="Delete">×</button>
              </div>
              <div className="ci-param-row__bottom">
                {meta.type === 'number' && (
                  <>
                    <label>min: <input type="number" value={meta.min ?? 0} onChange={(e) => updateMeta(key, 'min', +e.target.value)} /></label>
                    <label>max: <input type="number" value={meta.max ?? 100} onChange={(e) => updateMeta(key, 'max', +e.target.value)} /></label>
                    <label>step: <input type="number" value={meta.step ?? 1} step="0.01" onChange={(e) => updateMeta(key, 'step', +e.target.value)} /></label>
                    <label>default: <input type="number" value={defaultParams[key] as number ?? 0} step={meta.step ?? 1} onChange={(e) => updateDefault(key, +e.target.value)} /></label>
                  </>
                )}
                {meta.type === 'boolean' && (
                  <label>
                    default:
                    <input type="checkbox" checked={!!defaultParams[key]} onChange={(e) => updateDefault(key, e.target.checked)} />
                  </label>
                )}
                {meta.type === 'color' && (
                  <label>default: <input type="color" value={(defaultParams[key] as string) || '#808080'} onChange={(e) => updateDefault(key, e.target.value)} /></label>
                )}
                {meta.type === 'select' && (
                  <>
                    <label>
                      options (comma):
                      <input
                        value={(meta.options || []).join(', ')}
                        onChange={(e) => updateMeta(key, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        placeholder="opt1, opt2"
                      />
                    </label>
                    <label>
                      default:
                      <select
                        value={(defaultParams[key] as string) || ''}
                        onChange={(e) => updateDefault(key, e.target.value)}
                      >
                        <option value="">—</option>
                        {(meta.options || []).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {meta.type === 'text' && (
                  <label>default: <input type="text" value={(defaultParams[key] as string) || ''} onChange={(e) => updateDefault(key, e.target.value)} /></label>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ─── Main Component ─── */

interface AdminIndicatorEditorProps {
  t: Record<string, string>;
  /** Called to temporarily hide the admin modal (for live chart test) */
  onRequestHideModal?: () => void;
}

export function AdminIndicatorEditor({ t, onRequestHideModal }: AdminIndicatorEditorProps) {
  const { tLabel: _tLabel } = useI18n();
  const [indicators, setIndicators] = useState<CustomIndicatorDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = new

  // Editor state
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('#2ebd85');
  const [code, setCode] = useState(DEFAULT_CODE);
  const [paramMeta, setParamMeta] = useState<Record<string, IndicatorParamMeta>>(DEFAULT_PARAM_META);
  const [defaultParams, setDefaultParams] = useState<Record<string, unknown>>(DEFAULT_PARAMS);
  const [enabled, setEnabled] = useState(true);
  const [visibility, setVisibility] = useState<IndicatorVisibility>('public');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [debugTrace, setDebugTrace] = useState<DebugTrace | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Version history
  const [versions, setVersions] = useState<IndicatorVersionDTO[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionMessage, setVersionMessage] = useState('');

  // Live test countdown
  const [liveTestCountdown, setLiveTestCountdown] = useState(0);
  const liveTestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filter for list view
  const [listFilter, setListFilter] = useState<'all' | 'public' | 'private'>('all');

  const codeRef = useRef<HTMLTextAreaElement>(null);

  /* ─── Load list ─── */
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCustomIndicators();
      setIndicators(list);
    } catch (err) {
      console.warn('[AdminIndicators] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  /* ─── Reset editor ─── */
  const resetEditor = useCallback(() => {
    setEditId(null);
    setName('');
    setTag('');
    setColor('#2ebd85');
    setCode(DEFAULT_CODE);
    setParamMeta(DEFAULT_PARAM_META);
    setDefaultParams(DEFAULT_PARAMS);
    setEnabled(true);
    setVisibility('public');
    setTestResult(null);
    setTestError(null);
    setSyntaxError(null);
    setShowEditor(false);
    setDebugTrace(null);
    setTraceOpen(false);
    setCopied(false);
    setVersions([]);
    setVersionsOpen(false);
    setVersionMessage('');
  }, []);

  /* ─── Open for edit ─── */
  const openEdit = useCallback((ind: CustomIndicatorDTO) => {
    setEditId(ind.id);
    setName(ind.name);
    setTag(ind.tag);
    setColor(ind.color);
    setCode(ind.code);
    setParamMeta(ind.paramMeta || {});
    setDefaultParams(ind.defaultParams || {});
    setEnabled(ind.enabled);
    setVisibility(ind.visibility || 'public');
    setTestResult(null);
    setTestError(null);
    setSyntaxError(null);
    setShowEditor(true);
    setDebugTrace(null);
    setTraceOpen(false);
    setCopied(false);
    setVersions([]);
    setVersionsOpen(false);
    setVersionMessage('');
  }, []);

  /* ─── Open for new ─── */
  const openNew = useCallback(() => {
    resetEditor();
    setShowEditor(true);
  }, [resetEditor]);

  /* ─── Validate on code change ─── */
  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    const err = validateIndicatorCode(newCode);
    setSyntaxError(err);
    setTestResult(null);
    setTestError(null);
  }, []);

  /* ─── Test ─── */
  const handleTest = useCallback(async () => {
    setTestResult(null);
    setTestError(null);
    setDebugTrace(null);
    setCopied(false);

    const err = validateIndicatorCode(code);
    if (err) {
      setTestError(err);
      return;
    }

    // Generate test bars
    const testBars = generateTestBars(500);

    try {
      const { result, trace } = await executeIndicatorCode(code, testBars, defaultParams, true);
      setTestResult(`✅ ${t.ciTestSuccess || 'Успех'}: ${result.shapes.length} ${t.ciShapes || 'фигур'}`);
      if (trace) {
        setDebugTrace(trace);
        setTraceOpen(true);
      }
    } catch (e) {
      setTestError(`❌ ${e instanceof Error ? e.message : String(e)}`);
      // Try to extract trace from error
      const anyErr = e as Record<string, unknown>;
      if (anyErr.trace) {
        setDebugTrace(anyErr.trace as DebugTrace);
        setTraceOpen(true);
      }
    }
  }, [code, defaultParams, t]);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (!name.trim() || !tag.trim()) return;

    const err = validateIndicatorCode(code);
    if (err) {
      setTestError(err);
      return;
    }

    setSaving(true);
    try {
      const data: CustomIndicatorCreate = {
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        color,
        code,
        paramMeta,
        defaultParams,
        enabled,
        visibility,
        versionMessage: versionMessage.trim() || undefined,
      };

      if (editId) {
        await updateCustomIndicator(editId, data);
      } else {
        await createCustomIndicator(data);
      }

      // Reload registry so changes take effect
      await reloadCustomIndicators();
      await loadList();
      resetEditor();
    } catch (e) {
      setTestError(`${t.ciSaveFailed || 'Ошибка сохранения'}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [name, tag, color, code, paramMeta, defaultParams, enabled, visibility, versionMessage, editId, loadList, resetEditor, t]);

  /* ─── Delete ─── */
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t.ciDeleteConfirm || 'Удалить этот индикатор?')) return;
    try {
      await deleteCustomIndicator(id);
      await reloadCustomIndicators();
      await loadList();
      if (editId === id) resetEditor();
    } catch (e) {
      console.warn('[AdminIndicators] Delete failed:', e);
    }
  }, [editId, loadList, resetEditor, t]);

  /* ─── Format trace for AI clipboard ─── */
  const formatTraceForAI = useCallback((trace: DebugTrace): string => {
    const lines: string[] = [];
    lines.push('=== INDICATOR DEBUG TRACE ===');
    lines.push(`Время: ${new Date().toISOString()}`);
    lines.push(`Всего: ${trace.totalMs}ms | Баров: ${trace.barsCount}`);
    lines.push(`Параметры: ${JSON.stringify(trace.params, null, 2)}`);
    lines.push('');

    if (trace.error) {
      lines.push(`❌ ОШИБКА: ${trace.error}`);
      if (trace.errorStack) lines.push(`Stack: ${trace.errorStack}`);
      lines.push('');
    }

    if (trace.shapesCount !== undefined) {
      lines.push(`Результат: ${trace.shapesCount} фигур, типы: [${(trace.shapeTypes || []).join(', ')}]`);
      if (trace.dashboardRows) lines.push(`Dashboard строк: ${trace.dashboardRows}`);
      if (trace.alertsFired) lines.push(`Alerts: ${trace.alertsFired}`);
      lines.push('');
    }

    if (trace.helperCalls.length > 0) {
      lines.push(`--- Вызовы helpers (${trace.helperCalls.length}) ---`);
      for (const c of trace.helperCalls) {
        lines.push(`#${c.seq} helpers.${c.fn}(${c.args}) → ${c.result}  [${c.ms}ms]`);
      }
      lines.push('');
    }

    if (trace.debugLogs.length > 0) {
      lines.push(`--- helpers.debug() логи (${trace.debugLogs.length}) ---`);
      for (const log of trace.debugLogs) {
        lines.push(`  ${log}`);
      }
      lines.push('');
    }

    lines.push('--- КОД ИНДИКАТОРА ---');
    lines.push(code);
    lines.push('=== END TRACE ===');
    return lines.join('\n');
  }, [code]);

  const handleCopyTrace = useCallback(() => {
    if (!debugTrace) return;
    const text = formatTraceForAI(debugTrace);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [debugTrace, formatTraceForAI]);

  /* ─── Load version history ─── */
  const loadVersions = useCallback(async () => {
    if (!editId) return;
    setVersionsLoading(true);
    try {
      const list = await listIndicatorVersions(editId);
      setVersions(list);
    } catch (err) {
      console.warn('[AdminIndicators] Failed to load versions:', err);
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [editId]);

  const handleToggleVersions = useCallback(() => {
    if (!versionsOpen && versions.length === 0) {
      loadVersions();
    }
    setVersionsOpen(!versionsOpen);
  }, [versionsOpen, versions.length, loadVersions]);

  const handleRestoreVersion = useCallback(async (ver: IndicatorVersionDTO) => {
    if (!editId) return;
    if (!confirm(t.ciRestoreConfirm || `Восстановить версию #${ver.version}? Текущий код будет заменён.`)) return;
    try {
      const updated = await restoreIndicatorVersion(editId, ver.id);
      // Re-open with restored data
      openEdit(updated);
      await reloadCustomIndicators();
      await loadList();
      setTestResult(`✅ ${t.ciVersionRestored || 'Версия'} #${ver.version} ${t.ciRestored || 'восстановлена'}`);
    } catch (e) {
      setTestError(`${t.ciRestoreFailed || 'Ошибка восстановления'}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [editId, openEdit, loadList, t]);

  /* ─── Reset user params ─── */
  const handleResetUserParams = useCallback(async () => {
    if (!editId) return;
    if (!confirm(t.ciResetParamsConfirm || 'Сбросить параметры индикатора у ВСЕХ пользователей на значения по умолчанию?')) return;
    try {
      const { resetCount } = await resetIndicatorUserParams(editId);
      setTestResult(`✅ ${t.ciParamsReset || 'Параметры сброшены у'} ${resetCount} ${t.ciUsers || 'пользователей'}`);
    } catch (e) {
      setTestError(`${t.ciResetFailed || 'Ошибка сброса'}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [editId, t]);

  /* ─── Live test — hide modal to see chart ─── */
  const handleLiveTest = useCallback(async () => {
    // First save before testing live
    if (!name.trim() || !tag.trim()) return;
    const err = validateIndicatorCode(code);
    if (err) { setTestError(err); return; }

    setSaving(true);
    try {
      const data: CustomIndicatorCreate = {
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        color, code, paramMeta, defaultParams, enabled, visibility,
        versionMessage: versionMessage.trim() || undefined,
      };
      if (editId) {
        await updateCustomIndicator(editId, data);
      } else {
        await createCustomIndicator(data);
      }
      await reloadCustomIndicators();
      await loadList();
    } catch (e) {
      setTestError(`${t.ciSaveFailed || 'Ошибка сохранения'}: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
      return;
    }
    setSaving(false);

    // Hide the modal
    if (onRequestHideModal) {
      onRequestHideModal();
      setLiveTestCountdown(10);
    }
  }, [name, tag, color, code, paramMeta, defaultParams, enabled, visibility, versionMessage, editId, loadList, onRequestHideModal, t]);

  // Countdown timer for live test
  useEffect(() => {
    if (liveTestCountdown <= 0) {
      if (liveTestTimerRef.current) {
        clearInterval(liveTestTimerRef.current);
        liveTestTimerRef.current = null;
      }
      return;
    }
    liveTestTimerRef.current = setInterval(() => {
      setLiveTestCountdown((prev) => {
        if (prev <= 1) {
          if (liveTestTimerRef.current) clearInterval(liveTestTimerRef.current);
          liveTestTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (liveTestTimerRef.current) clearInterval(liveTestTimerRef.current);
    };
  }, [liveTestCountdown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Filtered list ─── */
  const filteredIndicators = indicators.filter((ind) => {
    if (listFilter === 'all') return true;
    return (ind.visibility || 'public') === listFilter;
  });

  /* ─── Render: list view ─── */
  if (!showEditor) {
    return (
      <div className="ci-list">
        <div className="ci-list__header">
          <div className="ci-list__filters">
            <button
              className={`ci-list__filter-btn${listFilter === 'all' ? ' ci-list__filter-btn--active' : ''}`}
              onClick={() => setListFilter('all')}
            >
              {t.all || 'Все'}
            </button>
            <button
              className={`ci-list__filter-btn${listFilter === 'public' ? ' ci-list__filter-btn--active' : ''}`}
              onClick={() => setListFilter('public')}
            >
              🌐 {t.ciPublic || 'Публичные'}
            </button>
            <button
              className={`ci-list__filter-btn${listFilter === 'private' ? ' ci-list__filter-btn--active' : ''}`}
              onClick={() => setListFilter('private')}
            >
              🔒 {t.ciPrivate || 'Приватные'}
            </button>
          </div>
          <button className="btn btn--primary btn--sm" onClick={openNew}>
            + {t.ciCreate || 'Создать индикатор'}
          </button>
        </div>

        {loading ? (
          <div className="admin-panel__loading">
            <div className="loading__spinner" />
            {t.loading}
          </div>
        ) : filteredIndicators.length === 0 ? (
          <div className="admin-panel__empty">{t.ciNoIndicators || 'Нет кастомных индикаторов'}</div>
        ) : (
          <div className="ci-list__items">
            {filteredIndicators.map((ind) => (
              <div key={ind.id} className="ci-list__item">
                <div className="ci-list__item-info">
                  <span
                    className="ind-item__tag"
                    style={{ background: `${ind.color}22`, color: ind.color }}
                  >
                    {ind.tag}
                  </span>
                  <span className="ci-list__item-name">{ind.name}</span>
                  {!ind.enabled && <span className="ci-list__item-badge">{t.ciDisabled || 'Выкл'}</span>}
                  <span className={`ci-list__item-vis ci-list__item-vis--${ind.visibility || 'public'}`}>
                    {(ind.visibility || 'public') === 'private' ? '🔒' : '🌐'}
                  </span>
                  {ind.version != null && (
                    <span className="ci-list__item-ver">v{ind.version}</span>
                  )}
                </div>
                <div className="ci-list__item-actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(ind)}>✏️</button>
                  <button className="btn btn--ghost btn--sm ci-list__del" onClick={() => handleDelete(ind.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ─── Render: editor view ─── */
  return (
    <div className="ci-editor">
      {/* Back button */}
      <div className="ci-editor__topbar">
        <button className="btn btn--ghost btn--sm" onClick={resetEditor}>
          ← {t.back || 'Назад'}
        </button>
        <span className="ci-editor__topbar-title">
          {editId ? (t.ciEdit || 'Редактирование') : (t.ciCreate || 'Новый индикатор')}
        </span>
      </div>

      {/* Meta fields */}
      <div className="ci-editor__meta">
        <div className="ci-editor__field">
          <label>{t.ciName || 'Название'}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Indicator" />
        </div>
        <div className="ci-editor__field ci-editor__field--short">
          <label>{t.ciTag || 'Тег'}</label>
          <input value={tag} onChange={(e) => setTag(e.target.value.slice(0, 4))} placeholder="MI" maxLength={4} />
        </div>
        <div className="ci-editor__field ci-editor__field--short">
          <label>{t.ciColor || 'Цвет'}</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <label className="ci-editor__checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t.ciEnabled || 'Включен'}
        </label>
      </div>

      {/* Visibility */}
      <div className="ci-editor__visibility">
        <span className="ci-editor__visibility-label">{t.ciVisibility || 'Видимость'}:</span>
        <div className="ci-editor__vis-toggle">
          <button
            className={`ci-editor__vis-btn${visibility === 'public' ? ' ci-editor__vis-btn--active ci-editor__vis-btn--public' : ''}`}
            onClick={() => setVisibility('public')}
          >
            🌐 {t.ciPublic || 'Публичный'}
          </button>
          <button
            className={`ci-editor__vis-btn${visibility === 'private' ? ' ci-editor__vis-btn--active ci-editor__vis-btn--private' : ''}`}
            onClick={() => setVisibility('private')}
          >
            🔒 {t.ciPrivate || 'Приватный'}
          </button>
        </div>
        <span className="ci-editor__vis-hint">
          {visibility === 'private'
            ? (t.ciPrivateHint || 'Виден только админам')
            : (t.ciPublicHint || 'Виден всем пользователям')}
        </span>
      </div>

      {/* Code editor */}
      <div className="ci-editor__code-section">
        <label className="ci-editor__code-label">{t.ciCode || 'Код (JavaScript)'}</label>
        <textarea
          ref={codeRef}
          className={`ci-editor__textarea${syntaxError ? ' ci-editor__textarea--error' : ''}`}
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          spellCheck={false}
          wrap="off"
        />
        {syntaxError && <div className="ci-editor__syntax-error">{syntaxError}</div>}
      </div>

      {/* ParamMeta editor */}
      <ParamMetaEditor
        paramMeta={paramMeta}
        defaultParams={defaultParams}
        onChange={(m, d) => { setParamMeta(m); setDefaultParams(d); }}
        t={t as Record<string, string>}
      />

      {/* Test & status */}
      {testResult && <div className="ci-editor__test-ok">{testResult}</div>}
      {testError && <div className="ci-editor__test-err">{testError}</div>}

      {/* Version message (optional, for save) */}
      <div className="ci-editor__version-msg">
        <input
          className="ci-editor__version-msg-input"
          value={versionMessage}
          onChange={(e) => setVersionMessage(e.target.value)}
          placeholder={t.ciVersionMessage || 'Описание изменений (необязательно)...'}
        />
      </div>

      {/* Actions */}
      <div className="ci-editor__actions">
        <button className="btn btn--ghost" onClick={handleTest} disabled={saving || !!syntaxError}>
          🧪 {t.ciTest || 'Тест'}
        </button>
        {onRequestHideModal && (
          <button
            className="btn btn--ghost"
            onClick={handleLiveTest}
            disabled={saving || !!syntaxError || !name.trim() || !tag.trim() || liveTestCountdown > 0}
          >
            {liveTestCountdown > 0
              ? `📺 ${liveTestCountdown}${t.ciSec || 'с'}...`
              : `📺 ${t.ciLiveTest || 'На графике'}`}
          </button>
        )}
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving || !!syntaxError || !name.trim() || !tag.trim()}
        >
          {saving ? '...' : (t.save || 'Сохранить')}
        </button>
      </div>

      {/* Extra admin actions (only for existing indicators) */}
      {editId && (
        <div className="ci-editor__extra-actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleToggleVersions}
          >
            📜 {t.ciVersionHistory || 'История версий'}
            {versions.length > 0 && ` (${versions.length})`}
          </button>
          <button
            className="btn btn--ghost btn--sm ci-editor__reset-btn"
            onClick={handleResetUserParams}
          >
            🔄 {t.ciResetParams || 'Сбросить параметры всем'}
          </button>
        </div>
      )}

      {/* ─── Version History Panel ─── */}
      {versionsOpen && editId && (
        <div className="ci-versions">
          <div className="ci-versions__title">
            📜 {t.ciVersionHistory || 'История версий'}
          </div>
          {versionsLoading ? (
            <div className="ci-versions__loading">
              <div className="loading__spinner" /> {t.loading || 'Загрузка...'}
            </div>
          ) : versions.length === 0 ? (
            <div className="ci-versions__empty">{t.ciNoVersions || 'Нет сохранённых версий'}</div>
          ) : (
            <div className="ci-versions__list">
              {versions.map((ver) => (
                <div key={ver.id} className="ci-versions__item">
                  <div className="ci-versions__item-info">
                    <span className="ci-versions__item-ver">v{ver.version}</span>
                    <span className="ci-versions__item-date">
                      {new Date(ver.createdAt).toLocaleString()}
                    </span>
                    {ver.message && (
                      <span className="ci-versions__item-msg">{ver.message}</span>
                    )}
                    {ver.author && (
                      <span className="ci-versions__item-author">— {ver.author}</span>
                    )}
                  </div>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => handleRestoreVersion(ver)}
                  >
                    ↩ {t.ciRestore || 'Восстановить'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Debug Trace Panel ─── */}
      {debugTrace && (
        <div className="ci-trace">
          <div className="ci-trace__header" onClick={() => setTraceOpen(!traceOpen)}>
            <span className="ci-trace__toggle">{traceOpen ? '▼' : '▶'}</span>
            <span className="ci-trace__title">
              {t.ciDebugTrace || 'Debug-трейс'}
            </span>
            <span className="ci-trace__summary">
              {debugTrace.totalMs}ms · {debugTrace.helperCalls.length} {t.ciCalls || 'вызовов'}
              {debugTrace.error ? ' · ❌' : ` · ${debugTrace.shapesCount ?? 0} ${t.ciShapes || 'фигур'}`}
            </span>
            <button
              className="btn btn--ghost btn--sm ci-trace__copy"
              onClick={(e) => { e.stopPropagation(); handleCopyTrace(); }}
              title={t.ciCopyForAI || 'Скопировать для ИИ'}
            >
              {copied ? '✓' : '📋'} {t.ciCopyForAI || 'Скопировать для ИИ'}
            </button>
          </div>

          {traceOpen && (
            <div className="ci-trace__body">
              {/* Summary */}
              <div className="ci-trace__section">
                <div className="ci-trace__row">
                  <span className="ci-trace__label">{t.ciTraceBars || 'Баров'}:</span>
                  <span className="ci-trace__value">{debugTrace.barsCount}</span>
                </div>
                <div className="ci-trace__row">
                  <span className="ci-trace__label">{t.ciTraceTime || 'Время выполнения'}:</span>
                  <span className="ci-trace__value">{debugTrace.totalMs}ms</span>
                </div>
                <div className="ci-trace__row">
                  <span className="ci-trace__label">{t.ciTraceParams || 'Параметры'}:</span>
                  <span className="ci-trace__value ci-trace__value--mono">
                    {JSON.stringify(debugTrace.params)}
                  </span>
                </div>
                {debugTrace.shapesCount !== undefined && (
                  <div className="ci-trace__row">
                    <span className="ci-trace__label">{t.ciTraceResult || 'Результат'}:</span>
                    <span className="ci-trace__value">
                      {debugTrace.shapesCount} {t.ciShapes || 'фигур'} [{(debugTrace.shapeTypes || []).join(', ')}]
                    </span>
                  </div>
                )}
                {debugTrace.error && (
                  <div className="ci-trace__row ci-trace__row--error">
                    <span className="ci-trace__label">Ошибка:</span>
                    <span className="ci-trace__value">{debugTrace.error}</span>
                  </div>
                )}
              </div>

              {/* Helper calls */}
              {debugTrace.helperCalls.length > 0 && (
                <div className="ci-trace__section">
                  <div className="ci-trace__section-title">
                    helpers.* ({debugTrace.helperCalls.length} {t.ciCalls || 'вызовов'})
                  </div>
                  <div className="ci-trace__calls">
                    {debugTrace.helperCalls.map((c) => (
                      <div key={c.seq} className="ci-trace__call">
                        <span className="ci-trace__call-seq">#{c.seq}</span>
                        <span className="ci-trace__call-fn">helpers.{c.fn}</span>
                        <span className="ci-trace__call-args">({c.args})</span>
                        <span className="ci-trace__call-arrow">→</span>
                        <span className="ci-trace__call-result">{c.result}</span>
                        <span className="ci-trace__call-ms">{c.ms}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug logs */}
              {debugTrace.debugLogs.length > 0 && (
                <div className="ci-trace__section">
                  <div className="ci-trace__section-title">
                    helpers.debug() ({debugTrace.debugLogs.length})
                  </div>
                  <div className="ci-trace__logs">
                    {debugTrace.debugLogs.map((log, i) => (
                      <div key={i} className="ci-trace__log-line">{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Test bar generator ─── */
function generateTestBars(count: number) {
  const bars = [];
  let price = 100;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.48) * 2;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 1;
    const low = Math.min(open, close) - Math.random() * 1;
    const vol = 1000 + Math.random() * 5000;
    bars.push({ time: now - (count - i) * 60000, open, high, low, close, volume: vol });
    price = close;
  }
  return bars;
}
