import { useId, type ReactElement } from 'react';
import { CORE_PRESETS } from '../../geometry';
import type { CoreKind, HeightMode } from '../../geometry';
import { useDims, useLamp, useLampActions } from '../../state';
import type { LampState } from '../../state';
import { ParamNumberField } from '../primitives/ParamNumberField';
import { SegmentedControl, type SegmentOption } from '../primitives/SegmentedControl';
import { UiIcon } from '../primitives/UiIcon';
import { fmt } from '../primitives/format';
import styles from './CoreSection.module.css';
import { PanelSection } from './PanelSection';
import panel from './panel.module.css';

const CORE_OPTIONS: readonly SegmentOption<CoreKind>[] = [
  { value: 'aluminium-rod', label: 'Rod + LED strip', title: CORE_PRESETS['aluminium-rod'].label },
  { value: 'led-tube', label: 'Single-ended LED tube', title: CORE_PRESETS['led-tube'].label },
];

const MODE_OPTIONS: readonly SegmentOption<HeightMode>[] = [
  { value: 'auto', label: 'Auto-fit segments', title: 'Segment count and height follow the rod length' },
  { value: 'locked', label: 'Lock segment height', title: 'Segments keep their height; you cut the rod' },
];

const selectKind = (s: LampState): CoreKind => s.config.params.core.kind;
const selectDiameter = (s: LampState): number => s.config.params.core.diameter;
const selectMode = (s: LampState): HeightMode => s.config.params.segments.heightMode;
const selectLength = (s: LampState): number => s.config.params.core.length;

/** "Auto-fit segments" | "Lock segment height". */
export function HeightModeToggle(): ReactElement {
  const mode = useLamp(selectMode);
  const { setHeightMode } = useLampActions();
  const labelId = useId();
  const hintId = useId();
  return (
    <div className={panel.control}>
      <span id={labelId} className={panel.controlLabel}>
        Height mode
      </span>
      <SegmentedControl
        labelledBy={labelId}
        describedBy={hintId}
        options={MODE_OPTIONS}
        value={mode}
        onChange={setHeightMode}
        block
      />
      <p id={hintId} className={panel.hint}>
        {mode === 'auto'
          ? 'The number of segments and their height adjust so the stack meets the rod end.'
          : 'Segments keep the height you set. The rod is cut to fit the stack.'}
      </p>
    </div>
  );
}

/** Live summary of the fitted stacks, plus the cut length in lock mode. */
export function HeightSummary(): ReactElement {
  const d = useDims();
  const mode = useLamp(selectMode);
  const length = useLamp(selectLength);
  const kind = useLamp(selectKind);
  const cut = mode === 'locked' && Math.round(d.rod.requiredLength) !== Math.round(length);
  const rodWord = kind === 'led-tube' ? 'tube' : 'rod';
  return (
    <div className={styles.summary}>
      <p className={styles.summaryLine} aria-live="polite" aria-atomic="true" data-testid="height-summary">
        <span>
          Outer {d.outer.count} × {fmt(d.outer.height, 1)} mm
        </span>
        <span aria-hidden="true"> · </span>
        <span>
          Inner {d.inner.count} × {fmt(d.inner.height, 1)} mm
        </span>
        <span aria-hidden="true"> · </span>
        <strong className={styles.total}>Lamp {fmt(d.totalHeight, 1)} mm tall</strong>
      </p>
      {cut ? (
        <p className={styles.cut} aria-live="polite">
          <UiIcon name="warning" size={18} />
          <span>
            Cut {rodWord} to {fmt(d.rod.requiredLength, 0)} mm
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** 01 Light core: core kind, rod length (the primary input), diameter, height mode + summary. */
export function CoreSection(): ReactElement {
  const kind = useLamp(selectKind);
  const diameter = useLamp(selectDiameter);
  const { applyCorePreset } = useLampActions();
  const kindLabelId = useId();
  const preset = CORE_PRESETS[kind];
  const isPreset = Math.abs(diameter - preset.diameter) < 1e-9;
  const isTube = kind === 'led-tube';
  return (
    <PanelSection id="section-core" number={1} title="Light core">
      <div className={panel.control}>
        <span id={kindLabelId} className={panel.controlLabel}>
          Core
        </span>
        <SegmentedControl labelledBy={kindLabelId} options={CORE_OPTIONS} value={kind} onChange={applyCorePreset} block />
      </div>
      {isTube ? (
        <p className={`${panel.note} ${panel.noteWarn}`}>
          <UiIcon name="warning" size={16} className={panel.noteIcon} />
          <span>
            LED tubes can't be cut. The stack is fitted to the tube instead. Mains voltage: have a qualified person wire it.
          </span>
        </p>
      ) : null}
      <ParamNumberField
        path="core.length"
        label={isTube ? 'Tube length' : 'Rod length'}
        hint="600 to 2000 mm. The stacks are fitted to it."
        size="lg"
        slider
      />
      <ParamNumberField
        path="core.diameter"
        label={isTube ? 'Tube diameter' : 'Rod diameter'}
        labelAside={isPreset ? 'Preset' : `Custom · preset ${fmt(preset.diameter, 1)} mm`}
        hint={null}
      />
      <HeightModeToggle />
      <HeightSummary />
    </PanelSection>
  );
}
