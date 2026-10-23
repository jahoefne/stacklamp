/**
 * The room around the lamp (scene space: metres, y-up) with its lights, and the light
 * core (lamp frame: mm, z-up, lives inside LampScene's root group).
 *
 * The lamp lights the room: three warm point lights sit on the LED zone, the middle one
 * casts the shadows. A cool, low dusk light comes in through the window of the left wall
 * (the wall casts a shadow, so the light reaches the floor only through the opening).
 */
import {
  AdditiveBlending,
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CoreKind, DerivedDims } from '../geometry';
import { createLedMaterial, createPartMaterial, createRodMaterial, LED_SLEEVE_HDR } from './materials';
import { Room, RUG_Y } from './room';
import type { StageTokens } from './stageTokens';
import { hexToLinear, inverseToneMap, type ToneMap } from './tonemap';

// ---- Tuning knobs -----------------------------------------------------------
export const HEMI_INTENSITY = 0.07;
/** Dusk sky above, warm floor bounce below. */
export const HEMI_SKY = '#6b7a99';
export const HEMI_GROUND = '#3a2a1c';
/** Candela per point light (three's physical units); three lights along the LED zone. */
export const LED_LIGHT_INTENSITY = 0.32;
/** The dusk through the window: a low, cool directional light. */
export const WINDOW_LIGHT = '#8fa6d4';
export const WINDOW_LIGHT_INTENSITY = 0.9;
/** Without shadows the window light would wash the whole left side, so it is only a hint. */
export const WINDOW_LIGHT_INTENSITY_FLAT = 0.08;
export const ENVIRONMENT_INTENSITY = 0.3;
export const POOL_RADIUS_M = 0.7;
export const POOL_INTENSITY = 0.35;
export const POINT_SHADOW_SIZE = 1024;
export const WINDOW_SHADOW_SIZE = 2048;
// -----------------------------------------------------------------------------

const poolVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const poolFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.4);
  gl_FragColor = vec4(uColor * (uIntensity * a), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface StageOptions {
  /** Anisotropic filtering for the floor texture. */
  anisotropy?: number | undefined;
  /** false builds the room with flat colours (no canvas textures). */
  textures?: boolean | undefined;
}

export class Stage {
  /** Scene-space group: room, light pool, background shell, lights. */
  readonly group = new Group();
  readonly room: Room;
  private readonly pool: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly shell: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly hemi: HemisphereLight;
  private readonly lights: PointLight[] = [];
  private readonly window: DirectionalLight;
  private envTexture: Texture | null = null;

  constructor(tokens: StageTokens, toneMap: ToneMap, opts: StageOptions = {}) {
    // The background goes through the tone mapper like everything else; the inverse keeps
    // the on-screen colour equal to --stage-bg in both render paths. It shows outside the
    // room (the walls are single-sided), i.e. when the camera orbits out through a wall.
    const bgLinear = inverseToneMap(toneMap, hexToLinear(tokens.bg));
    const bg = new Color().setRGB(bgLinear[0], bgLinear[1], bgLinear[2]);
    this.shell = new Mesh(new SphereGeometry(90, 16, 8), new MeshBasicMaterial({ color: bg, side: BackSide, fog: false, depthWrite: false }));
    this.shell.renderOrder = -10;
    this.shell.frustumCulled = false;

    this.room = new Room({
      colours: { wall: tokens.wall, wood: tokens.wood, fabric: tokens.fabric, rug: tokens.rug },
      anisotropy: opts.anisotropy,
      textures: opts.textures,
    });

    this.pool = new Mesh(
      new PlaneGeometry(POOL_RADIUS_M * 2, POOL_RADIUS_M * 2),
      new ShaderMaterial({
        name: 'light-pool',
        uniforms: { uColor: { value: new Color(tokens.led) }, uIntensity: { value: POOL_INTENSITY } },
        vertexShader: poolVertex,
        fragmentShader: poolFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: true,
      }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = RUG_Y + 0.002;
    this.pool.renderOrder = 4;

    this.hemi = new HemisphereLight(new Color(HEMI_SKY), new Color(HEMI_GROUND), HEMI_INTENSITY);
    for (let i = 0; i < 3; i++) {
      const l = new PointLight(new Color(tokens.led), LED_LIGHT_INTENSITY, 0, 2);
      this.lights.push(l);
    }
    const caster = this.lights[1]!;
    caster.shadow.mapSize.set(POINT_SHADOW_SIZE, POINT_SHADOW_SIZE);
    caster.shadow.bias = -0.003;
    caster.shadow.camera.near = 0.15;
    caster.shadow.camera.far = 12;
    this.setLedZone(80, 1500);

    this.window = new DirectionalLight(new Color(WINDOW_LIGHT), WINDOW_LIGHT_INTENSITY_FLAT);
    this.window.position.set(-6, 3.2, 1.2);
    this.window.shadow.mapSize.set(WINDOW_SHADOW_SIZE, WINDOW_SHADOW_SIZE);
    const cam = this.window.shadow.camera;
    cam.left = -4.5;
    cam.right = 4.5;
    cam.top = 4.5;
    cam.bottom = -4.5;
    cam.near = 1;
    cam.far = 16;
    this.window.shadow.bias = -0.0005;
    this.window.shadow.normalBias = 0.02;
    this.window.shadow.radius = 3;

    this.group.add(this.shell, this.room.group, this.pool, this.hemi, ...this.lights, this.window, this.window.target);
  }

  /** Low-intensity RoomEnvironment reflections for the sheen, rod, floor and brass. */
  createEnvironment(renderer: WebGLRenderer): Texture {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return this.envTexture;
  }

  /** Point lights at 1/6, 1/2 and 5/6 of the LED zone (world z in mm). */
  setLedZone(z0: number, z1: number): void {
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    this.lights.forEach((l, i) => l.position.set(0, (lo + ((2 * i + 1) / 6) * (hi - lo)) / 1000, 0));
  }

  /** Colour of the light spilling onto the rug (linear, pre-multiplied by strength). */
  setPoolTint(color: Color): void {
    this.pool.material.uniforms.uColor!.value = color;
  }

  /**
   * Shadow maps on or off (the high quality tier). Off, the window light drops to a hint:
   * without the wall's shadow it would wash the whole left side of the room.
   */
  setShadows(on: boolean): void {
    this.lights[1]!.castShadow = on;
    this.window.castShadow = on;
    this.window.intensity = on ? WINDOW_LIGHT_INTENSITY : WINDOW_LIGHT_INTENSITY_FLAT;
  }

  get shadows(): boolean {
    return this.window.castShadow;
  }

  dispose(): void {
    for (const m of [this.pool, this.shell]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.room.dispose();
    this.lights.forEach((l) => l.dispose());
    this.window.dispose();
    this.hemi.dispose();
    this.envTexture?.dispose();
    this.envTexture = null;
  }
}

/** Aluminium rod + LED sleeve (or a single-ended LED tube), in the lamp frame (mm, z-up). */
export class Core {
  readonly group = new Group();
  private readonly unitCylinder: CylinderGeometry;
  private readonly rod: Mesh<CylinderGeometry, MeshStandardMaterial>;
  private readonly rodMetal: MeshStandardMaterial;
  private readonly tubeBody: MeshStandardMaterial;
  private readonly sleeve: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private readonly ledColor: Color;
  private hdr = false;

  constructor(tokens: StageTokens) {
    // Unit cylinder along z (radius 1, height 1, centred); meshes scale it.
    this.unitCylinder = new CylinderGeometry(1, 1, 1, 40, 1, false);
    this.unitCylinder.rotateX(Math.PI / 2);
    this.rodMetal = createRodMaterial(tokens.rod);
    this.rod = new Mesh(this.unitCylinder, this.rodMetal);
    this.tubeBody = createPartMaterial('#f3efe8');
    this.ledColor = new Color(tokens.led);
    this.sleeve = new Mesh(this.unitCylinder, createLedMaterial(tokens.led));
    this.group.add(this.rod, this.sleeve);
    this.group.visible = false;
  }

  update(dims: DerivedDims, kind: CoreKind = 'aluminium-rod'): void {
    const r = dims.rod.diameter / 2;
    const len = Math.max(1, dims.rod.topZ - dims.rod.bottomZ);
    this.rod.scale.set(r, r, len);
    this.rod.position.set(0, 0, (dims.rod.topZ + dims.rod.bottomZ) / 2);
    // A single-ended LED tube is a frosted tube, not bare aluminium.
    this.rod.material = kind === 'led-tube' ? this.tubeBody : this.rodMetal;
    const [z0, z1] = dims.rod.stripZone;
    const lo = Math.max(dims.rod.bottomZ, Math.min(z0, z1));
    const hi = Math.min(dims.rod.topZ, Math.max(z0, z1));
    const sr = kind === 'led-tube' ? r + 0.3 : r + 1.5;
    this.sleeve.visible = hi - lo > 1;
    this.sleeve.scale.set(sr, sr, Math.max(1, hi - lo));
    this.sleeve.position.set(0, 0, (lo + hi) / 2);
    this.group.visible = true;
  }

  /** HDR LED colour feeds the bloom pass; without bloom it stays at the plain LED colour. */
  setHdr(hdr: boolean): void {
    this.hdr = hdr;
    this.sleeve.material.color.copy(this.ledColor).multiplyScalar(hdr ? LED_SLEEVE_HDR : 1);
  }

  get isHdr(): boolean {
    return this.hdr;
  }

  dispose(): void {
    this.unitCylinder.dispose();
    this.rodMetal.dispose();
    this.tubeBody.dispose();
    this.sleeve.material.dispose();
  }
}
