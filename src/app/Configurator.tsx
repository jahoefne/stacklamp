import { useEffect, useRef, type ReactElement } from 'react';
import { useLamp } from '../state';
import type { LampState } from '../state';
import { useToast } from '../ui/primitives/Toast';
import {
  BaseSection,
  ColourSection,
  ConfiguratorLayout,
  CoreSection,
  DownloadPanel,
  ErrorSummary,
  MiniBar,
  PreviewPane,
  PrinterTuning,
  ShareBar,
  TubesSection,
  WarningsList,
} from '../ui/sections';
import styles from './app.module.css';
import { ErrorBoundary } from './ErrorBoundary';

export const CONFIGURATOR_ID = 'configurator';

const selectEngine = (s: LampState): LampState['engine']['status'] => s.engine.status;

/** Says once, as an error toast, that the engine failed to start. */
function useEngineFailureToast(): void {
  const engine = useLamp(selectEngine);
  const toast = useToast();
  const told = useRef(false);
  useEffect(() => {
    if (engine !== 'error' || told.current) return;
    told.current = true;
    toast.show({
      kind: 'error',
      text: "The geometry engine didn't start. Reload the page; if it keeps failing, your browser may block WebAssembly.",
    });
  }, [engine, toast]);
}

/** The controls column, in the design's order. */
function Panel(): ReactElement {
  return (
    <div className={styles.panelStack}>
      <ErrorSummary />
      <ShareBar />
      <CoreSection />
      <TubesSection />
      <ColourSection />
      <BaseSection />
      <PrinterTuning />
      <WarningsList />
      <DownloadPanel />
    </div>
  );
}

/** "Configure your lamp": wires the store to the preview, the panel sections and the mini-bar. */
export function Configurator(): ReactElement {
  useEngineFailureToast();
  return (
    <section id={CONFIGURATOR_ID} className={styles.configurator} aria-labelledby="configurator-title" tabIndex={-1}>
      <div className="wrap">
        <div className={styles.configHead}>
          <h2 id="configurator-title" className={styles.configTitle}>
            Configure your lamp
          </h2>
        </div>
        <ErrorBoundary area="The configurator">
          <ConfiguratorLayout preview={<PreviewPane />} panel={<Panel />} miniBar={<MiniBar />} />
        </ErrorBoundary>
      </div>
    </section>
  );
}
