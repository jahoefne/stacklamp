/** Tiny memo helpers for referentially stable selectors (zustand 5 requires them). */

/** Recompute only when an argument changes (Object.is). One entry. */
export function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | null = null;
  let last!: R;
  return (...args: A): R => {
    if (lastArgs && lastArgs.length === args.length && args.every((a, i) => Object.is(a, lastArgs![i]))) return last;
    lastArgs = args;
    last = fn(...args);
    return last;
  };
}

/** Like memoLast, but also returns the previous result when the new one is `equal` to it. */
export function memoStable<A extends unknown[], R>(fn: (...args: A) => R, equal: (a: R, b: R) => boolean): (...args: A) => R {
  let has = false;
  let last!: R;
  return memoLast((...args: A): R => {
    const next = fn(...args);
    if (has && equal(last, next)) return last;
    has = true;
    last = next;
    return next;
  });
}

export const shallowArrayEqual = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a === b || (a.length === b.length && a.every((x, i) => Object.is(x, b[i])));
