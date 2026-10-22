/**
 * Geometry worker entry: the only module that imports the WASM binary URL.
 * Initialises manifold-3d, posts { type: 'ready' } (or 'init-error'), then
 * answers WorkerRequests through the Node-testable handler.
 */
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { createHandler } from './handler';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
const post = (res: WorkerResponse, transfer: ArrayBuffer[] = []): void => scope.postMessage(res, transfer);

const ready = Module({ locateFile: () => wasmUrl }).then((wasm) => {
  wasm.setup();
  return createHandler(wasm);
});
ready.then(
  () => post({ type: 'ready' }),
  (err: unknown) => post({ type: 'init-error', error: err instanceof Error ? err.message : String(err) }),
);

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  let handler;
  try {
    handler = await ready;
  } catch (err) {
    post({ type: 'error', id: req.id, error: `The geometry engine failed to load: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  handler.handle(req, post);
};
