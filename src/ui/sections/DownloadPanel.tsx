import { useId, type ReactElement } from 'react';
import type { Bom, PetgColour } from '../../geometry';
import { cancelDownload, download, selectBlockers, selectBom, selectPalette, useLamp, useLampActions } from '../../state';
import type { ExportJob, LampState } from '../../state';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { SegmentedControl, type SegmentOption } from '../primitives/SegmentedControl';
import { Swatch } from '../primitives/Swatch';
import { UiIcon } from '../primitives/UiIcon';
import { fmt } from '../primitives/format';
import { PART_LABELS, exportProgress, grams, stageText } from './derived';
import styles from './DownloadPanel.module.css';
import { PanelSection } from './PanelSection';
import panel from './panel.module.css';

const FORMATS: readonly SegmentOption<'3mf' | 'stl'>[] = [
  { value: '3mf', label: '3MF', title: 'One 3MF per part (recommended)' },
  { value: 'stl', label: 'STL', title: 'One binary STL per part' },
];

const selectFormat = (s: LampState): '3mf' | 'stl' => s.ui.exportFormat;
const selectFitTest = (s: LampState): boolean => s.ui.includeFitTest;
const selectJob = (s: LampState): ExportJob => s.exportJob;
const selectEngine = (s: LampState): EngineStatus => s.engine.status;

type EngineStatus = LampState['engine']['status'];

/** Why the button is disabled, in one line; `errors` are the blockers that are engine messages. */
export function blockedText(engine: EngineStatus, errors: readonly string[]): string {
  if (engine === 'loading' && errors.length === 0) return 'The geometry engine is still loading.';
  if (engine === 'error') return "The geometry engine didn't start.";
  if (errors.length === 0) return '';
  return errors.length === 1 ? 'Fix 1 error above to download.' : `Fix ${errors.length} errors above to download.`;
}

/** 05 Download: format, fit-test, parts and filament tables, the ZIP button with progress. */
export function DownloadPanel(): ReactElement {
  const format = useLamp(selectFormat);
  const fitTest = useLamp(selectFitTest);
  const job = useLamp(selectJob);
  const blockers = useLamp(selectBlockers);
  const bom = useLamp(selectBom);
  const palette = useLamp(selectPalette);
  const engine = useLamp(selectEngine);
  const { setUi } = useLampActions();
  const formatLabel = useId();
  const reasonId = useId();
  const running = job.phase === 'running';
  const blocked = blockers.length > 0;
  // selectBlockers lists the engine state first, then the error messages.
  const errors = engine === 'ready' ? blockers : blockers.slice(1);

  let status = '';
  if (job.phase === 'running') status = stageText(job.stage, job.done, job.total);
  else if (job.phase === 'done') status = `Saved ${job.fileName}.`;
  else if (job.phase === 'error') status = `Export failed: ${job.message}`;

  return (
    <PanelSection id="download" number={5} title="Download">
      <div className={styles.options}>
        <div className={panel.control}>
          <span id={formatLabel} className={panel.controlLabel}>
            File format
          </span>
          <SegmentedControl labelledBy={formatLabel} options={FORMATS} value={format} onChange={(v) => setUi({ exportFormat: v })} />
        </div>
        <Checkbox
          id="include-fit-test"
          label="Include fit-test ring"
          hint="A short ring to check the joint before printing the stacks."
          checked={fitTest}
          onChange={(v) => setUi({ includeFitTest: v })}
        />
      </div>

      {bom ? <BomTables bom={bom} palette={palette} /> : <p className={panel.hint}>The parts list appears once the preview has been built.</p>}

      <p className={panel.note}>
        <UiIcon name="info" size={16} className={panel.noteIcon} />
        <span>Slicers ignore 3MF colours — PRINT-PLAN.md lists how many to print in each colour.</span>
      </p>

      <div className={styles.action}>
        <Button
          variant="primary"
          size="wide"
          icon="download"
          busy={running}
          disabled={blocked || running}
          aria-describedby={blocked ? reasonId : undefined}
          onClick={() => void download()}
          data-testid="download-zip"
        >
          {running ? status : 'Download ZIP'}
        </Button>
        {running ? (
          <div className={styles.progressRow}>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(exportProgress(job) * 100)}
            >
              <span className={styles.progressFill} style={{ width: `${Math.round(exportProgress(job) * 100)}%` }} />
            </div>
            <Button variant="ghost" size="sm" onClick={cancelDownload}>
              Cancel
            </Button>
          </div>
        ) : null}
        {blocked ? (
          <div id={reasonId} className={styles.blocked}>
            <p className={styles.blockedLead}>{blockedText(engine, errors)}</p>
            {errors.length > 0 ? (
              <ul className={styles.reasons}>
                {errors.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {engine === 'error' ? (
              <p className={styles.reasonsNote}>
                Reload the page; if it keeps failing, your browser may block WebAssembly.
              </p>
            ) : null}
          </div>
        ) : null}
        <p className={styles.status} aria-live="polite" data-testid="download-status">
          {status}
        </p>
      </div>
    </PanelSection>
  );
}

function BomTables({ bom, palette }: { bom: Bom; palette: readonly PetgColour[] }): ReactElement {
  const order = new Map(palette.map((c, i) => [c.id, i]));
  const byId = new Map(palette.map((c) => [c.id, c]));
  const colours = [...bom.colours].sort((a, b) => (order.get(a.colourId) ?? 99) - (order.get(b.colourId) ?? 99));
  const totals = colours.reduce(
    (t, r) => ({ inner: t.inner + r.inner, outer: t.outer + r.outer, grams: t.grams + r.grams }),
    { inner: 0, outer: 0, grams: 0 },
  );
  return (
    <>
      <table className={styles.table}>
        <caption className={styles.caption}>Parts</caption>
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col" className={styles.num}>
              Copies
            </th>
            <th scope="col" className={styles.num}>
              Each
            </th>
            <th scope="col" className={styles.num}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {bom.parts.map((p) => {
            const fits = p.fitsBed && p.fitsZ;
            return (
              <tr key={p.part}>
                <th scope="row" className={styles.partCell}>
                  <span className={fits ? styles.fitOk : styles.fitBad}>
                    <UiIcon name={fits ? 'check' : 'warning'} size={16} title={fits ? 'Fits your printer' : 'Does not fit your printer'} />
                  </span>
                  {PART_LABELS[p.part]}
                </th>
                <td className={styles.num}>{p.copies} ×</td>
                <td className={styles.num}>{grams(p.gramsEstimateEach)}</td>
                <td className={styles.num}>{grams(p.gramsEstimateEach * p.copies)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All parts</th>
            <td className={styles.num}>{bom.parts.reduce((n, p) => n + p.copies, 0)} ×</td>
            <td />
            <td className={styles.num}>{grams(bom.totalGrams)}</td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.filament}>
        About {fmt(bom.totalMetres, 0)} m of 1.75 mm filament in total ({grams(bom.totalGrams).replace('≈ ', '')}).
      </p>

      <table className={styles.table}>
        <caption className={styles.caption}>Segments per colour</caption>
        <thead>
          <tr>
            <th scope="col">Colour</th>
            <th scope="col" className={styles.num}>
              Inner
            </th>
            <th scope="col" className={styles.num}>
              Outer
            </th>
            <th scope="col" className={styles.num}>
              PETG
            </th>
          </tr>
        </thead>
        <tbody>
          {colours.map((r) => {
            const c = byId.get(r.colourId);
            return (
              <tr key={r.colourId}>
                <th scope="row" className={styles.colourCell}>
                  <Swatch colour={c?.hex ?? '#ffffff'} size="sm" />
                  {c?.name ?? r.colourId}
                </th>
                <td className={styles.num}>{r.inner}</td>
                <td className={styles.num}>{r.outer}</td>
                <td className={styles.num}>{grams(r.grams)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All</th>
            <td className={styles.num}>{totals.inner}</td>
            <td className={styles.num}>{totals.outer}</td>
            <td className={styles.num}>{grams(totals.grams)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
