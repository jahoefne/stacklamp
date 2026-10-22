/**
 * Column-major 4×4 matrices (the layout three.js, Manifold and 3MF use):
 * element (row i, column j) is m[j * 4 + i]; the translation is m[12..14].
 */
export type Mat4 = number[];

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const translate = (x: number, y: number, z: number): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

export const translateZ = (z: number): Mat4 => translate(0, 0, z);

/**
 * Turn the print frame upside down (180° about x) and lift it so that print
 * z = 0 lands at world z = `top`: (x, y, z) → (x, −y, top − z). Used for the
 * cover, which prints plate-down.
 */
export const flipAt = (top: number): Mat4 => [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, top, 1];

/**
 * A right-handed frame for radial features at azimuth `azimuthDeg` (degrees
 * from +x towards +y): local x = tangential (−sin φ, cos φ, 0), local y =
 * world z, local z = radial (cos φ, sin φ, 0); the local origin sits at radius
 * r0 and height z0. Extrude a 2D section along local z (or use a z-axis
 * cylinder) and `transform` it with this matrix.
 */
export function radialFrame(azimuthDeg: number, r0: number, z0: number): Mat4 {
  const a = (azimuthDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [-s, c, 0, 0, 0, 0, 1, 0, c, s, 0, 0, r0 * c, r0 * s, z0, 1];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = s;
    }
  }
  return out;
}

export function applyToPoint(m: Mat4, p: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}
