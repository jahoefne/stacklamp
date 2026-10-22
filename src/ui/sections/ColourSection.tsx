import type { ReactElement } from 'react';
import { UiIcon } from '../primitives/UiIcon';
import { ColourBandEditor } from './ColourBandEditor';
import { GeneratorBar } from './GeneratorBar';
import { PaletteEditor } from './PaletteEditor';
import { PanelSection } from './PanelSection';
import panel from './panel.module.css';

/** 03 Colours: palette (brush + mix), generators, band editor. Colour edits never rebuild geometry. */
export function ColourSection(): ReactElement {
  return (
    <PanelSection id="section-colours" number={3} title="Colours">
      <PaletteEditor />
      <GeneratorBar />
      <ColourBandEditor />
      <p className={panel.note}>
        <UiIcon name="info" size={16} className={panel.noteIcon} />
        <span>Slicers ignore 3MF colours — PRINT-PLAN.md lists how many to print in each colour.</span>
      </p>
    </PanelSection>
  );
}
