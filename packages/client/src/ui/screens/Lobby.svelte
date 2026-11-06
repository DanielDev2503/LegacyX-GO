<script lang="ts">
  import { gameUI, type RoomInfo } from '../state/gameUI.svelte.js';
  import { userProfile, type LeaderboardCategory } from '../state/userProfile.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { sharedSignaling } from '../../net/SignalingClient.js';
  import { gameApp } from '../../net/GameApp.js';
  import CountryFlagBadge from '../components/CountryFlagBadge.svelte';

  let passwordInput = $state('');
  let passwordError = $state('');
  let isRefreshing = $state(false);
  let activeLobbyView = $state<'rooms' | 'rankings'>('rooms');
  let hoveredRoomId = $state<string | null>(null);
  let targetRoleUsername = $state('');
  let targetRoleValue = $state<'representante' | 'jugador'>('representante');
  let roleAdminNotice = $state('');

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
    setTimeout(() => {
      isRefreshing = false;
    }, 600);
  }

  function switchRankingCategory(cat: LeaderboardCategory) {
    soundFX.playUIClick();
    void userProfile.fetchLeaderboard(cat);
  }

  async function handleAssignRole() {
    if (!targetRoleUsername.trim()) return;
    soundFX.playUIClick();
    const res = await userProfile.assignUserRole(targetRoleUsername.trim(), targetRoleValue);
    roleAdminNotice = res.message;
    if (res.ok) {
      targetRoleUsername = '';
      void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);
    }
  }

  $effect(() => {
    void sharedSignaling.ensureConnected().then(() => {
      sharedSignaling.send({ type: 'get_rooms' });
      sharedSignaling.send({ type: 'ROOM_LIST' });
    });
    gameUI.refreshRooms();
    void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);

    const onRoomList = (data: { rooms?: Array<any>; onlineCount?: number }) => {
      if (Array.isArray(data.rooms)) {
        gameUI.rooms = data.rooms.map((r: any) => ({
          id: r.id || `R-${Math.random().toString(36).substring(2, 6)}`,
          name: r.name || 'Sala Pública',
          playersCount: r.playerCount ?? r.playersCount ?? 1,
          maxPlayers: r.maxPlayers ?? 30,
          ping:
            typeof r.hostPingMs === 'number' && gameUI.realPing !== null
              ? Math.max(1, Math.round(r.hostPingMs + gameUI.realPing))
              : (r.hostPingMs ?? gameUI.realPing ?? 20),
          hostPingMs: r.hostPingMs ?? 20,
          countryCode: r.countryCode || 'CO',
          roomType: r.roomType === 'ranked' ? 'ranked' : 'casual',
          isPrivate: Boolean(r.isPrivate ?? r.hasPassword),
          stadium: r.stadiumId || r.stadium || 'AF 3v3',
          timeLimit: r.timeLimit,
          scoreLimit: r.scoreLimit
        }));
      }
      if (typeof data.onlineCount === 'number') {
        gameUI.onlineUsersCount = data.onlineCount;
      }
    };

    sharedSignaling.on('room_list', onRoomList);
    sharedSignaling.on('ROOM_LIST', onRoomList);

    return () => {
      sharedSignaling.off('room_list', onRoomList);
      sharedSignaling.off('ROOM_LIST', onRoomList);
    };
  });

  async function enterJoinedRoom(room: RoomInfo, password?: string): Promise<boolean> {
    const ok = await gameApp.joinRoom(room.id, password);
    if (!ok) return false;
    gameUI.isPracticeMode = false;
    gameUI.roomType = room.roomType ?? 'casual';
    gameUI.navigateTo('IN_GAME');
    gameUI.clearModalStack();
    gameUI.openModal('TEAM_SELECT');
    return true;
  }

  async function handleJoinRoom(room: RoomInfo) {
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
        passwordError = 'No se pudo entrar: contraseña incorrecta o sala no disponible';
      }
    }
  }
</script>

<div class="lobby-root">
  <!-- Top Navigation Header -->
  <header class="top-header">
    <button
      type="button"
      class="nav-pill-btn"
      onmouseenter={() => soundFX.playUIHover()}
      onclick={() => gameUI.navigateTo('GATEKEEPER')}
      title="Volver al Inicio"
    >
      <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Volver</span>
    </button>

    <!-- Selector de vista principal: Salas Públicas vs Rankings Globales -->
    <div class="lobby-view-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="view-tab-btn"
        class:active={activeLobbyView === 'rooms'}
        onclick={() => {
          soundFX.playUIClick();
          activeLobbyView = 'rooms';
        }}
      >
        <svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>SALAS PÚBLICAS</span>
      </button>
      <button
        type="button"
        role="tab"
        class="view-tab-btn"
        class:active={activeLobbyView === 'rankings'}
        onclick={() => {
          soundFX.playUIClick();
          activeLobbyView = 'rankings';
          void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);
        }}
      >
        <svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
        </svg>
        <span>RANKINGS GLOBALES</span>
      </button>
    </div>

    <button
      type="button"
      class="nav-pill-btn replay-pill"
      onclick={() => {
        soundFX.playUIClick();
        gameUI.showReplayModal = true;
      }}
      title="Abrir reproductor de repeticiones (.lxr)"
    >
      <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Ver Repetición</span>
    </button>
  </header>

  <!-- Main Dual Card Layout -->
  <div class="content-container">
    {#if activeLobbyView === 'rooms'}
      <!-- LEFT CARD: Room Browser (Altura Completa) -->
      <section class="rooms-card">
        <div class="card-header">
          <div class="title-with-bar">
            <div class="accent-bar"></div>
            <h2 class="card-title">SALAS PÚBLICAS</h2>
          </div>
          <div class="online-pill">
            <span class="pulse-dot"></span>
            <span class="online-text">
              {gameUI.onlineUsersCount} {gameUI.onlineUsersCount === 1 ? 'jugador en línea' : 'jugadores en línea'}
            </span>
          </div>
        </div>

        <!-- Filter / Search Row -->
        <div class="filter-row">
          <div class="search-input-wrapper">
            <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              class="search-input"
              placeholder="Buscar sala por nombre o ID..."
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
            <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        </div>

        <!-- Scrollable Room List (flex-1 min-h-0) -->
        <div class="room-list">
          {#each gameUI.filteredRooms as room (room.id)}
            {@const ratio = room.maxPlayers > 0 ? room.playersCount / room.maxPlayers : 0}
            {@const estPing = Math.max(5, Math.round(room.ping || gameUI.realPing || 24))}
            <div
              class="room-row"
              role="listitem"
              onmouseenter={() => (hoveredRoomId = room.id)}
              onmouseleave={() => {
                if (hoveredRoomId === room.id) hoveredRoomId = null;
              }}
            >
              <div class="room-info">
                <CountryFlagBadge countryCode={room.countryCode || 'CO'} />
                {#if room.isPrivate}
                  <span class="lock-indicator" title="Sala con contraseña">
                    <svg class="mini-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                {/if}
                {#if room.roomType === 'ranked'}
                  <span class="room-type-badge ranked" title="Sala Clasificatoria Oficial (Ranked)">
                    <svg class="mini-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                    </svg>
                    <span>RANKED</span>
                  </span>
                {:else}
                  <span class="room-type-badge casual">CASUAL</span>
                {/if}
                <span class="room-name">{room.name}</span>
              </div>

              <div class="room-meta">
                {#if hoveredRoomId === room.id}
                  <span
                    class="ping-estimate-badge"
                    class:ping-good={estPing < 80}
                    class:ping-warn={estPing >= 80 && estPing <= 150}
                    class:ping-bad={estPing > 150}
                  >
                    <svg class="mini-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>
                    </svg>
                    <span>Ping estimado: ~{estPing} ms</span>
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
                    <svg class="btn-lock-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  {/if}
                  <span>UNIRSE</span>
                </button>
              </div>
            </div>
          {:else}
            <div class="empty-rooms">
              <svg class="empty-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="4" x2="12" y2="20" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
              <p class="empty-title">No hay salas públicas disponibles. ¡Crea una para comenzar!</p>
              <p class="empty-subtitle">¡Sé el primero en crear una sala y desafiar a otros jugadores!</p>
            </div>
          {/each}
        </div>

        <!-- Bottom Actions -->
        <div class="card-footer">
          <button
            type="button"
            class="btn-create-room"
            onmouseenter={() => soundFX.playUIHover()}
            onclick={() => gameUI.navigateTo('ROOM_CREATOR')}
          >
            <svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>CREAR SALA</span>
          </button>

          <button
            type="button"
            class="btn-settings"
            title="Configuración general"
            onmouseenter={() => soundFX.playUIHover()}
            onclick={() => gameUI.openModal('SETTINGS')}
          >
            <svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>AJUSTES</span>
          </button>
        </div>
      </section>
    {:else}
      <!-- SECCIÓN DE RANKINGS GLOBALES (4 Pestañas Competitivas) -->
      <section class="rooms-card rankings-card">
        <div class="card-header">
          <div class="title-with-bar">
            <div class="accent-bar gold"></div>
            <h2 class="card-title">RANKINGS GLOBALES (TOP 50)</h2>
          </div>

          <div class="ranking-subtabs">
            <button
              type="button"
              class="rank-subtab"
              class:active={userProfile.leaderboardCategory === 'elo'}
              onclick={() => switchRankingCategory('elo')}
            >
              Mayor ELO
            </button>
            <button
              type="button"
              class="rank-subtab"
              class:active={userProfile.leaderboardCategory === 'goals'}
              onclick={() => switchRankingCategory('goals')}
            >
              Máximos Goleadores
            </button>
            <button
              type="button"
              class="rank-subtab"
              class:active={userProfile.leaderboardCategory === 'assists'}
              onclick={() => switchRankingCategory('assists')}
            >
              Máximos Asistidores
            </button>
            <button
              type="button"
              class="rank-subtab"
              class:active={userProfile.leaderboardCategory === 'saves'}
              onclick={() => switchRankingCategory('saves')}
            >
              Mejores Porteros
            </button>
          </div>
        </div>

        {#if userProfile.isSuperadmin}
          <div class="superadmin-role-bar">
            <span class="sa-label">PANEL SUPERADMIN:</span>
            <input
              type="text"
              class="sa-input"
              placeholder="Usuario objetivo..."
              bind:value={targetRoleUsername}
            />
            <select class="sa-select" bind:value={targetRoleValue}>
              <option value="representante">Representante</option>
              <option value="jugador">Jugador</option>
            </select>
            <button type="button" class="sa-btn" onclick={handleAssignRole}>ASIGNAR ROL</button>
            {#if roleAdminNotice}
              <span class="sa-notice">{roleAdminNotice}</span>
            {/if}
          </div>
        {/if}

        <div class="leaderboard-table-wrap">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>POS</th>
                <th>JUGADOR</th>
                <th>PJ</th>
                <th>% VICT</th>
                <th class:highlight-col={userProfile.leaderboardCategory === 'elo'}>ELO</th>
                <th class:highlight-col={userProfile.leaderboardCategory === 'goals'}>GOLES</th>
                <th class:highlight-col={userProfile.leaderboardCategory === 'assists'}>ASIST</th>
                <th class:highlight-col={userProfile.leaderboardCategory === 'saves'}>ATAJADAS</th>
              </tr>
            </thead>
            <tbody>
              {#each userProfile.leaderboard as entry (entry.userId)}
                <tr class:top-three={entry.rank <= 3}>
                  <td class="pos-cell">
                    {#if entry.rank === 1}
                      <span class="medal-badge gold" title="Top 1 Oro">
                        <svg class="medal-svg" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="14" r="7" />
                          <path d="M8 2h8l-2 6h-4L8 2z" />
                        </svg>
                        <span>#1</span>
                      </span>
                    {:else if entry.rank === 2}
                      <span class="medal-badge silver" title="Top 2 Plata">
                        <svg class="medal-svg" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="14" r="7" />
                          <path d="M8 2h8l-2 6h-4L8 2z" />
                        </svg>
                        <span>#2</span>
                      </span>
                    {:else if entry.rank === 3}
                      <span class="medal-badge bronze" title="Top 3 Bronce">
                        <svg class="medal-svg" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="14" r="7" />
                          <path d="M8 2h8l-2 6h-4L8 2z" />
                        </svg>
                        <span>#3</span>
                      </span>
                    {:else}
                      <span class="rank-num">#{entry.rank}</span>
                    {/if}
                  </td>
                  <td class="player-cell">
                    <span class="lb-username">{entry.displayName || entry.username}</span>
                    {#if entry.role === 'superadmin'}
                      <span class="role-tag superadmin">DEV</span>
                    {:else if entry.role === 'representante'}
                      <span class="role-tag rep">REP</span>
                    {/if}
                  </td>
                  <td>{entry.matchesPlayed}</td>
                  <td>{entry.winRate}%</td>
                  <td class:highlight-val={userProfile.leaderboardCategory === 'elo'}>{entry.elo}</td>
                  <td class:highlight-val={userProfile.leaderboardCategory === 'goals'}>{entry.goals}</td>
                  <td class:highlight-val={userProfile.leaderboardCategory === 'assists'}>{entry.assists}</td>
                  <td class:highlight-val={userProfile.leaderboardCategory === 'saves'}>{entry.saves}</td>
                </tr>
              {:else}
                <tr>
                  <td colspan="8" class="empty-lb-cell">
                    {userProfile.isLoadingLeaderboard
                      ? 'Cargando clasificación oficial...'
                      : 'Aún no hay registros clasificatorios en esta categoría.'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Fila fija inferior con posición personal -->
        <div class="personal-rank-footer">
          {#if userProfile.isAuthenticated && !userProfile.isGuest}
            <div class="my-rank-summary">
              <span class="my-rank-label">TU CUENTA OFICIAL:</span>
              <strong>{userProfile.displayName}</strong>
              <span class="my-stat-pill">ELO: {userProfile.stats.elo}</span>
              <span class="my-stat-pill">Goles: {userProfile.stats.goals}</span>
              <span class="my-stat-pill">Asist: {userProfile.stats.assists}</span>
              <span class="my-stat-pill">Atajadas: {userProfile.stats.saves}</span>
            </div>
          {:else}
            <div class="my-rank-guest">
              <span>Estás jugando como invitado (<strong>{gameUI.nickname}</strong>). Inicia sesión con cuenta verificada para clasificar en el Ranking Global.</span>
              <button type="button" class="link-login-btn" onclick={() => gameUI.navigateTo('GATEKEEPER')}>
                Crear Cuenta / Iniciar Sesión
              </button>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- RIGHT MODULE: Player info & Practice Mode -->
    <div class="sidebar-module">
      <!-- Player Mini Card -->
      <div class="player-card">
        <div class="player-avatar">
          <span>{gameUI.avatarValue}</span>
          <span class="avatar-status-dot"></span>
        </div>
        <div class="player-details">
          <span class="player-nick">{gameUI.nickname}</span>
          <span class="player-role-badge">
            {#if userProfile.isGuest}
              INVITADO (SIN RANKING)
            {:else if userProfile.role === 'superadmin'}
              SUPERADMIN · {userProfile.stats.elo} ELO
            {:else if userProfile.role === 'representante'}
              REPRESENTANTE · {userProfile.stats.elo} ELO
            {:else}
              JUGADOR VERIFICADO · {userProfile.stats.elo} ELO
            {/if}
          </span>
        </div>
      </div>

      <!-- Practice Mode Card -->
      <aside class="practice-card">
        <div class="practice-header">
          <h3 class="practice-title">
            <svg class="practice-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="12 7 16.5 10.5 14.8 16 9.2 16 7.5 10.5 12 7"></polygon>
            </svg>
            <span>MODO PRÁCTICA</span>
          </h3>
          <span class="solo-badge">OFFLINE / SOLO</span>
        </div>
        <p class="practice-desc">
          Entrena tiros, regates y mecánicas en solitario sin conexión de red ni límite de tiempo.
        </p>

        <button
          type="button"
          class="btn-train"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.enterPracticeMode()}
        >
          <svg class="settings-icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>ENTRENAR AHORA</span>
        </button>
      </aside>
    </div>
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
          <button
            type="button"
            class="modal-cancel-btn"
            onclick={() => gameUI.closeModal()}
          >
            CANCELAR
          </button>
          <button
            type="button"
            class="modal-submit-btn"
            onclick={handleConfirmPassword}
          >
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
    height: 100vh;
    overflow: hidden;
    background-color: #0b111e;
    background: radial-gradient(circle at 50% 20%, #111a2e 0%, #070b14 100%);
    display: flex;
    flex-direction: column;
    padding: 14px 24px;
    gap: 12px;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
  }

  .top-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    z-index: 30;
    flex-shrink: 0;
  }

  .nav-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 1rem;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 9999px;
    color: #67e8f9;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .nav-pill-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #ffffff;
  }

  .replay-pill {
    border-color: rgba(255, 215, 0, 0.4);
    color: #ffd700;
  }

  .back-arrow-svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .lobby-view-tabs {
    display: inline-flex;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 8px;
    padding: 3px;
    gap: 4px;
  }

  .view-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #8fa0b5;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
  }

  .view-tab-btn.active {
    background: rgba(0, 229, 255, 0.18);
    color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.25);
  }

  .tab-svg {
    width: 15px;
    height: 15px;
  }

  .content-container {
    display: flex;
    justify-content: center;
    align-items: stretch;
    gap: 20px;
    max-width: 1180px;
    width: 100%;
    height: calc(100vh - 80px);
    min-height: 0;
    margin: 0 auto;
  }

  .rooms-card {
    flex: 1;
    height: 100%;
    min-height: 0;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.5rem;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.15);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    flex-shrink: 0;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .accent-bar {
    width: 4px;
    height: 22px;
    background: #00e5ff;
    border-radius: 2px;
    box-shadow: 0 0 8px #00e5ff;
  }

  .accent-bar.gold {
    background: #ffd700;
    box-shadow: 0 0 8px #ffd700;
  }

  .card-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 17px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.05em;
  }

  .online-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: #161c26;
    border: 1px solid rgba(46, 204, 113, 0.25);
    border-radius: 9999px;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2ecc71;
    box-shadow: 0 0 8px #2ecc71;
  }

  .online-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #c3f5ff;
    font-weight: 600;
  }

  .filter-row {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
  }

  .search-icon-svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 15px;
    height: 15px;
    color: #00e5ff;
    opacity: 0.7;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 38px;
    padding-left: 36px;
    padding-right: 14px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.5rem;
    color: #ffffff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }

  .refresh-btn {
    width: 38px;
    height: 38px;
    border-radius: 0.5rem;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #00e5ff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .refresh-icon {
    width: 17px;
    height: 17px;
    transition: transform 0.35s ease;
  }

  .refresh-btn.spinning .refresh-icon {
    transform: rotate(360deg);
  }

  .room-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: #060a12;
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 8px;
    padding: 4px 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 229, 255, 0.35) rgba(8, 14, 24, 0.6);
  }

  .room-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    transition: background 0.12s ease;
  }

  .room-row:hover {
    background: rgba(0, 229, 255, 0.06);
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .lock-indicator {
    display: inline-flex;
    align-items: center;
    color: #ffd700;
  }

  .mini-svg {
    width: 13px;
    height: 13px;
  }

  .room-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  .room-type-badge.ranked {
    background: rgba(255, 215, 0, 0.15);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.45);
  }

  .room-type-badge.casual {
    background: rgba(0, 229, 255, 0.1);
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.25);
  }

  .room-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #dde2f1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .room-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .ping-estimate-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    background: rgba(46, 204, 113, 0.12);
    border: 1px solid rgba(46, 204, 113, 0.4);
    color: #2ecc71;
  }

  .ping-estimate-badge.ping-warn {
    background: rgba(255, 215, 0, 0.12);
    border-color: rgba(255, 215, 0, 0.4);
    color: #ffd700;
  }

  .ping-estimate-badge.ping-bad {
    background: rgba(255, 71, 87, 0.12);
    border-color: rgba(255, 71, 87, 0.4);
    color: #ff4757;
  }

  .capacity-badge {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    font-weight: 700;
    color: #dfeeff;
    background: #1a202a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 3px 8px;
    border-radius: 4px;
  }

  .capacity-badge.occ-free {
    color: #2ecc71;
    border-color: rgba(46, 204, 113, 0.35);
    background: rgba(46, 204, 113, 0.1);
  }

  .capacity-badge.occ-warn {
    color: #ffd700;
    border-color: rgba(255, 215, 0, 0.35);
    background: rgba(255, 215, 0, 0.1);
  }

  .capacity-badge.occ-full {
    color: #ff4757;
    border-color: rgba(255, 71, 87, 0.4);
    background: rgba(255, 71, 87, 0.12);
  }

  .btn-lock-svg {
    width: 12px;
    height: 12px;
    margin-right: 4px;
  }

  .join-room-btn {
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    border-radius: 5px;
    background: #00e5ff;
    border: none;
    color: #080e18;
    font-family: 'Chivo', system-ui, sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  .join-room-btn.private {
    background: rgba(0, 229, 255, 0.18);
    border: 1px solid #00e5ff;
    color: #00e5ff;
  }

  .empty-rooms {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    background: rgba(14, 20, 32, 0.5);
    border: 1px dashed rgba(0, 229, 255, 0.25);
    border-radius: 8px;
    text-align: center;
    margin: auto 0;
  }

  .empty-svg-icon {
    width: 36px;
    height: 36px;
    color: #00e5ff;
    margin-bottom: 10px;
  }

  .empty-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 4px 0;
  }

  .empty-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    color: #8fa0b5;
    margin: 0;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px solid rgba(0, 229, 255, 0.15);
    flex-shrink: 0;
  }

  .btn-create-room {
    height: 40px;
    padding: 0 18px;
    border-radius: 6px;
    background: #00e5ff;
    border: none;
    color: #080e18;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-settings {
    height: 40px;
    padding: 0 16px;
    border-radius: 6px;
    background: #141c2b;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .settings-icon {
    width: 15px;
    height: 15px;
  }

  /* Rankings Table */
  .ranking-subtabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .rank-subtab {
    padding: 5px 10px;
    border-radius: 5px;
    border: 1px solid rgba(0, 229, 255, 0.25);
    background: #0d1524;
    color: #8fa0b5;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .rank-subtab.active {
    background: rgba(255, 215, 0, 0.16);
    border-color: #ffd700;
    color: #ffd700;
  }

  .superadmin-role-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(255, 0, 85, 0.08);
    border: 1px solid rgba(255, 0, 85, 0.35);
    border-radius: 6px;
    flex-wrap: wrap;
  }

  .sa-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 800;
    color: #ff4757;
  }

  .sa-input,
  .sa-select {
    height: 30px;
    padding: 0 8px;
    background: #070b12;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 4px;
    color: #ffffff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
  }

  .sa-btn {
    height: 30px;
    padding: 0 10px;
    background: #00e5ff;
    color: #070b12;
    border: none;
    border-radius: 4px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .sa-notice {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #ffd700;
  }

  .leaderboard-table-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 8px;
    background: #060a12;
  }

  .leaderboard-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }

  .leaderboard-table th {
    position: sticky;
    top: 0;
    background: #0c1424;
    color: #8fa0b5;
    font-size: 10px;
    font-weight: 700;
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(0, 229, 255, 0.2);
  }

  .leaderboard-table th.highlight-col {
    color: #ffd700;
  }

  .leaderboard-table td {
    padding: 7px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: #dde2f1;
  }

  .leaderboard-table td.highlight-val {
    color: #00e5ff;
    font-weight: 800;
  }

  .medal-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 800;
  }

  .medal-badge.gold {
    color: #ffd700;
  }

  .medal-badge.silver {
    color: #c0c0c0;
  }

  .medal-badge.bronze {
    color: #cd7f32;
  }

  .medal-svg {
    width: 14px;
    height: 14px;
  }

  .role-tag {
    margin-left: 6px;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 800;
  }

  .role-tag.superadmin {
    background: rgba(255, 71, 87, 0.2);
    color: #ff4757;
  }

  .role-tag.rep {
    background: rgba(255, 215, 0, 0.2);
    color: #ffd700;
  }

  .empty-lb-cell {
    text-align: center;
    padding: 32px !important;
    color: #8fa0b5;
  }

  .personal-rank-footer {
    padding: 10px 12px;
    background: #0c1424;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .my-rank-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
  }

  .my-rank-label {
    color: #00e5ff;
    font-weight: 700;
  }

  .my-stat-pill {
    padding: 2px 7px;
    background: #070b12;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 4px;
    color: #dde2f1;
  }

  .my-rank-guest {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    color: #ffd166;
  }

  .link-login-btn {
    padding: 5px 10px;
    background: #00e5ff;
    color: #070b12;
    border: none;
    border-radius: 4px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .sidebar-module {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 280px;
    flex-shrink: 0;
  }

  .player-card {
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .player-avatar {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #161c26;
    border: 2px solid #00e5ff;
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 15px;
    flex-shrink: 0;
  }

  .avatar-status-dot {
    position: absolute;
    top: -1px;
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

  .player-nick {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-role-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
  }

  .practice-card {
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .practice-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .solo-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: #161c26;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .practice-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #fff9ef;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .practice-svg {
    width: 16px;
    height: 16px;
    color: #00e5ff;
  }

  .practice-desc {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    line-height: 1.45;
    color: #8fa0b5;
    margin: 0;
  }

  .btn-train {
    width: 100%;
    height: 40px;
    border-radius: 6px;
    background: #2ecc71;
    border: none;
    color: #05150c;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  /* Password Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 14, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    pointer-events: auto;
  }

  .password-modal-card {
    width: min(90vw, 400px);
    background: #0a101a;
    border: 1px solid #00e5ff;
    border-radius: 0.5rem;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
  }

  .modal-sub {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 13px;
    color: #8fa0b5;
    margin: 0;
  }

  .modal-sub strong {
    color: #00e5ff;
  }

  .modal-password-input {
    width: 100%;
    height: 42px;
    padding: 0 14px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 6px;
    color: #ffffff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .error-msg {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #ff4757;
    margin: 0;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }

  .modal-cancel-btn {
    padding: 8px 16px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid rgba(143, 160, 181, 0.4);
    color: #8fa0b5;
    font-family: 'Chivo', system-ui, sans-serif;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
  }

  .modal-submit-btn {
    padding: 8px 18px;
    border-radius: 6px;
    background: #00e5ff;
    border: none;
    color: #080e18;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
  }
</style>
