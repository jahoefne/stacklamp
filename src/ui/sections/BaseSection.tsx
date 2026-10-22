import { useId, type ReactElement } from 'react';
import { PRINTER_PRESETS } from '../../geometry';
import type { PrinterId } from '../../geometry';
import { selectMessages, useDims, useLamp, useLampActions } from '../../state';
import type { LampState } from '../../state';
import { ParamNumberField } from '../primitives/ParamNumberField';
import { Select } from '../primitives/Select';
import { UiIcon } from '../primitives/UiIcon';
import { fmt } from '../primitives/format';
import { PanelSection } from './PanelSection';
import panel from './panel.module.css';

const PRINTER_IDS = Object.keys(PRINTER_PRESETS) as PrinterId[];
const PRINTER_OPTIONS = PRINTER_IDS.map((id) => ({ value: id, label: PRINTER_PRESETS[id].label }));

const selectPrinter = (s: LampState): PrinterId => s.config.params.printer.preset;

/** The engine's print note for the base (all messages are listed under Checks as well). */
const BASE_NOTES = new Set(['pocket-needs-supports']);

/** 04 Base & printer: base and weight plate sizes, printer bed. */
export function BaseSection(): ReactElement {
  const printer = useLamp(selectPrinter);
  const messages = useLamp(selectMessages);
  const d = useDims();
  const { applyPrinterPreset } = useLampActions();
  const printerId = useId();
  const notes = messages.filter((m) => BASE_NOTES.has(m.code));
  const custom = printer === 'custom';
  const bed = PRINTER_PRESETS[printer].bed;

  return (
    <PanelSection id="section-base" number={4} title="Base & printer">
      <ParamNumberField path="base.diameter" hint={`The base is ${fmt(d.base.height, 1)} mm tall and prints ${fmt(d.base.printHeight, 1)} mm high.`} />
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Weight plate</h3>
        <p className={panel.hint}>A round steel or cast-iron plate sits in a pocket under the base and keeps the lamp upright.</p>
        <ParamNumberField path="plate.od" />
        <ParamNumberField path="plate.thickness" />
        <ParamNumberField path="plate.bore" hint="Hole in the middle of the plate." />
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
      </div>
      {notes.map((m) => (
        <p key={m.code} className={panel.note}>
          <UiIcon name="info" size={16} className={panel.noteIcon} />
          <span>{m.text}</span>
        </p>
      ))}
    </PanelSection>
  );
}
