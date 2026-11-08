<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { userProfile } from '../state/userProfile.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { tooltip } from '../actions/tooltip.js';
  import { gameApp } from '../../net/GameApp.js';
  import StadiumPreviewCanvas from '../components/StadiumPreviewCanvas.svelte';

  let roomName = $state(`${gameUI.nickname || 'Player'}'s room`);
  let playerCount = $state(12);
  let roomType = $state<'casual' | 'ranked'>('casual');
  let isPasswordProtected = $state(false);
  let roomPassword = $state('');
  let isPublic = $state(true);
  let teamsLocked = $state(true);
  let allowCaptainKitSwitch = $state(false);
  let selectedTimeMinutes = $state(gameUI.timeLimitMinutes ?? 3);
  let selectedGoalsLimit = $state(gameUI.scoreLimitGoals ?? 3);
  let selectedStadiumIndex = $state(0);
  let isCreating = $state(false);
  let createError = $state<string | null>(null);

  const stadiums = [
    { id: 'mediano', name: 'Mediano', dims: '1200x540', desc: 'Campo Clásico Estándar 3v3' },
    { id: 'AF 3v3', name: 'AF 3v3 Official', dims: '840x400', desc: 'Canónico Haxball 3v3' },
    { id: 'big', name: 'Big Pitch', dims: '1600x720', desc: 'Gran Estadio 4v4 / 5v5' },
    { id: 'small', name: 'Small Field', dims: '1000x460', desc: 'Cancha Reducida 1v1 / 2v2' }
  ];

  const activePreviewStadiumId = $derived(
    gameUI.selectedStadiumId || gameUI.activeStadiumName || stadiums[selectedStadiumIndex]?.id || 'mediano'
  );

  $effect(() => {
    if (!userProfile.canCreateRanked && roomType === 'ranked') {
      roomType = 'casual';
    }
  });

  $effect(() => {
    if (gameUI.activeStadiumName) {
      const idx = stadiums.findIndex(
        (s) =>
          s.name === gameUI.activeStadiumName ||
          s.name.toLowerCase().includes(gameUI.activeStadiumName.toLowerCase())
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

  function handleTimeChange(e: Event) {
    soundFX.playUIClick();
    const nextVal = Math.max(0, Math.min(15, Number((e.currentTarget as HTMLSelectElement).value)));
    selectedTimeMinutes = nextVal;
    gameUI.timeLimitMinutes = nextVal;
  }

  function handleGoalsChange(e: Event) {
    soundFX.playUIClick();
    const nextVal = Math.max(0, Math.min(15, Number((e.currentTarget as HTMLSelectElement).value)));
    selectedGoalsLimit = nextVal;
    gameUI.scoreLimitGoals = nextVal;
  }

  function selectRoomType(next: 'casual' | 'ranked') {
    if (next === 'ranked' && !userProfile.canCreateRanked) return;
    soundFX.playUIClick();
    roomType = next;
  }

  function formatTimeLimit(val: number): string {
    return val === 0 ? '0 (Indefinido)' : `${val} min`;
  }

  function formatGoalsLimit(val: number): string {
    return val === 0 ? '0 (Sin límite)' : `${val} ${val === 1 ? 'gol' : 'goles'}`;
  }

  async function handleCreateRoom() {
    isCreating = true;
    createError = null;
    soundFX.playUIClick();
    const activeStadium =
      gameUI.selectedStadiumId || gameUI.activeStadiumName || stadiums[selectedStadiumIndex]!.id;
    const effectiveRoomType = userProfile.canCreateRanked ? roomType : 'casual';
    gameUI.timeLimitMinutes = selectedTimeMinutes;
    gameUI.scoreLimitGoals = selectedGoalsLimit;

    try {
      const success = await gameApp.createRoom({
        name: roomName.trim() || `${gameUI.nickname || 'Player'}'s room`,
        stadium: activeStadium || 'mediano',
        isPublic: isPublic && !isPasswordProtected,
        password: isPasswordProtected ? roomPassword : undefined,
        maxPlayers: Math.max(2, Math.min(30, playerCount || 12)),
        timeLimit: selectedTimeMinutes,
        scoreLimit: selectedGoalsLimit,
        teamsLocked,
        allowCaptainKitSwitch,
        roomType: effectiveRoomType
      });
      if (success) {
        gameUI.allowCaptainKitSwitch = allowCaptainKitSwitch;
        gameUI.currentScreen = 'IN_GAME';
        gameUI.activeModal = 'TEAM_SELECT';
      } else {
        createError = gameApp.lastJoinError || 'No se pudo crear la sala.';
      }
    } catch {
      createError = 'Error al crear la sala.';
    } finally {
      isCreating = false;
    }
  }
</script>

<div class="creator-root">
  <header class="top-header">
    <button
      type="button"
      class="nav-pill-btn"
      onmouseenter={() => soundFX.playUIHover()}
      onclick={() => gameUI.navigateTo('LOBBY')}
      title="Volver"
    >
      <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Volver</span>
    </button>
  </header>

  <main class="creator-card">
    <div class="card-header">
      <div class="title-with-bar">
        <div class="accent-bar"></div>
        <div>
          <h1 class="card-title">Ajustes de la sala</h1>
          <p class="card-subtitle">Define el tipo de sala, accesos, normativa de partido y terreno de juego</p>
        </div>
      </div>
    </div>

    {#if createError}
      <div class="creator-err-banner">{createError}</div>
    {/if}

    <div class="columns-grid">
      <!-- LEFT COLUMN -->
      <div class="config-column">
        <div class="column-header">
          <span class="column-title">AJUSTES DE LA SALA</span>
        </div>

        <!-- Selector Tipo de Sala: Casual | Clasificatoria (Ranked) -->
        <div class="config-section">
          <div class="block-header">
            <span class="block-label">TIPO DE SALA</span>
            {#if !userProfile.canCreateRanked}
              <span class="role-lock-hint">Ranked: Representante / Superadmin</span>
            {/if}
          </div>
          <div class="room-type-grid">
            <button
              type="button"
              class="type-btn"
              class:selected={roomType === 'casual'}
              onclick={() => selectRoomType('casual')}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
              </svg>
              <span>Casual</span>
            </button>

            <button
              type="button"
              class="type-btn ranked-opt"
              class:selected={roomType === 'ranked'}
              disabled={!userProfile.canCreateRanked}
              title={
                userProfile.canCreateRanked
                  ? 'Partida oficial con actualización de ELO y estadísticas globales'
                  : 'Solo cuentas con rol Representante o Superadmin pueden abrir salas Clasificatorias'
              }
              onclick={() => selectRoomType('ranked')}
            >
              {#if userProfile.canCreateRanked}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l2.9 6.1L22 9.2l-5 4.8 1.2 6.9L12 17.7 5.8 20.9 7 14 2 9.2l7.1-1.1L12 2z"></path>
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              {/if}
              <span>Clasificatoria (Ranked)</span>
            </button>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- Nombre y contraseña -->
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
              <span class="toggle-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#00e5ff" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"></rect>
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

        <!-- Límite de jugadores (hasta 30) -->
        <div class="config-section">
          <div class="param-row">
            <div class="param-label-row">
              <span class="param-name">Límite de jugadores</span>
            </div>
            <div class="stepper-box">
              <button type="button" class="stepper-btn" onclick={decreasePlayers}>−</button>
              <div class="stepper-display">
                <span class="stepper-num">{playerCount}</span>
                <span class="stepper-sub">Máximo 30 jugadores</span>
              </div>
              <button type="button" class="stepper-btn" onclick={increasePlayers}>+</button>
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- Mostrar en lista pública -->
        <div class="config-section">
          <div class="param-row">
            <div class="toggle-row">
              <div class="label-with-tooltip">
                <span class="toggle-label">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#00e5ff" stroke-width="2">
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
                  use:tooltip={'Si se desactiva, la sala no aparecerá en la lista pública y solo se podrá acceder por su ID.'}
                >
                  <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

      <!-- RIGHT COLUMN -->
      <div class="config-column right-panel-scroll">
        <div class="column-header">
          <span class="column-title">REGLAS DE PARTIDO</span>
        </div>

        <div class="rules-grid">
          <!-- Tiempo (0 a 15) -->
          <div class="rule-select-box" title="Tiempo de partido">
            <svg class="rule-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
              <polyline points="12 7 12 12 15 15"></polyline>
            </svg>
            <select class="rule-select" value={selectedTimeMinutes} onchange={handleTimeChange}>
              {#each Array.from({ length: 16 }, (_, i) => i) as t}
                <option value={t}>{formatTimeLimit(t)}</option>
              {/each}
            </select>
            <span class="rule-arrow">▾</span>
          </div>

          <!-- Goles (0 a 15) -->
          <div class="rule-select-box" title="Límite de goles">
            <svg class="rule-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <select class="rule-select" value={selectedGoalsLimit} onchange={handleGoalsChange}>
              {#each Array.from({ length: 16 }, (_, i) => i) as g}
                <option value={g}>{formatGoalsLimit(g)}</option>
              {/each}
            </select>
            <span class="rule-arrow">▾</span>
          </div>

          <!-- Bloquear Equipos -->
          <button
            type="button"
            class="rule-btn lock-teams-btn"
            class:active-locked={teamsLocked}
            onclick={() => {
              soundFX.playUIClick();
              teamsLocked = !teamsLocked;
            }}
          >
            <span class="lock-label">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                {#if teamsLocked}
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                {:else}
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                {/if}
              </svg>
              <span>{teamsLocked ? 'Equipos Bloq.' : 'Equipos Libres'}</span>
            </span>
            <span class="lock-tag">{teamsLocked ? 'SOLO ADMINS' : 'TODOS'}</span>
          </button>

          <!-- Bloquear Kits -->
          <button
            type="button"
            class="rule-btn lock-teams-btn"
            class:active-locked={!allowCaptainKitSwitch}
            onclick={() => {
              soundFX.playUIClick();
              allowCaptainKitSwitch = !allowCaptainKitSwitch;
            }}
          >
            <span class="lock-label">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
              </svg>
              <span>{allowCaptainKitSwitch ? 'Kits Libres' : 'Kits Bloq.'}</span>
            </span>
            <span class="lock-tag">{allowCaptainKitSwitch ? 'CAPITANES' : 'BLOQUEADO'}</span>
          </button>

          <!-- Modifiers -->
          <button
            type="button"
            class="rule-btn highlight"
            onclick={() => gameUI.openModal('PHYSICS_MODIFIERS')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
            </svg>
            <span>Modifiers Físicos</span>
          </button>
        </div>

        <!-- Previsualización Real de Estadio -->
        <div class="stadium-section">
          <div class="param-label-row">
            <span class="param-name">Escoger estadio</span>
          </div>

          <div
            class="stadium-preview-box"
            tabindex="0"
            role="button"
            onmouseenter={() => soundFX.playUIHover()}
            onclick={() => {
              soundFX.playUIClick();
              gameUI.openModal('STADIUM_SELECTOR');
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                soundFX.playUIClick();
                gameUI.openModal('STADIUM_SELECTOR');
              }
            }}
            title="Click para cambiar de estadio"
          >
            <StadiumPreviewCanvas stadiumId={activePreviewStadiumId} />

            <div class="stadium-overlay">
              <span class="stadium-name">{gameUI.activeStadiumName || stadiums[selectedStadiumIndex]!.name}</span>
              <span class="stadium-action-text">Click para cambiar de estadio</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-cta">
      <button
        type="button"
        class="launch-btn"
        disabled={isCreating}
        onmouseenter={() => soundFX.playUIHover()}
        onclick={handleCreateRoom}
      >
        <span>{isCreating ? 'CREANDO...' : roomType === 'ranked' ? 'CREAR SALA CLASIFICATORIA' : 'CREAR SALA'}</span>
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
    padding: 18px 24px;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
  }

  .top-header {
    display: flex;
    align-items: center;
  }

  .nav-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 1.05rem;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 9999px;
    color: #67e8f9;
    font-family: 'Chivo', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
  }

  .nav-pill-btn:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .back-arrow-svg {
    width: 1rem;
    height: 1rem;
  }

  .creator-card {
    width: min(94vw, 820px);
    max-height: 90vh;
    overflow-y: auto;
    background: #0a101a;
    border: 1px solid #00e5ff;
    border-radius: 8px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.65);
    padding: 20px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-sizing: border-box;
  }

  .creator-err-banner {
    padding: 8px 12px;
    border-radius: 6px;
    background: #2b1118;
    border: 1px solid #ff4757;
    color: #ff98a3;
    font-size: 12px;
  }

  .card-header {
    border-bottom: 1px solid rgba(0, 229, 255, 0.16);
    padding-bottom: 10px;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .accent-bar {
    width: 4px;
    height: 28px;
    background: #00e5ff;
    border-radius: 2px;
  }

  .card-title {
    margin: 0;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 18px;
    font-weight: 800;
    color: #c3f5ff;
  }

  .card-subtitle {
    margin: 2px 0 0;
    font-size: 11.5px;
    color: #8fa0b5;
  }

  .columns-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 720px) {
    .columns-grid {
      grid-template-columns: 1fr;
    }
  }

  .config-column {
    background: #101827;
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .column-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 7px;
  }

  .column-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #00e5ff;
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
  }

  .block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .block-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 700;
    color: #ffffff;
  }

  .role-lock-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #ffd700;
  }

  .room-type-grid {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 8px;
  }

  .type-btn {
    height: 36px;
    border-radius: 6px;
    border: 1px solid #263850;
    background: #0a101b;
    color: #9cb0ca;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }

  .type-btn.selected {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.16);
    color: #00e5ff;
  }

  .type-btn.ranked-opt.selected {
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.16);
    color: #ffd700;
  }

  .type-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .block-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: rgba(0, 229, 255, 0.7);
  }

  .styled-input,
  .styled-sub-input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    background: #09101c;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    color: #00e5ff;
    font-family: 'Chivo', sans-serif;
    font-size: 13.5px;
    font-weight: 700;
    outline: none;
    box-sizing: border-box;
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
    font-size: 12px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: #dbe7f5;
  }

  .label-with-tooltip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .info-help-icon {
    width: 14px;
    height: 14px;
    color: #67e8f9;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    inset: 0;
    cursor: pointer;
    background-color: #1c293d;
    border-radius: 999px;
    transition: 0.2s;
  }

  .slider::before {
    position: absolute;
    content: '';
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: #ffffff;
    border-radius: 50%;
    transition: 0.2s;
  }

  .switch input:checked + .slider {
    background-color: #00e5ff;
  }

  .switch input:checked + .slider::before {
    transform: translateX(18px);
    background-color: #050811;
  }

  .stepper-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #09101c;
    border: 1px solid rgba(0, 229, 255, 0.28);
    border-radius: 6px;
    padding: 4px;
  }

  .stepper-btn {
    width: 34px;
    height: 32px;
    border-radius: 4px;
    border: 1px solid rgba(0, 229, 255, 0.25);
    background: #121e31;
    color: #00e5ff;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
  }

  .stepper-display {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stepper-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
  }

  .stepper-sub {
    font-size: 10px;
    color: #7d92b0;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .rule-select-box {
    position: relative;
    display: flex;
    align-items: center;
    height: 38px;
    background: #09101c;
    border: 1px solid rgba(0, 229, 255, 0.28);
    border-radius: 6px;
    padding: 0 10px;
    gap: 6px;
  }

  .rule-svg {
    width: 14px;
    height: 14px;
    color: #00e5ff;
    flex-shrink: 0;
  }

  .rule-select {
    flex: 1;
    background: #09101c;
    border: none;
    color: #ffffff;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12px;
    font-weight: 700;
    outline: none;
    appearance: none;
    cursor: pointer;
  }

  .rule-arrow {
    color: #00e5ff;
    font-size: 11px;
    pointer-events: none;
  }

  .rule-btn {
    height: 42px;
    border-radius: 6px;
    border: 1px solid rgba(0, 229, 255, 0.28);
    background: #09101c;
    color: #dbe7f5;
    padding: 4px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
  }

  .rule-btn.active-locked {
    border-color: #ffd700;
    color: #ffd700;
  }

  .lock-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 700;
  }

  .lock-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    opacity: 0.78;
  }

  .rule-btn.highlight {
    grid-column: span 2;
    flex-direction: row;
    gap: 7px;
    border-color: #00e5ff;
    color: #00e5ff;
    font-weight: 800;
    font-size: 12px;
  }

  .stadium-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stadium-preview-box {
    position: relative;
    height: 152px;
    border-radius: 6px;
    border: 1px solid rgba(0, 229, 255, 0.35);
    overflow: hidden;
    cursor: pointer;
  }

  .stadium-overlay {
    position: absolute;
    inset: auto 0 0 0;
    padding: 6px 10px;
    background: linear-gradient(180deg, rgba(5, 8, 17, 0) 0%, rgba(5, 8, 17, 0.92) 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stadium-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    font-weight: 800;
    color: #ffffff;
  }

  .stadium-action-text {
    font-size: 10.5px;
    color: #00e5ff;
  }

  .footer-cta {
    display: flex;
  }

  .launch-btn {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 6px;
    background: #00e5ff;
    color: #050811;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  .launch-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }
</style>
