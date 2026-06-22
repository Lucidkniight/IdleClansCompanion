<!--
  TOOL TEMPLATE
  =============
  Copy this file, rename it (without the leading underscore), and it will
  be picked up automatically by the app — no changes to App.svelte needed.
-->



<!-- ── Tool registration ───────────────────────────────────────────────────────
  This block runs at build time. Export toolMeta to register the tool.
  name  — display name shown in the Tools list and the section header
  desc  — short description shown under the name in the Tools list (also searched)
  icon  — emoji OR image path shown next to the name in the list
          · emoji:  icon: '🔧'
          · image:  icon: './skilltaskicons/MyIcon.png'
                         './itemicons/my_item.png'
          Place new image files in renderer/public 
  author — your name

<script context="module" lang="ts">
  export const toolMeta = {
    name: 'My Tool',
    desc: 'A short description of what this tool does',
    icon: '🔧',  // or e.g. './skilltaskicons/Combat.png'
    author: 'Lucid',  // 'Lucid' = official · anything else = shown under Community section
  };
</script>



<!-- ── Tool logic ──────────────────────────────────────────────────────────────
  Local state and logic goes here.
  The section header and back button are handled by App.svelte —
  your component only needs to render its own content.

  ┌────────────────────────────────────────────────────────────────────────┐
  │ STORES  ·  import { ... } from '../lib/store'                          │
  │         ·  prefix with $ to read reactively  (e.g. $allItems)          │
  ├──────────────────┬────────────────────────────┬────────────────────────┤
  │ allItems         │ MarketItem[]               │ {id, name} for every   │
  │                  │                            │ tradeable item         │
  │ priceCache       │ Record<number, PriceData>  │ {lowestSell,           │
  │                  │                            │ highestBuy} by item id │
  │ profitTasks      │ Task[]                     │ All skill tasks        │
  │ profitSkills     │ string[]                   │ Sorted skill names     │
  │ allEquipment     │ EquipmentItem[]            │ All equipment items    │
  │                  │                            │ (enchanted variants    │
  │                  │                            │  excluded)             │
  │ allMonsters      │ Monster[]                  │ All combat enemies and │
  │                  │                            │ bosses                 │
  │ enchantedToBase  │ Record<number, number>     │ Enchanted item ID →    │
  │                  │                            │ base item ID           │
  ├──────────────────┴────────────────────────────┴────────────────────────┤
  │ All stores are empty until loadGameConfig() is called.                 │
  │ Import types for TypeScript:  import { type Task, type MarketItem,     │
  │   type PriceData, type TaskCost, type EquipmentItem,                   │
  │   type Monster } from '../lib/store'                                   │
  ├────────────────────────────────────────────────────────────────────────┤
  │ UTILITY FUNCTIONS  ·  import { ... } from '../lib/store'               │
  ├──────────────────────┬──────────┬──────────────────────────────────────┤
  │ formatGold(n)        │ string   │ 1500→'1.5K'  2400000→'2.40M'  0→'—'  │
  │ formatTime(s)        │ string   │ 3661→'1h 1m'  45→'45s'  90061→'1d 1h'│
  │ formatItemName(s)    │ string   │ 'iron_ore' → 'Iron Ore'              │
  │ xpToLevel(xp)        │ number   │ total XP → level (1–120)             │
  ├──────────────────────┴──────────┴──────────────────────────────────────┤
  │ CONSTANTS  ·  import { ... } from '../lib/store'                       │
  ├──────────────────────┬──────────┬──────────────────────────────────────┤
  │ XP_TABLE             │ number[] │ XP_TABLE[n-1] = XP needed for lvl n  │
  │ GATHERING_SKILLS     │ string[] │ ['Woodcutting','Fishing','Mining',   │
  │                      │          │  'Foraging'] — have Gatherers bonus  │
  ├──────────────────────┴──────────┴──────────────────────────────────────┤
  │ DATA LOADING  ·  import { loadGameConfig } from '../lib/store'         │
  │                                                                        │
  │  loadGameConfig()  Populates stores, No-ops if already loaded. Call in │
  │                    onMount for any tool that uses stores.              │
  │                                                                        │
  │    onMount(async () => { await loadGameConfig(); });                   │
  ├────────────────────────────────────────────────────────────────────────┤
  │ CROSS-TOOL NAVIGATION                                                  │
  │                                                                        │
  │  Sending  ·  import { navigate } from '../lib/store'                   │
  │                                                                        │
  │    navigate('Tool Name', param)                                        │
  │      Switches to the Tools tab, opens the named tool, and delivers     │
  │      param to it. Works from any tool component.                       │
  │                                                                        │
  │      <button on:click={() => navigate('Player Lookup', username)}>     │
  │                                                                        │
  │  Receiving  ·  import { createNavListener } from '../lib/store'        │
  │                                                                        │
  │    Call createNavListener with this tool's exact name. It returns a    │
  │    readable store that emits the param string each time another tool   │
  │    navigates here, and null at all other times. Each navigation fires  │
  │    exactly once even if the component was already mounted.             │
  │                                                                        │
  │    const incomingNav = createNavListener('My Tool');                   │
  │    $: if ($incomingNav !== null) {                                     │
  │      myInput = $incomingNav;   // populate your input                  │
  │      fetchData();              // then trigger your search/fetch       │
  │    }                                                                   │
  └────────────────────────────────────────────────────────────────────────┘
-->
<script lang="ts">
  import { onMount } from 'svelte';
  // import { profitTasks, loadGameConfig, formatGold, type Task } from '../lib/store';

  let message = 'Hello from My Tool!';

  onMount(async () => {
    // If your tool uses stores:
    // await loadGameConfig();
  });
</script>



<!-- ── HTML ───────────────────────────────────────────────────────────────
  Render your tool content here.
  You do not need a wrapper div — your root elements render directly
  inside the scrollable .content area of the sidebar.
-->
<div class="container">
  <p class="message">{message}</p>
</div>



<!-- ── Styles ─────────────────────────────────────────────────────────────────

  Use CSS custom properties instead of hardcoded hex colours.
  The app supports several themes — variables automatically update when the user
  switches themes. All theme pallets can be viewed in the app.svelte file if needed.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ Hex values shown are dark theme defaults — they adapt per theme.        │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ BACKGROUND                                                              │
  │   var(--bg-deep)     #0c0d13   Deepest inset areas (detail panels)      │
  │   var(--bg-base)     #0e0f15   Main app background                      │
  │   var(--bg-card)     #13151f   Cards, inputs, rows                      │
  │   var(--bg-hover)    #161824   Hover state for interactive elements     │
  │   var(--bg-raised)   #1a1c2e   Slightly elevated surfaces               │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ BORDERS                                                                 │
  │   var(--border)      #1e2030   Standard border colour                   │
  │   var(--divider)     #1a1c28   Subtle separator lines                   │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ TEXT                                                                    │
  │   var(--text)        #c8cad4   Primary body text                        │
  │   var(--text-hi)     #d0d4e8   High-emphasis text (names, values)       │
  │   var(--text-sub)    #8890b0   Secondary / supporting text              │
  │   var(--text-muted)  #555870   De-emphasised labels                     │
  │   var(--text-dim)    #474d6d   Dimmed detail text                       │
  │   var(--text-faint)  #3a3f58   Placeholder and very muted text          │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ ACCENT                                                                  │
  │   var(--accent)      #e8b84b   Theme accent — active states, values     │
  │   var(--accent-lo)   @17%      Subtle borders / fills                   │
  │   var(--accent-md)   @33%      Focus rings, toggle bg                   │
  │   var(--accent-hi)   @53%      Active/selected borders                  │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ SEMANTIC                                                                │
  │   var(--pos)         #4ade80   Positive / profit                        │
  │   var(--neg)         #e05555   Negative / loss                          │
  │   var(--neutral)     #e8884a   Neutral / break-even (orange-yellow)     │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ TYPOGRAPHY                                                              │
  │   font-family: 'Nunito', sans-serif   — all UI text                     │
  │   font-family: 'Cinzel', serif        — headings / display text only    │
  └─────────────────────────────────────────────────────────────────────────┘
-->
<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    font-size: 12px;
    color: var(--text-sub);
  }
</style>
