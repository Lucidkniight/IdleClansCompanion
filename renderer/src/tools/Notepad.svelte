<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Notepad',
    desc: 'Jot down notes, saved locally',
    icon: '📝',
    author: 'Lucid',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import DevPanel from '../lib/DevPanel.svelte';

let content = '';

onMount(() => {
  content = localStorage.getItem('notepad') ?? '';
});

function save() {
  localStorage.setItem('notepad', content);
}
</script>

<DevPanel>
  <div class="dev-row"><span class="dev-key">Storage key</span><span class="dev-val">notepad</span></div>
  <div class="dev-row"><span class="dev-key">Characters</span><span class="dev-val">{content.length}</span></div>
  <div class="dev-row"><span class="dev-key">Lines</span><span class="dev-val">{content ? content.split('\n').length : 0}</span></div>
  <div class="dev-row"><span class="dev-key">Bytes (est.)</span><span class="dev-val">{new TextEncoder().encode(content).length}</span></div>
</DevPanel>

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
