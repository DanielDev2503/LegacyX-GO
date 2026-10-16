<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let chatMessage = $state('');
  let chatHistory = $state([
    { team: 'RED', sender: 'kiko', text: 'Cuidado con el rebote central en el travesaño.' },
    { team: 'BLUE', sender: 'yami', isHost: true, text: 'Buen tiro al ángulo superior, gg a todos.' },
    { team: 'SPEC', sender: 'lucas', text: 'Ese hat-trick fue quirúrgico 🔥' }
  ]);

  function handleSendChat() {
    if (!chatMessage.trim()) return;
    soundFX.playUIClick();
    chatHistory.push({
      team: 'BLUE',
      sender: gameUI.nickname,
      isHost: true,
      text: chatMessage.trim()
    });
    chatMessage = '';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSendChat();
    }
  }

  function toggleAudio() {
    gameUI.toggleMute();
  }

  function openModifiers() {
    soundFX.playUIClick();
    gameUI.openModal('PHYSICS_MODIFIERS');
  }

  function leaveMatch() {
    soundFX.playUIClick();
    gameUI.navigateTo('LOBBY');
  }
</script>

<div class="hud-root">
  <!-- Top Persistent Scoreboard Bar -->
  <header class="top-banner">
    <!-- Left: Tournament / Room ID -->
    <div class="room-id-badge">
      <span class="pulse-cyan"></span>
      <span class="id-text">[ SALA: <strong class="cyan-text">{gameUI.activeRoom?.name || 'LOCAL-PRACTICE'}</strong> ]</span>
    </div>

    <!-- Center: Symmetric Scoreboard & Synchronized Timer -->
    <div class="scoreboard-pill">
      <!-- RED Team Score -->
      <div class="team-score red">
        <span class="team-tag">[RED]</span>
        <span class="score-number">{gameUI.redScore}</span>
      </div>

      <span class="score-divider">-</span>

      <!-- BLUE Team Score -->
      <div class="team-score blue">
        <span class="score-number">{gameUI.blueScore}</span>
        <span class="team-tag">[BLUE]</span>
      </div>

      <div class="score-sep"></div>

      <!-- Synchronized Timer -->
      <div class="timer-display">
        <span class="timer-icon">⏱</span>
        <span class="timer-val">{gameUI.matchTimeFormatted}</span>
      </div>

      <!-- FSM Phase Badge -->
      <div class="fsm-badge" class:goal={gameUI.fsmPhase === 'GOAL'}>
        {gameUI.fsmPhase}
      </div>
    </div>

    <!-- Right: 4 Circular Quick Action Buttons (32x32px) -->
    <div class="quick-actions">
      <!-- 1. Audio / Mute -->
      <button
        type="button"
        class="circle-btn"
        class:muted={gameUI.isAudioMuted}
        title={gameUI.isAudioMuted ? 'Activar Sonido' : 'Silenciar'}
        onmouseenter={() => soundFX.playUIHover()}
        onclick={toggleAudio}
      >
        <span>{gameUI.isAudioMuted ? '🔇' : '🔊'}</span>
      </button>

      <!-- 2. Modifiers Modal (#) -->
      <button
        type="button"
        class="circle-btn highlight"
        title="Modificadores Físicos [#]"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={openModifiers}
      >
        <span>#</span>
      </button>

      <!-- 3. Post-Match Stats Toggle -->
      <button
        type="button"
        class="circle-btn"
        title="Ver Estadísticas / MVP"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={() => {
          soundFX.playUIClick();
          gameUI.fsmPhase = gameUI.fsmPhase === 'STATS' ? 'PLAYING' : 'STATS';
        }}
      >
        <span>📊</span>
      </button>

      <!-- 4. Salir al Lobby -->
      <button
        type="button"
        class="circle-btn exit"
        title="Salir al Lobby"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={leaveMatch}
      >
        <span>✕</span>
      </button>
    </div>
  </header>

  <!-- Bottom-Left Telemetry (Ping & FPS) -->
  <div class="telemetry-box">
    <span class="ping-dot"></span>
    <span class="tel-label">Ping:</span>
    <span class="tel-val-green">{gameUI.pingMs} ms</span>
    <span class="tel-sep">|</span>
    <span class="tel-label">FPS:</span>
    <span class="tel-val-cyan">{gameUI.fps}</span>
  </div>

  <!-- Bottom-Center Dynamic Chat Box -->
  <div class="chat-box">
    <div class="chat-header-handle">
      <div class="handle-bar"></div>
    </div>

    <div class="chat-messages">
      {#each chatHistory as msg}
        <div class="chat-line">
          <span class="chat-sender {msg.team.toLowerCase()}">
            {#if msg.isHost}👑{/if} [{msg.team}] {msg.sender}:
          </span>
          <span class="chat-text">{msg.text}</span>
        </div>
      {/each}
    </div>

    <div class="chat-input-row">
      <input
        type="text"
        class="chat-input"
        placeholder="Escribe un mensaje táctico (Enter para enviar)..."
        bind:value={chatMessage}
        onkeydown={handleKeyDown}
      />
      <button
        type="button"
        class="chat-send-btn"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={handleSendChat}
      >
        ENVIAR
      </button>
    </div>
  </div>
</div>

<style>
  .hud-root {
    position: absolute;
    inset: 0;
    pointer-events: none;
    user-select: none;
  }

  .top-banner {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 44px;
    background: rgba(10, 16, 26, 0.96);
    border-bottom: 1px solid rgba(0, 229, 255, 0.35);
    padding: 0 24px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 50;
    box-shadow: 0 2px 14px rgba(0, 0, 0, 0.7);
    pointer-events: auto;
  }

  .room-id-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #080e18;
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid rgba(143, 160, 181, 0.2);
  }

  .pulse-cyan {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #00e5ff;
    box-shadow: 0 0 6px #00e5ff;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.9); }
  }

  .id-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #8fa0b5;
    letter-spacing: 0.05em;
  }

  .cyan-text {
    color: #00e5ff;
  }

  .scoreboard-pill {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #080e18;
    padding: 4px 16px;
    border-radius: 6px;
    border: 1px solid rgba(0, 229, 255, 0.3);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.18);
  }

  .team-score {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .team-tag {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 700;
  }

  .team-score.red {
    color: #ff4757;
  }

  .team-score.blue {
    color: #00e5ff;
  }

  .score-number {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    font-weight: 800;
  }

  .score-divider {
    font-family: 'JetBrains Mono', monospace;
    color: #8fa0b5;
    font-weight: 700;
  }

  .score-sep {
    width: 1px;
    height: 16px;
    background: rgba(143, 160, 181, 0.3);
  }

  .timer-display {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    color: #ffe16d;
    background: rgba(255, 225, 109, 0.1);
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 225, 109, 0.25);
  }

  .timer-icon {
    font-size: 12px;
  }

  .fsm-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.05em;
  }

  .fsm-badge.goal {
    color: #2ecc71;
    background: rgba(46, 204, 113, 0.2);
    animation: pulse 0.5s infinite;
  }

  .quick-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .circle-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }

  .circle-btn:hover {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
  }

  .circle-btn.highlight {
    color: #ffe16d;
    border-color: rgba(255, 225, 109, 0.4);
  }

  .circle-btn.highlight:hover {
    background: rgba(255, 225, 109, 0.2);
    border-color: #ffe16d;
    box-shadow: 0 0 10px rgba(255, 225, 109, 0.4);
  }

  .circle-btn.exit:hover {
    background: rgba(255, 71, 87, 0.2);
    border-color: #ff4757;
    color: #ff4757;
  }

  .circle-btn.muted {
    opacity: 0.5;
  }

  .telemetry-box {
    position: fixed;
    bottom: 16px;
    left: 20px;
    z-index: 40;
    background: rgba(10, 16, 26, 0.96);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(0, 229, 255, 0.3);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    pointer-events: auto;
  }

  .ping-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2ecc71;
    box-shadow: 0 0 6px #2ecc71;
  }

  .tel-label {
    color: #8fa0b5;
    font-weight: 600;
  }

  .tel-val-green {
    color: #2ecc71;
    font-weight: 700;
  }

  .tel-sep {
    color: rgba(143, 160, 181, 0.4);
  }

  .tel-val-cyan {
    color: #00e5ff;
    font-weight: 700;
  }

  .chat-box {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    width: min(88vw, 620px);
    height: 140px;
    background: rgba(10, 16, 26, 0.96);
    border-radius: 8px;
    border: 1px solid rgba(0, 229, 255, 0.35);
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.18);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    pointer-events: auto;
  }

  .chat-header-handle {
    width: 100%;
    padding: 3px 0;
    background: #161c26;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  }

  .handle-bar {
    width: 36px;
    height: 3px;
    border-radius: 2px;
    background: rgba(0, 229, 255, 0.4);
  }

  .chat-messages {
    flex: 1;
    padding: 8px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
  }

  .chat-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .chat-sender {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 11px;
    white-space: nowrap;
  }

  .chat-sender.red {
    color: #ff4757;
  }

  .chat-sender.blue {
    color: #00e5ff;
  }

  .chat-sender.spec {
    color: #8fa0b5;
  }

  .chat-text {
    color: #dde2f1;
  }

  .chat-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(22, 28, 38, 0.9);
    border-top: 1px solid rgba(0, 229, 255, 0.15);
  }

  .chat-input {
    flex: 1;
    height: 28px;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 4px;
    padding: 0 10px;
    color: #ffffff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .chat-input:focus {
    border-color: #00e5ff;
  }

  .chat-send-btn {
    height: 28px;
    padding: 0 12px;
    background: rgba(0, 229, 255, 0.18);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    border-radius: 4px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.15s;
  }

  .chat-send-btn:hover {
    background: #00e5ff;
    color: #080e18;
  }
</style>
