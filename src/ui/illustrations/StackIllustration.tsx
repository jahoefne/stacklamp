/**
 * The lamp as a drawing.
 *
 * - `hero`: stylised poster elevation for the landing hero. Flat colour bands with ink "leading",
 *   a stepped halo of light in each band's colour, an ink base and cap, a light pool on the floor.
 *   With `animate`, the halo pulses upwards band by band (CSS only, off under reduced motion).
 * - `schematic`: to-scale half-section elevation used as the WebGL fallback. Left half shows the
 *   outer stack from outside, right half cuts the outer wall and shows the inner stack, the core
 *   is a dashed hidden line. Linework and labels use `currentColor`, so the parent decides
 *   (on the dark stage: `color: var(--stage-ink)`; on paper: `color: var(--color-ink)`).
 *
 * Colours are hex strings, index 0 = bottom band. Everything renders with sensible defaults when
 * colours or dims are missing.
 */
import { useId, type CSSProperties, type ReactElement } from 'react';

export interface StackDims {
  totalHeight: number;
  outerOD: number;
  innerOD: number;
  baseD: number;
  innerSegH: number;
  outerSegH: number;
  rodLength: number;
}

export interface StackIllustrationProps {
  variant: 'hero' | 'schematic';
  /** Inner stack band colours, hex, index 0 = bottom. */
  innerColours: string[];
  /** Outer stack band colours, hex, index 0 = bottom. */
  outerColours: string[];
  dims?: StackDims;
  /** Accessible name of the drawing. */
  title: string;
  className?: string;
  /** Hero only: subtle rising glow. Ignored under prefers-reduced-motion. */
  animate?: boolean;
}

/** Default lamp (matches the engine's golden values at default params). */
export const DEFAULT_STACK_DIMS: StackDims = {
  totalHeight: 1536.5,
  outerOD: 200,
  innerOD: 60,
  baseD: 240,
  innerSegH: 154.3,
  outerSegH: 154.5,
  rodLength: 1500,
};

// Default PETG hexes (mirror of --petg-* in tokens.css) and the suggested default plan.
const AMB = '#FFA41B';
const ORG = '#FF6A1F';
const RED = '#F2363F';
const CLR = '#FFF4DC';
const DEFAULT_OUTER = [AMB, AMB, AMB, AMB, ORG, ORG, ORG, ORG, RED, RED, RED];
const DEFAULT_INNER = Array.from({ length: 11 }, () => CLR);

// Fixed construction constants of the segment joint (see contract.md), mm.
const SEAT_Z = 21.25; // overlap + clearance + lead-in
const RING_H = 21.75; // base spigot ring height = seatZ + foot gap
const FOOT_GAP = 0.5;
const COVER_PLATE = 3;
const COVER_RING_H = 20;
const COVER_RING_WALL = 2.4;
const SOCKET_BELOW_TOP = 15;
const ROD_D = 20;

const INK = 'var(--color-ink, #1B1814)';
const PAPER = 'var(--color-paper, #F4EEE1)';
const LIGHT = '#FFF8EC';

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const safeColour = (c: string | undefined, fallback: string): string => (c && HEX_RE.test(c) ? c : fallback);
const coloursOr = (list: string[] | undefined, fallback: string[]): string[] =>
  list && list.length > 0 ? list.map((c) => safeColour(c, CLR)) : fallback;

const pos = (n: number | undefined, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback;

const fmt = (n: number): string => String(Math.round(n * 10) / 10);

const cssId = (raw: string): string => `sl${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

export function StackIllustration(props: StackIllustrationProps): ReactElement {
  return props.variant === 'hero' ? <HeroStack {...props} /> : <SchematicStack {...props} />;
}

export default StackIllustration;

/* ───────────────────────────────── hero ───────────────────────────────── */

const HERO_W = 480;
const HERO_H = 640;

function HeroStack({ innerColours, outerColours, title, className, animate }: StackIllustrationProps): ReactElement {
  const uid = useId();
  const k = cssId(uid);
  const titleId = `${k}-title`;
  const outer = coloursOr(outerColours, DEFAULT_OUTER);
  const inner = coloursOr(innerColours, DEFAULT_INNER);

  const cx = HERO_W / 2;
  const groundY = 592;
  const baseTopY = 558;
  const stackBottomY = baseTopY;
  const capH = 14;
  const stackTopY = 84;
  const capY = stackTopY - capH;
  const outerW = 150;
  const innerW = 42;
  const coreW = 6;
  const haloMax = 440;

  const stackH = stackBottomY - stackTopY;
  const nO = outer.length;
  const nI = inner.length;
  const bandH = stackH / nO;
  const innerTopY = stackTopY + 6; // inner stack ends a little below the cover
  const innerBandH = (stackBottomY - innerTopY) / nI;

  // band i (0 = bottom) occupies [y0, y0 + h] in SVG coordinates
  const outerBands = outer.map((colour, i) => ({ colour, y: stackBottomY - (i + 1) * bandH, h: bandH }));
  const innerBands = inner.map((colour, i) => ({ colour, y: stackBottomY - (i + 1) * innerBandH, h: innerBandH }));
  const halo = outerBands.map((b, i) => {
    const t = Math.sin((Math.PI * (i + 0.5)) / nO);
    const w = outerW + (haloMax - outerW) * (0.3 + 0.7 * t);
    return { ...b, w };
  });

  const pulse = animate === true;
  const style = pulse
    ? `@media (prefers-reduced-motion: no-preference) {
  .${k}-halo { animation: ${k}-rise 6.4s cubic-bezier(0.65, 0, 0.35, 1) infinite both; }
}
@keyframes ${k}-rise { 0%, 100% { opacity: 0.2; } 35% { opacity: 0.46; } 60% { opacity: 0.24; } }`
    : '';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${HERO_W} ${HERO_H}`}
      role="img"
      aria-labelledby={titleId}
      className={className}
      data-variant="hero"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{title}</title>
      {style ? <style>{style}</style> : null}

      {/* light pool on the floor, tinted by the bottom band */}
      <ellipse cx={cx} cy={groundY} rx={200} ry={20} fill={outer[0]} opacity={0.32} />
      <ellipse cx={cx} cy={groundY} rx={128} ry={12} fill={outer[0]} opacity={0.4} />

      {/* stepped halo: each band spills its colour sideways */}
      <g data-part="halo">
        {halo.map((b, i) => (
          <rect
            key={i}
            className={pulse ? `${k}-halo` : undefined}
            x={cx - b.w / 2}
            y={b.y + 1.5}
            width={b.w}
            height={Math.max(0.5, b.h - 3)}
            fill={b.colour}
            opacity={0.26}
            style={pulse ? ({ animationDelay: `${(i * 0.24).toFixed(2)}s` } as CSSProperties) : undefined}
          />
        ))}
      </g>

      {/* floor line */}
      <path d={`M${cx - 230} ${groundY}H${cx + 230}`} stroke={INK} strokeWidth={3} />

      {/* outer stack: flat bands, ink leading between them */}
      <g data-part="outer">
        {outerBands.map((b, i) => (
          <rect key={i} x={cx - outerW / 2} y={b.y} width={outerW} height={b.h} fill={b.colour} />
        ))}
        {/* double wall where each segment's foot sleeves over the one below */}
        {outerBands.map((b, i) => (
          <rect
            key={`o${i}`}
            x={cx - outerW / 2}
            y={b.y + b.h - Math.min(10, b.h * 0.22)}
            width={outerW}
            height={Math.min(10, b.h * 0.22)}
            fill="#000"
            opacity={0.12}
          />
        ))}
      </g>

      {/* inner stack seen through the outer one, then the light core */}
      <g data-part="inner">
        {innerBands.map((b, i) => (
          <rect key={i} x={cx - innerW / 2} y={b.y} width={innerW} height={b.h} fill={b.colour} opacity={0.5} />
        ))}
        {innerBands.slice(0, -1).map((b, i) => (
          <path key={`s${i}`} d={`M${cx - innerW / 2} ${b.y}h${innerW}`} stroke={INK} strokeWidth={1} opacity={0.35} />
        ))}
        <rect x={cx - coreW / 2} y={innerTopY} width={coreW} height={stackBottomY - innerTopY} fill={LIGHT} />
      </g>

      {/* leading: outline and seams */}
      <g fill="none" stroke={INK} strokeWidth={2.5}>
        <rect x={cx - outerW / 2} y={stackTopY} width={outerW} height={stackH} />
        {outerBands.slice(0, -1).map((b, i) => (
          <path key={i} d={`M${cx - outerW / 2} ${b.y}h${outerW}`} />
        ))}
      </g>

      {/* top cover with slits */}
      <rect x={cx - outerW / 2 - 6} y={capY} width={outerW + 12} height={capH} fill={INK} />
      {[-48, -24, 0, 24, 48].map((dx) => (
        <rect key={dx} x={cx + dx - 6} y={capY + 4} width={12} height={3} fill={PAPER} />
      ))}

      {/* base puck with chamfered top edge */}
      <path
        d={`M${cx - 98} ${groundY}H${cx + 98}V${baseTopY + 8}L${cx + 90} ${baseTopY}H${cx - 90}L${cx - 98} ${baseTopY + 8}Z`}
        fill={INK}
      />
    </svg>
  );
}

/* ─────────────────────────────── schematic ─────────────────────────────── */

interface Band {
  colour: string;
  z0: number;
  z1: number;
  overlap: number;
}

function stackBands(colours: string[], bottomZ: number, pitch: number, segH: number): Band[] {
  const n = colours.length;
  return colours.map((colour, i) => {
    const z0 = bottomZ + i * pitch;
    const z1 = i < n - 1 ? z0 + pitch : z0 + segH;
    return { colour, z0, z1, overlap: Math.min(segH - pitch, z1 - z0) };
  });
}

function SchematicStack({ innerColours, outerColours, dims, title, className }: StackIllustrationProps): ReactElement {
  const uid = useId();
  const k = cssId(uid);
  const titleId = `${k}-title`;
  const descId = `${k}-desc`;

  const d0 = DEFAULT_STACK_DIMS;
  const total = pos(dims?.totalHeight, d0.totalHeight);
  const outerOD = pos(dims?.outerOD, d0.outerOD);
  const innerOD = Math.min(pos(dims?.innerOD, d0.innerOD), outerOD * 0.9);
  const baseD = Math.max(pos(dims?.baseD, d0.baseD), outerOD + 10);
  const outerH = Math.max(pos(dims?.outerSegH, d0.outerSegH), SEAT_Z + 10);
  const innerH = Math.max(pos(dims?.innerSegH, d0.innerSegH), SEAT_Z + 10);
  const rodLength = pos(dims?.rodLength, d0.rodLength);

  // Band counts come from the colour lists; fall back to what fits.
  const fitCount = (h: number) => Math.max(1, Math.round((total - 70) / (h - SEAT_Z)));
  const outer = outerColours.length > 0 ? coloursOr(outerColours, DEFAULT_OUTER) : Array.from({ length: fitCount(outerH) }, (_, i) => DEFAULT_OUTER[Math.min(i, 10)] ?? AMB);
  const inner = innerColours.length > 0 ? coloursOr(innerColours, DEFAULT_INNER) : Array.from({ length: fitCount(innerH) }, () => CLR);

  // Closure (same as the engine): total = baseTop + ringHeight + N·P + plate. Solve for the base top;
  // if the inputs disagree, keep a plausible base and squeeze the pitch so the drawing stays consistent.
  let pitchO = outerH - SEAT_Z;
  let baseTop = total - COVER_PLATE - RING_H - outer.length * pitchO;
  if (baseTop < 20 || baseTop > total * 0.25) {
    baseTop = Math.min(Math.max(43, total * 0.03), total * 0.25);
    pitchO = Math.max(1, (total - COVER_PLATE - RING_H - baseTop) / outer.length);
  }
  const segHO = pitchO + SEAT_Z;
  const stackBottom = baseTop + FOOT_GAP;
  const outerTop = baseTop + RING_H + outer.length * pitchO;
  let pitchI = innerH - SEAT_Z;
  if (baseTop + RING_H + inner.length * pitchI > outerTop - 0.5) {
    pitchI = Math.max(1, (outerTop - 2 - baseTop - RING_H) / inner.length);
  }
  const segHI = pitchI + SEAT_Z;
  const innerTop = baseTop + RING_H + inner.length * pitchI;

  const outerBands = stackBands(outer, stackBottom, pitchO, segHO);
  const innerBands = stackBands(inner, stackBottom, pitchI, segHI);

  const rO = outerOD / 2;
  const rI = innerOD / 2;
  const rB = baseD / 2;
  const coverR = rO + 0.25 + COVER_RING_WALL;
  const rodBottom = baseTop - SOCKET_BELOW_TOP;
  const rodTop = rodBottom + rodLength;
  const wallW = Math.max(0.8, outerOD * 0.03); // exaggerated so the cut wall reads

  // Drawing units: u = label size. Margins are multiples of u so the labels keep their proportion
  // to the drawing, and the free width beside the (tall, narrow) lamp carries horizontal callouts.
  const u = Math.max(total, 500) * 0.034;
  const left = -rB - 7.2 * u;
  const right = rB + 9.6 * u;
  const top = total + 3.4 * u;
  const bottom = -3.2 * u;
  const y = (z: number) => -z; // SVG y grows downwards

  const line = { vectorEffect: 'non-scaling-stroke' } as CSSProperties;
  const text: CSSProperties = {
    fontFamily: 'var(--font-body, ui-sans-serif, system-ui, sans-serif)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: u,
  };
  const caption: CSSProperties = {
    ...text,
    fontSize: u * 0.75,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    opacity: 0.75,
  };
  const tick = u * 0.3;
  const slash = (x: number, yy: number) => `M${x - tick} ${yy + tick}L${x + tick} ${yy - tick}`;

  const hDim = (x0: number, x1: number, z: number, label: string, key: string, below = false) => (
    <g key={key} data-dim={key}>
      <path d={`M${x0} ${y(z)}H${x1}${slash(x0, y(z))}${slash(x1, y(z))}`} stroke="currentColor" strokeWidth={1} style={line} />
      <text x={(x0 + x1) / 2} y={below ? y(z) + u * 1.2 : y(z) - u * 0.5} textAnchor="middle" fill="currentColor" style={text}>
        {label}
      </text>
    </g>
  );
  /** Callout: a dot on the part, a leader to the right margin, caption above and value below the leader. */
  const callout = (x0: number, z: number, title: string, value: string, key: string) => {
    const xl = rB + 1.2 * u;
    return (
      <g key={key} data-callout={key}>
        <circle cx={x0} cy={y(z)} r={u * 0.18} fill="currentColor" />
        <path d={`M${x0} ${y(z)}H${xl + 7.6 * u}`} stroke="currentColor" strokeWidth={1} style={line} />
        <text x={xl} y={y(z) - u * 0.35} fill="currentColor" style={caption}>
          {title}
        </text>
        <text x={xl} y={y(z) + u * 1.15} fill="currentColor" style={text}>
          {value}
        </text>
      </g>
    );
  };

  const topBand = outerBands[outerBands.length - 1];
  const innerMark = innerBands[Math.max(0, innerBands.length - 3)];
  const totalX = -rB - 1.4 * u;
  const desc =
    `Elevation, to scale: ${fmt(total)} mm tall, outer stack ${outer.length} × ${fmt(segHO)} mm, Ø ${fmt(outerOD)} mm; ` +
    `inner stack ${inner.length} × ${fmt(segHI)} mm, Ø ${fmt(innerOD)} mm; base Ø ${fmt(baseD)} mm; core ${fmt(rodLength)} mm.`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${left} ${-top} ${right - left} ${top - bottom}`}
      role="img"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={className}
      data-variant="schematic"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{title}</title>
      <desc id={descId}>{desc}</desc>

      {/* floor */}
      <path d={`M${-rB - 1.5 * u} 0H${rB + 1.5 * u}`} stroke="currentColor" strokeWidth={2} style={line} />

      {/* base */}
      <rect x={-rB} y={y(baseTop)} width={baseD} height={baseTop} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.25} style={line} />

      {/* left half: outer stack from outside */}
      <g data-part="outer-exterior">
        {outerBands.map((b, i) => (
          <g key={i}>
            <rect x={-rO} y={y(b.z1)} width={rO} height={b.z1 - b.z0} fill={b.colour} />
            <rect x={-rO} y={y(b.z0 + b.overlap)} width={rO} height={b.overlap} fill="#000" fillOpacity={0.2} />
          </g>
        ))}
      </g>

      {/* right half: inner stack from outside, outer wall cut */}
      <g data-part="inner-exterior">
        {innerBands.map((b, i) => (
          <g key={i}>
            <rect x={0} y={y(b.z1)} width={rI} height={b.z1 - b.z0} fill={b.colour} />
            <rect x={0} y={y(b.z0 + b.overlap)} width={rI} height={b.overlap} fill="#000" fillOpacity={0.2} />
          </g>
        ))}
        <rect x={0} y={y(innerTop)} width={rI} height={innerTop - stackBottom} fill="none" stroke="currentColor" strokeWidth={1} style={line} />
      </g>
      <g data-part="outer-section">
        {outerBands.map((b, i) => (
          <rect key={i} x={rO - wallW} y={y(b.z1)} width={wallW} height={b.z1 - b.z0} fill={b.colour} />
        ))}
      </g>

      {/* outline of the outer stack and its seams */}
      <g fill="none" stroke="currentColor" strokeWidth={1.25} style={line}>
        <path d={`M${-rO} ${y(stackBottom)}V${y(outerTop)}M${rO} ${y(stackBottom)}V${y(outerTop)}`} style={line} />
        {outerBands.slice(1).map((b, i) => (
          <path key={i} d={`M${-rO} ${y(b.z0)}H0M${rO - wallW} ${y(b.z0)}H${rO}`} style={line} />
        ))}
      </g>

      {/* core: hidden line */}
      <rect
        x={-ROD_D / 2}
        y={y(rodTop)}
        width={ROD_D}
        height={rodLength}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="6 4"
        style={line}
        data-part="core"
      />
      <path d={`M0 ${y(-u)}V${y(total + u)}`} stroke="currentColor" strokeWidth={0.75} strokeDasharray="14 4 2 4" opacity={0.6} style={line} />

      {/* cover */}
      <rect
        x={-coverR}
        y={y(total)}
        width={coverR * 2}
        height={Math.min(COVER_RING_H + COVER_PLATE, total - outerTop + COVER_RING_H)}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={1.25}
        style={line}
      />

      {/* dimensions and callouts */}
      <g data-dim="total">
        <path d={`M${totalX} 0V${y(total)}${slash(totalX, 0)}${slash(totalX, y(total))}`} stroke="currentColor" strokeWidth={1} style={line} />
        <text x={totalX - u * 0.6} y={y(total / 2) - u * 0.35} textAnchor="end" fill="currentColor" style={caption}>
          Height
        </text>
        <text x={totalX - u * 0.6} y={y(total / 2) + u * 1.15} textAnchor="end" fill="currentColor" style={text}>
          {`${fmt(total)} mm`}
        </text>
      </g>
      {hDim(-coverR, coverR, total + 1.4 * u, `Ø ${fmt(outerOD)}`, 'outer-dim')}
      {hDim(-rB, rB, -1.4 * u, `Ø ${fmt(baseD)}`, 'base', true)}
      {topBand ? callout(-rO * 0.5, (topBand.z0 + topBand.z1) / 2, 'Outer', `${outer.length} × ${fmt(segHO)} mm`, 'outer') : null}
      {innerMark ? callout(rI * 0.6, (innerMark.z0 + innerMark.z1) / 2, `Inner Ø ${fmt(innerOD)}`, `${inner.length} × ${fmt(segHI)} mm`, 'inner') : null}
      {callout(0, rodBottom + rodLength * 0.3, 'Core', `${fmt(rodLength)} mm`, 'core')}
    </svg>
  );
}
