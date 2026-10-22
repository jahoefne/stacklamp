/**
 * Materials of the lit lamp. Translucent PETG is faked as additive glow + a thin
 * sheen; no transmission (it would hide the inner tube behind the outer one and is
 * slow on integrated GPUs). Glow and sheen materials are cached per colour/layer.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  type Material,
} from 'three';
import type { PetgColour } from '../geometry';

export type Layer = 'inner' | 'outer';

// ---- Tuning knobs -----------------------------------------------------------
/** Face-on glow per surface (a tube wall has two surfaces, a ray crosses ≥ 4). */
export const GLOW_BASE = 0.18;
/** Extra glow at grazing angles: the light path through the wall is longer there. */
export const GLOW_EDGE = 0.9;
/** Overall glow gain on top of --stage-glow-strength. */
export const GLOW_GAIN = 0.6;
/** "Clear" renders as the LED white, dimmer than a coloured band. */
export const CLEAR_GLOW_STRENGTH = 0.45;
/** "Smoke" swallows light. */
export const SMOKE_GLOW_STRENGTH = 0.6;
export const SHEEN_OPACITY = 0.12;
/**
 * Diffuse albedo of the sheen relative to the band colour. The sheen is meant to be a
 * surface reflection (env/specular); a full-albedo band colour picks up hot spots from
 * the LED point lights a few cm away on the axis. The glow carries the body colour.
 */
export const SHEEN_ALBEDO = 0.15;
/** Multiplier on the LED sleeve colour when bloom is on (HDR > 1 feeds the bloom pass). */
export const LED_SLEEVE_HDR = 1.5;
// -----------------------------------------------------------------------------

export const CLEAR_ID = 'clr';
export const SMOKE_ID = 'smk';
const FALLBACK_COLOUR: PetgColour = { id: CLEAR_ID, name: 'Clear', hex: '#f4f1ea' };

export function resolveColour(id: string | undefined, palette: readonly PetgColour[]): PetgColour {
  return (id !== undefined ? palette.find((c) => c.id === id) : undefined) ?? palette[0] ?? FALLBACK_COLOUR;
}

/** Glow colour (linear working space) and strength of a band colour. */
export function glowFor(colour: PetgColour, ledHex: string, globalStrength = 1): { color: Color; strength: number } {
  const gain = GLOW_GAIN * globalStrength;
  if (colour.id === CLEAR_ID) return { color: new Color(ledHex), strength: CLEAR_GLOW_STRENGTH * gain };
  const strength = (colour.id === SMOKE_ID ? SMOKE_GLOW_STRENGTH : 1) * gain;
  return { color: new Color(colour.hex), strength };
}

const glowVertex = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uFade;
uniform float uBase;
uniform float uEdge;
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
  vec3 n = normalize(vNormalV);
  vec3 v = normalize(vViewV);
  float f = 1.0 - abs(dot(n, v));
  float k = uBase + uEdge * f * f;
  gl_FragColor = vec4(uColor * (uStrength * uFade * k), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface GlowUniforms {
  [uniform: string]: { value: unknown };
  uColor: { value: Color };
  uStrength: { value: number };
  uFade: { value: number };
  uBase: { value: number };
  uEdge: { value: number };
}

export function createGlowMaterial(color: Color, strength: number): ShaderMaterial & { uniforms: GlowUniforms } {
  const uniforms: GlowUniforms = {
    uColor: { value: color.clone() },
    uStrength: { value: strength },
    uFade: { value: 1 },
    uBase: { value: GLOW_BASE },
    uEdge: { value: GLOW_EDGE },
  };
  const m = new ShaderMaterial({
    name: 'band-glow',
    uniforms,
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: true,
  });
  return m as ShaderMaterial & { uniforms: GlowUniforms };
}

export function createSheenMaterial(hex: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'band-sheen',
    color: new Color(hex).multiplyScalar(SHEEN_ALBEDO),
    roughness: 0.25,
    metalness: 0,
    transparent: true,
    opacity: SHEEN_OPACITY,
    depthWrite: false,
    envMapIntensity: 0.6,
  });
}

export function createPartMaterial(hex: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'printed-part', color: new Color(hex), roughness: 0.6, metalness: 0 });
}

export function createRodMaterial(hex: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'aluminium', color: new Color(hex), roughness: 0.35, metalness: 1 });
}

export function createLedMaterial(hex: string): MeshBasicMaterial {
  return new MeshBasicMaterial({ name: 'led', color: new Color(hex), toneMapped: false });
}

type GlowMaterial = ReturnType<typeof createGlowMaterial>;
interface Entry {
  key: string;
  colourId: string;
  hex: string;
  layer: Layer;
  glow: GlowMaterial;
  sheen: MeshStandardMaterial;
}

/**
 * Glow + sheen per (colour id, hex, layer). The layer fade (inner-view ghosting) is a
 * per-layer setting applied to every cached material of that layer, including ones
 * created later.
 */
export class BandMaterials {
  private entries = new Map<string, Entry>();
  private fades: Record<Layer, { glow: number; sheen: number }> = {
    inner: { glow: 1, sheen: 1 },
    outer: { glow: 1, sheen: 1 },
  };

  private readonly ledHex: string;
  private readonly globalStrength: number;

  constructor(ledHex: string, globalStrength = 1) {
    this.ledHex = ledHex;
    this.globalStrength = globalStrength;
  }

  static key(colour: PetgColour, layer: Layer): string {
    return `${colour.id}|${colour.hex.toLowerCase()}|${layer}`;
  }

  get size(): number {
    return this.entries.size;
  }

  get(colour: PetgColour, layer: Layer): { glow: GlowMaterial; sheen: MeshStandardMaterial } {
    const key = BandMaterials.key(colour, layer);
    let e = this.entries.get(key);
    if (!e) {
      const { color, strength } = glowFor(colour, this.ledHex, this.globalStrength);
      const glow = createGlowMaterial(color, strength);
      const sheen = createSheenMaterial(colour.id === CLEAR_ID ? '#ffffff' : colour.hex);
      e = { key, colourId: colour.id, hex: colour.hex, layer, glow, sheen };
      this.applyFade(e);
      this.entries.set(key, e);
    }
    return { glow: e.glow, sheen: e.sheen };
  }

  setLayerFade(layer: Layer, glow: number, sheen: number): void {
    const f = this.fades[layer];
    if (f.glow === glow && f.sheen === sheen) return;
    f.glow = glow;
    f.sheen = sheen;
    this.entries.forEach((e) => {
      if (e.layer === layer) this.applyFade(e);
    });
  }

  /** Disposes every cached material whose key is not in `keep`. */
  retain(keep: ReadonlySet<string>): void {
    for (const [key, e] of this.entries) {
      if (keep.has(key)) continue;
      disposeAll([e.glow, e.sheen]);
      this.entries.delete(key);
    }
  }

  dispose(): void {
    this.entries.forEach((e) => disposeAll([e.glow, e.sheen]));
    this.entries.clear();
  }

  private applyFade(e: Entry): void {
    const f = this.fades[e.layer];
    e.glow.uniforms.uFade.value = f.glow;
    e.sheen.opacity = SHEEN_OPACITY * f.sheen;
  }
}

export function disposeAll(materials: readonly Material[]): void {
  materials.forEach((m) => m.dispose());
}
