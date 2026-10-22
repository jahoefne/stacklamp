/** Test helpers: fake parts and a controllable GeometryClient. Not part of the app bundle. */
import { ASSEMBLY_PART_IDS } from '../../geometry';
import type { DerivedDims, ExportRequest, ExportResult, ExportStage, GeometryClient, LampParams, PartMesh } from '../../geometry';

export function fakeParts(dims: DerivedDims): PartMesh[] {
  return ASSEMBLY_PART_IDS.map((id) => {
    const [x, y, z] = dims.fit[id].size;
    const copies = id === 'inner-segment' ? dims.inner.count : id === 'outer-segment' ? dims.outer.count : 1;
    const volume = 1000 * (id === 'base' ? 300 : 30);
    return {
      id,
      quality: 'preview',
      positions: new Float32Array(9),
      indices: new Uint32Array([0, 1, 2]),
      triangleCount: 1,
      volume,
      bbox: { min: [-x / 2, -y / 2, 0], max: [x / 2, y / 2, z] },
      copies,
      massGrams: { solid: (volume * 1.27) / 1000, estimate: (volume * 1.27) / 1000 },
    } satisfies PartMesh;
  });
}

export interface PendingBuild {
  params: LampParams;
  resolve: (parts: PartMesh[]) => void;
  reject: (err: unknown) => void;
}

export interface FakeClient {
  client: GeometryClient;
  builds: PendingBuild[];
  exports: { req: ExportRequest; onProgress?: (s: ExportStage, d: number, t: number) => void; resolve: (r: ExportResult) => void; reject: (e: unknown) => void }[];
}

export function fakeClient(): FakeClient {
  const builds: PendingBuild[] = [];
  const exports: FakeClient['exports'] = [];
  const client: GeometryClient = {
    ready: Promise.resolve(),
    buildParts: (params) => new Promise((resolve, reject) => builds.push({ params, resolve, reject })),
    exportZip: (req, onProgress) =>
      new Promise((resolve, reject) => exports.push(onProgress ? { req, onProgress, resolve, reject } : { req, resolve, reject })),
    cancel() {},
    dispose() {},
  };
  return { client, builds, exports };
}

export function namedError(name: string, message = name): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

/** Let pending promise callbacks run. */
export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
