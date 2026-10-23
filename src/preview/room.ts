/**
 * A mid-century living room around the lamp (scene space: metres, y-up; the lamp stands at
 * the origin on the floor, in front of the back wall). Everything is built from three.js
 * primitives and the canvas textures in roomTextures.ts: no downloads, about forty draw
 * calls, a few thousand triangles. Walls, floor and ceiling are single-sided and face
 * inward, so when the camera orbits out through a wall that wall disappears and the room
 * reads like a dollhouse instead of going black.
 *
 * Layout: back wall at z = -1.3, left wall at x = -2.7 with the window and curtains,
 * credenza with the art above it behind-left of the lamp, plant in the corner, lounge chair
 * and side table behind-right, sunburst clock on the back wall, rug under the lamp. The
 * furniture stays low and against the walls, so from every orbit angle inside the room the
 * lamp is unobstructed. The room never moves: its matrices are computed once.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  type EulerOrder,
  Group,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  type Object3D,
  Path,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type Texture,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { artTexture, rugTexture, seededRandom, skyTexture, WOOD_TILE_M, woodTexture } from './roomTextures';

/** The room box, metres. The lamp stands at the origin. */
export const ROOM = { backZ: -1.3, frontZ: 4.0, leftX: -2.7, rightX: 3.6, height: 2.7 } as const;
/** The rug lies this high above the floor; the light pool sits just above it. */
export const RUG_Y = 0.004;
/** The window in the left wall: world z range and height range. */
export const WINDOW = { z0: -0.7, z1: 1.1, y0: 0.75, y1: 2.25 } as const;
/** Where the furniture stands (floor point) and which way it faces (yaw, radians). */
export const PLACES = {
  credenza: { at: [-1.45, 0, -1.07], yaw: 0 },
  art: { at: [-1.45, 1.6, ROOM.backZ], yaw: 0 },
  clock: { at: [1.35, 1.9, ROOM.backZ], yaw: 0 },
  chair: { at: [2.0, 0, -0.55], yaw: -0.75 },
  sideTable: { at: [2.6, 0, 0.25], yaw: 0 },
  plant: { at: [-2.3, 0, -0.5], yaw: 0 },
  rug: { at: [0.7, RUG_Y, 0.3], yaw: 0 },
} as const satisfies Record<string, { at: readonly [number, number, number]; yaw: number }>;
export type Furniture = keyof typeof PLACES;

/** The four main colours come from the --stage-* tokens; the accents are fixed. */
export interface RoomColours {
  wall: string;
  wood: string;
  fabric: string;
  rug: string;
}
const ACCENT = {
  ceiling: '#d9d0c0',
  skirting: '#ece5d6',
  walnut: '#3f2a1a',
  brass: '#c9a24e',
  ceramic: '#e8e1d2',
  glaze: '#2f6b66',
  leaf: '#2f5c35',
  stem: '#4e3b2a',
  terracotta: '#9c5a3c',
  curtain: '#b57a2f',
  bronze: '#2b2420',
  soil: '#2a1f17',
  clockFace: '#201b18',
  skyFlat: '#3b4a6e',
  artFlat: '#e3d6bb',
  books: ['#9a3b2c', '#2e6f6a', '#d9c9a5'],
} as const;

export interface RoomOptions {
  colours: RoomColours;
  /** Anisotropic filtering for the floor texture (the renderer's maximum, capped). */
  anisotropy?: number | undefined;
  /** false skips the canvas textures (flat colours); the default draws them. */
  textures?: boolean | undefined;
}

type V3 = readonly [number, number, number];
type Rot = readonly [number, number, number, EulerOrder?];
/** A geometry with its placement, for merging several into one mesh. */
interface Part {
  geo: BufferGeometry;
  at?: V3;
  rot?: Rot;
}
interface Mats {
  wall: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  teak: MeshStandardMaterial;
  walnut: MeshStandardMaterial;
  fabric: MeshStandardMaterial;
  rug: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  ceramic: MeshStandardMaterial;
  glaze: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  stem: MeshStandardMaterial;
  terracotta: MeshStandardMaterial;
  curtain: MeshStandardMaterial;
  bronze: MeshStandardMaterial;
  skirting: MeshStandardMaterial;
  soil: MeshStandardMaterial;
  clockFace: MeshStandardMaterial;
  art: MeshStandardMaterial;
  sky: MeshBasicMaterial;
  books: MeshStandardMaterial[];
}

/** '#rrggbb' scaled by k in sRGB (darker below 1). */
export function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function placement(p: Part): Matrix4 {
  const [x, y, z] = p.at ?? [0, 0, 0];
  const r = p.rot ?? [0, 0, 0];
  const euler = new Euler(r[0], r[1], r[2], r[3] ?? 'XYZ');
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(euler), new Vector3(1, 1, 1));
}

/** One geometry from several placed parts (each part geometry is consumed). */
export function merged(parts: readonly Part[]): BufferGeometry {
  const placed = parts.map((p) => p.geo.applyMatrix4(placement(p)));
  const out = mergeGeometries(placed, false);
  placed.forEach((g) => g.dispose());
  if (!out) throw new Error('room: geometries with different attributes cannot be merged');
  return out;
}

/** A splayed leg's foot ends this high: the tilted foot rim must not dip below the floor. */
const FOOT_Y = 0.006;

/** A tapered leg or spoke from `top` to `foot` (points in the parent's frame). */
function strut(top: V3, foot: V3, rTop: number, rFoot: number): Part {
  const a = new Vector3(...top);
  const b = new Vector3(...foot);
  const dir = a.clone().sub(b);
  const len = dir.length();
  const geo = new CylinderGeometry(rTop, rFoot, len, 10, 1);
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  const mid = a.add(b).multiplyScalar(0.5);
  return { geo, at: [mid.x, mid.y, mid.z] };
}

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);

/** Revolved profile: (radius, height) points, bottom to top along the outside, then back in. */
function lathe(profile: readonly (readonly [number, number])[], segments = 28): LatheGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

/** A pointed leaf in the XY plane, base at the origin, tip at +y. */
function leafGeometry(len: number, width: number): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * 0.9, len * 0.15, width * 0.75, len * 0.7, 0, len);
  s.bezierCurveTo(-width * 0.75, len * 0.7, -width * 0.9, len * 0.15, 0, 0);
  return new ShapeGeometry(s, 10);
}

interface AddOptions {
  at?: V3;
  rot?: Rot;
  cast?: boolean;
  receive?: boolean;
  name?: string;
}

export class Room {
  readonly group = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];

  constructor(opts: RoomOptions) {
    this.group.name = 'room';
    const m = this.createMaterials(opts);
    this.buildShell(m);
    this.buildWindow(m);
    this.buildRug(m);
    this.buildCredenza(m, this.place('credenza'));
    this.buildArt(m, this.place('art'));
    this.buildClock(m, this.place('clock'));
    this.buildChair(m, this.place('chair'));
    this.buildSideTable(m, this.place('sideTable'));
    this.buildPlant(m, this.place('plant'));
    // Static: compute every matrix once and keep the renderer from revisiting the subtree.
    this.group.updateMatrixWorld(true);
    this.group.matrixWorldAutoUpdate = false;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }

  // ---- materials ---------------------------------------------------------------------

  private createMaterials(opts: RoomOptions): Mats {
    const { colours, textures = true, anisotropy } = opts;
    const tex = <T extends Texture>(t: T | null): T | null => {
      if (t) this.textures.push(t);
      return t;
    };
    const planks = textures ? tex(woodTexture({ base: shade(colours.wood, 0.72), anisotropy })) : null;
    const grain = textures
      ? tex(woodTexture({ size: 512, metres: 1, plankWidth: Infinity, plankLength: Infinity, base: colours.wood, seed: 3 }))
      : null;
    const rug = textures ? tex(rugTexture({ base: colours.rug })) : null;
    const art = textures ? tex(artTexture()) : null;
    const sky = textures ? tex(skyTexture()) : null;
    const std = (name: string, p: MeshStandardMaterialParameters): MeshStandardMaterial => {
      const mat = new MeshStandardMaterial({ name, ...p });
      this.materials.push(mat);
      return mat;
    };
    const mapped = (name: string, map: Texture | null, flat: string, p: MeshStandardMaterialParameters): MeshStandardMaterial =>
      std(name, map ? { map, ...p } : { color: new Color(flat), ...p });
    const skyMat = new MeshBasicMaterial({ name: 'sky', ...(sky ? { map: sky } : { color: new Color(ACCENT.skyFlat) }) });
    this.materials.push(skyMat);
    return {
      wall: std('wall', { color: new Color(colours.wall), roughness: 0.96, envMapIntensity: 0.06 }),
      ceiling: std('ceiling', { color: new Color(ACCENT.ceiling), roughness: 1, envMapIntensity: 0.04 }),
      floor: mapped('floor', planks, shade(colours.wood, 0.72), { roughness: 0.5, envMapIntensity: 0.35 }),
      teak: mapped('teak', grain, colours.wood, { roughness: 0.45, envMapIntensity: 0.3 }),
      walnut: std('walnut', { color: new Color(ACCENT.walnut), roughness: 0.5, envMapIntensity: 0.4 }),
      fabric: std('fabric', { color: new Color(colours.fabric), roughness: 1, envMapIntensity: 0.05 }),
      rug: mapped('rug', rug, colours.rug, { roughness: 1, envMapIntensity: 0 }),
      brass: std('brass', { color: new Color(ACCENT.brass), metalness: 0.85, roughness: 0.3 }),
      ceramic: std('ceramic', { color: new Color(ACCENT.ceramic), roughness: 0.35, envMapIntensity: 0.8, side: DoubleSide }),
      glaze: std('glaze', { color: new Color(ACCENT.glaze), roughness: 0.25, envMapIntensity: 1, side: DoubleSide }),
      leaf: std('leaf', { color: new Color(ACCENT.leaf), roughness: 0.65, envMapIntensity: 0.3, side: DoubleSide }),
      stem: std('stem', { color: new Color(ACCENT.stem), roughness: 0.9 }),
      terracotta: std('terracotta', { color: new Color(ACCENT.terracotta), roughness: 0.85, side: DoubleSide }),
      curtain: std('curtain', { color: new Color(ACCENT.curtain), roughness: 1, envMapIntensity: 0.05 }),
      bronze: std('bronze', { color: new Color(ACCENT.bronze), metalness: 0.4, roughness: 0.5 }),
      skirting: std('skirting', { color: new Color(ACCENT.skirting), roughness: 0.7 }),
      soil: std('soil', { color: new Color(ACCENT.soil), roughness: 1 }),
      clockFace: std('clock-face', { color: new Color(ACCENT.clockFace), roughness: 0.4 }),
      art: mapped('art', art, ACCENT.artFlat, { roughness: 0.9, envMapIntensity: 0.1 }),
      sky: skyMat,
      books: ACCENT.books.map((hex, i) => std(`book-${i}`, { color: new Color(hex), roughness: 0.85 })),
    };
  }

  // ---- helpers -----------------------------------------------------------------------

  private place(id: Furniture): Group {
    const p = PLACES[id];
    const g = new Group();
    g.name = id;
    g.position.set(p.at[0], p.at[1], p.at[2]);
    g.rotation.y = p.yaw;
    this.group.add(g);
    return g;
  }

  private add(parent: Object3D, geo: BufferGeometry, material: Material, o: AddOptions = {}): Mesh {
    this.geometries.push(geo);
    const mesh = new Mesh(geo, material);
    if (o.at) mesh.position.set(o.at[0], o.at[1], o.at[2]);
    if (o.rot) mesh.rotation.set(o.rot[0], o.rot[1], o.rot[2], o.rot[3] ?? 'XYZ');
    mesh.castShadow = o.cast ?? false;
    mesh.receiveShadow = o.receive ?? false;
    if (o.name) mesh.name = o.name;
    parent.add(mesh);
    return mesh;
  }

  // ---- the shell: floor, walls, ceiling, skirting -----------------------------------

  private buildShell(m: Mats): void {
    const w = ROOM.rightX - ROOM.leftX;
    const d = ROOM.frontZ - ROOM.backZ;
    const cx = (ROOM.leftX + ROOM.rightX) / 2;
    const cz = (ROOM.backZ + ROOM.frontZ) / 2;
    const h = ROOM.height;
    if (m.floor.map) m.floor.map.repeat.set(w / WOOD_TILE_M, d / WOOD_TILE_M);
    this.add(this.group, new PlaneGeometry(w, d), m.floor, { at: [cx, 0, cz], rot: [-Math.PI / 2, 0, 0], receive: true, name: 'floor' });
    this.add(this.group, new PlaneGeometry(w, d), m.ceiling, { at: [cx, h, cz], rot: [Math.PI / 2, 0, 0], name: 'ceiling' });
    this.add(this.group, new PlaneGeometry(w, h), m.wall, { at: [cx, h / 2, ROOM.backZ], receive: true, name: 'wall-back' });
    this.add(this.group, new PlaneGeometry(w, h), m.wall, { at: [cx, h / 2, ROOM.frontZ], rot: [0, Math.PI, 0], name: 'wall-front' });
    this.add(this.group, new PlaneGeometry(d, h), m.wall, { at: [ROOM.rightX, h / 2, cz], rot: [0, -Math.PI / 2, 0], receive: true, name: 'wall-right' });
    // Left wall with the window cut out. Its local x runs from the front wall towards the
    // back wall (world -z) once rotated to face +x. It casts a shadow, so the dusk light
    // enters only through the opening.
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(d, 0);
    shape.lineTo(d, h);
    shape.lineTo(0, h);
    shape.closePath();
    const hole = new Path();
    const hx0 = ROOM.frontZ - WINDOW.z1;
    const hx1 = ROOM.frontZ - WINDOW.z0;
    hole.moveTo(hx0, WINDOW.y0);
    hole.lineTo(hx1, WINDOW.y0);
    hole.lineTo(hx1, WINDOW.y1);
    hole.lineTo(hx0, WINDOW.y1);
    hole.closePath();
    shape.holes.push(hole);
    this.add(this.group, new ShapeGeometry(shape), m.wall, {
      at: [ROOM.leftX, 0, ROOM.frontZ],
      rot: [0, Math.PI / 2, 0],
      receive: true,
      cast: true,
      name: 'wall-left',
    });
    const skirting = merged([
      { geo: box(w, 0.1, 0.014), at: [cx, 0.05, ROOM.backZ + 0.007] },
      { geo: box(w, 0.1, 0.014), at: [cx, 0.05, ROOM.frontZ - 0.007] },
      { geo: box(0.014, 0.1, d), at: [ROOM.leftX + 0.007, 0.05, cz] },
      { geo: box(0.014, 0.1, d), at: [ROOM.rightX - 0.007, 0.05, cz] },
    ]);
    this.add(this.group, skirting, m.skirting, { name: 'skirting' });
  }

  private buildWindow(m: Mats): void {
    const g = new Group();
    g.name = 'window';
    this.group.add(g);
    const zc = (WINDOW.z0 + WINDOW.z1) / 2;
    const yc = (WINDOW.y0 + WINDOW.y1) / 2;
    const ww = WINDOW.z1 - WINDOW.z0;
    const wh = WINDOW.y1 - WINDOW.y0;
    const x = ROOM.leftX;
    // The dusk outside: an unlit plane just behind the opening.
    this.add(g, new PlaneGeometry(ww + 0.6, wh + 0.6), m.sky, { at: [x - 0.08, yc, zc], rot: [0, Math.PI / 2, 0], name: 'sky' });
    const frame = merged([
      { geo: box(0.07, 0.05, ww + 0.1), at: [x, WINDOW.y1 + 0.025, zc] },
      { geo: box(0.07, 0.05, ww + 0.1), at: [x, WINDOW.y0 - 0.025, zc] },
      { geo: box(0.07, wh + 0.1, 0.05), at: [x, yc, WINDOW.z0 - 0.025] },
      { geo: box(0.07, wh + 0.1, 0.05), at: [x, yc, WINDOW.z1 + 0.025] },
      { geo: box(0.03, wh, 0.025), at: [x, yc, zc] },
      { geo: box(0.03, 0.025, ww), at: [x, WINDOW.y0 + wh * 0.62, zc] },
    ]);
    this.add(g, frame, m.bronze, { name: 'frame' });
    this.add(g, box(0.16, 0.03, ww + 0.2), m.skirting, { at: [x + 0.05, WINDOW.y0 - 0.065, zc], name: 'sill' });
    // Curtains on a brass rod, one panel each side of the opening.
    const rodY = 2.42;
    const rod = merged([
      { geo: new CylinderGeometry(0.012, 0.012, ww + 1.3, 10), at: [x + 0.1, rodY, zc], rot: [Math.PI / 2, 0, 0] },
      { geo: new SphereGeometry(0.026, 10, 8), at: [x + 0.1, rodY, zc - ww / 2 - 0.65] },
      { geo: new SphereGeometry(0.026, 10, 8), at: [x + 0.1, rodY, zc + ww / 2 + 0.65] },
    ]);
    this.add(g, rod, m.brass, { name: 'rod' });
    const curtains = merged([
      { geo: new RoundedBoxGeometry(0.08, 2.3, 0.32, 2, 0.03), at: [x + 0.1, rodY - 0.03 - 1.15, WINDOW.z0 - 0.24] },
      { geo: new RoundedBoxGeometry(0.08, 2.3, 0.32, 2, 0.03), at: [x + 0.1, rodY - 0.03 - 1.15, WINDOW.z1 + 0.24] },
    ]);
    this.add(g, curtains, m.curtain, { cast: true, receive: true, name: 'curtains' });
  }

  private buildRug(m: Mats): void {
    const g = this.place('rug');
    this.add(g, new PlaneGeometry(3.2, 2.2), m.rug, { rot: [-Math.PI / 2, 0, 0], receive: true, name: 'rug' });
  }

  // ---- furniture (each in its own group, local +z is its front) ----------------------

  private buildCredenza(m: Mats, g: Group): void {
    const W = 1.6;
    const H = 0.56;
    const D = 0.44;
    const legH = 0.14;
    const body = merged([
      { geo: box(W, H, D), at: [0, legH + H / 2, 0] },
      { geo: box(W + 0.04, 0.025, D + 0.03), at: [0, legH + H + 0.0125, 0] },
      ...[-1, 0, 1].map((k): Part => ({ geo: box(0.51, H - 0.08, 0.014), at: [k * 0.53, legH + H / 2, D / 2 + 0.007] })),
      ...[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => strut([sx! * 0.68, legH, sz! * 0.15], [sx! * 0.74, FOOT_Y, sz! * 0.19], 0.02, 0.012)),
    ]);
    this.add(g, body, m.teak, { cast: true, receive: true, name: 'body' });
    const pulls = merged(
      [-1, 0, 1].map((k): Part => ({ geo: new CylinderGeometry(0.006, 0.006, 0.09, 8), at: [k * 0.53, legH + H - 0.08, D / 2 + 0.02], rot: [0, 0, Math.PI / 2] })),
    );
    this.add(g, pulls, m.brass, { name: 'pulls' });
    const topY = legH + H + 0.025;
    const vase = lathe([
      [0, 0],
      [0.05, 0],
      [0.08, 0.06],
      [0.085, 0.16],
      [0.05, 0.25],
      [0.035, 0.3],
      [0.045, 0.32],
      [0.03, 0.32],
      [0.025, 0.3],
      [0.04, 0.26],
      [0.05, 0.2],
      [0.03, 0.07],
      [0, 0.06],
    ]);
    this.add(g, vase, m.glaze, { at: [-0.5, topY, 0.02], cast: true, name: 'vase' });
    const bowl = lathe([
      [0, 0],
      [0.05, 0],
      [0.1, 0.02],
      [0.13, 0.06],
      [0.135, 0.07],
      [0.12, 0.07],
      [0.1, 0.04],
      [0.06, 0.015],
      [0, 0.012],
    ]);
    this.add(g, bowl, m.walnut, { at: [0.05, topY, 0], cast: true, name: 'bowl' });
    const books: readonly (readonly [number, number, number, number])[] = [
      [0.23, 0.028, 0.16, 0],
      [0.2, 0.024, 0.15, 0.12],
      [0.25, 0.034, 0.17, -0.08],
    ];
    let y = topY;
    books.forEach(([w, h, d, yaw], i) => {
      this.add(g, box(w, h, d), m.books[i]!, { at: [0.45, y + h / 2, 0], rot: [0, yaw, 0], cast: true, name: `book-${i}` });
      y += h;
    });
  }

  private buildArt(m: Mats, g: Group): void {
    this.add(g, box(0.8, 1.0, 0.035), m.walnut, { at: [0, 0, 0.0175], name: 'frame' });
    this.add(g, new PlaneGeometry(0.7, 0.9), m.art, { at: [0, 0, 0.036], name: 'print' });
  }

  private buildClock(m: Mats, g: Group): void {
    const spokes: Part[] = [];
    const n = 24;
    const r0 = 0.095;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = i % 2 ? 0.17 : 0.25;
      const mid = r0 + len / 2;
      spokes.push({ geo: box(len, 0.007, 0.007), at: [Math.cos(a) * mid, Math.sin(a) * mid, 0], rot: [0, 0, a] });
      if (i % 2 === 0) spokes.push({ geo: new SphereGeometry(0.014, 8, 6), at: [Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len), 0] });
    }
    this.add(g, merged(spokes), m.brass, { at: [0, 0, 0.02], name: 'spokes' });
    this.add(g, new CylinderGeometry(0.1, 0.1, 0.02, 32), m.brass, { at: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], name: 'rim' });
    this.add(g, new CylinderGeometry(0.085, 0.085, 0.012, 32), m.clockFace, { at: [0, 0, 0.032], rot: [Math.PI / 2, 0, 0], name: 'face' });
    const hour = box(0.007, 0.055, 0.004).translate(0, 0.0275, 0);
    const minute = box(0.005, 0.075, 0.004).translate(0, 0.0375, 0);
    this.add(g, merged([{ geo: hour, rot: [0, 0, -0.55] }, { geo: minute, rot: [0, 0, 2.3] }]), m.ceramic, { at: [0, 0, 0.041], name: 'hands' });
  }

  private buildChair(m: Mats, g: Group): void {
    const seatY = 0.4;
    const frame = merged([
      { geo: box(0.72, 0.045, 0.045), at: [0, seatY - 0.06, 0.29] },
      { geo: box(0.72, 0.045, 0.045), at: [0, seatY - 0.06, -0.29] },
      { geo: box(0.045, 0.045, 0.62), at: [0.36, seatY - 0.06, 0] },
      { geo: box(0.045, 0.045, 0.62), at: [-0.36, seatY - 0.06, 0] },
      { geo: box(0.05, 0.035, 0.6), at: [0.37, 0.63, -0.02] },
      { geo: box(0.05, 0.035, 0.6), at: [-0.37, 0.63, -0.02] },
      ...[1, -1].flatMap((s): Part[] => [
        { geo: box(0.04, 0.26, 0.04), at: [s * 0.37, 0.5, 0.25] },
        { geo: box(0.04, 0.5, 0.04), at: [s * 0.37, 0.58, -0.3], rot: [-0.2, 0, 0] },
      ]),
      ...[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz]) => strut([sx! * 0.33, seatY - 0.06, sz! * 0.27], [sx! * 0.38, FOOT_Y, sz! * 0.32], 0.022, 0.014)),
    ]);
    this.add(g, frame, m.teak, { cast: true, receive: true, name: 'frame' });
    this.add(g, new RoundedBoxGeometry(0.64, 0.12, 0.6, 3, 0.035), m.fabric, { at: [0, seatY + 0.02, 0], cast: true, receive: true, name: 'seat' });
    this.add(g, new RoundedBoxGeometry(0.64, 0.56, 0.11, 3, 0.035), m.fabric, {
      at: [0, 0.7, -0.28],
      rot: [-0.2, 0, 0],
      cast: true,
      receive: true,
      name: 'back',
    });
  }

  private buildSideTable(m: Mats, g: Group): void {
    const top = 0.52;
    const parts: Part[] = [{ geo: new CylinderGeometry(0.23, 0.23, 0.025, 32), at: [0, top - 0.0125, 0] }];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      parts.push(strut([Math.cos(a) * 0.13, top - 0.025, Math.sin(a) * 0.13], [Math.cos(a) * 0.2, FOOT_Y, Math.sin(a) * 0.2], 0.018, 0.011));
    }
    this.add(g, merged(parts), m.teak, { cast: true, receive: true, name: 'table' });
    const cup = lathe([
      [0, 0],
      [0.04, 0],
      [0.05, 0.03],
      [0.055, 0.08],
      [0.05, 0.085],
      [0.045, 0.082],
      [0.04, 0.02],
      [0, 0.015],
    ]);
    this.add(g, cup, m.ceramic, { at: [0.05, top, -0.03], cast: true, name: 'cup' });
  }

  private buildPlant(m: Mats, g: Group): void {
    const rand = seededRandom(5);
    const pot = lathe([
      [0, 0],
      [0.1, 0],
      [0.11, 0.03],
      [0.14, 0.25],
      [0.145, 0.28],
      [0.125, 0.28],
      [0.12, 0.24],
      [0, 0.23],
    ]);
    this.add(g, pot, m.terracotta, { cast: true, receive: true, name: 'pot' });
    this.add(g, new CylinderGeometry(0.12, 0.12, 0.01, 24), m.soil, { at: [0, 0.235, 0], name: 'soil' });
    this.add(g, new CylinderGeometry(0.01, 0.016, 1.15, 10), m.stem, { at: [0, 0.23 + 0.575, 0], cast: true, name: 'stem' });
    const leaves: Part[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const size = 0.9 + rand() * 0.4 - t * 0.3;
      // Leaves point outward (local +y → world -z before the yaw), tilted up a little,
      // spread around the stem by the golden angle.
      leaves.push({
        geo: leafGeometry(0.32 * size, 0.17 * size),
        at: [0, 0.5 + t * 0.85, 0],
        rot: [-Math.PI / 2 + 0.15 + rand() * 0.45, i * 2.39996 + rand() * 0.4, 0, 'YXZ'],
      });
    }
    this.add(g, merged(leaves), m.leaf, { cast: true, name: 'leaves' });
  }
}
