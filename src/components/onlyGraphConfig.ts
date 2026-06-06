import { INDICATOR_REGISTRY, createDefaultIndicatorParams } from '../types/chart';

const ONLY_GRAPH_ENABLED_INDICATORS = new Set([
  'adaptiveTrend',
  'imbalanceSuite',
  'rsiZones',
  'srZones',
  'sarWaveSignals',
]);

export function buildOnlyGraphActiveIndicators(
  enabledIndicators = ONLY_GRAPH_ENABLED_INDICATORS,
): Record<string, boolean> {
  const active: Record<string, boolean> = {};
  for (const key of Object.keys(INDICATOR_REGISTRY)) {
    active[key] = enabledIndicators.has(key);
  }
  return active;
}

export const ONLY_GRAPH_ACTIVE = buildOnlyGraphActiveIndicators();
export const CHAT_SIGNAL_ACTIVE = buildOnlyGraphActiveIndicators(new Set([
  'adaptiveTrend',
  'imbalanceSuite',
  'srZones',
  'sarWaveSignals',
]));
export const ONLY_GRAPH_DEFAULT_PARAMS = createDefaultIndicatorParams();