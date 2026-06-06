/**
 * ═══════════════════════════════════════════════════════════════
 *  Indicator Sandbox — safe execution of custom indicator code
 * ═══════════════════════════════════════════════════════════════
 *
 * Runs user-provided JavaScript in a WebWorker with timeout.
 * Falls back to inline execution if Workers are unavailable.
 */

import type { OHLCVBar, OverlayResult } from '../indicators/tv/overlayEngine';

/* ─── Trace types ─── */

export interface TraceEntry {
  seq: number;
  fn: string;
  args: string;
  result: string;
  ms: number;
}

export interface DebugTrace {
  totalMs: number;
  barsCount: number;
  params: Record<string, unknown>;
  helperCalls: TraceEntry[];
  shapesCount?: number;
  shapeTypes?: string[];
  dashboardRows?: number;
  alertsFired?: number;
  debugLogs: string[];
  error?: string;
  errorStack?: string;
}

export interface ExecuteResult {
  result: OverlayResult;
  trace?: DebugTrace;
}

/* ─── Worker management ─── */

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<string, {
  resolve: (result: ExecuteResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

const TIMEOUT_MS = 8000; // 8 seconds max execution time

function getWorker(): Worker | null {
  if (worker) return worker;

  try {
    worker = new Worker(
      new URL('../workers/indicatorWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error, logs, trace } = e.data;
      const p = pending.get(id);
      if (!p) return;

      // Print any helpers.log() output from user code
      if (Array.isArray(logs) && logs.length > 0) {
        for (const msg of logs) {
          console.log(`[Indicator:${id}]`, msg);
        }
      }

      clearTimeout(p.timer);
      pending.delete(id);

      if (error) {
        p.reject(Object.assign(new Error(error), { trace }));
      } else {
        p.resolve({ result, trace });
      }
    };

    worker.onerror = (e) => {
      console.error('[IndicatorSandbox] Worker error:', e);
      // Reject all pending
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error('Worker crashed'));
        pending.delete(id);
      }
      // Restart worker
      worker?.terminate();
      worker = null;
    };

    return worker;
  } catch (err) {
    console.warn('[IndicatorSandbox] Worker unavailable:', err);
    return null;
  }
}

/**
 * Execute custom indicator code safely in a WebWorker.
 *
 * @param code - JavaScript source code containing `function compute(bars, params, helpers)`
 * @param bars - OHLCV bar array
 * @param params - User-configured parameters
 * @param enableTrace - If true, returns detailed debug trace
 * @returns ExecuteResult with result and optional trace
 */
export function executeIndicatorCode(
  code: string,
  bars: OHLCVBar[],
  params: Record<string, unknown>,
  enableTrace = false,
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      reject(new Error('WebWorker не поддерживается'));
      return;
    }

    const id = String(++requestId);

    const timer = setTimeout(() => {
      pending.delete(id);
      // Kill and restart worker on timeout
      worker?.terminate();
      worker = null;
      reject(new Error(`Таймаут: compute() не завершилась за ${TIMEOUT_MS / 1000}с`));
    }, TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });

    w.postMessage({ id, code, bars, params, enableTrace });
  });
}

/**
 * Validate indicator code syntax without executing it.
 * Returns null if valid, error message string if invalid.
 */
export function validateIndicatorCode(code: string): string | null {
  if (!code || code.trim().length === 0) {
    return 'Код пуст';
  }

  // Check for compute function
  if (!/function\s+compute\s*\(/.test(code)) {
    return 'Не найдена функция compute(). Код должен содержать: function compute(bars, params, helpers) { ... }';
  }

  // Try to parse (syntax check)
  try {
    // eslint-disable-next-line no-new-func
    new Function('bars', 'params', 'helpers', `'use strict';\n${code}\nreturn typeof compute;`);
  } catch (err) {
    return `Синтаксическая ошибка: ${err instanceof Error ? err.message : String(err)}`;
  }

  return null;
}

/**
 * Terminate the sandbox worker (cleanup).
 */
export function terminateSandbox(): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error('Sandbox terminated'));
  }
  pending.clear();
  worker?.terminate();
  worker = null;
}
