import { useCallback, type MouseEvent, type ReactElement } from 'react';
import { ToastProvider } from '../ui/primitives/Toast';
import { Footer, Hero, REPO_URL } from '../ui/sections';
import { scrollAndFocus } from '../ui/sections/derived';
import styles from './app.module.css';
import { CONFIGURATOR_ID, Configurator } from './Configurator';
import { ErrorBoundary } from './ErrorBoundary';

const FAVICON = `${import.meta.env.BASE_URL}favicon.svg`;

function BandRule(): ReactElement {
  return (
    <div className={styles.bandRule} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

/** Go to the configurator without touching the URL hash (it holds the lamp). */
function goToConfigurator(focusRodLength: boolean): void {
  const section = document.getElementById(CONFIGURATOR_ID);
  const rod = document.getElementById('field-core.length');
  scrollAndFocus(section, focusRodLength && rod ? rod : section);
}

/** The page: skip link, header, hero, configurator, footer, toasts. */
export function App(): ReactElement {
  const onSkip = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    goToConfigurator(false);
  }, []);
  const onConfigure = useCallback(() => goToConfigurator(true), []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <a href={`#${CONFIGURATOR_ID}`} className={styles.skip} onClick={onSkip}>
          Skip to configurator
        </a>
        <BandRule />
        <header className={styles.header}>
          <div className={`wrap ${styles.headerInner}`}>
            <span className={styles.wordmark}>
              <img src={FAVICON} alt="" width={24} height={24} />
              stacklamp
            </span>
            <nav aria-label="Site" className={styles.nav}>
              <a
                href={`#${CONFIGURATOR_ID}`}
                onClick={(e) => {
                  e.preventDefault();
                  goToConfigurator(true);
                }}
              >
                Configure
              </a>
              <a href={REPO_URL} rel="noopener" target="_blank">
                GitHub
                <span aria-hidden="true"> ↗</span>
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </nav>
          </div>
        </header>
        <main id="main" className={styles.main}>
          <div className="wrap">
            <Hero onConfigure={onConfigure} />
          </div>
          <BandRule />
          <Configurator />
        </main>
        <Footer />
      </ToastProvider>
    </ErrorBoundary>
  );
}
