<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Notepad',
    desc: 'Jot down notes, saved locally',
    icon: '📝',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';

let content = '';

onMount(() => {
  content = localStorage.getItem('notepad') ?? '';
});

function save() {
  localStorage.setItem('notepad', content);
}
</script>

<textarea
  class="notepad"
  bind:value={content}
  on:input={save}
  placeholder="Write anything…"
></textarea>

<style>
  .notepad {
    width: 100%;
    flex: 1;
    min-height: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    line-height: 1.6;
    padding: 10px;
    resize: none;
    outline: none;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .notepad:focus { border-color: var(--accent-md); }
  .notepad::placeholder { color: var(--text-faint); }
</style>
