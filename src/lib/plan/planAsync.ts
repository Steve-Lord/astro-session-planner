import type { NightPlan } from '../types'
import type { PlanInput } from './night'

type Reply = { id: number; plan: NightPlan } | { id: number; error: string }
interface Pending { resolve: (p: NightPlan) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, Pending>()

function rejectAll(err: Error): void {
  for (const p of pending.values()) p.reject(err)
  pending.clear()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<Reply>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if ('error' in e.data) p.reject(new Error(e.data.error))
    else p.resolve(e.data.plan)
  }
  w.onmessageerror = () => rejectAll(new Error('Night plan worker reply could not be deserialized'))
  // Fatal worker error: fail everything in flight and start a fresh worker next time.
  w.onerror = (e) => {
    rejectAll(new Error(`Night plan worker failed: ${e.message || 'unknown error'}`))
    worker = null
    w.terminate()
  }
  worker = w
  return w
}

/**
 * Run planNight in a shared module worker; each call resolves (or rejects) with its own response.
 * The input is structured-cloned: pass plain data (e.g. `$state.snapshot(...)`), never Svelte
 * `$state` proxies, or postMessage throws a DataCloneError and the promise rejects.
 */
export function planNightAsync(input: PlanInput): Promise<NightPlan> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const w = getWorker()
    pending.set(id, { resolve, reject })
    try {
      w.postMessage({ id, input })
    } catch (err) {
      pending.delete(id)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
