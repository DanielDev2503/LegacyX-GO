<script lang="ts">
  import { gameUI, type RoomInfo } from '../state/gameUI.svelte.js';
  import { userProfile, type LeaderboardCategory } from '../state/userProfile.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { sharedSignaling } from '../../net/SignalingClient.js';
  import { gameApp } from '../../net/GameApp.js';
  import CountryFlagSvg from '../components/CountryFlagSvg.svelte';

  let passwordInput = $state('');
  let passwordError = $state('');
  let isRefreshing = $state(false);
  let hoveredRoomId = $state<string | null>(null);
  const pingProbeTimestamps = new Map<string, number>();

  function getPingTier(pingMs: number): 'optimal' | 'good' | 'high' | 'pending' {
    if (!(pingMs > 0)) return 'pending';
    if (pingMs <= 60) return 'optimal';
    if (pingMs <= 120) return 'good';
    return 'high';
  }

  function handleRoomHover(roomId: string) {
    hoveredRoomId = roomId;
    const now = Date.now();
    const lastProbe = pingProbeTimestamps.get(roomId) ?? 0;
    if (now - lastProbe >= 1500) {
      pingProbeTimestamps.set(roomId, now);
      sharedSignaling.probeRoomPing(roomId);
    }
  }

  const rankingTabs: ReadonlyArray<{ id: LeaderboardCategory; label: string; unit: string }> = [
    { id: 'elo', label: 'Mayor ELO', unit: 'ELO' },
    { id: 'goals', label: 'Goles', unit: 'Goles' },
    { id: 'assists', label: 'Asistencias', unit: 'Asist.' },
    { id: 'saves', label: 'Atajadas', unit: 'Ataj.' }
  ];

  const activeRankingUnit = $derived(
    rankingTabs.find((t) => t.id === userProfile.leaderboardCategory)?.unit || 'ELO'
  );

  function handleSearchInput(e: Event) {
    gameUI.roomFilterQuery = (e.target as HTMLInputElement).value;
  }

  function handleRefreshRooms() {
    soundFX.playUIClick();
    isRefreshing = true;
    void sharedSignaling.ensureConnected().then(() => {
      sharedSignaling.send({ type: 'get_rooms' });
      sharedSignaling.send({ type: 'ROOM_LIST' });
    });
    gameUI.refreshRooms();
    void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);
    setTimeout(() => {
      isRefreshing = false;
    }, 600);
  }

  function selectRankingCategory(cat: LeaderboardCategory) {
    soundFX.playUIClick();
    void userProfile.fetchLeaderboard(cat);
  }

  function goCreateAccount() {
    soundFX.playUIClick();
    userProfile.gatekeeperTab = 'register';
    gameUI.navigateTo('GATEKEEPER');
  }

  $effect(() => {
    void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);
  });

  $effect(() => {
    let disposed = false;

    const onRoomList = (data: { rooms?: Array<any>; onlineCount?: number }) => {
      if (disposed) return;
      if (Array.isArray(data.rooms)) {
        const previousPings = new Map(gameUI.rooms.map((rm) => [rm.id, rm.ping]));
        gameUI.rooms = data.rooms.map((r: any) => {
          const id = r.id || `R-${Math.random().toString(36).substring(2, 6)}`;
          const measuredPing =
            typeof r.ping === 'number' && r.ping > 0 ? r.ping : (previousPings.get(id) ?? 0);
          return {
            id,
            name: r.name || 'Sala Pública',
            playersCount: r.playerCount ?? r.playersCount ?? 1,
            maxPlayers: Math.min(30, Math.max(2, r.maxPlayers ?? 12)),
            ping: measuredPing,
            hostPingMs: typeof r.hostPingMs === 'number' ? r.hostPingMs : undefined,
            countryCode: typeof r.countryCode === 'string' && r.countryCode ? r.countryCode : 'UN',
            roomType: r.roomType === 'ranked' ? 'ranked' : 'casual',
            isPrivate: Boolean(r.isPrivate ?? r.hasPassword),
            stadium: r.stadiumId || r.stadium || 'AF 3v3'
          };
        });
      }
      if (typeof data.onlineCount === 'number') {
        gameUI.onlineUsersCount = data.onlineCount;
      }
    };

    sharedSignaling.off('room_list', onRoomList);
    sharedSignaling.off('ROOM_LIST', onRoomList);
    sharedSignaling.on('room_list', onRoomList);
    sharedSignaling.on('ROOM_LIST', onRoomList);

    void sharedSignaling.ensureConnected().then(() => {
      if (disposed) return;
      sharedSignaling.send({ type: 'get_rooms' });
      sharedSignaling.send({ type: 'ROOM_LIST' });
    });

    return () => {
      disposed = true;
      sharedSignaling.off('room_list', onRoomList);
      sharedSignaling.off('ROOM_LIST', onRoomList);
    };
  });

  async function enterJoinedRoom(room: RoomInfo, password?: string): Promise<boolean> {
    const ok = await gameApp.joinRoom(room.id, password);
    if (!ok) return false;
    gameUI.navigateTo('IN_GAME');
    gameUI.clearModalStack();
    gameUI.openModal('TEAM_SELECT');
    return true;
  }

  async function handleJoinRoom(room: RoomInfo) {
    gameUI.lobbyError = null;
    if (room.roomType === 'ranked' && !userProfile.canJoinRanked) {
      soundFX.playUIClick();
      gameUI.lobbyError =
        'Esta sala es Clasificatoria. Debes iniciar sesión con una cuenta verificada para entrar.';
      return;
    }

    if (room.isPrivate) {
      gameUI.pendingPasswordRoom = room;
      passwordInput = '';
      passwordError = '';
      gameUI.openModal('PASSWORD_PROMPT');
    } else {
      soundFX.playUIClick();
      if (!(await enterJoinedRoom(room))) {
        gameUI.refreshRooms();
      }
    }
  }

  async function handleConfirmPassword() {
    if (!passwordInput.trim()) {
      passwordError = 'Ingresa una contraseña válida';
      return;
    }
    soundFX.playUIClick();
    if (gameUI.pendingPasswordRoom) {
      const room = gameUI.pendingPasswordRoom;
      if (!(await enterJoinedRoom(room, passwordInput.trim()))) {
        passwordError =
          gameApp.lastJoinError || 'No se pudo entrar: contraseña incorrecta o sala no disponible';
      }
    }
  }

  function personalMetricText(): string {
    const pr = userProfile.personalRank;
    if (!pr) return `${userProfile.elo} ELO`;
    if (userProfile.leaderboardCategory === 'goals') return `${pr.goals} Goles`;
    if (userProfile.leaderboardCategory === 'assists') return `${pr.assists} Asist.`;
    if (userProfile.leaderboardCategory === 'saves') return `${pr.saves} Ataj.`;
    return `${pr.elo} ELO`;
  }
</script>

<div class="lobby-root">
  <!-- Main Full-Height Layout: h-[calc(100vh-2rem)] -->
  <div class="lobby-workspace">
    <!-- LEFT COLUMN: Explorador de Salas estirado a altura completa -->
    <section class="rooms-card">
      <header class="card-header">
        <div class="header-left-group">
          {#if userProfile.isAuthenticated}
            <button
              type="button"
              class="nav-pill-btn"
              onmouseenter={() => soundFX.playUIHover()}
              onclick={() => {
                soundFX.playUIClick();
                userProfile.logout();
                gameUI.navigateTo('GATEKEEPER');
              }}
              title="Cerrar sesión"
            >
              <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Cerrar sesión</span>
            </button>
          {:else}
            <button
              type="button"
              class="nav-pill-btn"
              onmouseenter={() => soundFX.playUIHover()}
              onclick={() => gameUI.navigateTo('GATEKEEPER')}
              title="Volver al Inicio"
            >
              <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Inicio</span>
            </button>
          {/if}

          <div class="title-with-bar">
            <div class="accent-bar"></div>
            <h2 class="card-title">EXPLORADOR DE SALAS</h2>
          </div>
        </div>

        <div class="online-pill">
          <span class="pulse-dot"></span>
          <span class="online-text">
            {gameUI.onlineUsersCount} {gameUI.onlineUsersCount === 1 ? 'en línea' : 'en línea'}
          </span>
        </div>
      </header>

      <!-- Error Banner (ej. rechazo de invitado en sala Ranked) -->
      {#if gameUI.lobbyError}
        <div class="lobby-error-banner" role="alert">
          <div class="err-left">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{gameUI.lobbyError}</span>
          </div>
          <div class="err-actions">
            {#if userProfile.isGuest}
              <button type="button" class="err-login-btn" onclick={goCreateAccount}>
                Iniciar sesión
              </button>
            {/if}
            <button type="button" class="err-dismiss-btn" onclick={() => (gameUI.lobbyError = null)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        </div>
      {/if}

      <!-- Filter / Search Row -->
      <div class="filter-row">
        <div class="search-input-wrapper">
          <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Filtrar sala por nombre, país o ID..."
            value={gameUI.roomFilterQuery}
            oninput={handleSearchInput}
          />
        </div>
        <button
          type="button"
          class="refresh-btn"
          class:spinning={isRefreshing}
          title="Actualizar lista de salas"
          onclick={handleRefreshRooms}
        >
          <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
      </div>

      <!-- Scrollable Room List (flex-1 min-h-0 overflow-y-auto) -->
      <div class="room-list">
        {#each gameUI.filteredRooms as room (room.id)}
          {@const ratio = room.maxPlayers > 0 ? room.playersCount / room.maxPlayers : 0}
          {@const pingTier = getPingTier(room.ping)}
          <div
            class="room-row"
            role="listitem"
            onmouseenter={() => handleRoomHover(room.id)}
            onmouseleave={() => {
              if (hoveredRoomId === room.id) hoveredRoomId = null;
            }}
          >
            <div class="room-info">
              <CountryFlagSvg code={room.countryCode || 'UN'} size={19} />

              {#if room.isPrivate}
                <svg class="lock-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" aria-label="Sala con contraseña">
                  <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              {/if}

              {#if room.roomType === 'ranked'}
                <span class="mode-tag ranked">RANKED</span>
              {:else}
                <span class="mode-tag casual">CASUAL</span>
              {/if}

              <span class="room-name" title={room.name}>{room.name}</span>
              <span class="stadium-mini-label">{room.stadium}</span>
            </div>

            <div class="room-meta">
              {#if hoveredRoomId === room.id || room.ping > 0}
                <span
                  class="hover-ping-pill"
                  class:ping-optimal={pingTier === 'optimal'}
                  class:ping-good={pingTier === 'good'}
                  class:ping-high={pingTier === 'high'}
                  class:ping-pending={pingTier === 'pending'}
                >
                  {room.ping > 0 ? `${room.ping} ms` : 'Midiendo...'}
                </span>
              {/if}

              <span
                class="capacity-badge"
                class:occ-free={ratio < 0.75}
                class:occ-warn={ratio >= 0.75 && ratio < 1}
                class:occ-full={ratio >= 1}
              >
                {room.playersCount} / {room.maxPlayers}
              </span>

              <button
                type="button"
                class="join-room-btn"
                class:private={room.isPrivate}
                onmouseenter={() => soundFX.playUIHover()}
                onclick={() => handleJoinRoom(room)}
              >
                {#if room.isPrivate}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3">
                    <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                {/if}
                <span>UNIRSE</span>
              </button>
            </div>
          </div>
        {:else}
          <div class="empty-rooms">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#00e5ff" stroke-width="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <line x1="12" y1="4" x2="12" y2="20"></line>
              <circle cx="12" cy="12" r="3.2"></circle>
            </svg>
            <p class="empty-title">No hay salas públicas disponibles.</p>
            <p class="empty-subtitle">Crea una sala nueva o entra al Modo Entrenamiento.</p>
          </div>
        {/each}
      </div>

      <!-- Footer Actions -->
      <footer class="card-footer">
        <button
          type="button"
          class="btn-create-room"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.navigateTo('ROOM_CREATOR')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>CREAR SALA</span>
        </button>

        <button
          type="button"
          class="btn-secondary-hud"
          title="Abrir reproductor de repeticiones"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => {
            soundFX.playUIClick();
            if (!userProfile.isAuthenticated) {
              gameUI.lobbyError = 'Solo cuentas registradas pueden ver o grabar repeticiones.';
              return;
            }
            gameUI.openModal('REPLAY_VIEWER');
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>VER REPETICIÓN</span>
        </button>

        <button
          type="button"
          class="btn-secondary-hud"
          title="Configuración general"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.openModal('SETTINGS')}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>AJUSTES</span>
        </button>
      </footer>
    </section>

    <!-- RIGHT COLUMN: Perfil + Ranking Global por Pestañas + Modo Entrenamiento -->
    <aside class="right-column">
      <!-- Tarjeta de Identidad y Práctica Rápida -->
      <div class="identity-and-practice">
        <div class="player-card">
          <div class="player-avatar">
            <span>{gameUI.avatarValue || gameUI.nickname.slice(0, 2).toUpperCase()}</span>
            <span class="avatar-status-dot"></span>
          </div>
          <div class="player-details">
            <div class="nick-row">
              <span class="player-nick">{gameUI.nickname}</span>
            </div>
            <span class="player-sub">
              {userProfile.isGuest ? 'Sin progreso competitivo' : `${userProfile.elo} ELO · Cuenta verificada`}
            </span>
          </div>
        </div>

        <button
          type="button"
          class="btn-train-compact"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.enterPracticeMode()}
          title="Sala local offline individual sin límites de tiempo ni goles"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <div class="train-copy">
            <strong>MODO ENTRENAMIENTO</strong>
            <span>OFFLINE · SOLO</span>
          </div>
        </button>
      </div>

      <!-- Contenedor de Ranking Global -->
      <section class="ranking-card">
        <div class="ranking-header">
          <div class="title-with-bar">
            <div class="accent-bar gold"></div>
            <h2 class="ranking-title">RANKING GLOBAL</h2>
          </div>
          <span class="season-chip">OFICIAL</span>
        </div>

        <!-- 4 Pestañas Interactivas -->
        <div class="ranking-tabs" role="tablist" aria-label="Categorías del Ranking">
          {#each rankingTabs as tab}
            <button
              type="button"
              role="tab"
              aria-selected={userProfile.leaderboardCategory === tab.id}
              class="rank-tab-btn"
              class:active={userProfile.leaderboardCategory === tab.id}
              onclick={() => selectRankingCategory(tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <!-- Lista Ordenada (Nunca Invitados) -->
        <div class="ranking-list">
          {#if userProfile.isLeaderboardLoading && userProfile.leaderboard.length === 0}
            <div class="ranking-empty">Consultando clasificación oficial...</div>
          {:else if userProfile.leaderboard.length === 0}
            <div class="ranking-empty">
              Aún no hay partidas Ranked registradas en esta categoría.
            </div>
          {:else}
            {#each userProfile.leaderboard as entry (entry.playerId)}
              <div
                class="rank-row"
                class:top-1={entry.position === 1}
                class:top-2={entry.position === 2}
                class:top-3={entry.position === 3}
                class:is-me={userProfile.id !== null && entry.playerId === userProfile.id}
              >
                <div class="rank-pos">
                  {#if entry.position === 1}
                    <svg class="medal-svg gold" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                    </svg>
                  {:else if entry.position === 2}
                    <svg class="medal-svg silver" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <path d="M12 2l2.9 6.1L22 9.2l-5 4.8 1.2 6.9L12 17.7 5.8 20.9 7 14 2 9.2l7.1-1.1L12 2z" />
                    </svg>
                  {:else if entry.position === 3}
                    <svg class="medal-svg bronze" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <path d="M12 2l2.9 6.1L22 9.2l-5 4.8 1.2 6.9L12 17.7 5.8 20.9 7 14 2 9.2l7.1-1.1L12 2z" />
                    </svg>
                  {:else}
                    <span class="pos-num">#{entry.position}</span>
                  {/if}
                </div>

                <span class="rank-username">{entry.username}</span>

                <span class="rank-metric">
                  {entry.metricValue} <small>{activeRankingUnit}</small>
                </span>
              </div>
            {/each}
          {/if}
        </div>

        <!-- Sticky Footer: Posición personal o CTA de crear cuenta -->
        <footer class="ranking-sticky-footer">
          {#if !userProfile.isGuest && userProfile.isAuthenticated}
            <div class="personal-rank-bar">
              <span class="personal-pos">
                #{userProfile.personalRank?.position ?? '-'}
              </span>
              <span class="personal-name">{userProfile.username}</span>
              <span class="personal-val">{personalMetricText()}</span>
            </div>
          {:else}
            <button type="button" class="cta-create-account-btn" onclick={goCreateAccount}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
              <span>Crea tu cuenta para aparecer en el ranking</span>
            </button>
          {/if}
        </footer>
      </section>
    </aside>
  </div>

  <!-- PASSWORD PROMPT MODAL -->
  {#if gameUI.activeModal === 'PASSWORD_PROMPT' && gameUI.pendingPasswordRoom}
    <div class="modal-backdrop" role="presentation">
      <div class="password-modal-card">
        <h3 class="modal-title">SALA PRIVADA</h3>
        <p class="modal-sub">
          Introduce la clave de acceso para <strong>{gameUI.pendingPasswordRoom.name}</strong>:
        </p>

        <input
          type="password"
          class="modal-password-input"
          placeholder="Contraseña de la sala..."
          bind:value={passwordInput}
          onkeydown={(e) => e.key === 'Enter' && handleConfirmPassword()}
        />

        {#if passwordError}
          <p class="error-msg">{passwordError}</p>
        {/if}

        <div class="modal-actions">
          <button type="button" class="modal-cancel-btn" onclick={() => gameUI.closeModal()}>
            CANCELAR
          </button>
          <button type="button" class="modal-submit-btn" onclick={handleConfirmPassword}>
            ENTRAR
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .lobby-root {
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    padding: 1rem;
    box-sizing: border-box;
    background-color: #0b111e;
    background: radial-gradient(circle at 50% 18%, #111a2e 0%, #070b14 100%);
    pointer-events: auto;
    user-select: none;
    overflow: hidden;
  }

  .lobby-workspace {
    height: calc(100vh - 2rem);
    max-width: 1320px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(340px, 0.95fr);
    gap: 16px;
  }

  @media (max-width: 960px) {
    .lobby-root {
      overflow-y: auto;
    }
    .lobby-workspace {
      height: auto;
      grid-template-columns: 1fr;
    }
  }

  /* Contenedor de Salas estirado a altura completa */
  .rooms-card {
    height: 100%;
    min-height: 0;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .header-left-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .nav-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #0d1626;
    border: 1px solid rgba(0, 229, 255, 0.32);
    border-radius: 6px;
    color: #67e8f9;
    font-family: 'Chivo', sans-serif;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .nav-pill-btn:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .back-arrow-svg {
    width: 14px;
    height: 14px;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .accent-bar {
    width: 4px;
    height: 18px;
    background: #00e5ff;
    border-radius: 2px;
  }

  .accent-bar.gold {
    background: #ffd700;
  }

  .card-title,
  .ranking-title {
    margin: 0;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
  }

  .online-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px;
    background: #101928;
    border: 1px solid rgba(46, 204, 113, 0.3);
    border-radius: 999px;
  }

  .pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #2ecc71;
  }

  .online-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #c3f5ff;
  }

  .lobby-error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    background: #2b1118;
    border: 1px solid #ff4757;
    border-radius: 6px;
    color: #ff9ca6;
    font-size: 12px;
    flex-shrink: 0;
  }

  .err-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .err-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .err-login-btn {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #00e5ff;
    background: #0b2430;
    color: #00e5ff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .err-dismiss-btn {
    background: transparent;
    border: none;
    color: #ff9ca6;
    font-size: 16px;
    cursor: pointer;
  }

  .filter-row {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
  }

  .search-icon-svg {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: #00e5ff;
    opacity: 0.75;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 36px;
    padding: 0 12px 0 34px;
    background: #101827;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    color: #ffffff;
    font-family: 'Chivo', sans-serif;
    font-size: 12.5px;
    outline: none;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: #00e5ff;
  }

  .refresh-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: #101827;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #00e5ff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .refresh-icon {
    width: 16px;
    height: 16px;
    transition: transform 0.35s ease;
  }

  .refresh-btn.spinning .refresh-icon {
    transform: rotate(360deg);
  }

  /* Listado interno estirable: flex-1 min-h-0 overflow-y-auto */
  .room-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: #060a12;
    border: 1px solid rgba(0, 229, 255, 0.16);
    border-radius: 6px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 229, 255, 0.35) #060a12;
  }

  /* Filas compactas horizontales: py-1.5 px-3 min-h-[42px] */
  .room-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    padding: 6px 12px;
    border-radius: 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 120ms ease, border-color 120ms ease;
  }

  .room-row:hover {
    background: #0d1728;
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .lock-svg {
    color: #ffd700;
    flex-shrink: 0;
  }

  .mode-tag {
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .mode-tag.ranked {
    background: rgba(255, 215, 0, 0.15);
    border: 1px solid rgba(255, 215, 0, 0.5);
    color: #ffd700;
  }

  .mode-tag.casual {
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.28);
    color: #7dd3fc;
  }

  .room-name {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13.5px;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stadium-mini-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #64748b;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .room-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .hover-ping-pill {
    padding: 3px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .hover-ping-pill.ping-optimal {
    background: rgba(46, 204, 113, 0.14);
    border: 1px solid rgba(46, 204, 113, 0.5);
    color: #2ecc71;
  }

  .hover-ping-pill.ping-good {
    background: rgba(255, 193, 7, 0.14);
    border: 1px solid rgba(255, 193, 7, 0.5);
    color: #ffd166;
  }

  .hover-ping-pill.ping-high {
    background: rgba(255, 71, 87, 0.16);
    border: 1px solid rgba(255, 71, 87, 0.55);
    color: #ff6b7a;
  }

  .hover-ping-pill.ping-pending {
    background: rgba(148, 163, 184, 0.14);
    border: 1px solid rgba(148, 163, 184, 0.4);
    color: #cbd5e1;
  }

  .capacity-badge {
    min-width: 54px;
    text-align: center;
    padding: 3px 7px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
  }

  .capacity-badge.occ-free {
    background: rgba(46, 204, 113, 0.12);
    color: #4ade80;
    border: 1px solid rgba(46, 204, 113, 0.3);
  }

  .capacity-badge.occ-warn {
    background: rgba(255, 215, 0, 0.12);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.35);
  }

  .capacity-badge.occ-full {
    background: rgba(255, 71, 87, 0.14);
    color: #ff6b7a;
    border: 1px solid rgba(255, 71, 87, 0.35);
  }

  .join-room-btn {
    height: 28px;
    padding: 0 11px;
    border-radius: 4px;
    border: 1px solid #00e5ff;
    background: rgba(0, 229, 255, 0.14);
    color: #00e5ff;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .join-room-btn:hover {
    background: #00e5ff;
    color: #050811;
  }

  .join-room-btn.private {
    border-color: #ffd700;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
  }

  .join-room-btn.private:hover {
    background: #ffd700;
    color: #050811;
  }

  .empty-rooms {
    margin: auto;
    text-align: center;
    padding: 2rem 1rem;
    color: #8fa3bf;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .empty-title {
    margin: 4px 0 0;
    font-weight: 700;
    color: #e2e8f0;
    font-size: 13.5px;
  }

  .empty-subtitle {
    margin: 0;
    font-size: 12px;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-create-room {
    flex: 1;
    height: 40px;
    background: #00e5ff;
    border: none;
    border-radius: 6px;
    color: #050811;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.06em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    cursor: pointer;
  }

  .btn-create-room:hover {
    filter: brightness(1.1);
  }

  .btn-secondary-hud {
    height: 40px;
    padding: 0 13px;
    background: #101929;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    color: #cde8f6;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .btn-secondary-hud:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }

  /* Columna Derecha */
  .right-column {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .identity-and-practice {
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    gap: 10px;
    flex-shrink: 0;
  }

  .player-card {
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.28);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .player-avatar {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #142033;
    border: 2px solid #00e5ff;
    color: #00e5ff;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .avatar-status-dot {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #2ecc71;
    border: 2px solid #080e18;
  }

  .player-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .nick-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .player-nick {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8fa3bf;
  }

  .btn-train-compact {
    background: #0b1824;
    border: 1px solid #2ecc71;
    border-radius: 8px;
    padding: 8px 10px;
    color: #2ecc71;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    text-align: left;
  }

  .btn-train-compact:hover {
    background: #2ecc71;
    color: #050811;
  }

  .train-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .train-copy strong {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11px;
    letter-spacing: 0.03em;
  }

  .train-copy span {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    opacity: 0.85;
  }

  /* Contenedor Ranking Global */
  .ranking-card {
    flex: 1;
    min-height: 0;
    background: #080e18;
    border: 1px solid rgba(255, 215, 0, 0.32);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .ranking-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .season-chip {
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255, 215, 0, 0.12);
    border: 1px solid rgba(255, 215, 0, 0.4);
    color: #ffd700;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
  }

  .ranking-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    background: #050911;
    padding: 3px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .rank-tab-btn {
    height: 29px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #8fa3bf;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    padding: 0 4px;
  }

  .rank-tab-btn.active {
    background: #ffd700;
    color: #050811;
  }

  .ranking-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-right: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 215, 0, 0.35) #050911;
  }

  .ranking-empty {
    margin: auto;
    text-align: center;
    font-size: 12px;
    color: #7d92b0;
    padding: 1.5rem 0.75rem;
  }

  .rank-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 4px 10px;
    border-radius: 5px;
    background: #0c1422;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .rank-row.top-1 {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.16) 0%, #0c1422 80%);
    border-color: rgba(255, 215, 0, 0.45);
  }

  .rank-row.top-2 {
    background: linear-gradient(90deg, rgba(203, 213, 225, 0.14) 0%, #0c1422 80%);
    border-color: rgba(203, 213, 225, 0.35);
  }

  .rank-row.top-3 {
    background: linear-gradient(90deg, rgba(217, 119, 6, 0.16) 0%, #0c1422 80%);
    border-color: rgba(217, 119, 6, 0.4);
  }

  .rank-row.is-me {
    border-color: #00e5ff;
  }

  .rank-pos {
    width: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .medal-svg.gold {
    color: #ffd700;
  }

  .medal-svg.silver {
    color: #cbd5e1;
  }

  .medal-svg.bronze {
    color: #d97706;
  }

  .pos-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #8fa3bf;
  }

  .rank-username {
    flex: 1;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rank-metric {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 800;
    color: #00e5ff;
  }

  .rank-metric small {
    font-size: 9.5px;
    color: #8fa3bf;
    font-weight: 600;
  }

  .ranking-sticky-footer {
    flex-shrink: 0;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .personal-rank-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-radius: 6px;
    background: #091d28;
    border: 1px solid #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    color: #e2f8ff;
  }

  .personal-pos {
    color: #ffd700;
    font-weight: 800;
  }

  .personal-name {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
  }

  .personal-val {
    color: #00e5ff;
    font-weight: 800;
  }

  .cta-create-account-btn {
    width: 100%;
    height: 36px;
    border-radius: 6px;
    border: 1px solid #ffd700;
    background: #1d1808;
    color: #ffd700;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    cursor: pointer;
  }

  .cta-create-account-btn:hover {
    background: #ffd700;
    color: #050811;
  }

  /* Password Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(5, 8, 17, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .password-modal-card {
    width: min(380px, 92vw);
    background: #0c1422;
    border: 1px solid #00e5ff;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .modal-title {
    margin: 0;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 16px;
    color: #ffffff;
  }

  .modal-sub {
    margin: 0;
    font-size: 12.5px;
    color: #9cb0ca;
  }

  .modal-password-input {
    height: 40px;
    padding: 0 12px;
    background: #070b13;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 6px;
    color: #ffffff;
    outline: none;
  }

  .error-msg {
    margin: 0;
    font-size: 12px;
    color: #ff6b7a;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .modal-cancel-btn {
    height: 36px;
    padding: 0 12px;
    border-radius: 5px;
    border: 1px solid #2b3c54;
    background: #121c2c;
    color: #b8cae0;
    font-weight: 700;
    cursor: pointer;
  }

  .modal-submit-btn {
    height: 36px;
    padding: 0 16px;
    border-radius: 5px;
    border: none;
    background: #00e5ff;
    color: #050811;
    font-weight: 800;
    cursor: pointer;
  }
</style>
