import type { ReactElement, ReactNode } from 'react';
import type { Message } from '../../geometry';
import { UiIcon as Icon } from './UiIcon';
import styles from './Field.module.css';
import { cx } from './format';

/** Props a Field hands to its control so hints and errors are announced with it. */
export interface FieldA11y {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  /** id of the control; hint/message ids derive from it. */
  id: string;
  label: ReactNode;
  /** Short help below the control. */
  hint?: ReactNode;
  /** A local validation error (e.g. "Enter a number"). Marks the control invalid. */
  error?: ReactNode;
  /** Engine messages about this field (errors mark it invalid). */
  messages?: readonly Message[];
  /** Polite live note (e.g. "Max 2000 mm, set to 2000."). */
  status?: ReactNode;
  /** 'row': label left, control right (number fields). 'stack': control under the label. */
  layout?: 'row' | 'stack';
  /** Small extra next to the label (e.g. a "Preset" tag). */
  labelAside?: ReactNode;
  /** Rendered under the label row (e.g. a slider). */
  below?: ReactNode;
  className?: string;
  children: ReactNode | ((a11y: FieldA11y) => ReactNode);
}

const SEVERITY_ICON = { error: 'warning', warning: 'warning', info: 'info' } as const;

/** Label → control → hint / errors, wired with aria-describedby and aria-invalid. */
export function Field({
  id,
  label,
  hint,
  error,
  messages = [],
  status,
  layout = 'stack',
  labelAside,
  below,
  className,
  children,
}: FieldProps): ReactElement {
  const errorId = `${id}-error`;
  const msgId = `${id}-messages`;
  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  const hasError = Boolean(error) || messages.some((m) => m.severity === 'error');
  const describedBy = [error ? errorId : null, messages.length > 0 ? msgId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');
  const a11y: FieldA11y = { id };
  if (describedBy) a11y['aria-describedby'] = describedBy;
  if (hasError) a11y['aria-invalid'] = true;
  const control = typeof children === 'function' ? children(a11y) : children;

  return (
    <div className={cx(styles.field, styles[layout], className)} data-invalid={hasError || undefined}>
      <div className={styles.head}>
        <span className={styles.labelWrap}>
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
          {labelAside ? <span className={styles.aside}>{labelAside}</span> : null}
        </span>
        {layout === 'row' ? <div className={styles.control}>{control}</div> : null}
      </div>
      {layout === 'stack' ? <div className={styles.control}>{control}</div> : null}
      {below}
      {error ? (
        <p id={errorId} className={cx(styles.message, styles.error)}>
          <Icon name="warning" size={16} className={styles.messageIcon} />
          <span>{error}</span>
        </p>
      ) : null}
      {messages.length > 0 ? (
        <div id={msgId} className={styles.messages}>
          {messages.map((m) => (
            <p key={m.code} className={cx(styles.message, styles[m.severity])}>
              <Icon name={SEVERITY_ICON[m.severity]} size={16} className={styles.messageIcon} />
              <span>{m.text}</span>
            </p>
          ))}
        </div>
      ) : null}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <p id={statusId} className={cx(styles.hint, styles.status)} aria-live="polite">
        {status}
      </p>
    </div>
  );
}
