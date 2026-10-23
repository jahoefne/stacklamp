/**
 * Imperative three.js scene of the lit lamp in a dusk-lit mid-century living room. Owns
 * its canvas, renders on demand, adapts quality, and never touches React or the store.
 *
 * Frames: parts arrive in their print frame (mm, z-up); `root` rotates z-up → y-up and
 * scales mm → m; each part copy is a Group whose matrix is T(view offset) · placement.
 */
import {
  AgXToneMapping,
  NeutralToneMapping,
  type BufferGeometry,
  PCFShadowMap,
  Group,
  HalfFloatType,
  Mesh,
  type MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { CoreKind, DerivedDims, PartMesh, PetgColour } from '../geometry';
import { computeFraming, directionFromAngles, type FrameBounds, MAX_ZOOM, shouldReframe, type Vec3 } from './framing';
import {
  applyLayout,
  computeLayout,
  easeOutCubic,
  LAMP_PART_IDS,
  LAYOUT_TWEEN_MS,
  layoutBounds,
  type LampPartId,
  type LayoutState,
  lerpLayout,
  type PartCopy,
} from './layout';
import { BandMaterials, createPartMaterial, glowFor, type Layer, resolveColour } from './materials';
import { GeometrySet, geometryFor, type MeshKey } from './meshes';
import { FrameSampler, initialTier, readDeviceHints, tierSettings } from './quality';
import { Core, ENVIRONMENT_INTENSITY, Stage } from './stage';
import { readStageTokens, type StageTokens } from './stageTokens';
import type { ToneMap } from './tonemap';
import type { GlowMode, PreviewBands, QualityTier, ViewMode } from './types';

// ---- Tuning knobs -----------------------------------------------------------
export const CAMERA_FOV = 30;
/**
 * Tone mapper. 'neutral' (Khronos PBR Neutral) keeps the PETG band colours saturated;
 * AgX turns saturated glow pastel (amber #ffa41b at 1.0 → #d0a162). `?tonemap=agx` overrides.
 */
export const TONE_MAPPING: ToneMap = 'neutral';
export const TONE_MAPPING_EXPOSURE = 1;
/**
 * Bloom is a tight halo around the glowing tubes, not a wash: the pass blurs at five
 * scales and the coarse ones smear a tall bright column over the whole frame, which the
 * dark stage hid and a lit room shows. Radius 0 keeps the fine levels at full weight;
 * the per-level factors fade the coarse levels out almost entirely.
 */
export const BLOOM_RADIUS = 0;
export const BLOOM_THRESHOLD = 0.8;
export const BLOOM_LEVELS: readonly number[] = [1, 0.7, 0.35, 0.1, 0.03];
export const CAMERA_TWEEN_MS = 450;
// -----------------------------------------------------------------------------

export interface LampSceneOptions {
  glow: GlowMode;
  ariaLabel: string;
  /** Orbit enabled (false on touch devices until the user taps "rotate"). */
  interactive: boolean;
  coreKind?: CoreKind | undefined;
  onGlowAuto?: ((tier: QualityTier) => void) | undefined;
  onContextLost?: (() => void) | undefined;
  onContextRestored?: (() => void) | undefined;
  tokens?: StageTokens;
}

interface CopyObjects extends PartCopy {
  group: Group;
  glow?: Mesh | undefined;
  sheen?: Mesh | undefined;
  solid?: Mesh | undefined;
}

interface CameraTween {
  start: number;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromDir: Vector3;
  toDir: Vector3;
  fromDist: number;
  toDist: number;
  limits: { min: number; max: number; maxPolar: number };
}

const SEGMENT_LAYER: Partial<Record<LampPartId, Layer>> = { 'inner-segment': 'inner', 'outer-segment': 'outer' };
const RENDER_ORDER = { sheenInner: 1, sheenOuter: 2, glow: 3 } as const;

export class LampScene {
  readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.02, 200);
  private readonly controls: OrbitControls;
  private readonly root = new Group();
  private readonly lamp = new Group();
  private readonly tokens: StageTokens;
  private readonly stage: Stage;
  private readonly core: Core;
  private readonly geometries = new GeometrySet();
  private readonly bandMaterials: BandMaterials;
  private readonly partMaterial: MeshStandardMaterial;
  private copies: Record<LampPartId, CopyObjects[]> = { base: [], 'inner-segment': [], 'outer-segment': [], 'top-cover': [], 'plate-clamp': [] };

  private parts: readonly PartMesh[] | null = null;
  private dims: DerivedDims | null = null;
  private bands: PreviewBands = { inner: [], outer: [] };
  private palette: readonly PetgColour[] = [];
  private paletteSig = '';
  private coreKind: CoreKind;
  private mode: ViewMode = 'assembled';
  private layout: LayoutState | null = null;
  private layoutTween: { start: number; from: LayoutState; to: LayoutState } | null = null;
  private cameraTween: CameraTween | null = null;
  private frameBounds: FrameBounds | null = null;
  /** Camera distance at zoom 1 for the current framing. */
  private framedDistance = 1;
  private userOrbited = false;
  private interacting = false;

  private glow: GlowMode;
  private autoTier: QualityTier;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private readonly sampler = new FrameSampler();

  private width = 1;
  private height = 1;
  private rafId = 0;
  private lastFrameTs = 0;
  private wasAnimating = false;
  private onScreen = true;
  private dirty = false;
  private contextLost = false;
  private disposed = false;
  private reducedMotion = false;
  private readonly cleanups: Array<() => void> = [];
  private readonly opts: LampSceneOptions;

  constructor(host: HTMLElement, opts: LampSceneOptions) {
    this.host = host;
    this.opts = opts;
    this.glow = opts.glow;
    this.coreKind = opts.coreKind ?? 'aluminium-rod';
    this.tokens = opts.tokens ?? readStageTokens();
    this.autoTier = initialTier('auto', readDeviceHints());

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', opts.ariaLabel);
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.outline = 'none';

    // Throws when WebGL2 cannot be created; PreviewCanvas falls back to the schematic.
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    const toneMap = toneMapFromUrl() ?? TONE_MAPPING;
    this.renderer.toneMapping = toneMap === 'agx' ? AgXToneMapping : NeutralToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
    // Shadow maps render only while a light casts (the high tier, see applyTier()).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Count draw calls per frame across all composer passes (reset in frame()).
    this.renderer.info.autoReset = false;
    host.appendChild(this.canvas);

    // The room and its lights
    this.stage = new Stage(this.tokens, toneMap, { anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()) });
    this.scene.add(this.stage.group);
    this.scene.environment = this.stage.createEnvironment(this.renderer);
    this.scene.environmentIntensity = ENVIRONMENT_INTENSITY;

    // Lamp: z-up mm → y-up m
    this.root.rotation.x = -Math.PI / 2;
    this.root.scale.setScalar(0.001);
    this.core = new Core(this.tokens);
    this.root.add(this.lamp, this.core.group);
    this.scene.add(this.root);

    this.bandMaterials = new BandMaterials(this.tokens.led, this.tokens.glowStrength);
    this.partMaterial = createPartMaterial(this.tokens.part);

    // Camera + controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.8;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.addEventListener('start', this.onControlStart);
    this.controls.addEventListener('end', this.onControlEnd);
    this.setInteractive(opts.interactive);
    // Default framing for a 1.5 m lamp until the first parts arrive.
    this.applyFraming({ height: 1.53, minX: -0.12, maxX: 0.12, radius: 0.12 }, { animate: false, keep: false });

    this.applyTier();
    if (this.glow === 'auto') this.opts.onGlowAuto?.(this.autoTier);

    this.observe();
    this.resize(host.clientWidth, host.clientHeight);
    // Dev-only handle for QA in the browser console (stripped from production builds).
    if (import.meta.env.DEV) (globalThis as { __stacklampScene?: LampScene }).__stacklampScene = this;
  }

  // ---- public API -------------------------------------------------------------

  setParts(parts: readonly PartMesh[], dims: DerivedDims): void {
    if (this.disposed || (parts === this.parts && dims === this.dims)) return;
    const first = this.dims === null;
    this.parts = parts;
    this.dims = dims;
    const { geometries, disposeOld } = this.geometries.swap(parts);
    this.rebuildCopies(geometries, dims);
    disposeOld();
    this.core.update(dims, this.coreKind);
    this.stage.setLedZone(dims.rod.stripZone[0], dims.rod.stripZone[1]);
    this.applyColours(false);
    // New geometry snaps to the current mode; only mode changes animate.
    this.layoutTween = null;
    this.layout = computeLayout(dims, this.mode);
    this.writeLayout();
    const bounds = layoutBounds(dims, this.mode);
    if (first) this.applyFraming(bounds, { animate: false, keep: false });
    else if (shouldReframe(this.frameBounds, bounds)) this.applyFraming(bounds, { animate: true, keep: this.userOrbited });
    this.requestRender();
  }

  setColours(bands: PreviewBands, palette: readonly PetgColour[]): void {
    if (this.disposed) return;
    const sig = palette.map((c) => `${c.id}:${c.hex}`).join(',');
    const paletteChanged = sig !== this.paletteSig;
    if (!paletteChanged && sameIds(bands.inner, this.bands.inner) && sameIds(bands.outer, this.bands.outer)) return;
    this.bands = { inner: [...bands.inner], outer: [...bands.outer] };
    this.palette = palette;
    this.paletteSig = sig;
    this.applyColours(paletteChanged);
    this.requestRender();
  }

  setViewMode(mode: ViewMode, instant = false): void {
    if (this.disposed || mode === this.mode) return;
    this.mode = mode;
    if (!this.dims) return;
    const to = computeLayout(this.dims, mode);
    if (instant || this.reducedMotion || !this.layout) {
      this.layout = to;
      this.layoutTween = null;
      this.writeLayout();
    } else {
      this.layoutTween = { start: performance.now(), from: this.layout, to };
    }
    const bounds = layoutBounds(this.dims, mode);
    if (shouldReframe(this.frameBounds, bounds)) this.applyFraming(bounds, { animate: !instant, keep: this.userOrbited });
    this.requestRender();
  }

  setGlow(glow: GlowMode): void {
    if (this.disposed || glow === this.glow) return;
    this.glow = glow;
    this.sampler.reset();
    this.applyTier();
    if (glow === 'auto') this.opts.onGlowAuto?.(this.autoTier);
    this.requestRender();
  }

  setCoreKind(kind: CoreKind): void {
    if (kind === this.coreKind) return;
    this.coreKind = kind;
    if (this.dims) this.core.update(this.dims, kind);
    this.requestRender();
  }

  setInteractive(enabled: boolean): void {
    this.controls.enabled = enabled;
    // OrbitControls sets touch-action:none; while disabled let the page scroll vertically.
    this.canvas.style.touchAction = enabled ? 'none' : 'pan-y';
    this.canvas.style.cursor = enabled ? 'grab' : 'default';
  }

  setAriaLabel(label: string): void {
    this.canvas.setAttribute('aria-label', label);
  }

  /** Animates back to the default direction and zoom. */
  resetView(): void {
    if (this.disposed) return;
    this.userOrbited = false;
    const bounds = this.dims ? layoutBounds(this.dims, this.mode) : this.frameBounds;
    if (bounds) this.applyFraming(bounds, { animate: true, keep: false });
    this.requestRender();
  }

  /** Diagnostics for QA: tier, draw calls, triangles, copies, geometries per part, camera distance. */
  debugInfo(): Record<string, unknown> {
    const info = this.renderer.info;
    return {
      tier: this.qualityTier,
      glow: this.glow,
      bloom: this.composer !== null,
      shadows: this.stage.shadows,
      pixelRatio: this.renderer.getPixelRatio(),
      size: [this.width, this.height],
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      copies: Object.fromEntries(LAMP_PART_IDS.map((id) => [id, this.copies[id].length])),
      // one geometry per part, per form in use for a segment stack
      partGeometries: this.geometries.countsByPart(),
      mode: this.mode,
      onScreen: this.onScreen,
      cameraDistance: this.camera.position.distanceTo(this.controls.target),
      samples: this.sampler.count,
    };
  }

  /** Current tier (for diagnostics / tests in a real browser). */
  get qualityTier(): QualityTier {
    return this.glow === 'auto' ? this.autoTier : this.glow === 'on' ? 'high' : 'low';
  }

  readonly requestRender = (): void => {
    if (this.disposed) return;
    if (!this.onScreen || this.contextLost) {
      this.dirty = true;
      return;
    }
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (import.meta.env.DEV) {
      const g = globalThis as { __stacklampScene?: LampScene };
      if (g.__stacklampScene === this) delete g.__stacklampScene;
    }
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.cleanups.splice(0).forEach((fn) => fn());
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.removeEventListener('start', this.onControlStart);
    this.controls.removeEventListener('end', this.onControlEnd);
    this.controls.dispose();
    // Release the GL context first (frees all GPU memory at once, and StrictMode mounts
    // twice); the deletes the resource disposals below trigger are then silent no-ops,
    // which also avoids "object does not belong to this context" after a context restore.
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.clearCopies();
    this.geometries.dispose();
    this.bandMaterials.dispose();
    this.partMaterial.dispose();
    this.core.dispose();
    this.stage.dispose();
    this.disposeComposer();
    this.canvas.remove();
  }

  // ---- frame loop ---------------------------------------------------------------

  private readonly frame = (now: number): void => {
    this.rafId = 0;
    if (this.disposed || this.contextLost) return;
    this.renderer.info.reset();
    let animating = false;
    if (this.layoutTween) animating = this.stepLayout(now) || animating;
    if (this.cameraTween) animating = this.stepCamera(now) || animating;
    // update() returns true while damping still moves the camera; it also emits
    // 'change', which re-requests a frame (coalesced into the next rAF).
    if (this.controls.update()) animating = true;
    if (this.interacting) animating = true;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    if (this.wasAnimating && this.lastFrameTs > 0 && this.glow === 'auto' && this.autoTier === 'high') {
      if (this.sampler.push(now - this.lastFrameTs)) this.dropToLowTier();
    }
    this.lastFrameTs = now;
    this.wasAnimating = animating;
    if (animating) this.requestRender();
  };

  private stepLayout(now: number): boolean {
    const tw = this.layoutTween!;
    const t = (now - tw.start) / LAYOUT_TWEEN_MS;
    const done = t >= 1;
    this.layout = done ? tw.to : lerpLayout(tw.from, tw.to, easeOutCubic(t));
    if (done) this.layoutTween = null;
    this.writeLayout();
    return !done;
  }

  private stepCamera(now: number): boolean {
    const tw = this.cameraTween!;
    const raw = (now - tw.start) / CAMERA_TWEEN_MS;
    const done = raw >= 1;
    const t = easeOutCubic(raw);
    const target = tw.fromTarget.clone().lerp(tw.toTarget, t);
    const dir = tw.fromDir.clone().lerp(tw.toDir, t);
    if (dir.lengthSq() < 1e-8) dir.copy(tw.toDir);
    dir.normalize();
    const dist = tw.fromDist + (tw.toDist - tw.fromDist) * t;
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    if (done) {
      this.cameraTween = null;
      this.setLimits(tw.limits);
    }
    return !done;
  }

  // ---- framing ------------------------------------------------------------------

  private applyFraming(bounds: FrameBounds, opts: { animate: boolean; keep: boolean }): void {
    this.frameBounds = bounds;
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    const currentDist = offset.length();
    const dir = opts.keep && currentDist > 1e-6 ? (offset.clone().divideScalar(currentDist).toArray() as Vec3) : null;
    const zoom = opts.keep ? currentDist / this.framedDistance : 1;
    const f = computeFraming(bounds, this.camera.fov, this.camera.aspect, { direction: dir, zoom });
    this.framedDistance = f.maxDistance / MAX_ZOOM;
    const limits = { min: f.minDistance, max: f.maxDistance, maxPolar: f.maxPolarAngle };
    const toTarget = new Vector3(...f.target);
    const toDir = new Vector3(...(dir ?? directionFromAngles()));
    if (opts.animate && !this.reducedMotion && currentDist > 1e-6) {
      this.cameraTween = {
        start: performance.now(),
        fromTarget: target,
        toTarget,
        fromDir: offset.normalize(),
        toDir,
        fromDist: currentDist,
        toDist: f.distance,
        limits,
      };
      // Open the limits during the tween so OrbitControls does not clamp mid-flight.
      this.setLimits({ min: 0, max: Infinity, maxPolar: Math.PI });
    } else {
      this.cameraTween = null;
      this.controls.target.copy(toTarget);
      this.camera.position.set(...f.position);
      this.setLimits(limits);
      this.controls.update();
    }
  }

  private setLimits(l: { min: number; max: number; maxPolar: number }): void {
    this.controls.minDistance = l.min;
    this.controls.maxDistance = l.max;
    this.controls.maxPolarAngle = l.maxPolar;
  }

  private readonly onControlStart = (): void => {
    this.userOrbited = true;
    this.interacting = true;
    if (this.cameraTween) {
      this.setLimits(this.cameraTween.limits);
      this.cameraTween = null;
    }
    this.sampler.reset();
    this.requestRender();
  };

  private readonly onControlEnd = (): void => {
    this.interacting = false;
    this.requestRender();
  };

  // ---- parts, colours, layout --------------------------------------------------------

  /**
   * One group per copy. A segment band k shows the mesh of its form (`dims.inner/outer.forms[k]`),
   * or the stack's straight mesh while that form is still being built; every copy of the
   * other parts shares the part's one mesh. A part without any geometry gets no copies.
   */
  private rebuildCopies(geometries: ReadonlyMap<MeshKey, BufferGeometry>, dims: DerivedDims): void {
    this.clearCopies();
    for (const id of LAMP_PART_IDS) {
      const count = dims.placements[id]?.length ?? 0;
      const layer = SEGMENT_LAYER[id];
      const forms = layer ? dims[layer].forms : undefined;
      const geos = Array.from({ length: count }, (_, k) => geometryFor(geometries, id, forms?.[k]));
      const list: CopyObjects[] = [];
      if (geos.every((g) => g !== undefined)) {
        geos.forEach((geo, k) => {
          const group = new Group();
          group.matrixAutoUpdate = false;
          group.name = `${id}#${k}`;
          if (layer) {
            // Materials are assigned in applyColours().
            const sheen = new Mesh(geo, this.partMaterial);
            sheen.renderOrder = layer === 'inner' ? RENDER_ORDER.sheenInner : RENDER_ORDER.sheenOuter;
            const glow = new Mesh(geo, this.partMaterial);
            glow.renderOrder = RENDER_ORDER.glow;
            group.add(sheen, glow);
            list.push({ group, sheen, glow });
          } else {
            const solid = new Mesh(geo, this.partMaterial);
            group.add(solid);
            list.push({ group, solid });
          }
          this.lamp.add(group);
        });
      }
      this.copies[id] = list;
    }
  }

  private clearCopies(): void {
    for (const id of LAMP_PART_IDS) {
      this.copies[id].forEach((c) => this.lamp.remove(c.group));
      this.copies[id] = [];
    }
  }

  private applyColours(sweep: boolean): void {
    const used = new Set<string>();
    for (const [id, layer] of Object.entries(SEGMENT_LAYER) as [LampPartId, Layer][]) {
      const ids = this.bands[layer];
      this.copies[id].forEach((c, k) => {
        const colour = resolveColour(ids[k] ?? ids[ids.length - 1], this.palette);
        const m = this.bandMaterials.get(colour, layer);
        used.add(BandMaterials.key(colour, layer));
        if (c.glow) c.glow.material = m.glow;
        if (c.sheen) c.sheen.material = m.sheen;
      });
    }
    // Light pool: the bottom outer band tints the floor.
    const bottom = resolveColour(this.bands.outer[0], this.palette);
    const { color, strength } = glowFor(bottom, this.tokens.led, this.tokens.glowStrength);
    this.stage.setPoolTint(color.multiplyScalar(Math.max(0.35, strength)));
    if (sweep) this.bandMaterials.retain(used);
  }

  private writeLayout(): void {
    if (!this.dims || !this.layout) return;
    applyLayout(this.copies, this.dims, this.layout);
    this.bandMaterials.setLayerFade('outer', this.layout.outerGlow, this.layout.outerSheen);
  }

  // ---- quality ------------------------------------------------------------------

  private applyTier(): void {
    const s = tierSettings(this.glow, this.glow === 'auto' ? this.autoTier : this.glow === 'on' ? 'high' : 'low');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.maxPixelRatio));
    this.renderer.setSize(this.width, this.height, false);
    if (s.bloom && !this.composer) this.createComposer();
    if (!s.bloom && this.composer) this.disposeComposer();
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(this.width, this.height);
    this.core.setHdr(s.bloom);
    this.stage.setShadows(s.shadows);
  }

  private dropToLowTier(): void {
    this.autoTier = 'low';
    this.sampler.reset();
    this.applyTier();
    this.opts.onGlowAuto?.('low');
  }

  private createComposer(): void {
    const pr = this.renderer.getPixelRatio();
    const target = new WebGLRenderTarget(this.width * pr, this.height * pr, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(this.width, this.height), this.tokens.bloom, BLOOM_RADIUS, BLOOM_THRESHOLD);
    this.bloomPass.compositeMaterial.uniforms['bloomFactors']!.value = [...BLOOM_LEVELS];
    composer.addPass(this.bloomPass);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.composer = null;
    this.bloomPass = null;
  }

  // ---- DOM observers ----------------------------------------------------------------

  private resize(w: number, h: number): void {
    if (this.disposed) return;
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.renderer.setSize(this.width, this.height, false);
    this.composer?.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    // Re-fit for the new aspect, keeping the user's direction and zoom if they orbited.
    if (this.frameBounds && !this.cameraTween) this.applyFraming(this.frameBounds, { animate: false, keep: this.userOrbited });
    this.requestRender();
  }

  private observe(): void {
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        const r = entries[entries.length - 1]?.contentRect;
        if (r && (Math.round(r.width) !== this.width || Math.round(r.height) !== this.height)) this.resize(r.width, r.height);
      });
      ro.observe(this.host);
      this.cleanups.push(() => ro.disconnect());
    } else {
      const onResize = () => this.resize(this.host.clientWidth, this.host.clientHeight);
      window.addEventListener('resize', onResize);
      this.cleanups.push(() => window.removeEventListener('resize', onResize));
    }

    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        this.onScreen = visible;
        if (visible && this.dirty) {
          this.dirty = false;
          this.requestRender();
        }
      });
      io.observe(this.host);
      this.cleanups.push(() => io.disconnect());
    }

    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mql.matches;
      const onChange = (e: MediaQueryListEvent) => (this.reducedMotion = e.matches);
      mql.addEventListener?.('change', onChange);
      this.cleanups.push(() => mql.removeEventListener?.('change', onChange));
    }

    const onLost = (e: Event) => {
      if (this.disposed) return;
      e.preventDefault();
      this.contextLost = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.opts.onContextLost?.();
    };
    const onRestored = () => {
      if (this.disposed) return;
      this.contextLost = false;
      this.opts.onContextRestored?.();
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.canvas.addEventListener('webglcontextrestored', onRestored);
    this.cleanups.push(() => {
      this.canvas.removeEventListener('webglcontextlost', onLost);
      this.canvas.removeEventListener('webglcontextrestored', onRestored);
    });
  }
}

function toneMapFromUrl(): ToneMap | null {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('tonemap');
  return v === 'agx' || v === 'neutral' ? v : null;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
