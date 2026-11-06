<script lang="ts">
  import { gameUI } from "../state/gameUI.svelte.js";
  import { userProfile } from "../state/userProfile.svelte.js";
  import { soundFX } from "../../audio/SoundFX.js";
  import { EMOJI_CATALOG } from "../utils/constants.js";

  const emojiList: readonly string[] = EMOJI_CATALOG;

  let authTab = $state<'login' | 'register' | 'verify'>('login');
  let loginIdentifier = $state('');
  let loginPassword = $state('');
  let regUsername = $state('');
  let regEmail = $state('');
  let regPassword = $state('');
  let verifyDigits = $state<string[]>(['', '', '', '', '', '']);
  let devVerificationHint = $state('');
  let authStatusMessage = $state('');

  let isNameValid = $derived(gameUI.nickname.trim().length > 0);
  let hasUserManuallyEditedAvatar = $state(
    Boolean(
      gameUI.avatarMode === "emoji" ||
        (gameUI.avatarValue &&
          gameUI.avatarValue !== gameUI.nickname.trim().slice(0, 2).toUpperCase())
    )
  );

  let effectiveAvatar = $derived(
    gameUI.avatarValue ||
      (!hasUserManuallyEditedAvatar && gameUI.avatarMode === "letters"
        ? gameUI.nickname.trim().replace(/^inv_/i, "").slice(0, 2).toUpperCase()
        : "")
  );

  function handleNicknameChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    gameUI.setPlayerNickname(val.slice(0, 25));
    if (!val.trim()) {
      hasUserManuallyEditedAvatar = false;
    }
    if (!hasUserManuallyEditedAvatar && gameUI.avatarMode === "letters") {
      const autoInitials = val.trim().replace(/^inv_/i, "").slice(0, 2).toUpperCase();
      gameUI.setPlayerAvatar(autoInitials, "text");
    }
  }

  function handleAvatarTextChange(e: Event) {
    const val = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 2);
    hasUserManuallyEditedAvatar = true;
    gameUI.setPlayerAvatar(val, "text");
  }

  function selectEmoji(emoji: string) {
    soundFX.playUIClick();
    hasUserManuallyEditedAvatar = true;
    gameUI.setPlayerAvatar(emoji, "emoji");
  }

  function toggleMode(isEmoji: boolean) {
    soundFX.playUIClick();
    gameUI.avatarMode = isEmoji ? "emoji" : "letters";
    if (isEmoji) {
      if (!gameUI.avatarValue || !emojiList.includes(gameUI.avatarValue)) {
        hasUserManuallyEditedAvatar = true;
        gameUI.setPlayerAvatar(emojiList[0] || "⚽", "emoji");
      }
    } else {
      if (emojiList.includes(gameUI.avatarValue)) {
        hasUserManuallyEditedAvatar = false;
        const autoInitials = gameUI.nickname.trim().replace(/^inv_/i, "").slice(0, 2).toUpperCase();
        gameUI.setPlayerAvatar(autoInitials, "text");
      }
    }
  }

  function handlePlayClick() {
    if (!isNameValid) return;
    soundFX.ensureContext();
    soundFX.playUIClick();
    const rawNick = gameUI.nickname.trim();
    const cleanGuest = userProfile.enterAsGuest(rawNick, effectiveAvatar || rawNick.slice(0, 2).toUpperCase());
    if (!hasUserManuallyEditedAvatar && !gameUI.avatarValue && gameUI.avatarMode === "letters") {
      gameUI.setPlayerAvatar(cleanGuest.replace(/^inv_/i, "").slice(0, 2).toUpperCase(), "text");
    }
    gameUI.navigateTo("LOBBY");
  }

  async function handleAccountLogin() {
    soundFX.ensureContext();
    soundFX.playUIClick();
    authStatusMessage = '';
    const res = await userProfile.login(loginIdentifier, loginPassword);
    if (res.ok) {
      gameUI.navigateTo("LOBBY");
    } else if ((res as any).requiresVerification) {
      regEmail = loginIdentifier.includes('@') ? loginIdentifier : regEmail;
      authTab = 'verify';
    }
  }

  async function handleAccountRegister() {
    soundFX.ensureContext();
    soundFX.playUIClick();
    authStatusMessage = '';
    const res = await userProfile.register(regUsername, regEmail, regPassword);
    if (res.ok) {
      if (res.devVerificationCode) {
        devVerificationHint = res.devVerificationCode;
        verifyDigits = res.devVerificationCode.split('').slice(0, 6);
      } else {
        devVerificationHint = '';
        verifyDigits = ['', '', '', '', '', ''];
      }
      authTab = 'verify';
      authStatusMessage = res.message || 'Ingresa el código de 6 dígitos enviado a tu correo.';
    }
  }

  function handleDigitInput(index: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    verifyDigits[index] = digit;
    if (digit && index < 5) {
      const next = document.getElementById(`verify-digit-${index + 1}`) as HTMLInputElement | null;
      next?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !verifyDigits[index] && index > 0) {
      const prev = document.getElementById(`verify-digit-${index - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  }

  async function handleVerifyCode() {
    soundFX.ensureContext();
    soundFX.playUIClick();
    const code = verifyDigits.join('');
    const ok = await userProfile.verifyEmailCode(regEmail || userProfile.pendingVerificationEmail, code);
    if (ok) {
      gameUI.navigateTo("LOBBY");
    }
  }
</script>

<div class="gatekeeper-root">
  <div class="dual-wrapper">
    <!-- Logotipo Oficial y Cabecera -->
    <header class="top-brand">
      <div class="logo-badge">
        <img
          src="/logo.webp"
          alt="LegacyX-GO Logo"
          class="logo-image"
          draggable="false"
          onerror={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (!img.src.includes('Logo%20LegacyX-GO.webp')) {
              img.src = '/Logo%20LegacyX-GO.webp';
            }
          }}
        />
      </div>
      <div class="header-text">
        <h1 class="game-title">
          <span>LEGACY</span><span class="cyan-accent">X</span><span>-GO</span>
        </h1>
        <p class="game-subtitle">fútbol multijugador 2D competitivo en tiempo real</p>
      </div>
    </header>

    <div class="dual-grid">
      <!-- SECCIÓN 1: ENTRAR CON TU CUENTA -->
      <section class="panel-card account-card">
        <div class="section-header">
          <div class="section-badge cyan">
            <svg class="section-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
            <span>COMPETITIVO OFICIAL</span>
          </div>
          <h2 class="section-title">ENTRAR CON TU CUENTA</h2>
        </div>

        <!-- Beneficios con Iconografía SVG Cyber-Pitch -->
        <ul class="benefits-list">
          <li class="benefit-item">
            <svg class="benefit-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
            <span>Guarda tu ELO, rango y victorias</span>
          </li>
          <li class="benefit-item">
            <svg class="benefit-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Compite en el Ranking Global (ELO, Goles, Asistencias, Atajadas)</span>
          </li>
          <li class="benefit-item">
            <svg class="benefit-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Historial y progreso persistente</span>
          </li>
        </ul>

        <!-- Sub-pestañas Iniciar Sesión / Registrarse -->
        <div class="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="auth-tab-btn"
            class:active={authTab === 'login'}
            onclick={() => {
              soundFX.playUIClick();
              userProfile.authError = '';
              authTab = 'login';
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            role="tab"
            class="auth-tab-btn"
            class:active={authTab === 'register' || authTab === 'verify'}
            onclick={() => {
              soundFX.playUIClick();
              userProfile.authError = '';
              authTab = 'register';
            }}
          >
            Registrarse
          </button>
        </div>

        {#if authTab === 'login'}
          <div class="auth-form">
            <div class="input-group">
              <label class="group-label" for="login-identifier">USUARIO O CORREO</label>
              <input
                id="login-identifier"
                class="styled-input"
                type="text"
                placeholder="usuario o correo@dominio.com"
                bind:value={loginIdentifier}
              />
            </div>

            <div class="input-group">
              <label class="group-label" for="login-password">CONTRASEÑA</label>
              <input
                id="login-password"
                class="styled-input"
                type="password"
                placeholder="••••••••"
                bind:value={loginPassword}
                onkeydown={(e) => e.key === 'Enter' && handleAccountLogin()}
              />
            </div>

            {#if userProfile.authError}
              <p class="auth-error">{userProfile.authError}</p>
            {/if}

            <button
              type="button"
              class="account-submit-btn"
              disabled={userProfile.isLoadingAuth || !loginIdentifier.trim() || !loginPassword}
              onclick={handleAccountLogin}
            >
              <span>{userProfile.isLoadingAuth ? 'VERIFICANDO...' : 'INICIAR SESIÓN'}</span>
              <svg class="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </button>
          </div>
        {:else if authTab === 'register'}
          <div class="auth-form">
            <div class="input-group">
              <label class="group-label" for="reg-username">NOMBRE DE USUARIO (3-15 ALFANUMÉRICO, SIN inv_)</label>
              <input
                id="reg-username"
                class="styled-input"
                type="text"
                maxlength="15"
                placeholder="Ej: StrikerPro"
                bind:value={regUsername}
              />
            </div>

            <div class="input-group">
              <label class="group-label" for="reg-email">CORREO ELECTRÓNICO</label>
              <input
                id="reg-email"
                class="styled-input"
                type="email"
                placeholder="jugador@correo.com"
                bind:value={regEmail}
              />
            </div>

            <div class="input-group">
              <label class="group-label" for="reg-password">CONTRASEÑA (MÍN. 8 CARACTERES)</label>
              <input
                id="reg-password"
                class="styled-input"
                type="password"
                placeholder="Mínimo 8 caracteres"
                bind:value={regPassword}
                onkeydown={(e) => e.key === 'Enter' && handleAccountRegister()}
              />
            </div>

            {#if userProfile.authError}
              <p class="auth-error">{userProfile.authError}</p>
            {/if}

            <button
              type="button"
              class="account-submit-btn"
              disabled={userProfile.isLoadingAuth || regUsername.trim().length < 3 || !regEmail.includes('@') || regPassword.length < 8}
              onclick={handleAccountRegister}
            >
              <span>{userProfile.isLoadingAuth ? 'REGISTRANDO...' : 'CREAR CUENTA Y VERIFICAR'}</span>
              <svg class="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </button>
          </div>
        {:else}
          <!-- Vista interactiva de 6 casillas para el código de verificación -->
          <div class="verify-box-container">
            <p class="verify-info">
              {authStatusMessage || `Ingresa el código de 6 dígitos enviado a ${regEmail || userProfile.pendingVerificationEmail}`}
            </p>
            {#if devVerificationHint}
              <div class="dev-code-banner">
                <span>CÓDIGO DE VERIFICACIÓN:</span>
                <strong>{devVerificationHint}</strong>
              </div>
            {/if}

            <div class="six-digits-row">
              {#each verifyDigits as digit, idx}
                <input
                  id={`verify-digit-${idx}`}
                  type="text"
                  inputmode="numeric"
                  maxlength="1"
                  class="digit-box"
                  value={digit}
                  oninput={(e) => handleDigitInput(idx, e)}
                  onkeydown={(e) => handleDigitKeyDown(idx, e)}
                />
              {/each}
            </div>

            {#if userProfile.authError}
              <p class="auth-error">{userProfile.authError}</p>
            {/if}

            <div class="verify-actions">
              <button
                type="button"
                class="back-link-btn"
                onclick={() => (authTab = 'register')}
              >
                Volver
              </button>
              <button
                type="button"
                class="account-submit-btn"
                disabled={userProfile.isLoadingAuth || verifyDigits.join('').length !== 6}
                onclick={handleVerifyCode}
              >
                <span>CONFIRMAR CÓDIGO (1000 ELO)</span>
              </button>
            </div>
          </div>
        {/if}
      </section>

      <!-- SECCIÓN 2: JUGAR COMO INVITADO -->
      <main class="panel-card main-card">
        <div class="section-header">
          <div class="section-badge amber">
            <svg class="section-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>ACCESO RÁPIDO (inv_)</span>
          </div>
          <h2 class="section-title">JUGAR COMO INVITADO</h2>
        </div>

        <!-- Aviso en Ámbar -->
        <div class="guest-warning-box">
          <svg class="warn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Entrarás como invitado. No se guardará tu progreso, estadísticas ni puntuaciones en el ranking.</span>
        </div>

        <div class="form-container">
          <!-- Selector de Nombre -->
          <div class="input-group">
            <label class="group-label" for="nickname-input">NOMBRE DE JUGADOR (SE ANTEPONDRÁ inv_)</label>
            <div class="relative-input">
              <span class="inv-prefix-pill">inv_</span>
              <input
                id="nickname-input"
                class="styled-input with-prefix"
                type="text"
                maxlength="25"
                placeholder="Ingresa tu nickname..."
                value={gameUI.nickname}
                oninput={handleNicknameChange}
                onkeydown={(e) => e.key === 'Enter' && handlePlayClick()}
              />
              <span class="char-count">({gameUI.nickname.length}/25)</span>
            </div>
          </div>

          <!-- Selector de Avatar en Cancha -->
          <div class="input-group">
            <div class="avatar-header">
              <label class="group-label" for="avatar-input">AVATAR EN CANCHA</label>
              <div
                class="avatar-mode-tabs"
                role="tablist"
                aria-label="Modo de avatar"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={gameUI.avatarMode === "letters"}
                  class="mode-tab-btn"
                  class:active={gameUI.avatarMode === "letters"}
                  onclick={() => toggleMode(false)}
                >
                  Letras / Números
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={gameUI.avatarMode === "emoji"}
                  class="mode-tab-btn"
                  class:active={gameUI.avatarMode === "emoji"}
                  onclick={() => toggleMode(true)}
                >
                  Iconos
                </button>
              </div>
            </div>

            {#if gameUI.avatarMode === "letters"}
              <div class="avatar-controls-row">
                <div class="avatar-disc-preview" title="Renderizado en cancha">
                  <span class="avatar-disc-text">{effectiveAvatar}</span>
                  <div class="status-dot-active" title="Jugador activo"></div>
                </div>

                <input
                  id="avatar-input"
                  class="avatar-text-input"
                  type="text"
                  maxlength="2"
                  placeholder={!hasUserManuallyEditedAvatar && gameUI.nickname.trim() ? gameUI.nickname.trim().replace(/^inv_/i, "").slice(0, 2).toUpperCase() : "Ej: 10"}
                  value={gameUI.avatarValue}
                  oninput={handleAvatarTextChange}
                />
              </div>
            {:else}
              <div class="avatar-emoji-block">
                <div class="avatar-disc-preview" title="Renderizado en cancha">
                  <span class="avatar-disc-text">{effectiveAvatar}</span>
                  <div class="status-dot-active" title="Jugador activo"></div>
                </div>

                <div class="emoji-grid-catalog">
                  {#each emojiList as emoji}
                    <button
                      type="button"
                      class="emoji-choice-btn"
                      class:selected={gameUI.avatarValue === emoji}
                      onclick={() => selectEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <!-- Botón Principal "JUGAR COMO INVITADO" -->
          <button
            type="button"
            class="play-btn"
            disabled={!isNameValid}
            onmouseenter={() => isNameValid && soundFX.playUIHover()}
            onclick={handlePlayClick}
          >
            <span>ENTRAR AL LOBBY COMO INVITADO</span>
            <svg class="play-icon" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </main>
    </div>
  </div>
</div>

<style>
  .gatekeeper-root {
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background-color: #0e141e;
    background: radial-gradient(circle at 50% 25%, #161c26 0%, #0e141e 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
  }

  .dual-wrapper {
    width: min(96vw, 920px);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .top-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  .logo-badge {
    width: 58px;
    height: 58px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 229, 255, 0.5);
    background: #0a101a;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.25);
    overflow: hidden;
    flex-shrink: 0;
  }

  .logo-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
  }

  .header-text {
    text-align: left;
  }

  .game-title {
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
    margin: 0;
  }

  .cyan-accent {
    color: #00e5ff;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.6);
  }

  .game-subtitle {
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 12px;
    color: #8fa0b5;
    margin: 2px 0 0 0;
  }

  .dual-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 18px;
    align-items: stretch;
  }

  .panel-card {
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.6rem;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-sizing: border-box;
  }

  .account-card {
    border-color: #00e5ff;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.2);
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 3px 9px;
    border-radius: 4px;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  .section-badge.cyan {
    background: rgba(0, 229, 255, 0.14);
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  .section-badge.amber {
    background: rgba(255, 184, 0, 0.14);
    color: #ffb800;
    border: 1px solid rgba(255, 184, 0, 0.35);
  }

  .section-svg {
    width: 13px;
    height: 13px;
  }

  .section-title {
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-size: 17px;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.04em;
  }

  .benefits-list {
    list-style: none;
    padding: 10px 12px;
    margin: 0;
    background: #070b12;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .benefit-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 12px;
    color: #c9d6ea;
  }

  .benefit-svg {
    width: 15px;
    height: 15px;
    color: #00e5ff;
    flex-shrink: 0;
  }

  .auth-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #070b12;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    padding: 3px;
    gap: 4px;
  }

  .auth-tab-btn {
    height: 32px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #8fa0b5;
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .auth-tab-btn.active {
    background: rgba(0, 229, 255, 0.2);
    color: #00e5ff;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }

  .auth-error {
    margin: 0;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #ff4757;
    background: rgba(255, 71, 87, 0.1);
    border: 1px solid rgba(255, 71, 87, 0.35);
    padding: 6px 10px;
    border-radius: 6px;
  }

  .account-submit-btn {
    width: 100%;
    height: 44px;
    margin-top: auto;
    background: #00e5ff;
    border: none;
    border-radius: 0.5rem;
    color: #070b12;
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.4);
  }

  .account-submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  .verify-box-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }

  .verify-info {
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 12px;
    color: #c9d6ea;
    margin: 0;
  }

  .dev-code-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 6px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #00e5ff;
  }

  .six-digits-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }

  .digit-box {
    height: 46px;
    background: #070b12;
    border: 1.5px solid rgba(0, 229, 255, 0.45);
    border-radius: 6px;
    color: #ffffff;
    font-family: "JetBrains Mono", monospace;
    font-size: 18px;
    font-weight: 800;
    text-align: center;
    outline: none;
  }

  .digit-box:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .verify-actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }

  .back-link-btn {
    padding: 0 14px;
    height: 44px;
    background: transparent;
    border: 1px solid rgba(143, 160, 181, 0.35);
    border-radius: 6px;
    color: #8fa0b5;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .guest-warning-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 11px;
    background: rgba(255, 184, 0, 0.1);
    border: 1px solid rgba(255, 184, 0, 0.4);
    border-radius: 6px;
    color: #ffd166;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 12px;
    line-height: 1.35;
  }

  .warn-svg {
    width: 16px;
    height: 16px;
    color: #ffb800;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .form-container {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }

  .group-label {
    display: block;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(0, 229, 255, 0.85);
    margin-bottom: 5px;
  }

  .relative-input {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
  }

  .inv-prefix-pill {
    position: absolute;
    left: 10px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    font-weight: 700;
    color: #ffb800;
    background: rgba(255, 184, 0, 0.14);
    border: 1px solid rgba(255, 184, 0, 0.35);
    padding: 2px 6px;
    border-radius: 4px;
    pointer-events: none;
  }

  .styled-input {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.45rem;
    color: #ffffff;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    outline: none;
    box-sizing: border-box;
  }

  .styled-input.with-prefix {
    padding-left: 56px;
    padding-right: 56px;
  }

  .styled-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
  }

  .char-count {
    position: absolute;
    right: 10px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: rgba(0, 229, 255, 0.65);
  }

  .avatar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: 8px;
  }

  .avatar-header .group-label {
    margin-bottom: 0;
  }

  .avatar-mode-tabs {
    display: inline-flex;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.45rem;
    padding: 2px;
    gap: 2px;
  }

  .mode-tab-btn {
    padding: 4px 10px;
    background: transparent;
    border: none;
    border-radius: 5px;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #8fa0b5;
    cursor: pointer;
  }

  .mode-tab-btn.active {
    background: rgba(0, 229, 255, 0.2);
    color: #00e5ff;
  }

  .avatar-controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar-disc-preview {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #1b2234;
    border: 2px solid #00e5ff;
    color: #00e5ff;
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-weight: 700;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.4);
    flex-shrink: 0;
  }

  .status-dot-active {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2ecc71;
    border: 2px solid #080d16;
  }

  .avatar-text-input {
    flex: 1;
    height: 42px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.45rem;
    color: #ffffff;
    text-align: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.15em;
    outline: none;
  }

  .avatar-emoji-block {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .emoji-grid-catalog {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
    flex: 1;
  }

  .emoji-choice-btn {
    height: 34px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.4rem;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .emoji-choice-btn.selected {
    background: rgba(0, 229, 255, 0.25);
    border-color: #00e5ff;
  }

  .play-btn {
    width: 100%;
    height: 44px;
    margin-top: auto;
    background: #ffb800;
    border: none;
    border-radius: 0.5rem;
    color: #0a101a;
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-weight: 800;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 0 16px rgba(255, 184, 0, 0.35);
  }

  .play-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    box-shadow: none;
  }

  .play-icon {
    width: 17px;
    height: 17px;
  }
</style>
