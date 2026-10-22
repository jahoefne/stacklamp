import type { ReactElement } from 'react';
import type { Message } from '../../geometry';
import { PARAM_SPEC_BY_PATH, selectMessages, useLamp, useLampActions } from '../../state';
import type { NumericParamPath } from '../../geometry';
import { UiIcon } from '../primitives/UiIcon';
import { cx } from '../primitives/format';
import { focusField, scrollAndFocus } from './derived';
import { PanelSection } from './PanelSection';
import styles from './WarningsList.module.css';

const RANK: Record<Message['severity'], number> = { error: 0, warning: 1, info: 2 };
const ICON = { error: 'close', warning: 'warning', info: 'info' } as const;
const SEVERITY_TEXT = { error: 'Error', warning: 'Warning', info: 'Note' } as const;

/** Fields that are not numeric params but still have an id to jump to. */
const OTHER_LABELS: Record<string, string> = {
  'core.kind': 'core type',
  'segments.heightMode': 'height mode',
  'printer.preset': 'printer',
  'base.wireRouting': 'cable route',
};

export function sortMessages(messages: readonly Message[]): Message[] {
  return messages
    .map((m, i) => ({ m, i }))
    .sort((a, b) => RANK[a.m.severity] - RANK[b.m.severity] || a.i - b.i)
    .map((x) => x.m);
}

function fieldLabel(path: string): string | null {
  const spec = PARAM_SPEC_BY_PATH.get(path as NumericParamPath);
  if (spec) return spec.label.charAt(0).toLowerCase() + spec.label.slice(1);
  return OTHER_LABELS[path] ?? null;
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Checks: every engine message, errors first, each with a jump to its field. */
export function WarningsList(): ReactElement {
  const messages = useLamp(selectMessages);
  const { setUi } = useLampActions();
  const sorted = sortMessages(messages);
  const errors = sorted.filter((m) => m.severity === 'error').length;
  const warnings = sorted.filter((m) => m.severity === 'warning').length;
  const summary =
    errors > 0
      ? count(errors, 'error')
      : warnings > 0
        ? count(warnings, 'warning')
        : sorted.length > 0
          ? count(sorted.length, 'note')
          : 'All clear';

  return (
    <PanelSection id="warnings" title="Checks" aside={<span className={styles.asideText}>{summary}</span>}>
      <ul className={styles.list} role="list">
        {sorted.length === 0 ? (
          <li className={cx(styles.row, styles.ok)}>
            <span className={styles.sev}>
              <UiIcon name="check" size={18} />
            </span>
            <span className={styles.text}>Every part fits your printer.</span>
          </li>
        ) : (
          sorted.map((m) => {
            const label = m.path ? fieldLabel(m.path) : null;
            return (
              <li key={`${m.code}:${m.path ?? ''}`} className={cx(styles.row, styles[m.severity])} data-severity={m.severity}>
                <span className={styles.sev}>
                  <UiIcon name={ICON[m.severity]} size={18} title={SEVERITY_TEXT[m.severity]} />
                </span>
                <span className={styles.text}>{m.text}</span>
                {m.path && label ? (
                  <button type="button" className={styles.fix} onClick={() => focusField(m.path!, () => setUi({ tuningOpen: true }))}>
                    Go to {label}
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </PanelSection>
  );
}

/** Sticky strip at the top of the panel while errors block the download. */
export function ErrorSummary(): ReactElement | null {
  const messages = useLamp(selectMessages);
  const errors = messages.filter((m) => m.severity === 'error');
  if (errors.length === 0) return null;
  const first = errors[0]!;
  return (
    <div className={styles.sticky} role="status">
      <span className={styles.stickyIcon}>
        <UiIcon name="warning" size={18} />
      </span>
      <span className={styles.stickyText}>
        <strong>{errors.length === 1 ? '1 error blocks' : `${errors.length} errors block`} the download.</strong> {first.text}
      </span>
      <button
        type="button"
        className={styles.stickyButton}
        onClick={() => {
          const el = document.getElementById('warnings');
          scrollAndFocus(el);
        }}
      >
        Show
      </button>
    </div>
  );
}
