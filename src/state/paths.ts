/** Typed access to the enum leaves of LampParams (numeric leaves use getParam/setParam from the barrel). */
import type { EnumParamPath, LampParams } from '../geometry';
import { ENUM_SPECS } from './paramSpec';
import type { EnumValue } from './paramSpec';

export function getEnumParam<P extends EnumParamPath>(p: LampParams, path: P): EnumValue<P> {
  const [g, k] = path.split('.') as [keyof LampParams, string];
  return (p[g] as unknown as Record<string, string>)[k] as EnumValue<P>;
}

/** Copy of `p` with one enum leaf replaced. Invalid values return `p` unchanged. */
export function withEnumParam<P extends EnumParamPath>(p: LampParams, path: P, value: EnumValue<P>): LampParams {
  if (!isEnumValue(path, value)) return p;
  if (getEnumParam(p, path) === value) return p;
  const [g, k] = path.split('.') as [keyof LampParams, string];
  return { ...p, [g]: { ...(p[g] as object), [k]: value } } as LampParams;
}

export function isEnumValue<P extends EnumParamPath>(path: P, value: unknown): value is EnumValue<P> {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENUM_SPECS[path].codes, value);
}

/** Allowed values of an enum path, in declaration order. */
export function enumValues<P extends EnumParamPath>(path: P): EnumValue<P>[] {
  return Object.keys(ENUM_SPECS[path].codes) as EnumValue<P>[];
}
