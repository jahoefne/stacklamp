import { useId, type ReactElement } from 'react';
import { PARAM_META, defaultParams, getParam } from '../../geometry';
import type { NumericParamPath, ParamGroup, WireRouting } from '../../geometry';
import { useLamp, useLampActions } from '../../state';
import type { LampState } from '../../state';
import { Button } from '../primitives/Button';
import { Disclosure } from '../primitives/Disclosure';
import { ParamNumberField } from '../primitives/ParamNumberField';
import { Select } from '../primitives/Select';
import panel from './panel.module.css';
import styles from './PrinterTuning.module.css';

/** Params with a home in the main sections; everything else is tuning. */
export const MAIN_PATHS: ReadonlySet<NumericParamPath> = new Set<NumericParamPath>([
  'core.length',
  'core.diameter',
  'tubes.innerOD',
  'tubes.outerOD',
  'segments.innerHeight',
  'segments.outerHeight',
  'segments.wall',
  'base.diameter',
  'plate.od',
  'plate.thickness',
  'plate.bore',
  'printer.bedX',
  'printer.bedY',
  'printer.bedZ',
]);

export const TUNING_PATHS: readonly NumericParamPath[] = PARAM_META.filter((m) => !MAIN_PATHS.has(m.path)).map((m) => m.path);

const GROUP_TITLES: Partial<Record<ParamGroup, string>> = {
  core: 'Light core',
  segments: 'Segment joint',
  base: 'Base',
  cover: 'Top cover',
  tolerances: 'Clearances',
  tubes: 'Tubes',
  plate: 'Weight plate',
  printer: 'Printer',
};

const GROUPS: { group: ParamGroup; paths: NumericParamPath[] }[] = (() => {
  const out: { group: ParamGroup; paths: NumericParamPath[] }[] = [];
  for (const m of PARAM_META) {
    if (MAIN_PATHS.has(m.path)) continue;
    let g = out.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, paths: [] };
      out.push(g);
    }
    g.paths.push(m.path);
  }
  return out;
})();

const WIRE_OPTIONS: { value: WireRouting; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'beside-collar', label: 'Beside the collar' },
  { value: 'through-socket', label: 'Through the socket floor' },
];

const DEFAULTS = defaultParams();

const selectOpen = (s: LampState): boolean => s.ui.tuningOpen;
const selectWire = (s: LampState): WireRouting => s.config.params.base.wireRouting;
const selectAtDefaults = (s: LampState): boolean =>
  s.config.params.base.wireRouting === DEFAULTS.base.wireRouting &&
  TUNING_PATHS.every((p) => getParam(s.config.params, p) === getParam(DEFAULTS, p));

/** Collapsed "Printer tuning": every remaining parameter, grouped, with a reset. */
export function PrinterTuning(): ReactElement {
  const open = useLamp(selectOpen);
  const wire = useLamp(selectWire);
  const atDefaults = useLamp(selectAtDefaults);
  const { setUi, setParam, setEnum } = useLampActions();
  const wireId = useId();

  const reset = () => {
    for (const p of TUNING_PATHS) setParam(p, getParam(DEFAULTS, p));
    setEnum('base.wireRouting', DEFAULTS.base.wireRouting);
  };

  return (
    <section aria-labelledby="tuning-title" className={styles.section}>
      <h2 id="tuning-title" className="visually-hidden">
        Printer tuning
      </h2>
      <Disclosure
        id="printer-tuning"
        open={open}
        onToggle={(v) => setUi({ tuningOpen: v })}
        summary={
          <span className={styles.summary}>
            Printer tuning
            {!atDefaults ? <span className={styles.badge}>edited</span> : null}
          </span>
        }
      >
        <div className={styles.body}>
          <div className={panel.row}>
            <p className={panel.hint}>The defaults print well on a 0.6 mm nozzle in vase mode.</p>
            <Button size="sm" variant="secondary" onClick={reset} disabled={atDefaults}>
              Reset tuning
            </Button>
          </div>
          {GROUPS.map(({ group, paths }) => (
            <div key={group} className={panel.group}>
              <h3 className={panel.groupTitle}>{GROUP_TITLES[group] ?? group}</h3>
              {paths.map((p) => (
                <ParamNumberField key={p} path={p} />
              ))}
              {group === 'base' ? (
                <div className={panel.control}>
                  <label htmlFor={wireId} className={panel.controlLabel}>
                    Cable route
                  </label>
                  <Select
                    id={wireId}
                    block
                    value={wire}
                    options={WIRE_OPTIONS}
                    onChange={(e) => setEnum('base.wireRouting', e.target.value as WireRouting)}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Disclosure>
    </section>
  );
}
