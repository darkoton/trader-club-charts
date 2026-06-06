/**
 * CalculatorPage — martingale calculator with 3 types.
 * Mirrors old_tma calculator.js.
 */
import { useState, useMemo, useCallback } from 'react';
import { useI18n } from '../i18n';

type CalcType = 'safe' | 'basic' | 'progressive';

const MULTIPLIERS: Record<CalcType, number> = {
  safe: 2.3,
  basic: 2.5,
  progressive: 2.7,
};

export function CalculatorPage() {
  const { t } = useI18n();
  const [calcType, setCalcType] = useState<CalcType | null>(null);
  const [dep1, setDep1] = useState('');

  const deposits = useMemo(() => {
    if (!calcType || !dep1) return [];
    const mult = MULTIPLIERS[calcType];
    const v1 = parseFloat(dep1) || 0;
    const result: number[] = [v1];
    let prev = v1;
    for (let i = 1; i < 6; i++) {
      prev = prev * mult;
      result.push(prev);
    }
    return result;
  }, [calcType, dep1]);

  const total = useMemo(() => deposits.reduce((s, v) => s + v, 0), [deposits]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.]/g, '');
    // allow only one dot, max 2 decimals
    const parts = raw.split('.');
    let val = parts[0];
    if (parts.length > 1) val += '.' + parts[1].slice(0, 2);
    setDep1(val);
  }, []);

  if (!calcType) {
    return (
      <div className="tma-calculator calculator-container">
        <div className="tma-calculator__wrapper calculator-wrapper">
          <h2>{t.tmaMartingale}</h2>
          <p className="tma-calculator__desc calculator-description">{t.tmaCalcDescription}</p>
          <div className="tma-calculator__options calculator-options">
            <div className="tma-calculator__option calculator-option" onClick={() => setCalcType('safe')}>
              <span>{t.tmaCalcSafe}</span>
            </div>
            <div className="tma-calculator__option calculator-option" onClick={() => setCalcType('basic')}>
              <span>{t.tmaCalcBasic}</span>
            </div>
            <div className="tma-calculator__option calculator-option" onClick={() => setCalcType('progressive')}>
              <span>{t.tmaCalcProgressive}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typeLabel =
    calcType === 'safe'
      ? t.tmaCalcSafe
      : calcType === 'basic'
        ? t.tmaCalcBasic
        : t.tmaCalcProgressive;

  return (
    <div className="tma-calculator tma-calculator--form calculator-form">
      <div className="tma-calculator__wrapper calculator-wrapper">
        <h2>
          {t.tmaMartingale} – {typeLabel}
        </h2>
        <p className="tma-calculator__desc calculator-description">{t.tmaCalcValueDesc}</p>

        <div className="tma-calculator__fields calculator-fields">
          <div className="tma-calculator__field calculator-field">
            <input
              className="tma-calculator__input calculator-input"
              type="text"
              inputMode="decimal"
              placeholder={t.tmaCalcDep1}
              value={dep1}
              onChange={handleInput}
              autoFocus
            />
          </div>
          {[2, 3, 4, 5, 6].map((i) => (
            <div className="tma-calculator__field calculator-field" key={i}>
              <input
                className="tma-calculator__input calculator-input"
                type="text"
                readOnly
                placeholder={t[`tmaCalcDep${i}` as keyof typeof t] as string}
                value={deposits[i - 1] ? deposits[i - 1].toFixed(2) : ''}
              />
            </div>
          ))}
        </div>

        <div className="tma-calculator__summary calculator-summary">
          <h3>{t.tmaCalcRequired}</h3>
          <input
            className="tma-calculator__input calculator-input"
            type="text"
            readOnly
            placeholder={t.tmaCalcRequired}
            value={total ? total.toFixed(2) : ''}
          />
        </div>

        <div className="tma-calculator__actions">
          <button
            className="tma-calculator__back tma-calculator__back-btn calculator-back-btn"
            onClick={() => {
              setCalcType(null);
              setDep1('');
            }}
          >
            {t.tmaBack}
          </button>
        </div>
      </div>
    </div>
  );
}
