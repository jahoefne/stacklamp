/**
 * Assembly interference in the (r, z) half plane: no two placed profiles
 * (base, every segment, cover, clamp, weight plate, rod) overlap, and the
 * parts that are meant to bear on each other actually touch (shift one by
 * 0.01 mm and they overlap). A segment is the envelope of its band's form.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { derive, deriveDims } from '../../src/geometry/derive';
import type { Kernel } from '../../src/geometry/kernel';
import { profileBounds, translateProfile, type Profile } from '../../src/geometry/profile';
import { segmentEnvelope, segmentRMax } from '../../src/geometry/profiles/forms';
import { assemblySection, overlapArea, type SectionPiece } from '../../src/geometry/section';
import { getKernel } from '../helpers/kernel';
import { CASES } from '../helpers/params';

const NONE = 1e-6;
const CONTACT = 1e-4;
const SHIFT = 0.01;

let k: Kernel;
beforeAll(async () => {
  k = await getKernel();
});

function zOverlap(a: Profile, b: Profile): boolean {
  const A = profileBounds(a);
  const B = profileBounds(b);
  return A.zMin <= B.zMax + 1 && B.zMin <= A.zMax + 1 && A.rMin <= B.rMax + 1 && B.rMin <= A.rMax + 1;
}

const piece = (pieces: SectionPiece[], name: string): SectionPiece => {
  const p = pieces.find((x) => x.name === name);
  if (!p) throw new Error(`no ${name}`);
  return p;
};

describe.each(CASES.filter((c) => !c.expectErrors?.length))('$name', ({ params }) => {
  it('no two placed parts overlap', () => {
    const pieces = assemblySection(params);
    let pairs = 0;
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i]!;
        const b = pieces[j]!;
        if (!zOverlap(a.polygon, b.polygon)) continue;
        pairs++;
        expect(overlapArea(k, a.polygon, b.polygon), `${a.name} × ${b.name}`).toBeLessThan(NONE);
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it('bearing faces touch', () => {
    const d = deriveDims(params);
    const pieces = assemblySection(params);
    const down = (p: SectionPiece) => translateProfile(p.polygon, -SHIFT);
    const up = (p: SectionPiece) => translateProfile(p.polygon, SHIFT);
    for (const stack of ['inner-segment', 'outer-segment'] as const) {
      const count = stack === 'inner-segment' ? d.inner.count : d.outer.count;
      // segment 1 sits on the base's spigot ring
      expect(overlapArea(k, down(piece(pieces, `${stack}#1`)), piece(pieces, 'base').polygon), `${stack}#1 on base`).toBeGreaterThan(CONTACT);
      for (let s = 2; s <= count; s++) {
        expect(
          overlapArea(k, down(piece(pieces, `${stack}#${s}`)), piece(pieces, `${stack}#${s - 1}`).polygon),
          `${stack}#${s} on #${s - 1}`,
        ).toBeGreaterThan(CONTACT);
      }
    }
    // the top outer segment's rim bears on the cover plate; the inner one does not
    const cover = piece(pieces, 'top-cover').polygon;
    expect(overlapArea(k, up(piece(pieces, `outer-segment#${d.outer.count}`)), cover)).toBeGreaterThan(CONTACT);
    expect(overlapArea(k, up(piece(pieces, `inner-segment#${d.inner.count}`)), cover)).toBeLessThan(NONE);
    // the rod stands on the socket floor and ends below the boss hole ceiling
    const rod = piece(pieces, 'rod');
    expect(overlapArea(k, down(rod), piece(pieces, 'base').polygon)).toBeGreaterThan(CONTACT);
    expect(overlapArea(k, up(rod), cover)).toBeLessThan(NONE);
    // the weight plate meets the pocket ceiling, clears the boss, and the clamp bears on it from below
    const plate = piece(pieces, 'plate');
    expect(overlapArea(k, up(plate), piece(pieces, 'base').polygon)).toBeGreaterThan(CONTACT);
    expect(overlapArea(k, up(piece(pieces, 'plate-clamp')), plate.polygon)).toBeGreaterThan(CONTACT);
    expect(overlapArea(k, down(piece(pieces, 'plate-clamp')), piece(pieces, 'base').polygon)).toBeLessThan(NONE);
  });
});

describe('segment forms in the section', () => {
  const caseParams = (name: string) => CASES.find((c) => c.name === name)!.params;

  it("every band is its form's envelope, placed by the pitch", () => {
    const params = caseParams('mixed forms');
    const { dims, layout } = derive(params);
    const pieces = assemblySection(params);
    for (const [part, stack] of [
      ['inner-segment', 'inner'],
      ['outer-segment', 'outer'],
    ] as const) {
      const s = dims[stack];
      expect(new Set(s.forms).size, stack).toBe(4);
      for (let k = 0; k < s.count; k++) {
        const spec = layout!.specs.variants[stack].find((v) => v.form === s.forms[k])!.spec;
        const polygon = piece(pieces, `${part}#${k + 1}`).polygon;
        expect(polygon, `${part}#${k + 1}`).toEqual(translateProfile(segmentEnvelope(spec), s.stackBottomZ + k * s.pitch));
        expect(profileBounds(polygon).rMax).toBeCloseTo(segmentRMax(spec), 9);
      }
    }
  });

  it('an inner form the derive rejects as too wide really runs into the outer stack', () => {
    const params = caseParams('inner form too wide');
    expect(deriveDims(params).messages.map((m) => m.code)).toContain('form-too-wide');
    const pieces = assemblySection(params);
    const inner = pieces.filter((p) => p.part === 'inner-segment');
    const outer = pieces.filter((p) => p.part === 'outer-segment');
    let worst = 0;
    for (const a of inner) for (const b of outer) if (zOverlap(a.polygon, b.polygon)) worst = Math.max(worst, overlapArea(k, a.polygon, b.polygon));
    expect(worst).toBeGreaterThan(CONTACT);
  });
});
