/// <reference lib="webworker" />
import { planNight, type PlanInput } from './night'

// Module worker: receives { id, input } and replies { id, plan }.
self.onmessage = (e: MessageEvent<{ id: number; input: PlanInput }>) => {
  const { id, input } = e.data
  postMessage({ id, plan: planNight(input) })
}
