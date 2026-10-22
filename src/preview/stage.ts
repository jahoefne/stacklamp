/**
 * The dark room around the lamp (scene space: metres, y-up) and the light core
 * (lamp frame: mm, z-up, lives inside LampScene's root group).
 */
import {
  AdditiveBlending,
  BackSide,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Fog,
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
import type { StageTokens } from './stageTokens';
import { hexToLinear, inverseToneMap, type ToneMap } from './tonemap';

// ---- Tuning knobs -----------------------------------------------------------
export const HEMI_INTENSITY = 0.15;
/** Candela per point light (three's physical units); three lights along the LED zone. */
export const LED_LIGHT_INTENSITY = 0.4;
export const ENVIRONMENT_INTENSITY = 0.3;
export const FLOOR_RADIUS_M = 40;
export const POOL_RADIUS_M = 0.7;
export const POOL_INTENSITY = 0.4;
/** Fog starts this far behind the lamp and is opaque this far behind it (metres). */
export const FOG_NEAR_BEHIND_M = 0.6;
export const FOG_FAR_BEHIND_M = 6;
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

export class Stage {
  /** Scene-space group: floor, light pool, background shell, lights. */
  readonly group = new Group();
  readonly fog: Fog;
  private readonly floor: Mesh<CircleGeometry, MeshStandardMaterial>;
  private readonly pool: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly shell: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly hemi: HemisphereLight;
  private readonly lights: PointLight[] = [];
  private envTexture: Texture | null = null;

  constructor(tokens: StageTokens, toneMap: ToneMap) {
    // Background and fog go through the tone mapper like everything else; the
    // inverse keeps the on-screen colour equal to --stage-bg in both render paths.
    const bgLinear = inverseToneMap(toneMap, hexToLinear(tokens.bg));
    const bg = new Color().setRGB(bgLinear[0], bgLinear[1], bgLinear[2]);
    this.fog = new Fog(bg, 4, 10);

    this.shell = new Mesh(
      new SphereGeometry(90, 16, 8),
      new MeshBasicMaterial({ color: bg, side: BackSide, fog: false, depthWrite: false }),
    );
    this.shell.renderOrder = -10;
    this.shell.frustumCulled = false;

    const floorMat = createPartMaterial(tokens.floor);
    floorMat.name = 'floor';
    floorMat.roughness = 0.9;
    this.floor = new Mesh(new CircleGeometry(FLOOR_RADIUS_M, 96), floorMat);
    this.floor.rotation.x = -Math.PI / 2;

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
    this.pool.position.y = 0.0015;
    this.pool.renderOrder = 4;

    this.hemi = new HemisphereLight(0xffffff, new Color(tokens.floor), HEMI_INTENSITY);
    for (let i = 0; i < 3; i++) {
      const l = new PointLight(new Color(tokens.led), LED_LIGHT_INTENSITY, 0, 2);
      this.lights.push(l);
    }
    this.setLedZone(80, 1500);
    this.group.add(this.shell, this.floor, this.pool, this.hemi, ...this.lights);
  }

  /** Low-intensity RoomEnvironment reflections for the sheen, rod and parts. */
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

  /** Colour of the light spilling onto the floor (linear, pre-multiplied by strength). */
  setPoolTint(color: Color): void {
    this.pool.material.uniforms.uColor!.value = color;
  }

  /** Keeps the fog band just behind the lamp whatever the zoom. */
  updateFog(cameraDistance: number): void {
    this.fog.near = cameraDistance + FOG_NEAR_BEHIND_M;
    this.fog.far = cameraDistance + FOG_FAR_BEHIND_M;
  }

  dispose(): void {
    for (const m of [this.floor, this.pool, this.shell]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.lights.forEach((l) => l.dispose());
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
