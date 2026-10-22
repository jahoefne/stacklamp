import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultParams, deriveDims } from './geometry';

function Smoke() {
  const [status, setStatus] = useState('engine loading…');
  useEffect(() => {
    const w = new Worker(new URL('./worker/smoke.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ ok: boolean; volume?: number; error?: string }>) => {
      setStatus(e.data.ok ? `engine ok: ${e.data.volume} mm³` : `engine failed: ${e.data.error}`);
      w.terminate();
    };
    w.onerror = (e) => setStatus(`engine failed: ${e.message}`);
    return () => w.terminate();
  }, []);
  const dims = deriveDims(defaultParams());
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>stacklamp</h1>
      <p>Skeleton build. {status}</p>
      <p>
        Default lamp: {dims.outer.count} outer × {dims.outer.height} mm, {dims.inner.count} inner × {dims.inner.height} mm,{' '}
        {dims.totalHeight} mm tall. v{__APP_VERSION__}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Smoke />
  </StrictMode>,
);
