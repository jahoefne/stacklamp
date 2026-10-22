import type { ReactElement } from 'react';
import { selectFittedBands, selectPalette, useLamp } from '../../state';
import { StackIllustration } from '../illustrations/StackIllustration';
import { Button } from '../primitives/Button';
import { listJoin } from '../primitives/format';
import { distinctNames, hexesFor } from './derived';
import styles from './Hero.module.css';

export interface HeroProps {
  /** Scroll to the configurator and focus the rod length. */
  onConfigure(): void;
}

/** Landing hero: the concept in three lines and the lamp in the current colours. */
export function Hero({ onConfigure }: HeroProps): ReactElement {
  const bands = useLamp(selectFittedBands);
  const palette = useLamp(selectPalette);
  const outer = hexesFor(bands.outer, palette);
  const inner = hexesFor(bands.inner, palette);
  const names = listJoin(distinctNames(bands.outer, palette).map((n) => n.toLowerCase()));
  const title = `A column of ${names || 'coloured'} rings around a light core, standing on a round base`;

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <p className="micro">A floor lamp you print yourself</p>
        <h1 id="hero-title" className={styles.headline}>
          Light,
          <br />
          stacked.
        </h1>
        <ul className={styles.lines} role="list">
          <li>A metal core. A ribbon of light. Rings of translucent PETG.</li>
          <li>Stack printed tubes in any colour order to paint the light, zone by zone.</li>
          <li>Set the height, pick the colours, download print-ready files. Free, in your browser.</li>
        </ul>
        <div className={styles.cta}>
          <Button variant="primary" onClick={onConfigure}>
            Configure your lamp
          </Button>
        </div>
        <p className={styles.meta}>1.5 m tall by default · 5 printable parts · open source (MIT)</p>
      </div>
      <div className={styles.art}>
        <StackIllustration variant="hero" outerColours={outer} innerColours={inner} title={title} animate className={styles.svg ?? ''} />
      </div>
    </section>
  );
}
