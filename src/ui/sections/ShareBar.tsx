import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react';
import {
  BUILTIN_PRESETS,
  cleanPresetName,
  decodeConfig,
  encodeConfigAuto,
  lampStore,
  selectCode,
  selectShareUrl,
  useLamp,
  useLampActions,
} from '../../state';
import type { LampConfig, LampState, SavedPreset } from '../../state';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Select } from '../primitives/Select';
import { useToast } from '../primitives/Toast';
import styles from './ShareBar.module.css';

const selectSaved = (s: LampState): SavedPreset[] => s.saved;

const BUILTIN_PREFIX = 'b:';
const SAVED_PREFIX = 's:';
/** Select value while the lamp matches no preset (shown, never pickable). */
export const CUSTOM_CHOICE = 'custom';

/** The share code a preset's code becomes once loaded (what `selectCode` then reports). */
function normalisedCode(code: string): string {
  const decoded = decodeConfig(code);
  return decoded ? encodeConfigAuto(decoded.config) : code;
}

const BUILTIN_CODES: ReadonlyMap<string, string> = new Map(BUILTIN_PRESETS.map((p) => [`${BUILTIN_PREFIX}${p.id}`, normalisedCode(p.code)]));

interface Undoable {
  verb: 'reset' | 'load';
  before: LampConfig;
  /** The share code right after the action: edits since then retire the undo. */
  after: string;
}

/**
 * Presets and sharing: load a built-in or saved preset, save the current lamp under a
 * name, delete saved ones (inline confirm), copy the share link, reset to the default lamp.
 * The select shows "Custom" once the lamp no longer matches the preset it was loaded from.
 */
export function ShareBar(): ReactElement {
  const saved = useLamp(selectSaved);
  const shareUrl = useLamp(selectShareUrl);
  const code = useLamp(selectCode);
  const { loadPreset, savePreset, deletePreset, resetAll, loadConfig } = useLampActions();
  const toast = useToast();
  const savedCodes = useMemo(
    () => new Map<string, string>(saved.map((p) => [`${SAVED_PREFIX}${p.name}`, normalisedCode(p.code)])),
    [saved],
  );
  const codeOf = (key: string): string | undefined => BUILTIN_CODES.get(key) ?? savedCodes.get(key);
  /** The first preset (built-in, then saved) the lamp matches exactly. */
  const matching = (c: string): string | null => {
    for (const [key, v] of BUILTIN_CODES) if (v === c) return key;
    for (const [key, v] of savedCodes) if (v === c) return key;
    return null;
  };
  const [choice, setChoice] = useState(() => matching(code) ?? CUSTOM_CHOICE);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [undo, setUndo] = useState<Undoable | null>(null);
  const presetId = useId();
  const nameId = useId();
  const linkId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const saveToggleRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const trashRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (saving) nameRef.current?.focus();
  }, [saving]);
  useEffect(() => {
    if (fallback) linkRef.current?.select();
  }, [fallback]);

  // "Custom" once the lamp drifts from the preset it matched; back to a preset's name when
  // it matches one again (undo, reset); off a saved preset that was deleted.
  const last = useRef({ choice, matched: codeOf(choice) === code });
  useEffect(() => {
    const matched = codeOf(choice) === code;
    if (choice === CUSTOM_CHOICE) {
      const found = matching(code);
      if (found) setChoice(found);
    } else if (choice.startsWith(SAVED_PREFIX) && !savedCodes.has(choice)) {
      setChoice(matching(code) ?? CUSTOM_CHOICE);
    } else if (!matched && last.current.choice === choice && last.current.matched) {
      setChoice(CUSTOM_CHOICE);
    }
    last.current = { choice, matched };
  });

  /** Run a config-replacing action; offer to undo it in a toast and, until the next edit, in the bar. */
  const withUndo = (verb: Undoable['verb'], run: () => boolean | void, text: string) => {
    const before = lampStore.getState().config;
    if (run() === false) return;
    const after = selectCode(lampStore.getState());
    setUndo({ verb, before, after });
    toast.show({ text, action: { label: 'Undo', onAction: () => loadConfig(before, 'preset') } });
  };

  const onUndo = () => {
    if (!undo) return;
    loadConfig(undo.before, 'preset');
    setUndo(null);
    toast.dismiss();
    // The undo button goes away with the undo: keep focus in the row.
    resetRef.current?.focus();
  };

  const onLoad = () => {
    if (choice === CUSTOM_CHOICE) return;
    const key = choice.startsWith(BUILTIN_PREFIX) ? choice.slice(BUILTIN_PREFIX.length) : choice.slice(SAVED_PREFIX.length);
    const label = BUILTIN_PRESETS.find((p) => p.id === key)?.name ?? key;
    withUndo('load', () => loadPreset(key), `Loaded “${label}”.`);
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanPresetName(name);
    if (savePreset(clean)) {
      setSaving(false);
      setName('');
      setChoice(`${SAVED_PREFIX}${clean}`);
      // The form unmounts: keep focus on the select that now shows the saved preset.
      selectRef.current?.focus();
    }
  };

  /** Close the name form without saving, focus back on its toggle. */
  const cancelSave = () => {
    setSaving(false);
    saveToggleRef.current?.focus();
  };

  const onCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(shareUrl);
      setFallback(false);
      toast.show({ text: 'Link copied. Anyone with it sees this lamp.' });
    } catch {
      setFallback(true);
    }
  };

  const exists = cleanPresetName(name) !== '' && saved.some((p) => p.name === cleanPresetName(name));
  const selectedBuiltin = BUILTIN_PRESETS.find((p) => `${BUILTIN_PREFIX}${p.id}` === choice);
  const custom = choice === CUSTOM_CHOICE;
  const canUndo = undo !== null && undo.after === code;

  return (
    <section className={styles.bar} aria-labelledby={`${presetId}-title`}>
      <h2 id={`${presetId}-title`} className="visually-hidden">
        Presets and sharing
      </h2>
      <div className={styles.presetRow}>
        <label htmlFor={presetId} className={styles.label}>
          Preset
        </label>
        <Select
          ref={selectRef}
          id={presetId}
          block
          size="sm"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          aria-describedby={selectedBuiltin || custom ? `${presetId}-desc` : undefined}
          options={[
            ...(custom ? [{ value: CUSTOM_CHOICE, label: 'Custom', disabled: true }] : []),
            {
              label: 'Built-in',
              options: BUILTIN_PRESETS.map((p) => ({ value: `${BUILTIN_PREFIX}${p.id}`, label: p.name })),
            },
            ...(saved.length > 0
              ? [{ label: 'Saved', options: saved.map((p) => ({ value: `${SAVED_PREFIX}${p.name}`, label: p.name })) }]
              : []),
          ]}
        />
        <Button size="sm" variant="secondary" onClick={onLoad} disabled={custom}>
          Load
        </Button>
      </div>
      {selectedBuiltin ? (
        <p id={`${presetId}-desc`} className={styles.hint}>
          {selectedBuiltin.description}
        </p>
      ) : custom ? (
        <p id={`${presetId}-desc`} className={styles.hint}>
          Edited since loading. Save it as a preset to keep it.
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button size="sm" variant="secondary" icon="link" onClick={() => void onCopy()}>
          Copy link
        </Button>
        <Button ref={saveToggleRef} size="sm" variant="ghost" icon="plus" aria-expanded={saving} onClick={() => setSaving((v) => !v)}>
          Save preset
        </Button>
        <Button ref={resetRef} size="sm" variant="ghost" onClick={() => withUndo('reset', () => resetAll(), 'Reset to the default lamp.')}>
          Reset
        </Button>
        {canUndo ? (
          <Button size="sm" variant="ghost" onClick={onUndo} data-testid="undo-config">
            {undo.verb === 'reset' ? 'Undo reset' : 'Undo load'}
          </Button>
        ) : null}
      </div>

      {saving ? (
        <form className={styles.saveForm} onSubmit={onSave}>
          <label htmlFor={nameId} className={styles.label}>
            Preset name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            className={styles.input}
            value={name}
            maxLength={40}
            autoComplete="off"
            aria-describedby={exists ? `${nameId}-hint` : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelSave();
            }}
          />
          <div className={styles.formActions}>
            <Button type="submit" size="sm" variant="secondary" disabled={cleanPresetName(name) === ''}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelSave}>
              Cancel
            </Button>
          </div>
          {exists ? (
            <p id={`${nameId}-hint`} className={styles.hint}>
              Replaces your saved preset with this name.
            </p>
          ) : null}
        </form>
      ) : null}

      {saved.length > 0 ? (
        <div className={styles.saved}>
          <h3 className="micro">Your presets</h3>
          <ul className={styles.savedList} role="list">
            {saved.map((p) => (
              <li key={p.name} className={styles.savedRow}>
                {confirmDelete === p.name ? (
                  <>
                    <span className={styles.savedName}>Delete “{p.name}”?</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        deletePreset(p.name);
                        setConfirmDelete(null);
                        selectRef.current?.focus();
                      }}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      autoFocus
                      onClick={() => {
                        setConfirmDelete(null);
                        setTimeout(() => trashRefs.current.get(p.name)?.focus(), 0);
                      }}
                    >
                      Keep
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.savedLoad}
                      onClick={() => {
                        setChoice(`${SAVED_PREFIX}${p.name}`);
                        withUndo('load', () => loadPreset(p.name), `Loaded “${p.name}”.`);
                      }}
                    >
                      {p.name}
                    </button>
                    <IconButton
                      ref={(el) => {
                        if (el) trashRefs.current.set(p.name, el);
                        else trashRefs.current.delete(p.name);
                      }}
                      icon="trash"
                      tone="row"
                      size="sm"
                      label={`Delete preset “${p.name}”`}
                      onClick={() => setConfirmDelete(p.name)}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fallback ? (
        <div className={styles.fallback}>
          <label htmlFor={linkId} className={styles.label}>
            Share link
          </label>
          <input
            ref={linkRef}
            id={linkId}
            className={styles.input}
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-describedby={`${linkId}-hint`}
          />
          <p id={`${linkId}-hint`} className={styles.hint}>
            Copying was blocked. Select the link and copy it yourself.
          </p>
        </div>
      ) : null}
    </section>
  );
}
