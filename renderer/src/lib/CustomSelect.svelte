<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{ change: any }>();

  export let value: any;
  export let options: { label: string; value: any; short?: string; icon?: string }[];
  export let compact = false;
  export let autofill = false;

  let open = false;
  $: selected = options.find(o => o.value === value);
  $: display = selected
    ? (compact && selected.short != null ? selected.short : selected.label)
    : '—';

  function pick(opt: { label: string; value: any }) {
    value = opt.value;
    dispatch('change', opt.value);
    open = false;
  }
</script>

{#if open}
  <div class="cs-overlay" on:click={() => open = false}></div>
{/if}
<div class="cs-wrap" class:open class:compact>
  <button class="cs-btn" class:autofill on:click|stopPropagation={() => open = !open}>
    <span class="cs-btn-label">
      {#if selected?.icon}
        <img class="cs-icon" src={selected.icon} alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
      {/if}
      {display}
    </span>
    <span class="cs-caret">▾</span>
  </button>
  {#if open}
    <div class="cs-dropdown">
      {#each options as opt}
        <button
          class="cs-option"
          class:active={value === opt.value}
          on:click|stopPropagation={() => pick(opt)}
        >
          {#if opt.icon}
            <img class="cs-icon" src={opt.icon} alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          {/if}
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cs-overlay { position: fixed; inset: 0; z-index: 99; }

  .cs-wrap { position: relative; width: 100%; }

  .cs-btn {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 5px; color: var(--text); font-size: 11px;
    padding: 4px 8px; cursor: pointer; font-family: 'Nunito', sans-serif;
    display: flex; align-items: center; justify-content: space-between;
    transition: border-color 0.15s; text-align: left;
  }
  .cs-btn:hover { border-color: var(--accent-lo); }
  .cs-wrap.open .cs-btn { border-color: var(--accent-md); }

  .compact .cs-btn { padding: 4px 4px; justify-content: center; gap: 3px; font-weight: 700; }

  .cs-btn-label { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }

  .cs-icon { width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; }

  .cs-caret { font-size: 9px; color: var(--text-faint); flex-shrink: 0; margin-left: 4px; }

  .cs-dropdown {
    position: absolute; top: calc(100% + 3px); left: 0;
    background: var(--bg-card); border: 1px solid var(--accent-md);
    border-radius: 5px; z-index: 100; min-width: 100%;
    overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .compact .cs-dropdown { min-width: 90px; left: auto; right: 0; }

  .cs-option {
    display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
    background: none; border: none; border-bottom: 1px solid var(--border);
    color: var(--text-muted); font-size: 11px; padding: 5px 8px;
    cursor: pointer; font-family: 'Nunito', sans-serif; white-space: nowrap;
  }
  .cs-option:last-child { border-bottom: none; }
  .cs-option:hover { background: var(--bg-hover); color: var(--text); }
  .cs-option.active { color: var(--accent); background: var(--bg-raised); }

  @keyframes autofill-glow {
    0%   { border-color: var(--accent-md); box-shadow: 0 0 0 2px var(--accent-lo); }
    60%  { border-color: var(--accent-md); box-shadow: 0 0 0 2px var(--accent-lo); }
    100% { border-color: var(--border);    box-shadow: none; }
  }
  .autofill { animation: autofill-glow 2s ease-out forwards; }
</style>
