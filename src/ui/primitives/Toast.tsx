import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { lampStore, useLamp, useLampActions } from '../../state';
import type { LampState, Notice } from '../../state';
import { UiIcon as Icon } from './UiIcon';
import { cx } from './format';
import styles from './Toast.module.css';

export interface ToastInput {
  text: string;
  kind?: 'info' | 'error';
  /** One optional action ("Undo", "Retry"). Clicking it also closes the toast. */
  action?: { label: string; onAction(): void };
}

interface CurrentToast extends ToastInput {
  key: number;
  /** Set when the toast mirrors the store's notice. */
  noticeId?: number;
}

export interface ToastApi {
  show(toast: ToastInput): void;
  dismiss(): void;
}

/** Info toasts close after 4 s; toasts with an action after 8 s; errors stay until closed. */
export const TOAST_MS = 4000;
const ACTION_MS = 8000;

const ToastContext = createContext<ToastApi | null>(null);
const selectNotice = (s: LampState): Notice | null => s.notice;

let keySeq = 0;

/**
 * Owns the single toast slot: the store's `notice` (engine, presets, links…) and local
 * toasts from `useToast().show()` (with an optional action). A newer one replaces the older.
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const notice = useLamp(selectNotice);
  const { dismissNotice } = useLampActions();
  const [current, setCurrent] = useState<CurrentToast | null>(null);
  /** A store notice that a local toast already replaced (it must not come back). */
  const ignoredNotice = useRef<number | null>(null);

  useEffect(() => {
    if (notice && notice.id !== ignoredNotice.current) {
      setCurrent({ key: ++keySeq, kind: notice.kind, text: notice.text, noticeId: notice.id });
    } else if (!notice) {
      setCurrent((c) => (c?.noticeId !== undefined ? null : c));
    }
  }, [notice]);

  const show = useCallback((toast: ToastInput) => {
    const pending = lampStore.getState().notice;
    if (pending) ignoredNotice.current = pending.id;
    setCurrent({ ...toast, key: ++keySeq });
  }, []);

  const dismiss = useCallback(() => {
    setCurrent((c) => {
      if (c?.noticeId !== undefined) dismissNotice(c.noticeId);
      return null;
    });
  }, [dismissNotice]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={current} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Show a toast from anywhere under <ToastProvider>. Outside it, falls back to the store notice. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  const { notify, dismissNotice } = useLampActions();
  return useMemo(
    () => ctx ?? { show: (t: ToastInput) => notify(t.kind ?? 'info', t.text), dismiss: () => dismissNotice() },
    [ctx, notify, dismissNotice],
  );
}

function ToastViewport({ toast, onDismiss }: { toast: CurrentToast | null; onDismiss(): void }): ReactElement {
  const [paused, setPaused] = useState(false);
  const kind = toast?.kind ?? 'info';

  useEffect(() => {
    if (!toast || paused || kind === 'error') return;
    const t = setTimeout(onDismiss, toast.action ? ACTION_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, paused, kind, onDismiss]);

  return (
    <div className={styles.viewport}>
      {/* Persistent polite region: info toasts are announced from here. */}
      <div aria-live="polite" aria-atomic="true" className={styles.region}>
        {toast ? (
          <div
            key={toast.key}
            className={cx(styles.toast, kind === 'error' && styles.error)}
            role={kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {kind === 'error' ? <Icon name="warning" size={18} className={styles.icon} /> : null}
            <p className={styles.text}>{toast.text}</p>
            {toast.action ? (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  toast.action?.onAction();
                  onDismiss();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button type="button" className={styles.close} aria-label="Close message" title="Close" onClick={onDismiss}>
              <Icon name="close" size={18} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
