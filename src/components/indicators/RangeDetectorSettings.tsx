import { meta } from '../../indicators/RangeDetector';

interface Props {
  params: typeof meta.defaultParams;
  onChange: (key: keyof typeof meta.defaultParams, value: unknown) => void;
}

export function RangeDetectorSettings({ params, onChange }: Props) {
  return (
    <div className="ind-settings">
      <div className="ind-settings__title">Range Detector</div>

      <Field label="Length (min bars)" value={params.length}>
        <input type="range" min={5} max={100} value={params.length}
          onChange={(e) => onChange('length', +e.target.value)} />
      </Field>

      <Field label="Multiplier" value={params.mult.toFixed(2)}>
        <input type="range" min={0.5} max={5} step={0.1} value={params.mult}
          onChange={(e) => onChange('mult', +e.target.value)} />
      </Field>

      <Field label="ATR Length" value={params.atrLen}>
        <input type="range" min={10} max={1000} value={params.atrLen}
          onChange={(e) => onChange('atrLen', +e.target.value)} />
      </Field>

      <Field label="Lookback Bars" value={params.lookbackBars}>
        <input type="range" min={100} max={5000} step={100} value={params.lookbackBars}
          onChange={(e) => onChange('lookbackBars', +e.target.value)} />
      </Field>

      <Field label="Max Boxes" value={params.maxBoxes}>
        <input type="range" min={1} max={50} value={params.maxBoxes}
          onChange={(e) => onChange('maxBoxes', +e.target.value)} />
      </Field>

      <Field label="Прозрачность" value={`${(params.fillAlpha * 100).toFixed(0)}%`}>
        <input type="range" min={0} max={100} value={params.fillAlpha * 100}
          onChange={(e) => onChange('fillAlpha', +e.target.value / 100)} />
      </Field>

      <Field label="Border Width" value={params.borderWidth}>
        <input type="range" min={1} max={10} value={params.borderWidth}
          onChange={(e) => onChange('borderWidth', +e.target.value)} />
      </Field>

      <label className="ind-settings__checkbox">
        <input type="checkbox" checked={params.showBorder}
          onChange={(e) => onChange('showBorder', e.target.checked)} />
        <span>Показывать рамку</span>
      </label>

      <label className="ind-settings__checkbox">
        <input type="checkbox" checked={params.keepBroken}
          onChange={(e) => onChange('keepBroken', e.target.checked)} />
        <span>Показывать сломанные</span>
      </label>

      <Field label="Цвет: в диапазоне">
        <input type="color" value={params.colorUnbroken}
          onChange={(e) => onChange('colorUnbroken', e.target.value)}
          style={{ width: '100%', height: 36 }} />
      </Field>

      <Field label="Цвет: пробой вверх">
        <input type="color" value={params.colorUp}
          onChange={(e) => onChange('colorUp', e.target.value)}
          style={{ width: '100%', height: 36 }} />
      </Field>

      <Field label="Цвет: пробой вниз">
        <input type="color" value={params.colorDown}
          onChange={(e) => onChange('colorDown', e.target.value)}
          style={{ width: '100%', height: 36 }} />
      </Field>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: unknown; children: React.ReactNode }) {
  return (
    <div className="ind-settings__field">
      <div className="ind-settings__label">
        <span>{label}</span>
        {value !== undefined && <span className="ind-settings__value">{String(value)}</span>}
      </div>
      {children}
    </div>
  );
}

