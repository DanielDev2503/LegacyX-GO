<script lang="ts">
  import { gameUI, type ChatEntry } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let chatMessage = $state('');
  let isChatInputActive = $state(false);
  let chatInputEl = $state<HTMLInputElement | null>(null);
  let chatScrollEl = $state<HTMLDivElement | null>(null);
  let telemetryEl = $state<HTMLElement | null>(null);
  let telemetryWidth = $state(140);
  let isResizingChat = $state(false);

  let pingColorClass = $derived(
    gameUI.pingMs < 60 ? 'text-emerald' : gameUI.pingMs <= 120 ? 'text-amber' : 'text-crimson'
  );

  // Colores de equipación del capitán (o de equipo)
  let redCaptain = $derived(gameUI.players.find((p) => p.team === 'red'));
  let blueCaptain = $derived(gameUI.players.find((p) => p.team === 'blue'));

  let redKitPrimary = $derived(
    redCaptain?.kit?.primaryColor || gameUI.redTeamKit?.primaryColor || '#e74c3c'
  );
  let redKitSecondary = $derived(
    redCaptain?.kit?.secondaryColor || gameUI.redTeamKit?.secondaryColor || '#e74c3c'
  );
  let redKitTertiary = $derived(
    redCaptain?.kit?.tertiaryColor || gameUI.redTeamKit?.tertiaryColor || '#ffffff'
  );

  let blueKitPrimary = $derived(
    blueCaptain?.kit?.primaryColor || gameUI.blueTeamKit?.primaryColor || '#3498db'
  );
  let blueKitSecondary = $derived(
    blueCaptain?.kit?.secondaryColor || gameUI.blueTeamKit?.secondaryColor || '#3498db'
  );
  let blueKitTertiary = $derived(
    blueCaptain?.kit?.tertiaryColor || gameUI.blueTeamKit?.tertiaryColor || '#ffffff'
  );

  // Ancho dinámico del minimapa (0px si está desactivado)
  let minimapWidth = $derived.by(() => {
    if (!gameUI.settings.minimapEnabled) return 0;
    const sz = gameUI.settings.minimapSize;
    const base = sz === 'small' || sz === 160 ? 160 : (sz === 'large' || sz === 240 ? 240 : 200);
    return base + 16;
  });

  // Medición reactiva del ancho de la tarjeta de telemetría
  $effect(() => {
    if (!telemetryEl) return;
    const updateWidth = () => {
      if (telemetryEl) {
        telemetryWidth = Math.round(telemetryEl.offsetWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(telemetryEl);
      return () => observer.disconnect();
    }
  });

  // Sincronización de variables CSS en el root
  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--chat-height', `${gameUI.chatHeight}px`);
      document.documentElement.style.setProperty('--top-banner-height', '48px');
      document.documentElement.style.setProperty('--telemetry-width', `${telemetryWidth}px`);
      document.documentElement.style.setProperty('--minimap-width', `${minimapWidth}px`);
    }
  });

  // Auto-scroll del chat con nuevos mensajes
  $effect(() => {
    const len = gameUI.chatMessages.length;
    if (len >= 0 && chatScrollEl) {
      chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
    }
  });

  function handleSendChat() {
    if (!chatMessage.trim()) {
      isChatInputActive = false;
      return;
    }
    soundFX.playUIClick();
    const newMsg: ChatEntry = {
      id: Date.now(),
      team: (gameUI.myTeam === 'red' ? 'RED' : gameUI.myTeam === 'blue' ? 'BLUE' : 'SPEC'),
      sender: gameUI.nickname || 'Player',
      isHost: gameUI.isHost,
      text: chatMessage.trim()
    };
    gameUI.chatMessages.push(newMsg);
    if (gameUI.onChatSent) {
      gameUI.onChatSent(chatMessage.trim());
    }
    chatMessage = '';
    isChatInputActive = false;
    chatInputEl?.blur();
  }

  function handleChatKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendChat();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isChatInputActive = false;
      chatInputEl?.blur();
    }
  }

  function focusChat() {
    isChatInputActive = true;
    setTimeout(() => {
      chatInputEl?.focus();
    }, 50);
  }

  function toggleAudio() {
    soundFX.playUIClick();
    gameUI.toggleMute();
  }

  function toggleRoomMenu() {
    soundFX.playUIClick();
    if (gameUI.activeModal === 'TEAM_MANAGEMENT' || gameUI.activeModal === 'teamSelect') {
      gameUI.closeOverlay();
    } else {
      gameUI.openOverlay('TEAM_MANAGEMENT');
    }
  }

  function openSettings() {
    soundFX.playUIClick();
    gameUI.openOverlay('SETTINGS');
  }

  function handleResizePointerDown(e: PointerEvent) {
    e.preventDefault();
    isResizingChat = true;
    const startY = e.clientY;
    const startH = gameUI.chatHeight;

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isResizingChat) return;
      // Arrastrar hacia arriba disminuye clientY y debe AUMENTAR la altura del chat
      const deltaY = startY - moveEv.clientY;
      const nextH = Math.max(100, Math.min(450, startH + deltaY));
      gameUI.chatHeight = nextH;
    };

    const onPointerUp = () => {
      isResizingChat = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    // Si presiona Enter y no está escribiendo en otro input, activa el chat del HUD
    if (e.key === 'Enter' && !isChatInputActive) {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (!isInputFocused && gameUI.activeModal === 'NONE') {
        e.preventDefault();
        focusChat();
      }
    }
  }}
/>

<div class="hud-root">
  <!-- ========================================== -->
  <!-- 1. TOP BAR: 3 CÁPSULAS FLOTANTES           -->
  <!-- ========================================== -->
  <div class="top-bar-container">
    <!-- A) Cartucho Izquierdo: Únicamente Nombre de Sala -->
    <div class="top-card top-card-left">
      <div class="room-title-block">
        <span class="pulse-dot"></span>
        <h1 class="room-title">
          {gameUI.activeRoomName || 'TORNEO NOCTURNO #12'}
        </h1>
      </div>
    </div>

    <!-- B) Cartucho Central: Marcador y Reloj -->
    <div class="top-card top-card-center">
      <div class="scoreboard-main-row">
        <!-- Bloque RED -->
        <div class="team-score-block red-team">
          <span
            class="team-tag-badge red-badge"
            style="
              background: linear-gradient(90deg, {redKitPrimary} 50%, {redKitSecondary} 50%);
              border-color: {redKitTertiary};
              color: {redKitTertiary};
            "
          >
            {gameUI.redTeamKit?.tag || 'RED'}
          </span>
          <span class="team-score-number" id="hud-score-red">{gameUI.redScore}</span>
        </div>

        <!-- Reloj Central -->
        <div class="timer-center-block">
          <span class="timer-glyph">⏱</span>
          <span class="timer-clock" id="hud-timer">{gameUI.matchTimeFormatted}</span>
          {#if gameUI.isGoldenGoal}
            <span class="golden-goal-chip">GOL DE ORO</span>
          {/if}
        </div>

        <!-- Bloque BLUE -->
        <div class="team-score-block blue-team">
          <span class="team-score-number" id="hud-score-blue">{gameUI.blueScore}</span>
          <span
            class="team-tag-badge blue-badge"
            style="
              background: linear-gradient(90deg, {blueKitPrimary} 50%, {blueKitSecondary} 50%);
              border-color: {blueKitTertiary};
              color: {blueKitTertiary};
            "
          >
            {gameUI.blueTeamKit?.tag || 'BLUE'}
          </span>
        </div>
      </div>
    </div>

    <!-- C) Cartucho Derecho: 3 Botones de Acción Cyber-Pitch -->
    <div class="top-card top-card-right">
      <!-- 1. Silenciar / Audio Toggle -->
      <button
        type="button"
        id="btn-audio-toggle"
        class="hud-action-btn"
        class:is-muted={gameUI.isAudioMuted}
        title={gameUI.isAudioMuted ? 'Activar Sonido' : 'Silenciar Todo'}
        aria-label="Audio / Silenciar"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={toggleAudio}
      >
        {#if gameUI.isAudioMuted}
          <svg class="hud-btn-svg text-crimson" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        {:else}
          <svg class="hud-btn-svg text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        {/if}
      </button>

      <!-- 2. Menú de Sala Toggle [Esc] -->
      <button
        type="button"
        id="btn-menu-toggle"
        class="hud-action-btn menu-toggle-btn"
        title="Menú de Sala [Esc]"
        aria-label="Menú de Sala"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={toggleRoomMenu}
      >
        <svg class="hud-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <!-- 3. Ajustes Generales [⚙] -->
      <button
        type="button"
        class="hud-action-btn"
        title="Ajustes Generales"
        aria-label="Ajustes"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={openSettings}
      >
        <svg class="hud-btn-svg text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
    </div>
  </div>

  <!-- ========================================== -->
  <!-- 2. TELEMETRÍA EN VIVO (ESQUINA INFERIOR IZQ)-->
  <!-- ========================================== -->
  <div class="hud-telemetry-corner" bind:this={telemetryEl}>
    <span class="tel-pulse-dot"></span>
    <span class="tel-label">Ping:</span>
    <span class="tel-val {pingColorClass}">{gameUI.pingMs} ms</span>
    <span class="tel-sep">|</span>
    <span class="tel-label">FPS:</span>
    <span class="tel-val text-cyan">{gameUI.fps}</span>
  </div>

  <!-- ========================================== -->
  <!-- 3. CHAT TÁCTICO FLOTANTE (ADAPTATIVO)      -->
  <!-- ========================================== -->
  <div
    class="hud-chat-container"
    style="--chat-opacity: {gameUI.settings.chatOpacity ?? 0.95};"
  >
    <!-- Tirador superior de redimensionamiento vertical -->
    <div
      class="chat-resize-handle"
      role="slider"
      aria-label="Ajustar altura del chat"
      aria-valuenow={gameUI.chatHeight}
      aria-valuemin={100}
      aria-valuemax={450}
      aria-orientation="vertical"
      tabindex="0"
      onpointerdown={handleResizePointerDown}
      onkeydown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          gameUI.chatHeight = Math.min(450, gameUI.chatHeight + 10);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          gameUI.chatHeight = Math.max(100, gameUI.chatHeight - 10);
        }
      }}
      title="Arrastra para ajustar la altura del chat"
    >
      <span class="resize-handle-bar"></span>
    </div>

    <div class="chat-messages-scroll custom-scrollbar" bind:this={chatScrollEl}>
      {#if gameUI.chatMessages.length === 0}
        <div class="chat-empty-state">
          <span class="chat-empty-hint">Sala iniciada. Presiona Enter para escribir...</span>
        </div>
      {:else}
        {#each gameUI.chatMessages as msg (msg.id)}
          <div class="chat-line">
            <span class="chat-sender {msg.team.toLowerCase()}">
              {#if msg.isHost}👑{/if} [{msg.team}] {msg.sender}:
            </span>
            <span class="chat-text">{msg.text}</span>
          </div>
        {/each}
      {/if}
    </div>

    <div class="chat-input-bar">
      <input
        bind:this={chatInputEl}
        type="text"
        class="chat-text-input"
        placeholder="Presiona Enter para escribir..."
        bind:value={chatMessage}
        onkeydown={handleChatKeyDown}
        onfocus={() => { isChatInputActive = true; }}
        onblur={() => { isChatInputActive = false; }}
      />
      <button
        type="button"
        class="chat-send-trigger"
        aria-label="Enviar Mensaje"
        onclick={handleSendChat}
      >
        <span>ENVIAR</span>
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  :root {
    --chat-height: 160px;
    --top-banner-height: 48px;
    --telemetry-width: 140px;
    --minimap-width: 220px;
  }

  .hud-root {
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
    overflow: hidden;
  }

  /* TOP BAR */
  .top-bar-container {
    position: fixed;
    top: 0.5rem;
    left: 1.5rem;
    right: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 100;
    pointer-events: none;
  }

  .top-card {
    pointer-events: auto;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.75rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  /* Cartucho Izquierdo */
  .top-card-left {
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .room-title-block {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pulse-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
    animation: pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.85); }
  }

  .room-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
    text-transform: uppercase;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .tel-label {
    color: #bac9cc;
    font-weight: 500;
  }

  .tel-val {
    font-weight: 700;
  }

  .text-emerald { color: #2ecc71; }
  .text-amber { color: #ffdb3c; }
  .text-crimson { color: #ff3366; }
  .text-cyan { color: #00e5ff; }

  /* Cartucho Central */
  .top-card-center {
    position: fixed;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.45rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    min-width: 290px;
    z-index: 101;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.18), 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .scoreboard-main-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    width: 100%;
  }

  .team-score-block {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.65rem;
    border-radius: 0.5rem;
  }

  .team-score-block.red-team {
    background: rgba(255, 51, 102, 0.12);
    border: 1px solid rgba(255, 51, 102, 0.35);
  }

  .team-score-block.blue-team {
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  .team-tag-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem 0.55rem;
    border-radius: 0.35rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    border-width: 1px;
    border-style: solid;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.85);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    user-select: none;
    line-height: 1.2;
    transition: all 0.2s ease;
  }

  .red-team .team-score-number {
    color: #ff3366;
  }

  .blue-team .team-score-number {
    color: #00e5ff;
  }

  .team-score-number {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.25rem;
    font-weight: 900;
    min-width: 20px;
    text-align: center;
  }

  .timer-center-block {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.6);
    padding: 0.25rem 0.65rem;
    border-radius: 0.375rem;
  }

  .timer-glyph {
    color: #ffb703;
    font-size: 0.85rem;
  }

  .timer-clock {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    font-weight: 800;
    color: #ffb703;
    letter-spacing: 0.08em;
  }

  .golden-goal-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 800;
    background: rgba(255, 215, 0, 0.2);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.5);
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    animation: pulseGlow 1.5s infinite;
  }

  /* Cartucho Derecho (3 Botones) */
  .top-card-right {
    padding: 0.35rem 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hud-action-btn {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
  }

  .hud-action-btn:hover {
    background: #242a35;
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.45);
    transform: translateY(-1px);
  }

  .hud-action-btn:active {
    transform: scale(0.95);
  }

  .hud-action-btn.menu-toggle-btn {
    background: rgba(0, 229, 255, 0.18);
    border-color: rgba(0, 229, 255, 0.6);
  }

  .hud-action-btn.menu-toggle-btn:hover {
    background: #00e5ff;
    color: #050811;
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.6);
  }

  .hud-action-btn.is-muted {
    border-color: rgba(255, 71, 87, 0.5);
    background: rgba(255, 71, 87, 0.15);
    box-shadow: 0 0 10px rgba(255, 71, 87, 0.3);
  }

  .hud-btn-svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  /* TELEMETRÍA EN VIVO (ESQUINA INFERIOR IZQUIERDA) */
  .hud-telemetry-corner {
    pointer-events: auto;
    position: fixed;
    bottom: 12px;
    left: 16px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.75rem;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    user-select: none;
    box-sizing: border-box;
    white-space: nowrap;
  }

  .tel-pulse-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 9999px;
    background: #2ecc71;
    box-shadow: 0 0 6px #2ecc71;
    animation: pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .tel-sep {
    color: #3b494c;
    font-size: 0.75rem;
    margin: 0 0.1rem;
  }

  /* CHAT TÁCTICO FLOTANTE (ADAPTATIVO RESPONSIVE) */
  .hud-chat-container {
    pointer-events: auto;
    position: fixed;
    bottom: 12px;
    left: calc(var(--telemetry-width, 140px) + 16px);
    right: calc(var(--minimap-width, 220px) + 16px);
    width: auto;
    height: var(--chat-height, 160px);
    z-index: 100;
    background: rgba(10, 16, 26, var(--chat-opacity, 0.95));
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.75rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }

  /* Tirador de redimensionamiento */
  .chat-resize-handle {
    height: 8px;
    width: 100%;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 14, 24, 0.6);
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    user-select: none;
    touch-action: none;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .chat-resize-handle:hover,
  .chat-resize-handle:active {
    background: rgba(0, 229, 255, 0.15);
  }

  .resize-handle-bar {
    width: 36px;
    height: 3px;
    border-radius: 9999px;
    background: rgba(0, 229, 255, 0.4);
    transition: all 0.15s ease;
  }

  .chat-resize-handle:hover .resize-handle-bar,
  .chat-resize-handle:active .resize-handle-bar {
    background: #00e5ff;
    box-shadow: 0 0 6px #00e5ff;
    width: 48px;
  }

  .chat-messages-scroll {
    flex: 1;
    min-height: 50px;
    padding: 0.55rem 0.85rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .chat-empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #556977;
    font-size: 0.75rem;
    font-style: italic;
  }

  .chat-line {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .chat-sender {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .chat-sender.red { color: #ff3366; }
  .chat-sender.blue { color: #00e5ff; }
  .chat-sender.spec { color: #8fa0b5; }

  .chat-text {
    color: #dde2f1;
    word-break: break-word;
  }

  .chat-input-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.65rem;
    background: rgba(8, 14, 24, 0.9);
    border-top: 1px solid rgba(0, 229, 255, 0.2);
    flex-shrink: 0;
  }

  .chat-text-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    color: #ffffff;
  }

  .chat-text-input::placeholder {
    color: #849396;
  }

  .chat-send-trigger {
    padding: 0.25rem 0.65rem;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.25rem;
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chat-send-trigger:hover {
    background: #00e5ff;
    color: #00363d;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  /* Custom Scrollbar */
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.4);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #00e5ff;
  }
</style>
