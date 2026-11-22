<script lang="ts">
  import { onMount } from 'svelte'
  import { startAutoSave } from './lib/store/state.svelte'
  import Tonight from './ui/Tonight.svelte'

  onMount(() => startAutoSave())
</script>

<h1 class="app-title">Astro Session Planner</h1>
<Tonight />
