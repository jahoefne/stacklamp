/**
 * 3MF export: a hand-rolled writer for the core specification (namespace
 * `core/2015/02`), adapted from openlamp (reflector).
 *
 * The package is an OPC ZIP (deflate level 6) of three parts:
 * `[Content_Types].xml`, `_rels/.rels` and `3D/3dmodel.model`. The model holds
 * one `<basematerials>` group (the colour is a viewer hint: slicers ignore
 * it), the mesh objects (`pid`/`pindex` pick the colour) and the build items.
 * Coordinates are millimetres with 4 decimals; triangles CCW from outside.
 *
 * Pure: no DOM and no TextEncoder; text is UTF-8 via fflate's `strToU8`.
 */
import { strToU8 } from 'fflate';
import type { PartMesh } from '../geometry/types';
import { zipFiles, zipTime } from './zip';

export const THREEMF_MIME = 'model/3mf';
export const THREEMF_MODEL_CONTENT_TYPE = 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml';
export const THREEMF_MODEL_PATH = '3D/3dmodel.model';
export const THREEMF_CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
export const THREEMF_MODEL_REL = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';
/** Namespace of stacklamp's own metadata names (`stacklamp:part`, …). */
export const STACKLAMP_3MF_NS = 'https://jahoefne.github.io/stacklamp/3mf/2026/10';

/** The id of the one `<basematerials>` group; objects are numbered after it. */
const MATERIALS_ID = 1;

export interface ThreeMfMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface ThreeMfMaterial {
  name: string;
  /** `#rgb`, `#rrggbb` or `#rrggbbaa`. */
  colour: string;
}

export interface ThreeMfObject {
  name: string;
  mesh: ThreeMfMesh;
  /** Index into `materials`. */
  material: number;
  metadata?: Readonly<Record<string, string>> | undefined;
}

export interface ThreeMfItem {
  object: number;
  /** Object frame → build platform, column-major 4×4 (affine). */
  transform: readonly number[];
  partNumber?: string | undefined;
}

export interface ThreeMfModel {
  objects: readonly ThreeMfObject[];
  materials: readonly ThreeMfMaterial[];
  items: readonly ThreeMfItem[];
  title: string;
  /** Model metadata: well-known names (Designer, CreationDate, …) or `stacklamp:` names. */
  metadata?: Readonly<Record<string, string>> | undefined;
}

// eslint-disable-next-line no-control-regex -- matching the control characters is the point
const INVALID_XML = /[\0-\x08\x0B\x0C\x0E-\x1F￾￿\uD800-\uDFFF]/gu;

export function xmlEscape(s: string): string {
  return s
    .replace(INVALID_XML, '�')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A coordinate in mm with 4 decimals, without trailing zeros (`12.5`, `0`, `-3.25`). */
export function fmtCoord(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return String(r === 0 ? 0 : r);
}

function fmtMatrix(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return String(r === 0 ? 0 : r);
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` → `#RRGGBBAA`; throws on anything else. */
export function displayColour(colour: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(colour.trim())?.[1];
  if (!hex) throw new Error(`Not a colour: "${colour}" (use #rrggbb)`);
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return `#${full.toUpperCase()}${full.length === 6 ? 'FF' : ''}`;
}

/**
 * The 3MF `transform` attribute of a column-major 4×4: `m00 m01 m02 m10 m11
 * m12 m20 m21 m22 m30 m31 m32`, row i of the 3MF matrix = column i of ours.
 */
export function threeMfTransform(m: readonly number[]): string {
  if (m.length !== 16) throw new Error(`A transform needs 16 numbers, not ${m.length}`);
  const out: string[] = [];
  for (const col of [0, 1, 2, 3]) for (const row of [0, 1, 2]) out.push(fmtMatrix(m[col * 4 + row]!));
  return out.join(' ');
}

function metadataXml(name: string, value: string, indent: string): string {
  return `${indent}<metadata name="${xmlEscape(name)}">${xmlEscape(value)}</metadata>\n`;
}

function objectXml(obj: ThreeMfObject, id: number, materials: number): string[] {
  const { positions, indices } = obj.mesh;
  if (positions.length % 3 !== 0) throw new Error(`${obj.name}: ${positions.length} coordinates is not 3 per vertex`);
  if (indices.length % 3 !== 0 || indices.length === 0) throw new Error(`${obj.name}: ${indices.length} indices is not 3 per triangle`);
  if (!Number.isInteger(obj.material) || obj.material < 0 || obj.material >= materials) {
    throw new Error(`${obj.name}: no material ${obj.material}`);
  }
  const numVert = positions.length / 3;
  const head = [`  <object id="${id}" type="model" name="${xmlEscape(obj.name)}" pid="${MATERIALS_ID}" pindex="${obj.material}">\n`];
  const meta = Object.entries(obj.metadata ?? {});
  if (meta.length > 0) {
    head.push('   <metadatagroup>\n');
    for (const [name, value] of meta) head.push(metadataXml(name, value, '    '));
    head.push('   </metadatagroup>\n');
  }
  head.push('   <mesh>\n    <vertices>\n');
  const vertices = new Array<string>(numVert);
  for (let v = 0, i = 0; v < numVert; v++, i += 3) {
    vertices[v] = `     <vertex x="${fmtCoord(positions[i]!)}" y="${fmtCoord(positions[i + 1]!)}" z="${fmtCoord(positions[i + 2]!)}"/>\n`;
  }
  const numTri = indices.length / 3;
  const triangles = new Array<string>(numTri);
  for (let t = 0, i = 0; t < numTri; t++, i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    if (a >= numVert || b >= numVert || c >= numVert) throw new Error(`${obj.name}: triangle ${t} refers to a vertex beyond ${numVert}`);
    triangles[t] = `     <triangle v1="${a}" v2="${b}" v3="${c}"/>\n`;
  }
  return [head.join(''), vertices.join(''), '    </vertices>\n    <triangles>\n', triangles.join(''), '    </triangles>\n   </mesh>\n  </object>\n'];
}

function modelChunks(model: ThreeMfModel): Uint8Array[] {
  const { objects, materials, items } = model;
  if (materials.length === 0) throw new Error('A 3MF needs at least one material');
  if (items.length === 0) throw new Error('A 3MF needs at least one build item');
  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    `<model unit="millimeter" xml:lang="en-US" xmlns="${THREEMF_CORE_NS}" xmlns:stacklamp="${STACKLAMP_3MF_NS}">\n`,
    metadataXml('Title', model.title, ' '),
    metadataXml('Application', 'stacklamp', ' '),
  ];
  for (const [name, value] of Object.entries(model.metadata ?? {})) head.push(metadataXml(name, value, ' '));
  head.push(' <resources>\n', `  <basematerials id="${MATERIALS_ID}">\n`);
  for (const m of materials) head.push(`   <base name="${xmlEscape(m.name)}" displaycolor="${displayColour(m.colour)}"/>\n`);
  head.push('  </basematerials>\n');
  const chunks = [strToU8(head.join(''))];
  const objectId = (i: number) => MATERIALS_ID + 1 + i;
  objects.forEach((obj, i) => {
    for (const part of objectXml(obj, objectId(i), materials.length)) chunks.push(strToU8(part));
  });
  const build = [' </resources>\n <build>\n'];
  for (const item of items) {
    if (!Number.isInteger(item.object) || item.object < 0 || item.object >= objects.length) {
      throw new Error(`A build item refers to object ${item.object} of ${objects.length}`);
    }
    const pn = item.partNumber === undefined ? '' : ` partnumber="${xmlEscape(item.partNumber)}"`;
    build.push(`  <item objectid="${objectId(item.object)}" transform="${threeMfTransform(item.transform)}"${pn}/>\n`);
  }
  build.push(' </build>\n</model>\n');
  chunks.push(strToU8(build.join('')));
  return chunks;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="${THREEMF_MODEL_CONTENT_TYPE}"/>
</Types>
`;

export const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/${THREEMF_MODEL_PATH}" Id="rel0" Type="${THREEMF_MODEL_REL}"/>
</Relationships>
`;

/** A 3MF package of `model` (deflate level 6). Object ids start at 2 (1 is the material group). */
export function write3mf(model: ThreeMfModel, mtime?: Date): Uint8Array<ArrayBuffer> {
  const zip = zipFiles(
    [
      { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
      { name: '_rels/.rels', data: RELS_XML },
      { name: THREEMF_MODEL_PATH, data: concat(modelChunks(model)) },
    ],
    6,
    mtime,
  );
  return new Uint8Array(zip);
}

export interface Part3mfOptions {
  /** Object name, e.g. `Outer segment`. */
  name: string;
  /** Viewer hint colour `#rrggbb`. */
  colour: string;
  colourName: string;
  /** Printer bed [x, y, z]; the part is centred on it. */
  bed: readonly [number, number, number];
  title: string;
  /** ISO timestamp (CreationDate metadata). */
  createdAt: string;
  metadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * One part as a 3MF: one object (the mesh in its print frame) and one build
 * item centred on the bed (bbox centre → bed centre, bottom on z = 0).
 */
export function partTo3mf(mesh: Pick<PartMesh, 'positions' | 'indices' | 'bbox'>, o: Part3mfOptions): Uint8Array<ArrayBuffer> {
  const cx = (mesh.bbox.min[0] + mesh.bbox.max[0]) / 2;
  const cy = (mesh.bbox.min[1] + mesh.bbox.max[1]) / 2;
  const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o.bed[0] / 2 - cx, o.bed[1] / 2 - cy, -mesh.bbox.min[2], 1];
  const metadata: Record<string, string> = {
    CreationDate: o.createdAt.slice(0, 10),
    'stacklamp:bed': o.bed.join(' '),
    ...(o.metadata ?? {}),
  };
  return write3mf({
    objects: [{ name: o.name, mesh, material: 0 }],
    materials: [{ name: o.colourName, colour: o.colour }],
    items: [{ object: 0, transform, partNumber: o.name }],
    title: o.title,
    metadata,
  }, zipTime(o.createdAt));
}
