import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { BUILTIN_PRESETS, cleanPresetName, lampStore, selectShareUrl, useLamp, useLampActions } from '../../state';
import type { LampState, SavedPreset } from '../../state';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Select } from '../primitives/Select';
import { useToast } from '../primitives/Toast';
import styles from './ShareBar.module.css';

const selectSaved = (s: LampState): SavedPreset[] => s.saved;

const BUILTIN_PREFIX = 'b:';
const SAVED_PREFIX = 's:';

/**
 * Presets and sharing: load a built-in or saved preset, save the current lamp under a
 * name, delete saved ones (inline confirm), copy the share link, reset to the default lamp.
 */
export function ShareBar(): ReactElement {
  const saved = useLamp(selectSaved);
  const shareUrl = useLamp(selectShareUrl);
  const { loadPreset, savePreset, deletePreset, resetAll, loadConfig } = useLampActions();
  const toast = useToast();
  const [choice, setChoice] = useState(`${BUILTIN_PREFIX}${BUILTIN_PRESETS[0]?.id ?? ''}`);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const presetId = useId();
  const nameId = useId();
  const linkId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const trashRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (saving) nameRef.current?.focus();
  }, [saving]);
  useEffect(() => {
    if (fallback) linkRef.current?.select();
  }, [fallback]);
  // Keep the select on an existing entry when a saved preset disappears.
  useEffect(() => {
    if (choice.startsWith(SAVED_PREFIX) && !saved.some((p) => `${SAVED_PREFIX}${p.name}` === choice))
      setChoice(`${BUILTIN_PREFIX}${BUILTIN_PRESETS[0]?.id ?? ''}`);
  }, [saved, choice]);

  /** Run a config-replacing action and offer to undo it. */
  const withUndo = (run: () => boolean | void, text: (ok: boolean) => string) => {
    const before = lampStore.getState().config;
    const ok = run() !== false;
    if (ok) toast.show({ text: text(ok), action: { label: 'Undo', onAction: () => loadConfig(before, 'preset') } });
  };

  const onLoad = () => {
    const key = choice.startsWith(BUILTIN_PREFIX) ? choice.slice(BUILTIN_PREFIX.length) : choice.slice(SAVED_PREFIX.length);
    const label = BUILTIN_PRESETS.find((p) => p.id === key)?.name ?? key;
    withUndo(
      () => loadPreset(key),
      () => `Loaded “${label}”.`,
    );
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanPresetName(name);
    if (savePreset(clean)) {
      setSaving(false);
      setName('');
      setChoice(`${SAVED_PREFIX}${clean}`);
    }
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
          aria-describedby={selectedBuiltin ? `${presetId}-desc` : undefined}
          options={[
            {
              label: 'Built-in',
              options: BUILTIN_PRESETS.map((p) => ({ value: `${BUILTIN_PREFIX}${p.id}`, label: p.name })),
            },
            ...(saved.length > 0
              ? [{ label: 'Saved', options: saved.map((p) => ({ value: `${SAVED_PREFIX}${p.name}`, label: p.name })) }]
              : []),
          ]}
        />
        <Button size="sm" variant="secondary" onClick={onLoad}>
          Load
        </Button>
      </div>
      {selectedBuiltin ? (
        <p id={`${presetId}-desc`} className={styles.hint}>
          {selectedBuiltin.description}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button size="sm" variant="secondary" icon="link" onClick={() => void onCopy()}>
          Copy link
        </Button>
        <Button size="sm" variant="ghost" icon="plus" aria-expanded={saving} onClick={() => setSaving((v) => !v)}>
          Save preset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            withUndo(
              () => resetAll(),
              () => 'Reset to the default lamp.',
            )
          }
        >
          Reset
        </Button>
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
              if (e.key === 'Escape') setSaving(false);
            }}
          />
          <div className={styles.formActions}>
            <Button type="submit" size="sm" variant="secondary" disabled={cleanPresetName(name) === ''}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSaving(false)}>
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
                      onClick={() =>
                        withUndo(
                          () => loadPreset(p.name),
                          () => `Loaded “${p.name}”.`,
                        )
                      }
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
