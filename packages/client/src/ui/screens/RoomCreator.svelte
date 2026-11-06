<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { userProfile } from '../state/userProfile.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { tooltip } from '../actions/tooltip.js';
  import { gameApp } from '../../net/GameApp.js';
  import StadiumPreviewCanvas from '../components/StadiumPreviewCanvas.svelte';

  let roomName = $state(`${gameUI.nickname || 'Player'}'s room`);
  let playerCount = $state(12);
  let isPasswordProtected = $state(false);
  let roomPassword = $state('');
  let isPublic = $state(true);
  let teamsLocked = $state(true);
  let allowCaptainKitSwitch = $state(false);
  let selectedTimeMinutes = $state(3);
  let selectedGoalsLimit = $state(3);
  let selectedStadiumIndex = $state(0);
  let isCreating = $state(false);

  const stadiums = [
    { id: 'classic', name: 'Mediano', dims: '55x30m', desc: 'Campo Clásico Estándar 3v3' },
    { id: 'classic', name: 'AF 3v3 Official', dims: '60x35m', desc: 'Canónico Haxball 3v3' },
    { id: 'big', name: 'Big Pitch', dims: '80x45m', desc: 'Gran Estadio 4v4 / 5v5' },
    { id: 'small', name: 'Small Field', dims: '40x22m', desc: 'Cancha Reducida 1v1 / 2v2' }
  ];

  $effect(() => {
    if (!userProfile.canCreateRankedRoom && gameUI.roomType === 'ranked') {
      gameUI.roomType = 'casual';
    }
  });

  $effect(() => {
    if (gameUI.activeStadiumName) {
      const idx = stadiums.findIndex(
        (s) => s.name === gameUI.activeStadiumName || s.name.toLowerCase().includes(gameUI.activeStadiumName.toLowerCase())
      );
      if (idx !== -1) {
        selectedStadiumIndex = idx;
      }
    }
  });

  function decreasePlayers() {
    soundFX.playUIClick();
    if (playerCount > 2) playerCount -= 1;
  }

  function increasePlayers() {
    soundFX.playUIClick();
    if (playerCount < 30) playerCount += 1;
  }

  function formatTimeLimit(val: number): string {
    return val === 0 ? '0 (Indefinido)' : `${val} min`;
  }

  function formatGoalsLimit(val: number): string {
    return val === 0 ? '0 (Sin límite)' : `${val} ${val === 1 ? 'gol' : 'goles'}`;
  }

  async function handleCreateRoom() {
    isCreating = true;
    soundFX.playUIClick();
    const activeStadium = gameUI.activeStadiumName || stadiums[selectedStadiumIndex].name;
    const effectiveRoomType = userProfile.canCreateRankedRoom ? gameUI.roomType : 'casual';
    try {
      gameUI.isPracticeMode = false;
      gameUI.timeLimitMinutes = selectedTimeMinutes;
      gameUI.scoreLimitGoals = selectedGoalsLimit;
      gameUI.physicsModifiers.timeLimit = selectedTimeMinutes;
      gameUI.physicsModifiers.scoreLimit = selectedGoalsLimit;
      gameUI.teamsLocked = teamsLocked;
      gameUI.allowCaptainKitSwitch = allowCaptainKitSwitch;
      gameUI.roomType = effectiveRoomType;

      const success = await gameApp.createRoom({
        name: roomName.trim() || `${gameUI.nickname || 'Player'}'s room`,
        stadium: activeStadium || 'mediano',
        isPublic: isPublic && !isPasswordProtected,
        password: isPasswordProtected ? roomPassword : undefined,
        maxPlayers: Math.min(30, Math.max(2, playerCount || 12)),
        timeLimit: selectedTimeMinutes,
        scoreLimit: selectedGoalsLimit,
        teamsLocked: teamsLocked,
        allowCaptainKitSwitch: allowCaptainKitSwitch,
        roomType: effectiveRoomType
      });
      if (success) {
        gameUI.allowCaptainKitSwitch = allowCaptainKitSwitch;
        gameUI.currentScreen = 'IN_GAME';
        gameUI.activeModal = 'TEAM_SELECT';
      }
    } catch (err) {
      console.error('Error al crear sala:', err);
    } finally {
      isCreating = false;
    }
  }
</script>

<div class="creator-root">
  <!-- Top Navigation Header -->
  <header class="top-header">
    <button
      type="button"
      class="nav-pill-btn"
      onmouseenter={() => soundFX.playUIHover()}
      onclick={() => gameUI.navigateTo('LOBBY')}
      title="Volver"
    >
      <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Volver</span>
    </button>
  </header>

  <!-- Main Card -->
  <main class="creator-card">
    <div class="card-header">
      <div class="title-with-bar">
        <div class="accent-bar"></div>
        <div>
          <h1 class="card-title">Ajustes de la sala</h1>
          <p class="card-subtitle">Define los accesos, la normativa de partido y el terreno de juego</p>
        </div>
      </div>
    </div>

    <!-- Dual Column Grid -->
    <div class="columns-grid">
      <!-- LEFT COLUMN: Ajustes de la sala -->
      <div class="config-column">
        <div class="column-header">
          <span class="column-title">AJUSTES DE LA SALA</span>
        </div>

        <!-- SECCIÓN 1: Nombre de la sala y contraseña -->
        <div class="config-section">
          <div class="input-block">
            <div class="block-header">
              <label class="block-label" for="room-name">NOMBRE DE LA SALA</label>
              <span class="block-hint">({roomName.length}/50)</span>
            </div>
            <input
              id="room-name"
              type="text"
              class="styled-input"
              maxlength="50"
              placeholder="Ej: Torneo Nocturno 3v3..."
              bind:value={roomName}
            />
          </div>

          <div class="param-row">
            <div class="toggle-row">
              <span class="toggle-label flex-icon-label">
                <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Proteger con contraseña</span>
              </span>
              <label class="switch">
                <input
                  type="checkbox"
                  bind:checked={isPasswordProtected}
                  onchange={() => soundFX.playUIClick()}
                />
                <span class="slider"></span>
              </label>
            </div>

            {#if isPasswordProtected}
              <input
                type="text"
                class="styled-sub-input"
                placeholder="Ingresa la clave de acceso..."
                bind:value={roomPassword}
              />
            {/if}
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- SECCIÓN 1.5: Tipo de Sala (Casual vs Clasificatoria Ranked) -->
        <div class="config-section">
          <div class="param-row">
            <div class="param-label-row">
              <span class="param-name">Tipo de Sala</span>
              {#if !userProfile.canCreateRankedRoom}
                <span class="role-hint-tag">ROL: {userProfile.isGuest ? 'INVITADO' : 'JUGADOR'}</span>
              {:else}
                <span class="role-hint-tag verified">ROL: {userProfile.role.toUpperCase()}</span>
              {/if}
            </div>
            <div class="room-type-segmented">
              <button
                type="button"
                class="type-seg-btn"
                class:active={gameUI.roomType === 'casual'}
                onclick={() => { soundFX.playUIClick(); gameUI.roomType = 'casual'; }}
              >
                <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 3a9 9 0 0 1 9 9"></path>
                </svg>
                <span>Casual</span>
              </button>
              <button
                type="button"
                class="type-seg-btn ranked-btn"
                class:active={gameUI.roomType === 'ranked'}
                class:locked={!userProfile.canCreateRankedRoom}
                disabled={!userProfile.canCreateRankedRoom}
                title={userProfile.canCreateRankedRoom ? 'Crear sala Clasificatoria oficial (suma ELO y estadísticas)' : 'Solo Representantes y Superadmins pueden crear salas Clasificatorias (Ranked)'}
                onclick={() => {
                  if (!userProfile.canCreateRankedRoom) return;
                  soundFX.playUIClick();
                  gameUI.roomType = 'ranked';
                }}
              >
                {#if userProfile.canCreateRankedRoom}
                  <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                    <path d="M4 22h16"></path>
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                  </svg>
                {:else}
                  <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                {/if}
                <span>Clasificatoria (Ranked)</span>
              </button>
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- SECCIÓN 2: Límite de jugadores (hasta 30) -->
        <div class="config-section">
          <div class="param-row">
            <div class="param-label-row">
              <span class="param-name">Límite de jugadores</span>
              <span class="block-hint">2 a 30 máx.</span>
            </div>
            <div class="stepper-box">
              <button type="button" class="stepper-btn" onclick={decreasePlayers}>−</button>
              <div class="stepper-display">
                <span class="stepper-num">{playerCount}</span>
                <span class="stepper-sub">Máximo 30 jugadores</span>
              </div>
              <button type="button" class="stepper-btn" onclick={increasePlayers}>+</button>
            </div>
            <div class="capacity-presets">
              {#each [4, 6, 8, 12, 16, 20, 24, 30] as cap}
                <button
                  type="button"
                  class="cap-preset-chip"
                  class:active={playerCount === cap}
                  onclick={() => { soundFX.playUIClick(); playerCount = cap; }}
                >
                  {cap}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- SECCIÓN 3: Opciones de privacidad y lista pública -->
        <div class="config-section">
          <div class="param-row">
            <div class="toggle-row">
              <div class="label-with-tooltip">
                <span class="toggle-label flex-icon-label">
                  <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  <span>Mostrar en lista pública</span>
                </span>
                <div
                  class="info-tooltip-wrapper"
                  tabindex="0"
                  role="button"
                  aria-label="Información sobre visibilidad en lista pública"
                  use:tooltip={"Si se desactiva, la sala no aparecerá en la lista pública y solo se podrá acceder buscándola por su ID en el lobby."}
                >
                  <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </div>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  bind:checked={isPublic}
                  onchange={() => soundFX.playUIClick()}
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: Reglas de partido y Escoger estadio -->
      <div class="config-column right-panel-scroll">
        <div class="column-header">
          <span class="column-title">REGLAS DE PARTIDO</span>
        </div>

        <!-- Rules Grid -->
        <div class="rules-grid">
          <!-- Time Selector (0 to 15) -->
          <div class="rule-select-box" title="Tiempo de partido">
            <span class="rule-icon">
              <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </span>
            <select
              class="rule-select"
              bind:value={selectedTimeMinutes}
              onchange={() => soundFX.playUIClick()}
            >
              {#each Array.from({ length: 16 }, (_, i) => i) as t}
                <option value={t}>{formatTimeLimit(t)}</option>
              {/each}
            </select>
            <span class="rule-arrow">▾</span>
          </div>

          <!-- Goals Selector (0 to 15) -->
          <div class="rule-select-box" title="Límite de goles">
            <span class="rule-icon">
              <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="12 7 15 10 14 14 10 14 9 10 12 7"></polygon>
              </svg>
            </span>
            <select
              class="rule-select"
              bind:value={selectedGoalsLimit}
              onchange={() => soundFX.playUIClick()}
            >
              {#each Array.from({ length: 16 }, (_, i) => i) as g}
                <option value={g}>{formatGoalsLimit(g)}</option>
              {/each}
            </select>
            <span class="rule-arrow">▾</span>
          </div>

          <!-- Bloquear Equipos Toggle -->
          <button
            type="button"
            class="rule-btn lock-teams-btn"
            class:active-locked={teamsLocked}
            title="Bloquear equipos para que solo los administradores puedan mover jugadores"
            onclick={() => { soundFX.playUIClick(); teamsLocked = !teamsLocked; }}
          >
            <span class="lock-label flex-icon-label">
              {#if teamsLocked}
                <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Bloqueados</span>
              {:else}
                <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                </svg>
                <span>Libres</span>
              {/if}
            </span>
            <span class="lock-tag">{teamsLocked ? 'SOLO ADMINS' : 'TODOS'}</span>
          </button>

          <!-- Bloqueo de Equipaciones por Capitanes -->
          <button
            type="button"
            class="rule-btn lock-teams-btn h-10 px-3 overflow-hidden"
            class:active-locked={!allowCaptainKitSwitch}
            title="Permitir o bloquear el cambio de camisetas para capitanes"
            onclick={() => { soundFX.playUIClick(); allowCaptainKitSwitch = !allowCaptainKitSwitch; }}
          >
            <span class="lock-label flex-icon-label whitespace-nowrap truncate text-xs font-semibold">
              <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
              </svg>
              <span>{allowCaptainKitSwitch ? 'Kits: Libres' : 'Kits: Bloq.'}</span>
            </span>
            <span class="lock-tag">{allowCaptainKitSwitch ? 'CAPITANES' : 'BLOQUEADO'}</span>
          </button>

          <!-- Modifiers Button -->
          <button
            type="button"
            class="rule-btn highlight"
            onclick={() => gameUI.openModal('PHYSICS_MODIFIERS')}
          >
            <span class="flex-icon-label">
              <svg class="inline-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>Modifiers</span>
            </span>
          </button>
        </div>

        <!-- Subtítulo Escoger estadio y Previsualización Geométrica Real -->
        <div class="stadium-section">
          <div class="param-label-row">
            <span class="param-name">Escoger estadio</span>
          </div>

          <div
            class="stadium-preview-box"
            tabindex="0"
            role="button"
            onmouseenter={() => soundFX.playUIHover()}
            onclick={() => { soundFX.playUIClick(); gameUI.openModal('STADIUM_SELECTOR'); }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                soundFX.playUIClick();
                gameUI.openModal('STADIUM_SELECTOR');
              }
            }}
            title="Dar click para cambiar de estadio"
          >
            <div class="stadium-canvas-wrap">
              <StadiumPreviewCanvas
                stadiumId={gameUI.selectedStadiumId || stadiums[selectedStadiumIndex].id || 'classic'}
                width={320}
                height={145}
              />
            </div>

            <!-- Superimposed overlay info -->
            <div class="stadium-overlay">
              <span class="stadium-name">{gameUI.activeStadiumName || stadiums[selectedStadiumIndex].name}</span>
              <span class="stadium-action-text">Dar click para cambiar de estadio</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Launch CTA -->
    <div class="footer-cta">
      <button
        type="button"
        class="launch-btn"
        disabled={isCreating}
        onmouseenter={() => soundFX.playUIHover()}
        onclick={handleCreateRoom}
      >
        <span>{isCreating ? 'CREANDO...' : 'CREAR SALA'}</span>
      </button>
    </div>
  </main>
</div>

<style>
  .creator-root {
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background-color: #0b111e;
    background: radial-gradient(circle at 50% 20%, #111a2e 0%, #070b14 100%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px 28px;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
  }

  .top-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    z-index: 30;
  }

  .nav-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.15rem;
    background: rgba(10, 16, 26, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 9999px;
    color: #67e8f9;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 12px rgba(0, 229, 255, 0.15);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  }

  .nav-pill-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #ffffff;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.45), 0 6px 24px rgba(0, 0, 0, 0.6);
    transform: translateY(-1px);
  }

  .nav-pill-btn:active {
    transform: scale(0.95);
  }

  .back-arrow-svg {
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
  }

  .creator-card {
    width: min(94vw, 780px);
    max-height: 90vh;
    overflow-y: auto;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid #00e5ff;
    border-radius: 0.5rem;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35), inset 0 0 12px rgba(0, 229, 255, 0.15);
    padding: 22px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 229, 255, 0.35) rgba(8, 14, 24, 0.6);
  }

  .creator-card::-webkit-scrollbar,
  .right-panel-scroll::-webkit-scrollbar {
    width: 4px;
  }

  .creator-card::-webkit-scrollbar-track,
  .right-panel-scroll::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
    border-radius: 4px;
  }

  .creator-card::-webkit-scrollbar-thumb,
  .right-panel-scroll::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.35);
    border-radius: 4px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    padding-bottom: 10px;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .accent-bar {
    width: 4px;
    height: 30px;
    background: #00e5ff;
    border-radius: 2px;
    box-shadow: 0 0 10px #00e5ff;
  }

  .card-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 800;
    color: #c3f5ff;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .card-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    color: #8fa0b5;
    margin: 2px 0 0 0;
  }

  .columns-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 680px) {
    .columns-grid {
      grid-template-columns: 1fr;
    }
  }

  .config-column {
    background: rgba(18, 26, 41, 0.75);
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 0.5rem;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
  }

  .column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 8px;
  }

  .column-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #00e5ff;
    text-transform: uppercase;
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-divider {
    width: 100%;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 2px 0;
  }

  .input-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .block-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.06em;
  }

  .block-hint {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    color: rgba(0, 229, 255, 0.65);
  }

  .styled-input {
    width: 100%;
    height: 40px;
    padding: 0 14px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.5rem;
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .styled-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.35);
  }

  .param-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .param-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .param-name {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #ffffff;
  }

  .stepper-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.5rem;
    padding: 4px 8px;
  }

  .stepper-btn {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background: #1a202a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }

  .stepper-btn:hover {
    background: #00e5ff;
    color: #080e18;
  }

  .stepper-display {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stepper-num {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 18px;
    font-weight: 800;
    color: #00e5ff;
    line-height: 1;
  }

  .stepper-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #8fa0b5;
    margin-top: 2px;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #dde2f1;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 38px;
    height: 20px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #1a202a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 20px;
    transition: 0.2s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 2px;
    bottom: 2px;
    background-color: #ffffff;
    border-radius: 50%;
    transition: 0.2s;
  }

  input:checked + .slider {
    background-color: rgba(0, 229, 255, 0.4);
    border-color: #00e5ff;
  }

  input:checked + .slider:before {
    transform: translateX(18px);
    background-color: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }

  .styled-sub-input {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.5rem;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    margin-top: 4px;
  }

  .styled-sub-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
  }

  .label-with-tooltip {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-tooltip-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    outline: none;
  }

  .info-help-icon {
    width: 14px;
    height: 14px;
    color: #8fa0b5;
    transition: color 0.15s ease, transform 0.15s ease;
  }

  .info-tooltip-wrapper:hover .info-help-icon,
  .info-tooltip-wrapper:focus-visible .info-help-icon {
    color: #00e5ff;
    transform: scale(1.15);
  }


  .right-panel-scroll {
    overflow-y: auto;
    max-height: 480px;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 229, 255, 0.35) rgba(8, 14, 24, 0.6);
  }

  .rules-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .rule-select-box {
    position: relative;
    height: 40px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    padding: 0 12px;
    box-sizing: border-box;
    overflow: hidden;
    transition: border-color 0.15s, background-color 0.15s;
  }

  .rule-select-box:hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.08);
  }

  .rule-icon {
    font-size: 13px;
    margin-right: 6px;
  }

  .rule-select {
    flex: 1;
    height: 100%;
    background: transparent;
    border: none;
    color: #c3f5ff;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    font-weight: 600;
    outline: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .rule-select option {
    background: #0a101a;
    color: #ffffff;
  }

  .rule-arrow {
    color: #8fa0b5;
    font-size: 11px;
    pointer-events: none;
    margin-left: 4px;
  }

  .rule-btn {
    height: 40px;
    padding: 0 12px;
    border-radius: 0.5rem;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #c3f5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s;
    box-sizing: border-box;
  }

  .rule-btn:hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
  }

  .lock-teams-btn.active-locked {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
    color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .lock-tag {
    font-size: 9px;
    background: #0e1726;
    color: #00e5ff;
    padding: 2px 5px;
    border-radius: 3px;
  }

  .rule-btn.highlight {
    border-color: rgba(255, 219, 60, 0.4);
    color: #ffe16d;
    justify-content: center;
  }

  .rule-btn.highlight:hover {
    background: rgba(255, 219, 60, 0.15);
    border-color: #ffdb3c;
  }

  .stadium-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }

  .stadium-preview-box {
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 1;
    min-height: 120px;
    max-height: 150px;
    border-radius: 0.5rem;
    overflow: hidden;
    background: #07170e;
    border: 1px solid rgba(0, 229, 255, 0.35);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  }

  .stadium-preview-box:hover {
    border-color: #00e5ff;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.45);
  }

  .stadium-canvas-wrap {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .flex-icon-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .inline-svg-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: #00e5ff;
  }

  .role-hint-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }

  .role-hint-tag.verified {
    background: rgba(255, 215, 0, 0.16);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.35);
  }

  .room-type-segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .type-seg-btn {
    height: 36px;
    padding: 0 10px;
    border-radius: 6px;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.22);
    color: #94a3b8;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .type-seg-btn.active {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .type-seg-btn.ranked-btn.active {
    background: rgba(255, 215, 0, 0.18);
    border-color: #ffd700;
    color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
  }

  .type-seg-btn.ranked-btn.active .inline-svg-icon {
    color: #ffd700;
  }

  .type-seg-btn.locked {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .capacity-presets {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
    margin-top: 2px;
  }

  .cap-preset-chip {
    height: 24px;
    background: #0b1322;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 4px;
    color: #8fa0b5;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .cap-preset-chip:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .cap-preset-chip.active {
    background: #00e5ff;
    color: #070d18;
    border-color: #00e5ff;
  }

  .stadium-overlay {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.4);
    padding: 8px 16px;
    border-radius: 0.5rem;
    pointer-events: none;
    box-shadow: 0 0 14px rgba(0, 0, 0, 0.6);
  }

  .stadium-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-shadow: 0 0 8px rgba(0, 229, 255, 0.6);
  }

  .stadium-action-text {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.15);
    border: 1px solid rgba(0, 229, 255, 0.35);
    padding: 3px 10px;
    border-radius: 4px;
  }

  .footer-cta {
    margin-top: 2px;
  }

  .launch-btn {
    width: 100%;
    height: 46px;
    border-radius: 0.5rem;
    background: #00e5ff;
    border: none;
    color: #0a101a;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.45);
    transition: transform 0.1s, box-shadow 0.15s, filter 0.15s;
  }

  .launch-btn:hover {
    filter: brightness(1.12);
    box-shadow: 0 0 26px rgba(0, 229, 255, 0.75);
    transform: translateY(-1px);
  }

  .launch-btn:active {
    transform: scale(0.98);
  }
</style>
