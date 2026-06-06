import { meta } from '../../indicators/OrderBlocks';

interface Props {
  params: typeof meta.defaultParams;
  onChange: (key: keyof typeof meta.defaultParams, value: unknown) => void;
}

export function OrderBlocksSettings({ params, onChange }: Props) {
  return (
    <div className="ind-settings">
      <div className="ind-settings__title">Order Blocks</div>

      <Field label="Left Bars" value={params.leftBars}>
        <input type="range" min={1} max={10} value={params.leftBars}
          onChange={(e) => onChange('leftBars', +e.target.value)} />
      </Field>

      <Field label="Right Bars" value={params.rightBars}>
        <input type="range" min={1} max={10} value={params.rightBars}
          onChange={(e) => onChange('rightBars', +e.target.value)} />
      </Field>

      <Field label="ATR Period" value={params.atrPeriod}>
        <input type="range" min={5} max={50} value={params.atrPeriod}
          onChange={(e) => onChange('atrPeriod', +e.target.value)} />
      </Field>

      <Field label="Min Impulse ATR" value={params.minImpulseATR.toFixed(2)}>
        <input type="range" min={0.1} max={3} step={0.1} value={params.minImpulseATR}
          onChange={(e) => onChange('minImpulseATR', +e.target.value)} />
      </Field>

      <Field label="Lookback Bars" value={params.lookbackBars}>
        <input type="range" min={100} max={2000} step={50} value={params.lookbackBars}
          onChange={(e) => onChange('lookbackBars', +e.target.value)} />
      </Field>

      <Field label="Max Zones" value={params.maxZones}>
        <input type="range" min={1} max={50} value={params.maxZones}
          onChange={(e) => onChange('maxZones', +e.target.value)} />
      </Field>

      <Field label="TTL Bars (0=off)" value={params.ttlBars}>
        <input type="range" min={0} max={500} value={params.ttlBars}
          onChange={(e) => onChange('ttlBars', +e.target.value)} />
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
        <input type="checkbox" checked={params.mergeEnabled}
          onChange={(e) => onChange('mergeEnabled', e.target.checked)} />
        <span>Сливать близкие зоны</span>
      </label>

      <label className="ind-settings__checkbox">
        <input type="checkbox" checked={params.keepMitigated}
          onChange={(e) => onChange('keepMitigated', e.target.checked)} />
        <span>Хранить митигированные</span>
      </label>

      <label className="ind-settings__checkbox">
        <input type="checkbox" checked={params.keepInvalid}
          onChange={(e) => onChange('keepInvalid', e.target.checked)} />
        <span>Хранить сломанные</span>
      </label>

      <Field label="Цвет Bull OB">
        <input type="color" value={params.bullColor}
          onChange={(e) => onChange('bullColor', e.target.value)}
          style={{ width: '100%', height: 36 }} />
      </Field>

      <Field label="Цвет Bear OB">
        <input type="color" value={params.bearColor}
          onChange={(e) => onChange('bearColor', e.target.value)}
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

