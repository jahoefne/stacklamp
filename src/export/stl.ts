/**
 * Binary STL writer: 80-byte ASCII header (never starting with "solid", which
 * would make readers parse it as ASCII STL), uint32 triangle count, then 50
 * bytes per triangle (normal, three corners, attribute 0), little-endian.
 * Triangles are CCW from outside, so the cross-product normal points out.
 */
export interface IndexedMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export function stlHeader(name: string): string {
  const text = `stacklamp ${name} binary STL, mm`;
  return text.startsWith('solid') ? `-${text}` : text;
}

export function meshToBinaryStl(mesh: IndexedMesh, name = 'part'): Uint8Array<ArrayBuffer> {
  const { positions, indices } = mesh;
  const numTri = Math.floor(indices.length / 3);
  const buffer = new ArrayBuffer(84 + numTri * 50);
  const view = new DataView(buffer);
  const header = new Uint8Array(buffer, 0, 80);
  const text = stlHeader(name).slice(0, 80);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    header[i] = code < 128 ? code : 0x3f;
  }
  view.setUint32(80, numTri, true);
  let offset = 84;
  for (let t = 0; t < numTri; t++) {
    const i0 = indices[t * 3]! * 3;
    const i1 = indices[t * 3 + 1]! * 3;
    const i2 = indices[t * 3 + 2]! * 3;
    const ax = positions[i0]!;
    const ay = positions[i0 + 1]!;
    const az = positions[i0 + 2]!;
    const bx = positions[i1]!;
    const by = positions[i1 + 1]!;
    const bz = positions[i1 + 2]!;
    const cx = positions[i2]!;
    const cy = positions[i2 + 1]!;
    const cz = positions[i2 + 2]!;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = ny = nz = 0;
    }
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return new Uint8Array(buffer);
}
