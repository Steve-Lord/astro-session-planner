/// <reference lib="webworker" />
import { planNight, type PlanInput } from './night'

// Module worker: receives { id, input }; replies { id, plan } or { id, error } if planNight throws.
self.onmessage = (e: MessageEvent<{ id: number; input: PlanInput }>) => {
  const { id, input } = e.data
  try {
    postMessage({ id, plan: planNight(input) })
  } catch (err) {
    postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
