import type { ReactElement } from 'react';
import { ColourBandEditor } from './ColourBandEditor';
import { GeneratorBar } from './GeneratorBar';
import { PaletteEditor } from './PaletteEditor';
import { PanelSection } from './PanelSection';

/** 03 Colours: palette (brush + mix), generators, band editor. Colour edits never rebuild geometry. */
export function ColourSection(): ReactElement {
  return (
    <PanelSection id="section-colours" number={3} title="Colours">
      <PaletteEditor />
      <GeneratorBar />
      <ColourBandEditor />
    </PanelSection>
  );
}
