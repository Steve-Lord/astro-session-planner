import type { NightPlan } from '../types'
import type { PlanInput } from './night'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (p: NightPlan) => void; reject: (e: unknown) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<{ id: number; plan: NightPlan }>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    p.resolve(e.data.plan)
  }
  w.onerror = (e) => {
    for (const p of pending.values()) p.reject(e)
    pending.clear()
    worker = null
    w.terminate()
  }
  worker = w
  return w
}

/** Run planNight in a shared module worker; each call resolves with its own response. */
export function planNightAsync(input: PlanInput): Promise<NightPlan> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, input })
  })
}
