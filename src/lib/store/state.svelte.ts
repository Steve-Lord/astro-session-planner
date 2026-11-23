// Runes store. `appState` is a deep $state proxy; mutate it directly.
// Auto-save: the App calls startAutoSave() once (an $effect.root, since $effect
// needs an owner and this module is outside any component). It returns a cleanup.
import type { HorizonProfile } from '../types';
import { defaultState, loadState, saveState, type AppState } from './state';

// Merely reading `localStorage` can throw (blocked site data), so guard the access itself.
let storage: Storage | null = null;
try {
  storage = typeof localStorage !== 'undefined' ? localStorage : null;
} catch {
  storage = null;
}
const loaded = storage
  ? loadState(storage)
  : { state: defaultState(), error: "Browser storage is unavailable — changes won't be saved." };

export const appState: AppState = $state(loaded.state);
export const loadError: string | null = loaded.error;

/** Transient cross-screen UI requests (not persisted). */
export const ui: {
  editHorizonFor: string | null;
  /** Payload of a horizon link waiting for the user to pick a target site. */
  importPayload: string | null;
  /** Decoded horizon waiting to be applied to the next site the user saves. */
  pendingImport: HorizonProfile | null;
  /** Asks Sites to open its new-site form. */
  openNewSite: boolean;
  /** Asks Sites to apply an imported horizon to a site (after checking for unsaved editor changes). */
  applyImport: { siteId: string; profile: HorizonProfile } | null;
} = $state({ editHorizonFor: null, importPayload: null, pendingImport: null, openNewSite: false, applyImport: null });

export function persist(): void {
  if (storage) saveState(storage, $state.snapshot(appState) as AppState);
}

export function startAutoSave(): () => void {
  return $effect.root(() => {
    $effect(() => {
      persist(); // snapshot reads every field, so any change re-runs this
    });
  });
}
