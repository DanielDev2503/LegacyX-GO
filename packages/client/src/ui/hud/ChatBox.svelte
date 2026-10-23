<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte';
  import { soundFX } from '../../audio/SoundFX.js';

  let {
    onSendChat = (_text: string) => {}
  }: {
    onSendChat?: (text: string) => void;
  } = $props();

  let chatInput = $state('');
  let inputRef = $state<HTMLInputElement | null>(null);
  let messagesRef = $state<HTMLDivElement | null>(null);

  $effect(() => {
    // Auto-scroll when messages change
    const count = gameUI.chatMessages.length;
    if (count >= 0 && messagesRef) {
      messagesRef.scrollTop = messagesRef.scrollHeight;
    }
  });

  function sendChat() {
    const text = chatInput.trim();
    if (text.length > 0) {
      if (gameUI.onChatSent) {
        gameUI.onChatSent(text);
      } else {
        onSendChat(text);
      }
    }
    chatInput = '';
    gameUI.isChatFocused = false;
    inputRef?.blur();
  }

  function handleInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      sendChat();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      chatInput = '';
      gameUI.isChatFocused = false;
      inputRef?.blur();
    }
  }

  export function focusInput() {
    inputRef?.focus();
  }
</script>

<aside
  id="chat-container"
  class="chat-dock"
  style={`height: ${gameUI.chatHeight}px;`}
>
  <div id="chat-messages" class="chat-history" bind:this={messagesRef}>
    {#each gameUI.chatMessages as msg (msg.id)}
      {#if msg.isSystem || msg.senderTeam === 'system'}
        <div class="chat-line chat-msg chat-msg--system">{msg.text}</div>
      {:else}
        <div class="chat-line chat-msg">
          <span class="sender font-bold {msg.senderTeam ?? 'spectator'}">{msg.sender}:</span>
          <span class="msg-body">{msg.text}</span>
        </div>
      {/if}
    {/each}
  </div>

  <form
    id="chat-form"
    class="chat-input-row"
    onsubmit={(e) => {
      e.preventDefault();
      sendChat();
    }}
  >
    <input
      id="chat-input"
      bind:this={inputRef}
      type="text"
      bind:value={chatInput}
      maxlength="140"
      placeholder="Presiona Enter para chatear (/pause, /reset, /kick)..."
      onfocus={() => (gameUI.isChatFocused = true)}
      onblur={() => (gameUI.isChatFocused = false)}
      onkeydown={handleInputKeyDown}
    />
    <button type="submit">Enviar</button>
  </form>
</aside>

<style>
  .chat-dock {
    width: min(440px, 55vw);
    min-height: 64px;
    background: rgba(10, 16, 26, 0.92);
    border: 1px solid rgba(0, 229, 255, 0.28);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(0, 229, 255, 0.12);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    pointer-events: auto;
    box-sizing: border-box;
    font-family: 'Chivo', system-ui, sans-serif;
  }

  .chat-history {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    font-size: 0.78rem;
    padding-right: 0.25rem;
  }

  .chat-line {
    color: #e2e8f0;
    line-height: 1.32;
    word-break: break-word;
  }

  .chat-msg--system {
    color: #facc15;
    font-weight: 600;
  }

  .sender {
    font-weight: 800;
    margin-right: 0.35rem;
  }

  .sender.red {
    color: #ff4757;
  }

  .sender.blue {
    color: #00e5ff;
  }

  .sender.spectator {
    color: #94a3b8;
  }

  .chat-input-row {
    display: flex;
    gap: 0.4rem;
  }

  input {
    flex: 1;
    background: rgba(2, 6, 23, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 7px;
    padding: 0.38rem 0.6rem;
    color: #f8fafc;
    font-size: 0.78rem;
  }

  input:focus {
    outline: none;
    border-color: #00e5ff;
  }

  button {
    padding: 0.38rem 0.75rem;
    border-radius: 7px;
    border: none;
    background: #0284c7;
    color: #fff;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
