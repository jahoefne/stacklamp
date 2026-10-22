import { useId, useState, type ReactElement } from 'react';
import { lampStore, selectFittedBands, selectPalette, useLamp, useLampActions } from '../../state';
import type { GenTarget, GeneratorKind, LampState } from '../../state';
import { Button } from '../primitives/Button';
import { SegmentedControl, type SegmentOption } from '../primitives/SegmentedControl';
import { listJoin } from '../primitives/format';
import { distinctNames } from './derived';
import styles from './GeneratorBar.module.css';

const TARGETS: readonly SegmentOption<GenTarget>[] = [
  { value: 'outer', label: 'Outer' },
  { value: 'inner', label: 'Inner' },
  { value: 'both', label: 'Both' },
];

const GENERATORS: readonly { kind: GeneratorKind; label: string; icon: 'alternate' | 'gradient' | 'random' }[] = [
  { kind: 'alternate', label: 'Alternate', icon: 'alternate' },
  { kind: 'gradient', label: 'Gradient', icon: 'gradient' },
  { kind: 'random', label: 'Random', icon: 'random' },
];

const TARGET_TEXT: Record<GenTarget, string> = { outer: 'Outer', inner: 'Inner', both: 'Both stacks' };
const KIND_TEXT: Record<GeneratorKind, string> = { alternate: 'alternating', gradient: 'gradient', random: 'random' };

/** Generators need at least this many colours in the mix. */
export const MIN_MIX = 2;

const selectTarget = (s: LampState): GenTarget => s.ui.genTarget;
const selectMix = (s: LampState): string[] => s.ui.mix;

/** "Fill [Outer|Inner|Both]" + Alternate / Gradient / Random / Mirror over the mix colours. */
export function GeneratorBar(): ReactElement {
  const target = useLamp(selectTarget);
  const mix = useLamp(selectMix);
  const palette = useLamp(selectPalette);
  const { setUi, applyGenerator, mirror } = useLampActions();
  const [said, setSaid] = useState('');
  const labelId = useId();
  const hintId = useId();
  const mixNames = distinctNames(mix, palette);
  const tooFew = mix.length < MIN_MIX;

  const describe = (prefix: string) => {
    const s = lampStore.getState();
    const bands = selectFittedBands(s);
    const n = target === 'both' ? `${bands.outer.length} + ${bands.inner.length}` : String(bands[target].length);
    return `${TARGET_TEXT[target]}: ${prefix} over ${n} bands.`;
  };

  const run = (kind: GeneratorKind) => {
    applyGenerator(kind);
    setSaid(describe(`${KIND_TEXT[kind]} ${listJoin(mixNames)}`));
  };

  return (
    <div className={styles.bar} role="group" aria-labelledby={labelId}>
      <div className={styles.top}>
        <span id={labelId} className="micro">
          Fill
        </span>
        <SegmentedControl label="Stack to fill" options={TARGETS} value={target} onChange={(v) => setUi({ genTarget: v })} size="sm" />
      </div>
      <div className={styles.buttons}>
        {GENERATORS.map((g) => (
          <Button
            key={g.kind}
            size="sm"
            variant="secondary"
            icon={g.icon}
            disabled={tooFew}
            aria-describedby={hintId}
            onClick={() => run(g.kind)}
          >
            {g.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="secondary"
          icon="mirror"
          aria-describedby={hintId}
          title="Reflect the bands about the middle"
          onClick={() => {
            mirror();
            setSaid(`${TARGET_TEXT[target]}: mirrored.`);
          }}
        >
          Mirror
        </Button>
      </div>
      <p id={hintId} className={styles.hint}>
        {tooFew
          ? `Tick Mix on at least ${MIN_MIX} colours to alternate, blend or shuffle them.`
          : `Mix: ${listJoin(mixNames)}. Random re-rolls on every click.`}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
