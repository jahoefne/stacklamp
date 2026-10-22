/**
 * GeometryClient against fake workers: ready, newest-wins previews
 * (SupersededError), FIFO exports, cancel = terminate + respawn, crashes,
 * dispose; and end to end with the real handler running in-process.
 */
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import type { ExportRequest, ExportStage } from '../../src/geometry/types';
import { WorkerGeometryClient, isBenignGeometryError, type WorkerLike } from '../../src/worker/client';
import { createHandler } from '../../src/worker/handler';
import type { WorkerRequest, WorkerResponse } from '../../src/worker/protocol';
import { getKernel } from '../helpers/kernel';

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: WorkerResponse }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  received: WorkerRequest[] = [];
  terminated = false;
  postMessage(message: WorkerRequest): void {
    this.received.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(res: WorkerResponse): void {
    this.onmessage?.({ data: res });
  }
  crash(message = 'boom'): void {
    this.onerror?.({ message });
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new WorkerGeometryClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const current = () => workers[workers.length - 1]!;
  return { client, workers, current };
}

const req: ExportRequest = {
  params: defaultParams(),
  colourPlan: { palette: [], inner: [], outer: [] },
  format: '3mf',
  includeFitTest: false,
  meta: { shareUrl: '', appVersion: 'test', createdAt: '2026-10-22T12:00:00.000Z' },
};

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('WorkerGeometryClient (fake worker)', () => {
  it('ready follows the worker', async () => {
    const a = setup();
    a.current().reply({ type: 'ready' });
    await expect(a.client.ready).resolves.toBeUndefined();
    const b = setup();
    b.current().reply({ type: 'init-error', error: 'no wasm' });
    await expect(b.client.ready).rejects.toThrow(/no wasm/);
  });

  it('coalesces previews newest-wins', async () => {
    const { client, current } = setup();
    const p1 = client.buildParts(defaultParams(), 'preview');
    const p2 = client.buildParts(defaultParams(), 'preview');
    const p3 = client.buildParts(defaultParams(), 'preview');
    const e2 = await p2.catch((e: Error) => e);
    expect((e2 as Error).name).toBe('SupersededError');
    expect(isBenignGeometryError(e2)).toBe(true);
    expect(current().received.map((r) => r.id)).toEqual([1]);
    current().reply({ type: 'parts', id: 1, parts: [], ms: 1 });
    await expect(p1).resolves.toEqual([]);
    expect(current().received.map((r) => r.id)).toEqual([1, 3]);
    current().reply({ type: 'parts', id: 3, parts: [], ms: 1 });
    await expect(p3).resolves.toEqual([]);
  });

  it('runs exports FIFO before queued previews and forwards progress', async () => {
    const { client, current } = setup();
    const preview1 = client.buildParts(defaultParams(), 'preview'); // id 1, in flight
    const preview2 = client.buildParts(defaultParams(), 'preview'); // id 2, queued
    const stages: ExportStage[] = [];
    const ex1 = client.exportZip(req, (s) => stages.push(s)); // id 3
    const ex2 = client.exportZip(req); // id 4
    current().reply({ type: 'parts', id: 1, parts: [], ms: 1 });
    await preview1;
    expect(current().received.map((r) => r.id)).toEqual([1, 3]);
    current().reply({ type: 'progress', id: 3, stage: 'base', done: 0, total: 6 });
    current().reply({ type: 'zip', id: 3, zip: new Uint8Array([1]), fileName: 'a.zip', ms: 1 });
    await expect(ex1).resolves.toEqual({ zip: new Uint8Array([1]), fileName: 'a.zip' });
    expect(stages).toEqual(['base']);
    expect(current().received.map((r) => r.id)).toEqual([1, 3, 4]);
    current().reply({ type: 'error', id: 4, error: 'Fix these problems' });
    await expect(ex2).rejects.toThrow('Fix these problems');
    expect(current().received.map((r) => r.id)).toEqual([1, 3, 4, 2]);
    current().reply({ type: 'parts', id: 2, parts: [], ms: 1 });
    await expect(preview2).resolves.toEqual([]);
  });

  it('export-quality builds are never superseded', async () => {
    const { client, current } = setup();
    const a = client.buildParts(defaultParams(), 'export');
    const b = client.buildParts(defaultParams(), 'export');
    current().reply({ type: 'parts', id: 1, parts: [], ms: 1 });
    await expect(a).resolves.toEqual([]);
    current().reply({ type: 'parts', id: 2, parts: [], ms: 1 });
    await expect(b).resolves.toEqual([]);
  });

  it('cancel terminates, respawns and rejects everything pending', async () => {
    const { client, workers, current } = setup();
    const a = client.buildParts(defaultParams(), 'preview');
    const b = client.exportZip(req);
    const old = current();
    client.cancel();
    const [ea, eb] = await Promise.all([a.catch((e: Error) => e), b.catch((e: Error) => e)]);
    expect((ea as Error).name).toBe('CancelledError');
    expect((eb as Error).name).toBe('CancelledError');
    expect(old.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    // stale replies from the old worker are ignored; the new one works
    old.reply({ type: 'parts', id: 1, parts: [], ms: 1 });
    const c = client.buildParts(defaultParams(), 'preview');
    expect(current().received.map((r) => r.id)).toEqual([3]);
    current().reply({ type: 'parts', id: 3, parts: [], ms: 1 });
    await expect(c).resolves.toEqual([]);
  });

  it('a crash rejects the running request, respawns and continues', async () => {
    const { client, workers, current } = setup();
    current().reply({ type: 'ready' });
    const a = client.buildParts(defaultParams(), 'preview');
    const b = client.exportZip(req);
    current().crash('out of memory');
    await expect(a).rejects.toThrow(/crashed: out of memory/);
    expect(workers).toHaveLength(2);
    expect(current().received.map((r) => r.id)).toEqual([2]);
    current().reply({ type: 'zip', id: 2, zip: new Uint8Array(), fileName: 'x.zip', ms: 1 });
    await expect(b).resolves.toMatchObject({ fileName: 'x.zip' });
  });

  it('gives up when the worker cannot start', async () => {
    const { client, workers, current } = setup();
    const a = client.buildParts(defaultParams(), 'preview');
    current().crash('404');
    await expect(a).rejects.toThrow(/crashed: 404/);
    const b = client.buildParts(defaultParams(), 'preview');
    current().crash('404');
    await expect(b).rejects.toThrow(/failed to load/);
    await expect(client.ready).rejects.toThrow(/failed to load/);
    await expect(client.buildParts(defaultParams(), 'preview')).rejects.toThrow(/failed to load/);
    expect(workers).toHaveLength(2);
  });

  it('dispose rejects pending and later requests', async () => {
    const { client, current } = setup();
    const a = client.buildParts(defaultParams(), 'preview');
    client.dispose();
    expect(current().terminated).toBe(true);
    await expect(a).rejects.toMatchObject({ name: 'CancelledError' });
    await expect(client.exportZip(req)).rejects.toMatchObject({ name: 'CancelledError' });
    await settle();
  });
});

describe('WorkerGeometryClient with the real handler in-process', () => {
  let k: Kernel;
  beforeAll(async () => {
    k = await getKernel();
  });

  it('builds parts and exports a ZIP', async () => {
    const handler = createHandler(k);
    const client = new WorkerGeometryClient(() => {
      const w: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(msg) {
          setTimeout(() => handler.handle(msg, (res) => w.onmessage?.({ data: res })), 0);
        },
        terminate() {},
      };
      setTimeout(() => w.onmessage?.({ data: { type: 'ready' } }), 0);
      return w;
    });
    await client.ready;
    const parts = await client.buildParts(defaultParams(), 'preview');
    expect(parts.map((p) => p.id)).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp']);
    const stages: ExportStage[] = [];
    const { zip, fileName } = await client.exportZip({ ...req, includeFitTest: true }, (s) => stages.push(s));
    expect(fileName).toBe('stacklamp-L1500-D200-rod-o11x154.5-i11x154.3.zip');
    expect(Object.keys(unzipSync(zip))).toHaveLength(9);
    expect(stages).toContain('fit-test');
    client.dispose();
  });
});
