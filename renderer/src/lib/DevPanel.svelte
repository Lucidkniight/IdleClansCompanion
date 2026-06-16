<script lang="ts">
  import { devMode } from './store';
</script>

{#if $devMode}
  <div class="dev-panel">
    <span class="dev-badge">DEV</span>
    <slot />
  </div>
{/if}

<style>
  .dev-panel {
    background: rgba(255, 130, 40, 0.06);
    border: 1px solid rgba(255, 130, 40, 0.28);
    border-radius: 6px;
    padding: 7px 10px 8px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .dev-badge {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: rgba(255, 130, 40, 0.9);
    background: rgba(255, 130, 40, 0.12);
    border: 1px solid rgba(255, 130, 40, 0.3);
    border-radius: 3px;
    padding: 1px 5px;
    align-self: flex-start;
    margin-bottom: 4px;
  }

  :global(.dev-row) {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 10px;
  }

  :global(.dev-key) {
    font-family: monospace;
    font-size: 9px;
    color: rgba(255, 130, 40, 0.75);
    flex-shrink: 0;
    white-space: nowrap;
  }

  :global(.dev-val) {
    font-family: monospace;
    font-size: 9px;
    color: #c8cad4;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.dev-sep) {
    height: 1px;
    background: rgba(255, 130, 40, 0.15);
    margin: 3px 0;
  }
</style>
