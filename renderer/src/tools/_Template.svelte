<!--
  TOOL TEMPLATE
  =============
  Copy this file, rename it (without the leading underscore), and it will
  be picked up automatically by the app — no changes to App.svelte needed.

  Naming convention:
    - Files starting with _ are ignored by the app (use for drafts / this template)
    - All other .svelte files in this folder are auto-discovered and listed in the Tools tab
-->

<!-- ── Tool registration ───────────────────────────────────────────────────────
  This block runs at build time. Export toolMeta to register the tool.
  name  — display name shown in the Tools list and the section header
  desc  — short description shown under the name in the Tools list (also searched)
  icon  — emoji shown next to the name in the list
-->
<script context="module" lang="ts">
  export const toolMeta = {
    name: 'My Tool',
    desc: 'A short description of what this tool does',
    icon: '🔧',
  };
</script>

<!-- ── Tool logic ──────────────────────────────────────────────────────────────
  Local state and logic goes here.

  To use shared game data, import from the store:
    import { allItems, priceCache, profitTasks, profitSkills } from '../lib/store';

  To use shared utilities, import from the store:
    import { formatGold, formatTime, formatItemName, xpToLevel, XP_TABLE } from '../lib/store';

  To load game data (tasks + prices) if not already loaded:
    import { loadGameConfig } from '../lib/store';
    import { onMount } from 'svelte';
    onMount(async () => {
      await loadGameConfig();
    });

  The section header and back button are handled by App.svelte —
  your component only needs to render its own content.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let message = 'Hello from My Tool!';

  onMount(() => {
    // Initialise your tool here
  });
</script>

<!-- ── Template ───────────────────────────────────────────────────────────────
  Render your tool content here.
  You do not need a wrapper div — your root elements render directly
  inside the scrollable .content area of the sidebar.
-->
<div class="container">
  <p class="message">{message}</p>
</div>

<!-- ── Styles ─────────────────────────────────────────────────────────────────
  Styles are scoped to this component by default — no need to worry about
  clashing with other tools or the base app.

  Shared colour tokens used across the app:
    Background:   #0e0f15 (app), #13151f (cards/inputs), #0c0d13 (deep)
    Border:       #1e2030
    Text:         #c8cad4 (primary), #8890b0 (secondary), #555870 (muted), #3a3f58 (faint)
    Accent:       #e8b84b (gold)
    Positive:     #4ade80 (green)
    Negative:     #e05555 (red)
    Font:         'Nunito', sans-serif (UI), 'Cinzel', serif (headings)
-->
<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    font-size: 12px;
    color: #8890b0;
  }
</style>
