// Phase-0 smoke test: proves the Manifold WASM loads under the Pages base path.
// Replaced by geometry.worker.ts when the engine lands.
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

(async () => {
  try {
    const wasm = await Module({ locateFile: () => wasmUrl });
    wasm.setup();
    const cube = wasm.Manifold.cube([10, 10, 10]);
    const volume = cube.volume();
    cube.delete();
    self.postMessage({ ok: true, volume });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
})();
