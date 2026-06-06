import { useState, useMemo } from 'react';
import type { ChartConfig } from '../types/chart';
import { INDICATOR_REGISTRY, applyLockedIndicatorParams, normalizeIndicatorParamsMap } from '../types/chart';
import { useI18n } from '../i18n';
import { GenericIndicatorSettings } from './indicators/GenericIndicatorSettings';

interface ChartSettingsModalProps {
  chart: ChartConfig;
  onClose: () => void;
  onSave: (chart: ChartConfig) => void;
}

export function ChartSettingsModal({ chart, onClose, onSave }: ChartSettingsModalProps) {
  const { t } = useI18n();
  const [config, setConfig] = useState<ChartConfig>({
    ...chart,
    indicatorParams: normalizeIndicatorParamsMap(chart.indicatorParams),
  });
  const [search, setSearch] = useState('');
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null);

  const handleSave = () => { onSave(config); onClose(); };

  const toggleIndicator = (key: string) => {
    setConfig({
      ...config,
      activeIndicators: { ...config.activeIndicators, [key]: !config.activeIndicators[key] },
    });
  };

  const updateIndicatorParam = (indicatorKey: string, paramKey: string, value: unknown) => {
    const meta = INDICATOR_REGISTRY[indicatorKey]?.meta.paramMeta?.[paramKey];
    if (meta?.readonly) return;

    setConfig({
      ...config,
      indicatorParams: {
        ...config.indicatorParams,
        [indicatorKey]: applyLockedIndicatorParams(indicatorKey, {
          ...config.indicatorParams[indicatorKey],
          [paramKey]: value,
        }),
      },
    });
  };

  const filteredIndicators = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.entries(INDICATOR_REGISTRY).filter(
      ([key, entry]) =>
        !q ||
        entry.meta.name.toLowerCase().includes(q) ||
        entry.tag.toLowerCase().includes(q) ||
        key.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--md" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal__header">
          <span className="modal__title">
            {t.indicators} {config.currency ? `— ${config.currency}` : ''}
          </span>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="ind-search-wrap">
          <div className="currency-search-wrap">
            <input
              className="currency-search"
              placeholder={t.searchIndicators}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Indicator list */}
        <div className="modal__body ind-list">
          {filteredIndicators.map(([key, entry]) => {
            const isActive = !!config.activeIndicators[key];
            return (
              <div key={key} className={`ind-item${isActive ? ' ind-item--active' : ''}`}>
                <label className="ind-item__toggle">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleIndicator(key)}
                  />
                  <span
                    className="ind-item__tag"
                    style={{ background: `${entry.color}22`, color: entry.color }}
                  >
                    {entry.tag}
                  </span>
                  <span className="ind-item__name">{entry.meta.name}</span>
                  {entry.meta.pane === 'separate' && (
                    <span className="ind-item__badge">{t.separatePane}</span>
                  )}
                </label>
                <button
                  className="btn btn--ghost btn--icon btn--sm"
                  title={t.settings}
                  onClick={() => setSettingsOpenFor(settingsOpenFor === key ? null : key)}
                >
                  ⚙
                </button>
              </div>
            );
          })}

          {filteredIndicators.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">🔍</span>
              <span>{t.indicatorsNotFound}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>{t.cancel}</button>
          <button className="btn btn--primary" onClick={handleSave}>{t.save}</button>
        </div>
      </div>

      {/* Per-indicator settings popup */}
      {settingsOpenFor && INDICATOR_REGISTRY[settingsOpenFor] && (
        <div
          className="modal modal--sm ind-settings-popup"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal__header">
            <span className="modal__title">
              {INDICATOR_REGISTRY[settingsOpenFor].meta.name}
            </span>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => setSettingsOpenFor(null)}
            >
              ✕
            </button>
          </div>
          <div className="modal__body">
            <GenericIndicatorSettings
              paramMeta={INDICATOR_REGISTRY[settingsOpenFor].meta.paramMeta}
              params={
                config.indicatorParams[settingsOpenFor] ||
                INDICATOR_REGISTRY[settingsOpenFor].meta.defaultParams
              }
              onChange={(paramKey, value) =>
                updateIndicatorParam(settingsOpenFor, paramKey, value)
              }
            />
          </div>
          <div className="modal__footer">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setConfig({
                  ...config,
                  indicatorParams: {
                    ...config.indicatorParams,
                    [settingsOpenFor]: applyLockedIndicatorParams(settingsOpenFor, {
                      ...INDICATOR_REGISTRY[settingsOpenFor].meta.defaultParams,
                    }),
                  },
                });
              }}
            >
              {t.reset}
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                onSave(config);
                setSettingsOpenFor(null);
              }}
            >
              {t.save}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
