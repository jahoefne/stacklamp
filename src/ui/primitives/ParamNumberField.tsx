import { useCallback, type ReactElement, type ReactNode } from 'react';
import type { NumericParamPath } from '../../geometry';
import { useFieldMessages, useParam } from '../../state';
import { roundTo } from './format';
import { NumberField } from './NumberField';

export interface ParamNumberFieldProps {
  path: NumericParamPath;
  /** Overrides the PARAM_META label. */
  label?: string;
  /** Overrides the PARAM_META hint (pass null to hide it). */
  hint?: ReactNode | null;
  slider?: boolean;
  size?: 'md' | 'lg';
  labelAside?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Unit chip of count parameters (screws, slits, intakes). */
export const COUNT_UNIT = '×';

/** The DOM id of a parameter's input (WarningsList jumps to it). */
export const fieldId = (path: string): string => `field-${path}`;

/**
 * NumberField bound to one numeric lamp parameter: label, unit, range, step and hint come
 * from PARAM_META; engine messages with this path show under it. Percent params are stored
 * as fractions and shown × 100; counts get a "×" unit chip.
 */
export function ParamNumberField({
  path,
  label,
  hint,
  slider = false,
  size = 'md',
  labelAside,
  disabled,
  className,
}: ParamNumberFieldProps): ReactElement {
  const { value, spec, set } = useParam(path);
  const messages = useFieldMessages(path);
  const percent = spec.unit === '%';
  const scale = percent ? 100 : 1;
  const precision = percent ? Math.max(0, spec.precision - 2) : spec.precision;
  const onChange = useCallback((v: number) => set(percent ? v / 100 : v), [set, percent]);
  // Counts (unit '') get a "×" chip so their boxes line up with the mm fields (DESIGN §11 "11 ×").
  const unit = spec.unit === '' ? COUNT_UNIT : spec.unit;
  const shownHint = hint === null ? undefined : (hint ?? spec.hint);

  return (
    <NumberField
      id={fieldId(path)}
      label={label ?? spec.label}
      value={roundTo(value * scale, precision)}
      min={roundTo(spec.min * scale, 6)}
      max={roundTo(spec.max * scale, 6)}
      step={roundTo(spec.step * scale, 6)}
      precision={precision}
      onChange={onChange}
      messages={messages}
      slider={slider}
      size={size}
      unit={unit}
      {...(shownHint !== undefined ? { hint: shownHint } : {})}
      {...(labelAside !== undefined ? { labelAside } : {})}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(className !== undefined ? { className } : {})}
    />
  );
}
