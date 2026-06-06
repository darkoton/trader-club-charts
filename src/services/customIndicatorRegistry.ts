/**
 * ═══════════════════════════════════════════════════════════════
 *  Custom Indicator Registry — dynamic loading & registration
 * ═══════════════════════════════════════════════════════════════
 *
 * Loads custom indicators from the server and registers them
 * in INDICATOR_REGISTRY + OVERLAY_COMPUTE so they are treated
 * identically to built-in indicators.
 */

import { getEnabledCustomIndicators, type CustomIndicatorDTO } from '../api/customIndicators';
import { INDICATOR_REGISTRY, type IndicatorRegistryEntry, type IndicatorMeta } from '../types/chart';
import { OVERLAY_COMPUTE, type OHLCVBar, type OverlayResult } from '../indicators/tv/overlayEngine';
import { executeIndicatorCode } from '../services/indicatorSandbox';

/* ─── State ─── */

/** Keys of dynamically registered custom indicators */
let registeredCustomKeys: string[] = [];
let loaded = false;
let loading: Promise<void> | null = null;

/**
 * Key prefix for custom indicators to avoid collisions with built-in ones.
 * e.g. "custom_sr_zones_pro"
 */
function toRegistryKey(dto: CustomIndicatorDTO): string {
  return `custom_${dto.id}`;
}

/**
 * Create a compute function that delegates to the WebWorker sandbox.
 */
function createSandboxCompute(code: string): (bars: OHLCVBar[], params: Record<string, unknown>) => Promise<OverlayResult> {
  return async (bars: OHLCVBar[], params: Record<string, unknown>) => {
    const { result } = await executeIndicatorCode(code, bars, params);
    return result;
  };
}

/**
 * Register a single custom indicator into INDICATOR_REGISTRY and OVERLAY_COMPUTE.
 */
function registerOne(dto: CustomIndicatorDTO): string {
  const key = toRegistryKey(dto);
  console.log(`[CustomRegistry] Registering "${dto.name}" as ${key} (tag: ${dto.tag}, enabled: ${dto.enabled})`);

  const meta: IndicatorMeta = {
    name: dto.name,
    defaultParams: dto.defaultParams || {},
    paramMeta: dto.paramMeta || {},
  };

  const entry: IndicatorRegistryEntry = {
    meta,
    tag: dto.tag || '??',
    color: dto.color || '#888888',
  };

  INDICATOR_REGISTRY[key] = entry;

  // Create async compute wrapper
  const asyncCompute = createSandboxCompute(dto.code);

  // OVERLAY_COMPUTE expects sync functions returning OverlayResult.
  // We store the async version in a parallel map.
  // The integration point in TVChart handles async compute specially.
  CUSTOM_ASYNC_COMPUTE[key] = asyncCompute;

  // Also register a sync stub in OVERLAY_COMPUTE for compatibility
  // (will be overridden by custom async path in TVChart)
  OVERLAY_COMPUTE[key] = () => ({ shapes: [] });

  return key;
}

/**
 * Unregister all previously loaded custom indicators.
 */
function unregisterAll(): void {
  for (const key of registeredCustomKeys) {
    delete INDICATOR_REGISTRY[key];
    delete OVERLAY_COMPUTE[key];
    delete CUSTOM_ASYNC_COMPUTE[key];
  }
  registeredCustomKeys = [];
}

/* ─── Public API ─── */

/**
 * Map of custom indicator key → async compute function.
 * Used by TVChart to execute custom indicators via WebWorker.
 */
export const CUSTOM_ASYNC_COMPUTE: Record<
  string,
  (bars: OHLCVBar[], params: Record<string, unknown>) => Promise<OverlayResult>
> = {};

/**
 * Check if an indicator key is a custom (dynamically loaded) indicator.
 */
export function isCustomIndicator(key: string): boolean {
  return key.startsWith('custom_');
}

/**
 * Load all enabled custom indicators from the server and register them.
 * Safe to call multiple times (deduplicates).
 * Call on app startup and after admin saves changes.
 */
export async function loadCustomIndicators(): Promise<void> {
  if (loading) return loading;

  loading = (async () => {
    try {
      // Clear previous registrations
      unregisterAll();

      const indicators = await getEnabledCustomIndicators();
      const keys: string[] = [];

      for (const dto of indicators) {
        try {
          const key = registerOne(dto);
          keys.push(key);
        } catch (err) {
          console.warn(`[CustomRegistry] Failed to register "${dto.name}":`, err);
        }
      }

      registeredCustomKeys = keys;
      loaded = true;
      console.log(`[CustomRegistry] Loaded ${keys.length} custom indicators`);
    } catch (err) {
      console.warn('[CustomRegistry] Failed to load custom indicators:', err);
      // Non-fatal: app works without custom indicators
    }
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

/**
 * Force reload all custom indicators (after admin changes).
 */
export async function reloadCustomIndicators(): Promise<void> {
  loaded = false;
  await loadCustomIndicators();
}

/**
 * Whether custom indicators have been loaded at least once.
 */
export function isCustomIndicatorsLoaded(): boolean {
  return loaded;
}

/**
 * Get list of currently registered custom indicator keys.
 */
export function getCustomIndicatorKeys(): string[] {
  return [...registeredCustomKeys];
}
