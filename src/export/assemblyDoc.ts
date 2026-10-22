/**
 * ASSEMBLY.md: hardware list, assembly steps and safety notes for the
 * configured lamp. Deterministic.
 */
import type { DerivedDims } from '../geometry/types';
import { num, table } from './format';
import type { DocInput } from './printPlan';
import { rodLine } from './printPlan';

/** Width of the LED strip the estimates assume, mm. */
export const STRIP_WIDTH = 10;

/** Strip length (m) for a helix of the given pitch over the strip zone. */
export function stripLength(dims: DerivedDims, stripBuildUp: number, pitch: number): number {
  const zone = Math.max(0, dims.rod.stripZone[1] - dims.rod.stripZone[0]);
  const circumference = Math.PI * (dims.rod.diameter + stripBuildUp);
  return (zone / pitch) * Math.hypot(circumference, pitch) / 1000;
}

export function assemblyMarkdown(input: DocInput): string {
  const { req, dims } = input;
  const p = req.params;
  const tube = p.core.kind === 'led-tube';
  const zone = dims.rod.stripZone;
  const out: string[] = [];
  out.push('# stacklamp — assembly', '');
  if (req.meta.shareUrl) out.push(`Configuration: ${req.meta.shareUrl}`, '');

  out.push('## Hardware', '');
  const hw: string[] = [];
  hw.push(`- **Core:** ${rodLine(req, dims)}.`);
  if (p.base.screwCount > 0) {
    hw.push(
      `- **${p.base.screwCount} × M4 screws** (8–10 mm set screws or self-tapping screws) for the collar holes (Ø ${num(p.base.screwDiameter)} mm), or a few dots of hot glue instead.`,
    );
  } else {
    hw.push('- **Hot glue** (or epoxy) to fix the core in the collar.');
  }
  hw.push(
    `- **Weight plate** Ø ${num(p.plate.od)} × ${num(p.plate.thickness)} mm with a ${num(p.plate.bore)} mm bore (a standard cast-iron dumbbell plate); it sits in the base's ${num(dims.base.pocketDiameter)} × ${num(dims.base.pocketDepth)} mm underside pocket and keeps the lamp from tipping.`,
  );
  if (!tube) {
    hw.push(
      `- **LED strip**, ${STRIP_WIDTH} mm wide, 12 V or 24 V, wrapped around the rod between ${num(zone[0])} mm and ${num(zone[1])} mm above the floor (${num(zone[1] - zone[0])} mm). Length estimate:`,
    );
    hw.push('');
    hw.push(
      table(
        ['Wrap', 'Strip length'],
        [
          [`tight helix (pitch ${STRIP_WIDTH} mm)`, `≈ ${num(stripLength(dims, p.core.stripBuildUp, STRIP_WIDTH), 1)} m`],
          ['open helix (pitch 20 mm)', `≈ ${num(stripLength(dims, p.core.stripBuildUp, 20), 1)} m`],
          ['open helix (pitch 40 mm)', `≈ ${num(stripLength(dims, p.core.stripBuildUp, 40), 1)} m`],
          ['one straight run', `≈ ${num((zone[1] - zone[0]) / 1000, 2)} m`],
        ],
      ),
    );
    hw.push('');
    hw.push(
      '- **Power supply:** a certified 12 V or 24 V (SELV) supply matching the strip, rated for the strip power (W/m × length) plus 20 %, with an inline switch or dimmer. The supply stays outside the lamp.',
    );
  } else {
    hw.push('- **Mains lead** for the LED tube with an inline switch, wired by a qualified person.');
  }
  hw.push(
    `- **Printed parts:** base, ${dims.inner.count} × inner segment, ${dims.outer.count} × outer segment, top cover (see PRINT-PLAN.md).`,
  );
  out.push(hw.join('\n'), '');

  out.push('## Steps', '');
  const routing =
    dims.base.wireRouting === 'beside-collar'
      ? `down the Ø ${num(p.base.wireDiameter)} mm hole beside the collar into the tunnel and out of the base rim`
      : `through the Ø ${num(p.base.wireDiameter)} mm hole in the socket floor into the tunnel and out of the base rim`;
  const steps: string[] = [
    `Press the weight plate into the pocket on the underside of the base. If it rattles, a few dots of hot glue or a strip of tape hold it.`,
    `Push the ${tube ? 'LED tube' : 'rod'} into the collar until it stands on the socket floor, ${num(p.base.socketBelowTop)} mm below the base top. ${
      p.base.screwCount > 0
        ? `Tighten the ${p.base.screwCount} screws (${num(dims.base.screwZ - dims.base.topZ)} mm above the base top) evenly so the ${tube ? 'tube' : 'rod'} stands upright.`
        : 'Fix it with hot glue and hold it upright until the glue sets.'
    }`,
    tube
      ? `Route the tube's lead ${routing} before seating the tube.`
      : `Wrap the LED strip around the rod from the collar top (${num(zone[0])} mm) up to ${num(zone[1])} mm, leaving the top ${num(p.cover.bossHeight)} mm free for the cover boss. Secure both ends.`,
    ...(tube ? [] : [`Route the strip's lead ${routing}. Connect it to the power supply outside the lamp.`]),
    `Stack the ${dims.inner.count} inner segments onto the inner ring of the base, foot (socket) down, in the colour order of PRINT-PLAN.md (band 1 at the bottom). Each foot slides over the rim below and sits on its 45° shoulder.`,
    `Stack the ${dims.outer.count} outer segments onto the outer ring the same way.`,
    `Fit the cover: the boss goes over the ${tube ? 'tube' : 'rod'} end, the inner ring over the top inner segment, the outer ring over the top outer segment, whose rim bears on the cover plate. The ${tube ? 'tube' : 'rod'} ends ${num(dims.rod.endGap)} mm below the boss hole ceiling and the inner stack ${num(dims.cover.innerTopGap)} mm below the plate.`,
  ];
  out.push(steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), '');

  out.push('## Safety', '');
  const safety: string[] = [];
  if (tube) {
    safety.push(
      '- **The LED tube runs on mains voltage.** Have the wiring done by a qualified electrician, use a tube and lead rated for the purpose, strain-relieve the lead and protect it where it leaves the base.',
    );
  } else {
    safety.push(
      '- Use **only SELV LED strips (12 V or 24 V)** with a certified, correctly rated power supply. Never bring mains voltage into the lamp.',
    );
  }
  safety.push(
    '- **PETG softens at about 80 °C.** Keep the air intakes in the base and the slits in the cover open so warm air can rise through the stacks; use moderate strip power (aluminium rod as heat sink) and check after an hour that no part gets hot to the touch.',
    `- **Anchor the lamp against tipping.** It is ${num(dims.totalHeight / 1000, 2)} m tall on a ${num(p.base.diameter)} mm base: always use the weight plate, stand it on a level floor and keep it out of reach of small children and pets.`,
    '- The printed parts are not a structural load path: do not lift the lamp by the cover or the segments.',
  );
  out.push(safety.join('\n'), '');
  return out.join('\n');
}
