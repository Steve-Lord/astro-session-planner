// Runes store. `appState` is a deep $state proxy; mutate it directly.
// Auto-save: the App calls startAutoSave() once (an $effect.root, since $effect
// needs an owner and this module is outside any component). It returns a cleanup.
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
export const ui: { editHorizonFor: string | null } = $state({ editHorizonFor: null });

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
