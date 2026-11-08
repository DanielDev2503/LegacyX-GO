<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte';
  import { soundFX } from '../../audio/SoundFX.js';
  import {
    applyMentionCandidate,
    findActiveMentionToken,
    getMentionCandidates,
    segmentChatMentions
  } from '../utils/chatMentions.js';

  let {
    onSendChat = (_text: string) => {}
  }: {
    onSendChat?: (text: string) => void;
  } = $props();

  let chatInput = $state('');
  let chatCursor = $state(0);
  let mentionIndex = $state(0);
  let inputRef = $state<HTMLInputElement | null>(null);
  let messagesRef = $state<HTMLDivElement | null>(null);

  let knownRosterNames = $derived(gameUI.rosterPlayers.map((p) => p.name));

  let activeMentionToken = $derived(
    gameUI.isChatFocused ? findActiveMentionToken(chatInput, chatCursor) : null
  );

  let mentionCandidates = $derived(
    activeMentionToken ? getMentionCandidates(activeMentionToken.query, gameUI.rosterPlayers) : []
  );

  let isMentionMenuOpen = $derived(
    Boolean(gameUI.isChatFocused && activeMentionToken && mentionCandidates.length > 0)
  );

  $effect(() => {
    const total = mentionCandidates.length;
    if (total === 0 || mentionIndex >= total) {
      mentionIndex = 0;
    }
  });

  $effect(() => {
    const count = gameUI.chatMessages.length;
    if (count >= 0 && messagesRef) {
      messagesRef.scrollTop = messagesRef.scrollHeight;
    }
  });

  function syncCursor() {
    chatCursor = inputRef?.selectionStart ?? chatInput.length;
  }

  function selectMention(index: number) {
    const candidate = mentionCandidates[index];
    if (!candidate || !activeMentionToken) return;
    soundFX.playUIClick();
    const { nextText, nextCursor } = applyMentionCandidate(
      chatInput,
      activeMentionToken,
      candidate.handle
    );
    chatInput = nextText;
    chatCursor = nextCursor;
    mentionIndex = 0;
    queueMicrotask(() => {
      if (inputRef) {
        inputRef.focus();
        inputRef.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  $effect(() => {
    const handleGlobalCaptureKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        const activeEl = document.activeElement;
        if (activeEl === inputRef) {
          return;
        }
        const isOtherInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (isOtherInput) {
          return;
        }
        if (
          activeEl &&
          (activeEl.tagName === 'BUTTON' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.getAttribute('role') === 'button')
        ) {
          (activeEl as HTMLElement).blur();
        }

        const modal = gameUI.activeModal;
        const isAllowedModal =
          modal === 'NONE' ||
          modal === 'TEAM_MANAGEMENT' ||
          modal === 'TEAM_SELECT' ||
          modal === 'teamSelect' ||
          modal === 'STATS' ||
          modal === 'stats';
        const isAllowedSlide = gameUI.activeSlide === 'STATS' || gameUI.activeSlide === 'MENU';

        if (isAllowedModal || isAllowedSlide) {
          e.preventDefault();
          e.stopPropagation();
          inputRef?.focus();
          gameUI.isChatFocused = true;
          syncCursor();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalCaptureKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalCaptureKeydown, true);
    };
  });

  function sendChat() {
    const text = chatInput.trim();
    if (text.length > 0) {
      if (gameUI.handleChatCommand(text)) {
        chatInput = '';
        chatCursor = 0;
        gameUI.isChatFocused = false;
        inputRef?.blur();
        return;
      }
      if (gameUI.onChatSent) {
        gameUI.onChatSent(text);
      } else {
        onSendChat(text);
      }
    }
    chatInput = '';
    chatCursor = 0;
    gameUI.isChatFocused = false;
    inputRef?.blur();
  }

  function handleInputKeyDown(e: KeyboardEvent) {
    if (isMentionMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        mentionIndex = (mentionIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        selectMention(mentionIndex);
        return;
      }
    }

    if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      sendChat();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      chatInput = '';
      chatCursor = 0;
      gameUI.isChatFocused = false;
      inputRef?.blur();
    }
  }

  export function focusInput() {
    inputRef?.focus();
    gameUI.isChatFocused = true;
    syncCursor();
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
          <span class="msg-body">
            {#each segmentChatMentions(msg.text, gameUI.nickname, knownRosterNames) as seg}
              {#if seg.kind === 'mention'}
                <span class="mention-pill" class:is-self={seg.isSelf}>{seg.value}</span>
              {:else}
                {seg.value}
              {/if}
            {/each}
          </span>
        </div>
      {/if}
    {/each}
  </div>

  {#if isMentionMenuOpen}
    <div class="mention-popup" role="listbox" aria-label="Autocompletar mención">
      {#each mentionCandidates as candidate, idx (candidate.handle)}
        <button
          type="button"
          role="option"
          aria-selected={idx === mentionIndex}
          class="mention-option"
          class:is-active={idx === mentionIndex}
          onmousedown={(e) => {
            e.preventDefault();
            selectMention(idx);
          }}
        >
          <span class="mention-handle">@{candidate.handle}</span>
          <span class="mention-team">{candidate.handle === 'all' ? 'Todos' : candidate.team.toUpperCase()}</span>
        </button>
      {/each}
    </div>
  {/if}

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
      placeholder="Presiona Enter para chatear (@usuario, @all, /pause)..."
      oninput={syncCursor}
      onclick={syncCursor}
      onkeyup={syncCursor}
      onfocus={() => {
        gameUI.isChatFocused = true;
        syncCursor();
      }}
      onblur={() => (gameUI.isChatFocused = false)}
      onkeydown={handleInputKeyDown}
    />
    <button type="submit">Enviar</button>
  </form>
</aside>

<style>
  .chat-dock {
    position: relative;
    width: min(440px, 55vw);
    min-height: 64px;
    background: #0a101a;
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
    animation: chatLineIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes chatLineIn {
    0% {
      opacity: 0;
      transform: translateY(6px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
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

  .mention-pill {
    display: inline-block;
    padding: 0.02rem 0.3rem;
    border-radius: 4px;
    background: rgba(0, 229, 255, 0.14);
    border: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .mention-pill.is-self {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    color: #ffd700;
  }

  .mention-popup {
    position: absolute;
    left: 0.65rem;
    right: 0.65rem;
    bottom: 2.8rem;
    z-index: 40;
    max-height: 160px;
    overflow-y: auto;
    background: #0b1322;
    border: 1px solid rgba(0, 229, 255, 0.45);
    border-radius: 6px;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .mention-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.32rem 0.5rem;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: #cbd5e1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.73rem;
    cursor: pointer;
  }

  .mention-option:hover,
  .mention-option.is-active {
    background: rgba(0, 229, 255, 0.18);
    color: #ffffff;
  }

  .mention-handle {
    font-weight: 800;
    color: #00e5ff;
  }

  .mention-team {
    font-size: 0.65rem;
    color: #94a3b8;
  }

  .chat-input-row {
    display: flex;
    gap: 0.4rem;
  }

  input {
    flex: 1;
    background: #060b16;
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

  button[type='submit'] {
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
