/**
 * Geometric 20 px stroke icons (2 px ink stroke, square caps, mitred joins: Bauhaus, not friendly-round).
 * Drawn on a 20 × 20 grid with integer coordinates so the 2 px strokes land on whole pixels.
 * Colour comes from `currentColor`; size defaults to 20. Decorative unless `title` is given.
 */
import type { ReactElement, SVGProps } from 'react';

export const ICON_NAMES = [
  'link',
  'download',
  'plus',
  'trash',
  'edit',
  'alternate',
  'gradient',
  'random',
  'mirror',
  'eye',
  'explode',
  'resetView',
  'warning',
  'info',
  'check',
  'close',
  'chevron',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const solid = { fill: 'currentColor', stroke: 'none' } as const;

/** Inner SVG content per icon. `chevron` points down; rotate it with CSS for other directions. */
const GLYPHS: Record<IconName, ReactElement> = {
  link: (
    <g transform="rotate(-45 10 10)">
      <rect x="1" y="7" width="8" height="6" rx="3" />
      <rect x="11" y="7" width="8" height="6" rx="3" />
      <path d="M7 10h6" />
    </g>
  ),
  download: <path d="M10 3v9M6 8l4 4 4-4M4 17h12" />,
  plus: <path d="M10 4v12M4 10h12" />,
  trash: <path d="M3 5h14M8 5V3h4v2M5 5v12h10V5M8 8v6M12 8v6" />,
  edit: <path d="M13 3l4 4-10 10H3v-4zM11 5l4 4" />,
  alternate: (
    <>
      <rect x="4" y="3" width="12" height="14" />
      <rect x="4" y="6.5" width="12" height="3.5" {...solid} />
      <rect x="4" y="13.5" width="12" height="3.5" {...solid} />
    </>
  ),
  gradient: (
    <>
      <rect x="4" y="3" width="12" height="14" />
      <rect x="4" y="13.5" width="12" height="3.5" {...solid} />
      <rect x="4" y="10" width="12" height="3.5" {...solid} fillOpacity={0.6} />
      <rect x="4" y="6.5" width="12" height="3.5" {...solid} fillOpacity={0.28} />
    </>
  ),
  random: (
    <>
      <rect x="3" y="3" width="14" height="14" />
      <circle cx="7" cy="7" r="1.5" {...solid} />
      <circle cx="10" cy="10" r="1.5" {...solid} />
      <circle cx="13" cy="13" r="1.5" {...solid} />
    </>
  ),
  mirror: (
    <>
      <path d="M10 2v16" strokeDasharray="2 2" strokeLinecap="butt" />
      <path d="M7 5v10H2zM13 5v10h5z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 10a9 9 0 0 1 16 0a9 9 0 0 1-16 0z" />
      <circle cx="10" cy="10" r="2.25" {...solid} />
    </>
  ),
  explode: (
    <>
      <rect x="4" y="8" width="12" height="4" />
      <path d="M10 5V1.5M7.5 3.5L10 1l2.5 2.5M10 15v3.5M7.5 16.5L10 19l2.5-2.5" />
    </>
  ),
  resetView: (
    <>
      <path d="M17 10a7 7 0 1 1-2.05-4.95L17 7M17 3v4h-4" />
      <circle cx="10" cy="10" r="1.5" {...solid} />
    </>
  ),
  warning: (
    <>
      <path d="M10 2.5L18.5 17h-17z" />
      <path d="M10 8v4" />
      <circle cx="10" cy="14.5" r="1.1" {...solid} />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6" r="1.1" {...solid} />
    </>
  ),
  check: <path d="M4 10l4 4 8-8" />,
  close: <path d="M4 4l12 12M16 4L4 16" />,
  chevron: <path d="M4 7l6 6 6-6" />,
};

export interface IconProps {
  name: IconName;
  /** Rendered width and height in CSS px (the artwork is drawn for 20). */
  size?: number;
  /** Accessible name. Omit for decorative icons next to visible text (then aria-hidden). */
  title?: string;
  className?: string;
}

export function Icon({ name, size = 20, title, className }: IconProps): ReactElement {
  const a11y: SVGProps<SVGSVGElement> = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      focusable="false"
      className={className}
      data-icon={name}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {GLYPHS[name]}
    </svg>
  );
}

type NamedIconProps = Omit<IconProps, 'name'>;
const named = (name: IconName) => {
  const C = (props: NamedIconProps) => <Icon name={name} {...props} />;
  C.displayName = `Icon(${name})`;
  return C;
};

export const LinkIcon = named('link');
export const DownloadIcon = named('download');
export const PlusIcon = named('plus');
export const TrashIcon = named('trash');
export const EditIcon = named('edit');
export const AlternateIcon = named('alternate');
export const GradientIcon = named('gradient');
export const RandomIcon = named('random');
export const MirrorIcon = named('mirror');
export const EyeIcon = named('eye');
export const ExplodeIcon = named('explode');
export const ResetViewIcon = named('resetView');
export const WarningIcon = named('warning');
export const InfoIcon = named('info');
export const CheckIcon = named('check');
export const CloseIcon = named('close');
export const ChevronIcon = named('chevron');
