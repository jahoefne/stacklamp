import { useId, type ReactElement } from 'react';
import { NOZZLES, NOZZLE_IDS, PRINTER_PRESETS } from '../../geometry';
import type { NozzleId, PrinterId } from '../../geometry';
import { useDims, useLamp, useLampActions } from '../../state';
import type { LampState } from '../../state';
import { ParamNumberField } from '../primitives/ParamNumberField';
import { Select } from '../primitives/Select';
import { fmt } from '../primitives/format';
import { PanelSection } from './PanelSection';
import panel from './panel.module.css';

const PRINTER_IDS = Object.keys(PRINTER_PRESETS) as PrinterId[];
const PRINTER_OPTIONS = PRINTER_IDS.map((id) => ({ value: id, label: PRINTER_PRESETS[id].label }));

const NOZZLE_OPTIONS = NOZZLE_IDS.map((id) => ({ value: id, label: NOZZLES[id].label }));

const selectPrinter = (s: LampState): PrinterId => s.config.params.printer.preset;
const selectNozzle = (s: LampState): NozzleId => s.config.params.printer.nozzle;

/** 04 Base & printer: base and weight plate sizes, printer bed and nozzle. Print notes live under Checks. */
export function BaseSection(): ReactElement {
  const printer = useLamp(selectPrinter);
  const nozzle = useLamp(selectNozzle);
  const d = useDims();
  const { applyPrinterPreset, applyNozzle } = useLampActions();
  const printerId = useId();
  const nozzleId = useId();
  const custom = printer === 'custom';
  const bed = PRINTER_PRESETS[printer].bed;
  const nz = NOZZLES[nozzle] ?? NOZZLES['0.6'];

  return (
    <PanelSection id="section-base" number={4} title="Base & printer">
      <ParamNumberField path="base.diameter" hint={`The base is ${fmt(d.base.height, 1)} mm tall and prints ${fmt(d.base.printHeight, 1)} mm high.`} />
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Weight plate</h3>
        <p className={panel.hint}>
          A round steel or cast-iron plate sits in a pocket under the base and keeps the lamp upright. A boss through its bore and the
          printed plate clamp with one wood screw hold it in.
        </p>
        <ParamNumberField path="plate.od" />
        <ParamNumberField path="plate.thickness" hint="Measure it: a plate up to 3 mm thinner still clamps, a thicker one pushes the clamp out." />
        <ParamNumberField path="plate.bore" hint="Hole in the middle of the plate. The base's boss passes through it." />
      </div>
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Printer</h3>
        <div className={panel.control}>
          <label htmlFor={printerId} className={panel.controlLabel}>
            Printer
          </label>
          <Select
            id={printerId}
            block
            value={printer}
            options={PRINTER_OPTIONS}
            onChange={(e) => applyPrinterPreset(e.target.value as PrinterId)}
          />
          {!custom ? (
            <p className={panel.hint}>
              Bed {bed[0]} × {bed[1]} × {bed[2]} mm. Pick “Custom bed size” to enter your own.
            </p>
          ) : null}
        </div>
        {custom ? (
          <>
            <ParamNumberField path="printer.bedX" />
            <ParamNumberField path="printer.bedY" />
            <ParamNumberField path="printer.bedZ" hint="Build height. Segments must print in one piece." />
          </>
        ) : null}
        <div className={panel.control}>
          <label htmlFor={nozzleId} className={panel.controlLabel}>
            Nozzle
          </label>
          <Select id={nozzleId} block value={nz.id} options={NOZZLE_OPTIONS} onChange={(e) => applyNozzle(e.target.value as NozzleId)} />
          <p className={panel.hint}>
            Sets the segment wall to {nz.wall} mm (one vase-mode line) and {nz.layer} mm layers in the print plan.
          </p>
        </div>
      </div>
    </PanelSection>
  );
}
