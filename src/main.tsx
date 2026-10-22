/**
 * DEV HARNESS for the 3D preview (wave 1). The UI agent replaces this file with the app.
 * Full-viewport PreviewCanvas on stub/real engine parts, with a few controls.
 */
import { type CSSProperties, StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createGeometryClient, defaultParams, deriveDims, type CoreKind, type LampParams, type PartMesh, type PetgColour } from './geometry';
import { PreviewCanvas, PreviewToolbar, type GlowMode, type PreviewStatus, type QualityTier, type ViewMode } from './preview';

// Pull in the design tokens when they exist (defensive: the design agent owns them).
import.meta.glob(['./ui/styles/tokens.css', './ui/styles/fonts.css'], { eager: true });

const PALETTE: PetgColour[] = [
  { id: 'clr', name: 'Clear', hex: '#fff4dc' },
  { id: 'smk', name: 'Smoke', hex: '#6b625a' },
  { id: 'amb', name: 'Amber', hex: '#ffa41b' },
  { id: 'org', name: 'Orange', hex: '#ff6a1f' },
  { id: 'red', name: 'Red', hex: '#f2363f' },
  { id: 'vio', name: 'Violet', hex: '#9e5fff' },
  { id: 'blu', name: 'Blue', hex: '#3d7bff' },
  { id: 'tea', name: 'Teal', hex: '#00b3a6' },
  { id: 'grn', name: 'Green', hex: '#33c24d' },
];
const ids = PALETTE.map((c) => c.id);

type Scheme = 'sunset' | 'alternate' | 'gradient' | 'random' | 'clear';
function bandsFor(scheme: Scheme, n: number, seed: number, inner: boolean): string[] {
  return Array.from({ length: n }, (_, k) => {
    switch (scheme) {
      case 'sunset':
        return inner ? 'clr' : k < 4 ? 'amb' : k < 7 ? 'org' : 'red';
      case 'alternate':
        return inner ? (k % 2 ? 'tea' : 'clr') : k % 2 ? 'blu' : 'vio';
      case 'gradient': {
        const ramp = inner ? ['amb', 'org', 'red', 'vio'] : ['grn', 'tea', 'blu', 'vio'];
        return ramp[Math.min(ramp.length - 1, Math.floor((k / n) * ramp.length))]!;
      }
      case 'random':
        return ids[Math.floor(Math.abs(Math.sin(seed * 97 + k * 13 + (inner ? 7 : 0))) * ids.length) % ids.length]!;
      case 'clear':
        return inner ? 'smk' : 'clr';
    }
  });
}

// One client for the page (StrictMode would dispose a per-component one).
const client = createGeometryClient();

function Harness() {
  const [length, setLength] = useState(1500);
  const [coreKind, setCoreKind] = useState<CoreKind>('aluminium-rod');
  const params = useMemo<LampParams>(() => {
    const p = defaultParams();
    p.core.length = length;
    p.core.kind = coreKind;
    if (coreKind === 'led-tube') p.core.diameter = 28;
    return p;
  }, [length, coreKind]);
  const dims = useMemo(() => deriveDims(params), [params]);
  const [built, setBuilt] = useState<{ parts: PartMesh[]; dims: ReturnType<typeof deriveDims> } | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('assembled');
  const [glow, setGlow] = useState<GlowMode>('auto');
  const [autoTier, setAutoTier] = useState<QualityTier | null>(null);
  const [scheme, setScheme] = useState<Scheme>('sunset');
  const [seed, setSeed] = useState(1);
  const [reset, setReset] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus('building');
    const t = setTimeout(() => {
      client.buildParts(params, 'preview').then(
        (parts) => {
          if (!live) return;
          setBuilt({ parts, dims: deriveDims(params) });
          setStatus('idle');
        },
        (err: unknown) => {
          if (!live || (err instanceof Error && err.name === 'SupersededError')) return;
          console.error(err);
          setStatus('error');
        },
      );
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [params]);

  const layoutDims = built?.dims ?? null;
  const bands = useMemo(
    () => ({
      inner: bandsFor(scheme, layoutDims?.inner.count ?? 0, seed, true),
      outer: bandsFor(scheme, layoutDims?.outer.count ?? 0, seed, false),
    }),
    [scheme, seed, layoutDims],
  );

  const bar: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    padding: '8px 16px',
    background: 'var(--color-paper, #f4eee1)',
    color: 'var(--color-ink, #1b1814)',
    font: '14px var(--font-body, system-ui)',
  };
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100svh', margin: 0 }}>
      <div style={bar}>
        <PreviewToolbar
          viewMode={viewMode}
          onViewMode={setViewMode}
          status={status}
          onResetView={() => setReset((r) => r + 1)}
          glow={glow}
          onGlow={setGlow}
          autoTier={autoTier}
        />
        <label>
          Rod {length} mm{' '}
          <input type="range" min={600} max={2000} step={50} value={length} onChange={(e) => setLength(Number(e.target.value))} />
        </label>
        <select value={scheme} onChange={(e) => setScheme(e.target.value as Scheme)} aria-label="Colour scheme">
          {(['sunset', 'alternate', 'gradient', 'random', 'clear'] as Scheme[]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="button" onClick={() => { setScheme('random'); setSeed((s) => s + 1); }}>
          Shuffle
        </button>
        <select value={coreKind} onChange={(e) => setCoreKind(e.target.value as CoreKind)} aria-label="Core">
          <option value="aluminium-rod">rod + strip</option>
          <option value="led-tube">LED tube</option>
        </select>
        <span>
          {dims.outer.count}× outer {dims.outer.height} mm · {dims.inner.count}× inner {dims.inner.height} mm ·{' '}
          {(dims.totalHeight / 1000).toFixed(2)} m · glow {glow}
          {glow === 'auto' && autoTier ? ` (${autoTier})` : ''}
        </span>
      </div>
      <div style={{ minHeight: 0 }}>
        <PreviewCanvas
          parts={built?.parts ?? null}
          layoutDims={layoutDims}
          bands={bands}
          palette={PALETTE}
          viewMode={viewMode}
          status={status}
          glow={glow}
          onGlowAuto={setAutoTier}
          onContextLost={() => console.warn('context lost')}
          ariaLabel={`Preview of the lamp, ${(dims.totalHeight / 1000).toFixed(2)} m tall, ${dims.outer.count} outer and ${dims.inner.count} inner bands`}
          resetViewSignal={reset}
          coreKind={coreKind}
        />
      </div>
    </div>
  );
}

document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
