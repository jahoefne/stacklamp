import { Box3, FrontSide, type Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PLACES, ROOM, Room, type Furniture, shade } from './room';

const colours = { wall: '#d9cdb8', wood: '#8a5a32', fabric: '#c98e2e', rug: '#d3c09a' };
const SHELL = ['floor', 'ceiling', 'wall-back', 'wall-front', 'wall-left', 'wall-right'];

function meshes(room: Room): Mesh[] {
  const out: Mesh[] = [];
  room.group.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

describe('Room', () => {
  // Node has no canvas: the room must build with flat colours (textures: undefined → null textures).
  const room = new Room({ colours });
  const all = meshes(room);

  it('builds the shell, the window and every piece of furniture', () => {
    const names = new Set(all.map((m) => m.name));
    for (const n of [...SHELL, 'skirting', 'sky', 'frame', 'curtains', 'rug', 'body', 'print', 'spokes', 'seat', 'table', 'leaves']) {
      expect(names.has(n), n).toBe(true);
    }
    expect(all.length).toBeLessThan(60);
    const triangles = all.reduce((sum, m) => sum + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count) / 3, 0);
    expect(triangles).toBeLessThan(60000);
  });

  it('faces every shell surface inward and single-sided (dollhouse when the camera leaves)', () => {
    for (const name of SHELL) {
      const m = all.find((x) => x.name === name)!;
      expect((m.material as { side: number }).side).toBe(FrontSide);
      // The surface normal (local +z) points into the room.
      const normal = new Vector3(0, 0, 1).transformDirection(m.matrixWorld);
      const centre = new Vector3().setFromMatrixPosition(m.matrixWorld);
      const inside = new Vector3((ROOM.leftX + ROOM.rightX) / 2, ROOM.height / 2, (ROOM.backZ + ROOM.frontZ) / 2);
      expect(normal.dot(inside.sub(centre)), name).toBeGreaterThan(0);
    }
  });

  it('keeps the furniture inside the room, on the floor and clear of the lamp', () => {
    const lampClearance = 0.6;
    for (const id of Object.keys(PLACES) as Furniture[]) {
      if (id === 'rug') continue;
      const g = room.group.getObjectByName(id)!;
      const b = new Box3().setFromObject(g);
      expect(b.min.y, `${id} floor`).toBeGreaterThan(-1e-6);
      expect(b.max.y, `${id} ceiling`).toBeLessThan(ROOM.height);
      expect(b.min.x, `${id} left`).toBeGreaterThan(ROOM.leftX - 1e-6);
      expect(b.max.x, `${id} right`).toBeLessThan(ROOM.rightX);
      expect(b.min.z, `${id} back`).toBeGreaterThan(ROOM.backZ - 0.05);
      expect(b.max.z, `${id} front`).toBeLessThan(ROOM.frontZ);
      // Horizontal distance from the lamp axis to the nearest point of the box.
      const dx = Math.max(b.min.x, 0, -b.max.x);
      const dz = Math.max(b.min.z, 0, -b.max.z);
      expect(Math.hypot(dx, dz), `${id} clearance`).toBeGreaterThan(lampClearance);
    }
  });

  it('casts shadows from the furniture and the window wall, receives on the floor and walls', () => {
    const casters = all.filter((m) => m.castShadow).map((m) => m.name);
    expect(casters).toEqual(expect.arrayContaining(['wall-left', 'body', 'seat', 'back', 'curtains', 'leaves', 'table']));
    expect(casters).not.toContain('floor');
    for (const n of ['floor', 'rug', 'wall-back', 'wall-left', 'wall-right']) expect(all.find((m) => m.name === n)!.receiveShadow, n).toBe(true);
  });

  it('is static: world matrices are computed once', () => {
    expect(room.group.matrixWorldAutoUpdate).toBe(false);
    const chair = room.group.getObjectByName('chair')!;
    expect(new Vector3().setFromMatrixPosition(chair.matrixWorld).toArray()).toEqual([...PLACES.chair.at]);
  });

  it('disposes every geometry and material once', () => {
    const r = new Room({ colours, textures: false });
    const list = meshes(r);
    let geometries = 0;
    let materials = 0;
    const seen = new Set<unknown>();
    for (const m of list) {
      if (!seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.addEventListener('dispose', () => geometries++);
      }
      const mat = m.material as { addEventListener(type: string, fn: () => void): void };
      if (!seen.has(mat)) {
        seen.add(mat);
        mat.addEventListener('dispose', () => materials++);
      }
    }
    r.dispose();
    expect(geometries).toBe(new Set(list.map((m) => m.geometry)).size);
    expect(materials).toBe(new Set(list.map((m) => m.material)).size);
  });

  it('shade darkens a hex colour', () => {
    expect(shade('#ffffff', 0.5)).toBe('#808080');
    expect(shade('#8a5a32', 1)).toBe('#8a5a32');
  });
});
