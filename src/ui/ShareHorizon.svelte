<script lang="ts">
  import { encodeHorizon, horizonQrSvg, importUrl } from '../lib/horizon/share'
  import type { HorizonProfile } from '../lib/types'

  let { horizon }: { horizon: HorizonProfile } = $props()

  let url = $state<string | null>(null)
  let error = $state<string | null>(null)
  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  $effect(() => {
    const h = $state.snapshot(horizon) as HorizonProfile
    let stale = false
    encodeHorizon(h).then(
      (payload) => { if (!stale) url = importUrl(location.origin + location.pathname, payload) },
      (e: unknown) => { if (!stale) error = e instanceof Error ? e.message : 'Could not make a link.' },
    )
    return () => { stale = true }
  })
  $effect(() => () => clearTimeout(copyTimer))

  // The SVG comes from our own QR encoder and never contains user text.
  const qr = $derived(url ? horizonQrSvg(url) : '')

  async function share(): Promise<void> {
    if (!url) return
    try { await navigator.share({ url }) } catch { /* cancelled */ }
  }

  async function copy(): Promise<void> {
    if (!url) return
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { ok = document.execCommand('copy') } catch { ok = false }
      ta.remove()
    }
    if (!ok) return
    copied = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied = false), 2000)
  }
</script>

<section class="share" aria-label="Send horizon to another device">
  <h4>Send to another device</h4>
  {#if error}
    <div class="banner error" role="alert">{error}</div>
  {:else if url}
    <div class="actions">
      {#if canShare}<button type="button" onclick={share}>Share…</button>{/if}
      <button type="button" onclick={copy}>Copy link</button>
      {#if copied}<span class="hint" role="status">Copied</span>{/if}
    </div>
    <div class="share-qr" aria-label="QR code for the horizon link" role="img">{@html qr}</div>
    <code class="share-link">{url}</code>
    <p class="hint">The link contains only the horizon shape — no location.</p>
  {:else}
    <p class="hint">Preparing link…</p>
  {/if}
</section>

<style>
  .share { border-top: 1px solid var(--border); padding-top: 10px; display: grid; gap: 8px; min-width: 0; }
  h4 { margin: 0; font-size: 14px; }
  .hint { color: var(--text-dim); font-size: 13px; margin: 0; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .share-qr { max-width: min(100%, 280px); background: #fff; padding: 4px; border-radius: 6px; }
  .share-qr :global(svg) { display: block; width: 100%; height: auto; }
  .share-link { display: block; font-size: 12px; color: var(--text-dim); overflow-wrap: anywhere; word-break: break-all; }
</style>
