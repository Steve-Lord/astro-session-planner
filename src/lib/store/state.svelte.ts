// Runes store. `appState` is a deep $state proxy; mutate it directly.
// Auto-save: the App calls startAutoSave() once (an $effect.root, since $effect
// needs an owner and this module is outside any component). It returns a cleanup.
import { defaultState, loadState, saveState, type AppState } from './state';

const hasStorage = typeof localStorage !== 'undefined';
const loaded = hasStorage ? loadState(localStorage) : { state: defaultState(), error: null };

export const appState: AppState = $state(loaded.state);
export const loadError: string | null = loaded.error;

export function persist(): void {
  if (hasStorage) saveState(localStorage, $state.snapshot(appState) as AppState);
}

export function startAutoSave(): () => void {
  return $effect.root(() => {
    $effect(() => {
      persist(); // snapshot reads every field, so any change re-runs this
    });
  });
}
