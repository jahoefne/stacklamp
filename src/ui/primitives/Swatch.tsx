import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactElement } from 'react';
import { cx } from './format';
import styles from './Swatch.module.css';

interface SwatchBase {
  /** '#rrggbb' fill. */
  colour: string;
  /** Selected brush: double ring. */
  selected?: boolean;
  /** In the generator mix: small ink dot badge. */
  inMix?: boolean;
  /** 'md' 32 px (palette), 'sm' 14 px dot (tables and readouts). */
  size?: 'md' | 'sm';
  className?: string;
}

export interface SwatchSpanProps extends SwatchBase {
  as?: 'span';
  /** Accessible name; omit for a decorative dot next to a visible name. */
  label?: string;
}

export interface SwatchButtonProps extends SwatchBase, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  as: 'button';
  label: string;
}

export type SwatchProps = SwatchSpanProps | SwatchButtonProps;

/** A colour seen from above: a circle with an ink ring and a flat glass facet. */
export const Swatch = forwardRef<HTMLButtonElement, SwatchProps>(function Swatch(props, ref): ReactElement {
  const { colour, selected = false, inMix = false, size = 'md', className } = props;
  const style = { '--_c': colour } as CSSProperties;
  const classes = cx(styles.swatch, styles[size], selected && styles.selected, inMix && styles.inMix, className);
  if (props.as === 'button') {
    const { as: _as, colour: _c, selected: _s, inMix: _m, size: _z, className: _cn, label, type = 'button', ...rest } = props;
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={rest.title ?? label}
        className={cx(classes, styles.interactive)}
        style={style}
        {...rest}
      />
    );
  }
  const { label } = props;
  return label ? (
    <span role="img" aria-label={label} title={label} className={classes} style={style} />
  ) : (
    <span aria-hidden="true" className={classes} style={style} />
  );
});
