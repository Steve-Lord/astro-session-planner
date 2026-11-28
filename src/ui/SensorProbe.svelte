<script lang="ts">
  import { onDestroy } from 'svelte'
  import { cameraDirection } from '../lib/sweep/orientation'
  import { requestMotionPermission, sensorSupport, startOrientation, type RawReading } from '../lib/sweep/sensors'

  const support = sensorSupport()
  let status = $state<'idle' | 'waiting' | 'running' | 'denied'>('idle')
  let raw = $state<RawReading | null>(null)
  let rate = $state(0)
  let noEvents = $state(false)
  let label = $state('')
  let log = $state<string[]>([])
  let copied = $state('')

  let stop: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let rateTimer: ReturnType<typeof setInterval> | undefined
  let count = 0

  const dir = $derived(raw ? cameraDirection(raw.alpha, raw.beta, raw.gamma) : null)

  const f1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1))

  function start(): void {
    // Permission request must be the first thing in the tap handler (iOS).
    requestMotionPermission().then((p) => {
      if (p === 'denied') {
        status = 'denied'
        return
      }
      status = 'waiting'
      stop?.()
      stop = startOrientation(
        () => {},
        (r) => {
          raw = r
          count++
          status = 'running'
          noEvents = false
        },
      )
      clearTimeout(timer)
      timer = setTimeout(() => (noEvents = raw === null), 2000)
      clearInterval(rateTimer)
      rateTimer = setInterval(() => {
        rate = count
        count = 0
      }, 1000)
    })
  }

  function mark(): void {
    if (!raw || !dir) return
    const r = raw
    const name = label.trim() || `mark ${log.length + 1}`
    log.push([name.replace(/,/g, ';'), f1(r.alpha), f1(r.beta), f1(r.gamma), f1(r.compassHeading), f1(r.compassAccuracy),
      f1(dir.alt), f1(dir.azRel), f1(r.azMag), f1(dir.roll)].join(', '))
    label = ''
  }

  function copyAll(): void {
    const text = ['label, alpha, beta, gamma, compassHeading, compassAccuracy, alt, azRel, azMag, roll', ...log].join('\n')
    const fallback = () => {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      copied = ok ? 'Copied' : 'Copy failed: select the log text manually'
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => (copied = 'Copied'), fallback)
    else fallback()
  }

  onDestroy(() => {
    stop?.()
    clearTimeout(timer)
    clearInterval(rateTimer)
  })
</script>

<section class="probe">
  <div class="head">
    <h2>Sensor probe</h2>
    <a href="#sites">Back</a>
  </div>

  {#if !support.secure}
    <p class="banner warn">Not a secure context: sensors need HTTPS.</p>
  {/if}
  {#if !support.orientation}
    <p class="banner warn">This browser has no device-orientation support. Use your phone.</p>
  {/if}

  <button class="big" onclick={start}>{status === 'idle' ? 'Start' : 'Restart'}</button>
  {#if status === 'denied'}<p class="banner error">Motion permission denied.</p>{/if}
  {#if noEvents}<p class="banner warn">No sensor events yet</p>{/if}

  <dl class="grid">
    <dt>α</dt><dd>{f1(raw?.alpha)}</dd>
    <dt>β</dt><dd>{f1(raw?.beta)}</dd>
    <dt>γ</dt><dd>{f1(raw?.gamma)}</dd>
    <dt>heading</dt><dd>{f1(raw?.compassHeading)}</dd>
    <dt>accuracy</dt><dd>{f1(raw?.compassAccuracy)}</dd>
    <dt>alt</dt><dd>{f1(dir?.alt)}</dd>
    <dt>azRel</dt><dd>{f1(dir?.azRel)}</dd>
    <dt>azMag</dt><dd>{f1(raw?.azMag)}</dd>
    <dt>roll</dt><dd>{f1(dir?.roll)}</dd>
    <dt>rate</dt><dd>{rate} Hz</dd>
  </dl>

  <div class="row">
    <input bind:value={label} placeholder="Label (e.g. church spire)" aria-label="Mark label" />
    <button onclick={mark} disabled={!raw}>Mark</button>
  </div>
  <div class="row">
    <button onclick={copyAll} disabled={log.length === 0}>Copy all</button>
    <span class="dim">{copied}</span>
  </div>
  {#if log.length}
    <pre class="log">{log.join('\n')}</pre>
  {/if}
</section>

<style>
  .probe { max-width: var(--page-max); margin: 0 auto; padding: 12px 16px 32px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .head a { font-size: 18px; }
  .big { width: 100%; min-height: 56px; font-size: 20px; }
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 16px 0; }
  .grid dt { color: var(--text-dim); font-size: 16px; align-self: center; }
  .grid dd { margin: 0; text-align: right; font: 600 28px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); }
  .row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
  .row input { flex: 1; min-width: 0; }
  .dim { color: var(--text-dim); }
  .log { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px;
    font: 12px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
</style>
