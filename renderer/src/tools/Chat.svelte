<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Chat',
    desc: 'Live feed of in-game public chat channels',
    icon: './skilltaskicons/ChatboxIcon.png',
    author: 'Lucid',
  };
</script>

<script lang="ts">
  import { navigate, fetchProfile } from '../lib/store';
  import {
    chatAlerts, addChatAlert, removeChatAlert, triggeredChatAlerts,
    chatMessages, chatEnabledChannels, toggleChatChannel,
    chatLoading, chatRefreshing, chatError, refreshChat,
    CHAT_CHANNELS as CHANNELS, CHAT_CHANNEL_LABEL as CHANNEL_LABEL,
  } from '../lib/store';
  import DevPanel from '../lib/DevPanel.svelte';

  // ── Word alerts ───────────────────────────────────────────────────────────────
  let alertPhraseInput = '';

  function submitAlertPhrase() {
    const trimmed = alertPhraseInput.trim();
    if (!trimmed) return;
    addChatAlert(trimmed);
    alertPhraseInput = '';
  }

  function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // Chat only gives us a short clan tag, not the full clan name the Clan tool needs to
  // search by — so resolve it via the sender's own profile instead of the tag itself.
  let clanLookupPending: string | null = null;

  async function viewClanForSender(sender: string) {
    if (clanLookupPending) return;
    clanLookupPending = sender;
    try {
      const profile = await fetchProfile(sender);
      if (profile?.guildName) navigate('Clan', profile.guildName);
    } finally {
      clanLookupPending = null;
    }
  }

  $: visibleMessages = $chatMessages.filter(m => $chatEnabledChannels.has(m.channel));
</script>

<DevPanel>
  <div class="dev-row"><span class="dev-key">Messages loaded</span><span class="dev-val">{$chatMessages.length}</span></div>
  <div class="dev-row"><span class="dev-key">Visible</span><span class="dev-val">{visibleMessages.length}</span></div>
  <div class="dev-row"><span class="dev-key">Channels enabled</span><span class="dev-val">{[...$chatEnabledChannels].join(', ') || 'none'}</span></div>
  <div class="dev-row"><span class="dev-key">Word alerts</span><span class="dev-val">{$chatAlerts.length} watched · {$triggeredChatAlerts.length} triggered</span></div>
  <div class="dev-sep"></div>
  <div class="dev-row"><span class="dev-key">Chat API</span><span class="dev-val">/api/Chat/recent</span></div>
  <div class="dev-row"><span class="dev-key">Polling</span><span class="dev-val">background (store-level, runs even when tool is closed)</span></div>
</DevPanel>

<div class="channel-row">
  {#each CHANNELS as ch}
    <button class="channel-chip" class:active={$chatEnabledChannels.has(ch.id)} on:click={() => toggleChatChannel(ch.id)}>
      {ch.label}
    </button>
  {/each}
</div>

<div class="alert-section">
  <div class="alert-form">
    <input
      class="alert-input"
      placeholder="Watch for a word or phrase…"
      bind:value={alertPhraseInput}
      on:keydown={(e) => e.key === 'Enter' && submitAlertPhrase()}
    />
    <button class="alert-add-btn" disabled={!alertPhraseInput.trim()} on:click={submitAlertPhrase}>+</button>
  </div>
  {#if $chatAlerts.length > 0}
    <div class="alert-chip-row">
      {#each $chatAlerts as rule (rule.id)}
        <span class="alert-chip">
          {rule.phrase}
          <button class="alert-chip-remove" on:click={() => removeChatAlert(rule.id)} title="Remove alert">✕</button>
        </span>
      {/each}
    </div>
  {/if}
</div>

{#if $chatLoading}
  <div class="state-box">
    <span class="spinner">⟳</span>
    <span class="state-text">Loading chat…</span>
  </div>
{:else if $chatError}
  <div class="state-box">
    <span class="state-icon">⚠</span>
    <span class="state-text">Could not load chat.</span>
    <button class="retry-btn" on:click={refreshChat}>Retry</button>
  </div>
{:else}
  <div class="refresh-row">
    <span class="count">{visibleMessages.length} message{visibleMessages.length !== 1 ? 's' : ''}{$chatRefreshing ? ' · refreshing…' : ''}</span>
    <button class="refresh-btn" on:click={refreshChat} title="Refresh">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Refresh
    </button>
  </div>

  {#if visibleMessages.length === 0}
    <div class="empty-state">
      <div class="empty-icon">💬</div>
      <p>No messages in the selected channels yet.</p>
    </div>
  {:else}
    <div class="chat-list">
      {#each visibleMessages as m (m.channel + '|' + m.sender + '|' + m.timestamp)}
        <div class="chat-row">
          <div class="chat-meta">
            <span class="chat-channel">{CHANNEL_LABEL[m.channel] ?? m.channel}</span>
            {#if m.clanTag}
              <button
                class="chat-clan"
                disabled={clanLookupPending === m.sender}
                on:click={() => viewClanForSender(m.sender)}
                title="View {m.sender}'s clan"
              >[{m.clanTag}]{clanLookupPending === m.sender ? '…' : ''}</button>
            {/if}
            <button class="chat-sender" class:mod={m.isModerator} on:click={() => navigate('Player Lookup', m.sender)} title="View player">{m.sender}</button>
            {#if m.isModerator}<img class="badge" src="./skilltaskicons/Moderator.png" alt="" title="Moderator" />{/if}
            {#if m.gilded}<img class="badge" src="./skilltaskicons/Prestige.png" alt="" title="Gilded" />{/if}
            {#if m.premium}<img class="badge" src="./skilltaskicons/Premium_permanent.png" alt="" title="Premium" />{/if}
            <span class="chat-time">{timeAgo(m.timestamp)}</span>
          </div>
          <div class="chat-text">{m.text}</div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  /* ── Channel filter ── */
  .channel-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
  .channel-chip {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-faint);
    font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 5px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
  }
  .channel-chip:hover { border-color: var(--accent-md); color: var(--text-sub); }
  .channel-chip.active { border-color: var(--accent-hi); color: var(--accent); background: var(--accent-lo); }

  /* ── Word alerts ── */
  .alert-section { margin-bottom: 10px; }
  .alert-form { display: flex; gap: 6px; }
  .alert-input {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text); font-size: 11px; padding: 6px 9px;
    font-family: 'Nunito', sans-serif; min-width: 0;
  }
  .alert-input:focus { outline: none; border-color: var(--accent-md); }
  .alert-add-btn {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px;
    color: var(--accent); font-size: 15px; padding: 0 12px; cursor: pointer;
    font-family: 'Nunito', sans-serif; flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .alert-add-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent-md); }
  .alert-add-btn:disabled { opacity: 0.4; cursor: default; }

  .alert-chip-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .alert-chip {
    display: inline-flex; align-items: center; gap: 5px;
    background: var(--accent-lo); border: 1px solid var(--accent-md); color: var(--accent);
    font-size: 10px; font-weight: 700; padding: 3px 4px 3px 9px; border-radius: 5px;
  }
  .alert-chip-remove {
    background: none; border: none; padding: 0 2px; color: var(--accent); opacity: 0.7;
    font-size: 9px; cursor: pointer; font-family: 'Nunito', sans-serif; width: auto;
    transition: opacity 0.1s;
  }
  .alert-chip-remove:hover { opacity: 1; }

  /* ── Loading / error / empty states ── */
  .state-box {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 40px 12px; text-align: center;
  }
  .spinner {
    font-size: 20px; color: var(--text-faint);
    display: inline-block; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .state-icon { font-size: 20px; color: var(--text-faint); }
  .state-text { font-size: 11px; color: var(--text-faint); }
  .retry-btn {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-sub); font-size: 11px; font-weight: 700;
    padding: 5px 14px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .retry-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .empty-state {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 32px 12px; text-align: center;
  }
  .empty-icon { font-size: 26px; opacity: 0.3; }
  .empty-state p { font-size: 11px; color: var(--text-faint); margin: 0; }

  /* ── Top row ── */
  .refresh-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .count { font-size: 10px; color: var(--text-faint); }
  .refresh-btn {
    display: inline-flex; align-items: center; gap: 4px;
    background: none; border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-faint); font-size: 10px; font-weight: 700;
    padding: 3px 8px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .refresh-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  /* ── Chat list ── */
  .chat-list { display: flex; flex-direction: column; gap: 2px; }

  .chat-row {
    padding: 6px 8px; border-radius: 6px; transition: background 0.1s;
  }
  .chat-row:hover { background: var(--bg-card); }

  .chat-meta {
    display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
    margin-bottom: 2px;
  }
  .chat-channel {
    font-size: 8px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;
    color: var(--text-faint); background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 3px; padding: 1px 4px;
  }
  .chat-clan, .chat-sender {
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: 'Nunito', sans-serif; transition: color 0.1s; width: auto;
  }
  .chat-clan { font-size: 10px; font-weight: 700; color: var(--text-dim); }
  .chat-clan:hover:not(:disabled) { color: var(--accent); }
  .chat-clan:disabled { cursor: default; opacity: 0.6; }
  .chat-sender { font-size: 11px; font-weight: 700; color: var(--text-hi); }
  .chat-sender:hover { color: var(--accent); }
  .chat-sender.mod { color: var(--accent); }
  .badge { width: 12px; height: 12px; object-fit: contain; flex-shrink: 0; }
  .chat-time { font-size: 9px; color: var(--text-faint); margin-left: auto; white-space: nowrap; }

  .chat-text { font-size: 11px; color: var(--text-sub); line-height: 1.5; word-break: break-word; }
</style>
