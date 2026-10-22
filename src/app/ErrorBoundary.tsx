import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './app.module.css';

interface Props {
  children: ReactNode;
  /** What broke, for the message ("The configurator"). */
  area?: string;
}

interface State {
  error: Error | null;
}

/** Catches render errors and offers a reload instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[stacklamp] UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={styles.crash} role="alert">
        <h2 className={styles.crashTitle}>{this.props.area ?? 'The page'} stopped working.</h2>
        <p>Reload the page to start again. Your lamp is kept in the address bar and in this browser.</p>
        <p className={styles.crashDetail}>
          <code>{error.message}</code>
        </p>
        <button type="button" className={styles.crashButton} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
