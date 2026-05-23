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
    background: #13151f;
    border: 1px solid #1e2030;
    border-radius: 6px;
    color: #c8cad4;
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    line-height: 1.6;
    padding: 10px;
    resize: none;
    outline: none;
    scrollbar-width: thin;
    scrollbar-color: #1e2030 transparent;
  }
  .notepad:focus { border-color: #e8b84b55; }
  .notepad::placeholder { color: #3a3f58; }
</style>
