import type { ReactElement } from 'react';
import { Icon, type IconName } from '../illustrations/icons';

export interface UiIconProps {
  name: IconName;
  size?: number;
  /** Accessible name; omit for decorative icons next to visible text. */
  title?: string;
  /** Accepts `undefined` (CSS-module lookups), unlike the illustration Icon's strict optional. */
  className?: string | undefined;
}

/** The design system's Icon with app-friendly optional props. */
export function UiIcon({ name, size = 20, title, className }: UiIconProps): ReactElement {
  return <Icon name={name} size={size} {...(title ? { title } : {})} {...(className ? { className } : {})} />;
}
