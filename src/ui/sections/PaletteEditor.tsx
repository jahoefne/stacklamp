import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { PetgColour } from '../../geometry';
import {
  MAX_COLOURS,
  MAX_NAME_LENGTH,
  isDefaultPalette,
  lampStore,
  normalizeHex,
  selectPalette,
  selectUsage,
  useLamp,
  useLampActions,
} from '../../state';
import type { ColourUsage, LampState } from '../../state';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Select } from '../primitives/Select';
import { Swatch } from '../primitives/Swatch';
import { useToast } from '../primitives/Toast';
import { cx } from '../primitives/format';
import styles from './PaletteEditor.module.css';

const selectBrush = (s: LampState): string => s.ui.brush;
const selectMix = (s: LampState): string[] => s.ui.mix;

const NO_USAGE: ColourUsage = { inner: 0, outer: 0, total: 0 };

/**
 * The palette: each row's swatch picks the brush (one radiogroup, arrow keys move), "Mix"
 * adds the colour to the generators, the pencil opens name + colour editing, the bin removes
 * (asking for a replacement when bands use it).
 */
export function PaletteEditor(): ReactElement {
  const palette = useLamp(selectPalette);
  const usage = useLamp(selectUsage);
  const brush = useLamp(selectBrush);
  const mix = useLamp(selectMix);
  const { setBrush, toggleMix, addColour, resetPalette, loadConfig } = useLampActions();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const swatchRefs = useRef(new Map<string, HTMLButtonElement>());
  const mixSet = new Set(mix);
  const full = palette.length >= MAX_COLOURS;

  const moveBrush = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % palette.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + palette.length) % palette.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = palette.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const c = palette[next];
    if (!c) return;
    setBrush(c.id);
    swatchRefs.current.get(c.id)?.focus();
  };

  const onAdd = () => {
    const id = addColour();
    if (id) {
      setEditing(id);
      setFocusName(id);
    }
  };

  // A removed row takes the focused button with it: move focus to the brush swatch.
  const focusBrush = () => {
    setTimeout(() => swatchRefs.current.get(lampStore.getState().ui.brush)?.focus(), 0);
  };

  const onReset = () => {
    const before = lampStore.getState().config;
    resetPalette();
    setEditing(null);
    toast.show({ text: 'Palette reset to the nine default colours.', action: { label: 'Undo', onAction: () => loadConfig(before, 'preset') } });
  };

  return (
    <div className={styles.editor}>
      <p className={styles.hint}>Click a swatch to pick the brush. Mix marks the colours the fill buttons use.</p>
      <div className={styles.list} role="radiogroup" aria-label="Brush colour">
        {palette.map((c, i) => (
          <PaletteRow
            key={c.id}
            colour={c}
            index={i}
            palette={palette}
            usage={usage[c.id] ?? NO_USAGE}
            isBrush={c.id === brush}
            inMix={mixSet.has(c.id)}
            editing={editing === c.id}
            focusName={focusName === c.id}
            onFocusedName={() => setFocusName(null)}
            onEdit={(open) => setEditing(open ? c.id : null)}
            onBrush={() => setBrush(c.id)}
            onBrushKey={(e) => moveBrush(e, i)}
            onMix={() => toggleMix(c.id)}
            swatchRef={(el) => {
              if (el) swatchRefs.current.set(c.id, el);
              else swatchRefs.current.delete(c.id);
            }}
            canRemove={palette.length > 1}
            onRemoved={focusBrush}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" icon="plus" onClick={onAdd} disabled={full} aria-describedby={full ? 'palette-full' : undefined}>
          Add colour
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={isDefaultPalette(palette)}>
          Reset palette
        </Button>
      </div>
      {full ? (
        <p id="palette-full" className={styles.hint}>
          The palette holds at most {MAX_COLOURS} colours.
        </p>
      ) : null}
    </div>
  );
}

interface RowProps {
  colour: PetgColour;
  index: number;
  palette: PetgColour[];
  usage: ColourUsage;
  isBrush: boolean;
  inMix: boolean;
  editing: boolean;
  focusName: boolean;
  onFocusedName(): void;
  onEdit(open: boolean): void;
  onBrush(): void;
  onBrushKey(e: KeyboardEvent<HTMLButtonElement>): void;
  onMix(): void;
  swatchRef(el: HTMLButtonElement | null): void;
  canRemove: boolean;
  /** Called after this colour was removed (its row unmounts). */
  onRemoved(): void;
}

function PaletteRow({
  colour,
  palette,
  usage,
  isBrush,
  inMix,
  editing,
  focusName,
  onFocusedName,
  onEdit,
  onBrush,
  onBrushKey,
  onMix,
  swatchRef,
  canRemove,
  onRemoved,
}: RowProps): ReactElement {
  const { updateColour, removeColour } = useLampActions();
  const [confirm, setConfirm] = useState(false);
  const trashRef = useRef<HTMLButtonElement>(null);
  const others = palette.filter((c) => c.id !== colour.id);
  const [replacement, setReplacement] = useState(others[0]?.id ?? '');
  const editId = `palette-edit-${colour.id}`;
  const bandsWord = usage.total === 1 ? 'band' : 'bands';

  useEffect(() => {
    if (!others.some((c) => c.id === replacement)) setReplacement(others[0]?.id ?? '');
  }, [others, replacement]);

  const onRemove = () => {
    if (usage.total > 0) setConfirm(true);
    else {
      removeColour(colour.id);
      onRemoved();
    }
  };

  return (
    <div className={cx(styles.row, isBrush && styles.brushRow)}>
      <div className={styles.main}>
        <Swatch
          as="button"
          ref={swatchRef}
          role="radio"
          aria-checked={isBrush}
          tabIndex={isBrush ? 0 : -1}
          colour={colour.hex}
          selected={isBrush}
          inMix={inMix}
          label={`Paint with ${colour.name}`}
          onClick={onBrush}
          onKeyDown={onBrushKey}
        />
        <span className={styles.name}>{colour.name}</span>
        <span className={styles.count} title={`Used on ${usage.total} ${bandsWord}`}>
          ×{usage.total}
          <span className="visually-hidden"> {bandsWord}</span>
        </span>
        <button
          type="button"
          className={styles.mix}
          aria-pressed={inMix}
          aria-label={`Use ${colour.name} in the generators`}
          title="Use this colour for Alternate, Gradient and Random"
          onClick={onMix}
        >
          Mix
        </button>
        <IconButton
          icon="edit"
          tone="row"
          size="sm"
          label={`Edit ${colour.name}`}
          aria-expanded={editing}
          aria-controls={editId}
          pressed={editing}
          onClick={() => onEdit(!editing)}
        />
        <IconButton
          ref={trashRef}
          icon="trash"
          tone="row"
          size="sm"
          label={`Remove ${colour.name}`}
          disabled={!canRemove}
          onClick={onRemove}
        />
      </div>
      {editing ? (
        <ColourEditor id={editId} colour={colour} focusName={focusName} onFocusedName={onFocusedName} onChange={(patch) => updateColour(colour.id, patch)} />
      ) : null}
      {confirm ? (
        <div className={styles.confirm} role="group" aria-label={`Remove ${colour.name}`}>
          <label className={styles.confirmText} htmlFor={`replace-${colour.id}`}>
            Used in {usage.total} {bandsWord}. Replace with
          </label>
          <Select
            id={`replace-${colour.id}`}
            autoFocus
            size="sm"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            options={others.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className={styles.confirmActions}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                removeColour(colour.id, replacement);
                setConfirm(false);
                onRemoved();
              }}
            >
              Remove
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirm(false);
                trashRef.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ColourEditorProps {
  id: string;
  colour: PetgColour;
  focusName: boolean;
  onFocusedName(): void;
  onChange(patch: { name?: string; hex?: string }): void;
}

/** Name (max 20 characters), native colour picker and hex text for one palette colour. */
function ColourEditor({ id, colour, focusName, onFocusedName, onChange }: ColourEditorProps): ReactElement {
  const [name, setName] = useState<string | null>(null);
  const [hex, setHex] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const hexValid = hex === null || normalizeHex(hex) !== null;

  useEffect(() => {
    if (focusName) {
      nameRef.current?.focus();
      nameRef.current?.select();
      onFocusedName();
    }
  }, [focusName, onFocusedName]);

  const commitName = () => {
    if (name !== null) onChange({ name });
    setName(null);
  };

  return (
    <div id={id} className={styles.edit}>
      <div className={styles.editField}>
        <label htmlFor={`${id}-name`} className={styles.editLabel}>
          Name
        </label>
        <input
          ref={nameRef}
          id={`${id}-name`}
          className={styles.input}
          value={name ?? colour.name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setName(null);
          }}
        />
      </div>
      <div className={styles.editField}>
        <label htmlFor={`${id}-hex`} className={styles.editLabel}>
          Colour
        </label>
        <span className={cx(styles.hexBox, !hexValid && styles.invalid)}>
          <span className={styles.hash} aria-hidden="true">
            #
          </span>
          <input
            id={`${id}-hex`}
            className={cx(styles.input, styles.hex)}
            value={(hex ?? colour.hex).replace(/^#/, '').toUpperCase()}
            maxLength={7}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!hexValid || undefined}
            aria-describedby={!hexValid ? `${id}-hex-error` : undefined}
            onChange={(e) => {
              const raw = e.target.value;
              setHex(raw);
              const n = normalizeHex(raw);
              if (n && raw.replace(/^#/, '').length === 6) onChange({ hex: n });
            }}
            onBlur={() => {
              const n = hex !== null ? normalizeHex(hex) : null;
              if (n) onChange({ hex: n });
              setHex(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setHex(null);
            }}
          />
          <span className={styles.picker} title="Pick a colour">
            <input
              type="color"
              className={styles.pickerInput}
              value={normalizeHex(colour.hex) ?? '#ffffff'}
              aria-label={`Pick the colour of ${colour.name}`}
              onChange={(e) => {
                setHex(null);
                onChange({ hex: e.target.value });
              }}
            />
            <Swatch colour={colour.hex} />
          </span>
        </span>
      </div>
      {!hexValid ? (
        <p id={`${id}-hex-error`} className={styles.error}>
          Enter 3 or 6 hex digits, like FFA41B.
        </p>
      ) : null}
    </div>
  );
}
