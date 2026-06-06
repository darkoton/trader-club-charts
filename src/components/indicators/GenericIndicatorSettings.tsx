import type { IndicatorParamMeta } from '../../types/chart';
import { useI18n } from '../../i18n';

interface Props {
  paramMeta: Record<string, IndicatorParamMeta>;
  params: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function GenericIndicatorSettings({ paramMeta, params, onChange }: Props) {
  const { tLabel } = useI18n();
  return (
    <div className="ind-settings">
      {Object.entries(paramMeta).map(([key, meta]) => (
        <Field key={key} paramKey={key} meta={meta} value={params[key]} onChange={onChange} tLabel={tLabel} />
      ))}
    </div>
  );
}

/* ─── Individual field renderer ─── */
interface FieldProps {
  paramKey: string;
  meta: IndicatorParamMeta;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  tLabel: (label: string) => string;
}

function Field({ paramKey, meta, value, onChange, tLabel }: FieldProps) {
  const isReadonly = meta.readonly === true;
  switch (meta.type) {
    case 'number': {
      const num = (typeof value === 'number' ? value : meta.min ?? 0) as number;
      const min = meta.min ?? 0;
      const max = meta.max ?? 100;
      const step = meta.step ?? 1;
      return (
        <div className="ind-settings__field">
          <label className="ind-settings__label">
            <span>{tLabel(meta.label)}</span>
            <span className="ind-settings__value">{num}</span>
          </label>
          <input
            type="range"
            className="ind-settings__input"
            min={min}
            max={max}
            step={step}
            value={num}
            disabled={isReadonly}
            onChange={(e) => onChange(paramKey, parseFloat(e.target.value))}
          />
        </div>
      );
    }

    case 'boolean': {
      const checked = (typeof value === 'boolean' ? value : false);
      return (
        <label className="ind-settings__checkbox">
          <input
            type="checkbox"
            checked={checked}
            disabled={isReadonly}
            onChange={(e) => onChange(paramKey, e.target.checked)}
          />
          <span>{tLabel(meta.label)}</span>
        </label>
      );
    }

    case 'color': {
      const color = (typeof value === 'string' ? value : '#808080');
      return (
        <div className="ind-settings__field">
          <label className="ind-settings__label">
            <span>{tLabel(meta.label)}</span>
            <span className="ind-settings__value" style={{ color }}>{color}</span>
          </label>
          <input
            type="color"
            className="ind-settings__input ind-settings__input--color"
            value={color.startsWith('rgba') || color.startsWith('rgb(') ? '#808080' : color}
            disabled={isReadonly}
            onChange={(e) => onChange(paramKey, e.target.value)}
          />
        </div>
      );
    }

    case 'select': {
      const selected = (typeof value === 'string' ? value : meta.options?.[0] ?? '');
      return (
        <div className="ind-settings__field">
          <label className="ind-settings__label">
            <span>{tLabel(meta.label)}</span>
          </label>
          <select
            className="ind-settings__select"
            value={selected}
            disabled={isReadonly}
            onChange={(e) => onChange(paramKey, e.target.value)}
          >
            {(meta.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    case 'text': {
      const text = (typeof value === 'string' ? value : '');
      return (
        <div className="ind-settings__field">
          <label className="ind-settings__label">
            <span>{tLabel(meta.label)}</span>
          </label>
          <input
            type="text"
            className="ind-settings__input"
            value={text}
            maxLength={meta.maxLength}
            readOnly={isReadonly}
            onChange={(e) => onChange(paramKey, e.target.value)}
          />
        </div>
      );
    }

    default:
      return null;
  }
}
