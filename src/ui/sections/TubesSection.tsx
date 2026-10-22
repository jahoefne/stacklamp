import type { ReactElement } from 'react';
import { useDims, useLamp, useLampActions } from '../../state';
import type { LampState } from '../../state';
import { Checkbox } from '../primitives/Checkbox';
import { ParamNumberField } from '../primitives/ParamNumberField';
import { fmt } from '../primitives/format';
import { PanelSection } from './PanelSection';
import panel from './panel.module.css';

const selectLinked = (s: LampState): boolean => s.ui.linkSegmentHeights;
const selectAuto = (s: LampState): boolean => s.config.params.segments.heightMode === 'auto';

/** 02 Tubes: diameters, wall, target segment heights. */
export function TubesSection(): ReactElement {
  const linked = useLamp(selectLinked);
  const auto = useLamp(selectAuto);
  const d = useDims();
  const { setUi } = useLampActions();
  const heightHint = (fitted: number) =>
    auto ? `Target. Auto-fit uses ${fmt(fitted, 1)} mm.` : `Kept as set. Each segment is ${fmt(fitted, 1)} mm.`;
  return (
    <PanelSection id="section-tubes" number={2} title="Tubes">
      <ParamNumberField path="tubes.outerOD" label="Outer tube diameter" />
      <ParamNumberField path="tubes.innerOD" label="Inner tube diameter" />
      <ParamNumberField path="segments.wall" hint="Equals the vase-mode line width (0.8 mm for a 0.6 mm nozzle)." />
      <div className={panel.group}>
        <h3 className={panel.groupTitle}>Segment height</h3>
        <ParamNumberField path="segments.outerHeight" hint={heightHint(d.outer.height)} />
        <ParamNumberField path="segments.innerHeight" hint={heightHint(d.inner.height)} />
        <Checkbox
          id="link-segment-heights"
          label="Same height for both stacks"
          checked={linked}
          onChange={(v) => setUi({ linkSegmentHeights: v })}
        />
      </div>
    </PanelSection>
  );
}
