<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import {
    userProfile,
    formatGuestNickname,
    validateAccountUsername
  } from '../state/userProfile.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { EMOJI_CATALOG } from '../utils/constants.js';

  const emojiList: readonly string[] = EMOJI_CATALOG;

  // Sección 1: Estado de Cuenta Oficial (Iniciar Sesión / Registrarse / Verificación 6 dígitos)
  let loginIdentifier = $state('');
  let loginPassword = $state('');

  let regUsername = $state('');
  let regEmail = $state('');
  let regPassword = $state('');

  let otpDigits = $state<string[]>(['', '', '', '', '', '']);
  let otpRefs = $state<Array<HTMLInputElement | null>>([null, null, null, null, null, null]);

  // Sección 2: Estado de Invitado (prefijo obligatorio inv_)
  const initialCleanGuest = gameUI.nickname.replace(/^(inv_)+/i, '').trim() || 'Jugador';
  let guestRawName = $state(initialCleanGuest);
  let guestPreviewName = $derived(formatGuestNickname(guestRawName));
  let isGuestNameValid = $derived(guestRawName.trim().length > 0);

  let hasUserManuallyEditedAvatar = $state(
    Boolean(
      gameUI.avatarMode === 'emoji' ||
        (gameUI.avatarValue &&
          gameUI.avatarValue !== initialCleanGuest.slice(0, 2).toUpperCase())
    )
  );

  let effectiveAvatar = $derived(
    gameUI.avatarValue ||
      (!hasUserManuallyEditedAvatar && gameUI.avatarMode === 'letters'
        ? guestRawName.trim().slice(0, 2).toUpperCase() || 'JG'
        : '')
  );

  const regUsernameValidation = $derived(
    regUsername.trim().length === 0 ? null : validateAccountUsername(regUsername)
  );

  const otpJoined = $derived(otpDigits.join(''));

  function switchAuthTab(tab: 'login' | 'register') {
    soundFX.playUIClick();
    userProfile.authError = null;
    userProfile.authNotice = null;
    userProfile.gatekeeperTab = tab;
  }

  async function handleAccountLogin(e: SubmitEvent) {
    e.preventDefault();
    soundFX.ensureContext();
    soundFX.playUIClick();
    const res = await userProfile.login(loginIdentifier, loginPassword);
    if (res.ok) {
      gameUI.navigateTo('LOBBY');
    }
  }

  async function handleAccountRegister(e: SubmitEvent) {
    e.preventDefault();
    soundFX.ensureContext();
    soundFX.playUIClick();
    const res = await userProfile.register(regUsername, regEmail, regPassword);
    if (res.ok) {
      otpDigits = ['', '', '', '', '', ''];
      setTimeout(() => otpRefs[0]?.focus(), 40);
    }
  }

  function handleOtpInput(index: number, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    if (!raw) {
      otpDigits[index] = '';
      return;
    }
    // Soporte de pegado rápido de múltiples dígitos
    if (raw.length > 1) {
      const chars = raw.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        otpDigits[i] = chars[i] || '';
      }
      const focusIdx = Math.min(5, chars.length);
      otpRefs[focusIdx]?.focus();
      return;
    }
    otpDigits[index] = raw[0]!;
    if (index < 5) {
      otpRefs[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpDigits[index - 1] = '';
      otpRefs[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpRefs[index + 1]?.focus();
    }
  }

  function handleOtpPaste(e: ClipboardEvent) {
    const pasted = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) || '';
    if (pasted.length > 0) {
      e.preventDefault();
      for (let i = 0; i < 6; i++) {
        otpDigits[i] = pasted[i] || '';
      }
      otpRefs[Math.min(5, pasted.length - 1)]?.focus();
    }
  }

  async function handleVerifyOtp(e: SubmitEvent) {
    e.preventDefault();
    if (otpJoined.length !== 6) return;
    soundFX.playUIClick();
    const res = await userProfile.verifyCode(
      userProfile.pendingVerificationEmail || regEmail || loginIdentifier,
      otpJoined,
      regPassword || loginPassword
    );
    if (res.ok) {
      gameUI.navigateTo('LOBBY');
    }
  }

  async function handleResendOtp() {
    soundFX.playUIClick();
    await userProfile.resendCode();
  }

  function handleGuestInput(e: Event) {
    const val = (e.target as HTMLInputElement).value.replace(/^(inv_)+/i, '').slice(0, 18);
    guestRawName = val;
    if (!val.trim()) {
      hasUserManuallyEditedAvatar = false;
    }
    if (!hasUserManuallyEditedAvatar && gameUI.avatarMode === 'letters') {
      const autoInitials = val.trim().slice(0, 2).toUpperCase() || 'JG';
      gameUI.setPlayerAvatar(autoInitials, 'text');
    }
  }

  function handleAvatarTextChange(e: Event) {
    const val = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 2);
    hasUserManuallyEditedAvatar = true;
    gameUI.setPlayerAvatar(val, 'text');
  }

  function selectEmoji(emoji: string) {
    soundFX.playUIClick();
    hasUserManuallyEditedAvatar = true;
    gameUI.setPlayerAvatar(emoji, 'emoji');
  }

  function toggleAvatarMode(isEmoji: boolean) {
    soundFX.playUIClick();
    gameUI.avatarMode = isEmoji ? 'emoji' : 'letters';
    if (isEmoji) {
      if (!gameUI.avatarValue || !emojiList.includes(gameUI.avatarValue)) {
        hasUserManuallyEditedAvatar = true;
        gameUI.setPlayerAvatar(emojiList[0] || '★', 'emoji');
      }
    } else if (emojiList.includes(gameUI.avatarValue)) {
      hasUserManuallyEditedAvatar = false;
      const autoInitials = guestRawName.trim().slice(0, 2).toUpperCase() || 'JG';
      gameUI.setPlayerAvatar(autoInitials, 'text');
    }
  }

  function handleEnterAsGuest() {
    if (!isGuestNameValid) return;
    soundFX.ensureContext();
    soundFX.playUIClick();
    const chosenAvatar =
      effectiveAvatar || guestRawName.trim().slice(0, 2).toUpperCase() || 'JG';
    userProfile.enterAsGuest(guestRawName, chosenAvatar, gameUI.avatarMode);
    gameUI.navigateTo('LOBBY');
  }

  function handleContinueLoggedAccount() {
    soundFX.ensureContext();
    soundFX.playUIClick();
    gameUI.setPlayerNickname(userProfile.username);
    gameUI.navigateTo('LOBBY');
  }
</script>

<div class="gatekeeper-root">
  <div class="gatekeeper-shell">
    <!-- Encabezado de Marca -->
    <header class="brand-header">
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
      <div class="brand-copy">
        <h1 class="game-title">
          <span>LEGACY</span><span class="cyan-accent">X</span><span>-GO</span>
        </h1>
        <p class="game-subtitle">FÚTBOL COMPETITIVO 2D · FÍSICA DETERMINISTA 60 HZ · P2P WEBRTC</p>
      </div>
    </header>

    <!-- Panel Dual Dividido -->
    <main class="dual-grid">
      <!-- SECCIÓN 1: ENTRAR CON TU CUENTA -->
      <section class="panel-card account-panel">
        <div class="panel-heading">
          <div class="heading-left">
            <span class="accent-pill cyan"></span>
            <h2 class="panel-title">ENTRAR CON TU CUENTA</h2>
          </div>
          <span class="competitive-tag">RANKED & ELO</span>
        </div>

        <!-- Beneficios Competitivos con Iconos SVG Cyber-Pitch -->
        <ul class="benefits-list">
          <li class="benefit-item">
            <svg class="benefit-svg gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
            <span>Guarda tu ELO, rango y victorias</span>
          </li>
          <li class="benefit-item">
            <svg class="benefit-svg cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 20V10M12 20V4M6 20v-6"></path>
            </svg>
            <span>Compite en el Ranking Global (ELO, Goles, Asistencias, Atajadas)</span>
          </li>
          <li class="benefit-item">
            <svg class="benefit-svg cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>Historial y progreso persistente</span>
          </li>
        </ul>

        {#if userProfile.isAuthenticated && !userProfile.isGuest}
          <!-- Sesión JWT Activa -->
          <div class="active-session-box">
            <div class="session-meta">
              <span class="session-label">SESIÓN VERIFICADA ACTIVA</span>
              <strong class="session-user">{userProfile.username}</strong>
              <span class="session-stats">
                Rol: {userProfile.role.toUpperCase()} · {userProfile.elo} ELO
              </span>
            </div>
            <div class="session-actions">
              <button type="button" class="primary-cyan-btn" onclick={handleContinueLoggedAccount}>
                <span>CONTINUAR AL LOBBY</span>
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button type="button" class="ghost-outline-btn" onclick={() => userProfile.logout()}>
                CERRAR SESIÓN
              </button>
            </div>
          </div>
        {:else if userProfile.gatekeeperTab === 'verify'}
          <!-- Vista Interactiva de Verificación por Código de 6 Dígitos -->
          <form class="verify-box" onsubmit={handleVerifyOtp}>
            <div class="verify-header">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#00e5ff" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
              </svg>
              <div>
                <h3>VERIFICACIÓN DE 6 DÍGITOS</h3>
                <p>Código enviado a <strong>{userProfile.pendingVerificationEmail}</strong> (expira en 15 min)</p>
              </div>
            </div>

            {#if userProfile.devVerificationCodeHint}
              <div class="dev-code-banner">
                <span>Código de verificación generado:</span>
                <strong>{userProfile.devVerificationCodeHint}</strong>
              </div>
            {/if}

            <div class="otp-row" onpaste={handleOtpPaste}>
              {#each [0, 1, 2, 3, 4, 5] as idx}
                <input
                  bind:this={otpRefs[idx]}
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  class="otp-cell"
                  value={otpDigits[idx]}
                  aria-label={`Dígito ${idx + 1}`}
                  oninput={(e) => handleOtpInput(idx, e)}
                  onkeydown={(e) => handleOtpKeyDown(idx, e)}
                />
              {/each}
            </div>

            {#if userProfile.authError}
              <div class="feedback-msg error">{userProfile.authError}</div>
            {/if}
            {#if userProfile.authNotice}
              <div class="feedback-msg notice">{userProfile.authNotice}</div>
            {/if}

            <div class="verify-actions">
              <button
                type="submit"
                class="primary-cyan-btn"
                disabled={otpJoined.length !== 6 || userProfile.isLoading}
              >
                {userProfile.isLoading ? 'VALIDANDO...' : 'ACTIVAR CUENTA (1000 ELO)'}
              </button>
              <div class="verify-sub-links">
                <button type="button" class="text-link-btn" onclick={handleResendOtp}>
                  Reenviar código
                </button>
                <button type="button" class="text-link-btn" onclick={() => switchAuthTab('login')}>
                  Volver a Iniciar Sesión
                </button>
              </div>
            </div>
          </form>
        {:else}
          <!-- Acceso Rápido con Google OAuth -->
          <div class="oauth-section">
            <button
              type="button"
              class="google-oauth-btn"
              disabled={userProfile.isLoading}
              onclick={() => userProfile.loginWithGoogle()}
            >
              <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>CONTINUAR CON GOOGLE</span>
            </button>
            <div class="oauth-divider">
              <span class="divider-line"></span>
              <span class="divider-text">O CON CORREO ELECTRÓNICO</span>
              <span class="divider-line"></span>
            </div>
          </div>

          <!-- Sub-pestañas Iniciar Sesión / Registrarse -->
          <div class="auth-subtabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={userProfile.gatekeeperTab === 'login'}
              class="subtab-btn"
              class:active={userProfile.gatekeeperTab === 'login'}
              onclick={() => switchAuthTab('login')}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={userProfile.gatekeeperTab === 'register'}
              class="subtab-btn"
              class:active={userProfile.gatekeeperTab === 'register'}
              onclick={() => switchAuthTab('register')}
            >
              Registrarse
            </button>
          </div>

          {#if userProfile.authError}
            <div class="feedback-msg error">{userProfile.authError}</div>
          {/if}
          {#if userProfile.authNotice}
            <div class="feedback-msg notice">{userProfile.authNotice}</div>
          {/if}

          {#if userProfile.gatekeeperTab === 'login'}
            <form class="auth-form" onsubmit={handleAccountLogin}>
              <div class="field-block">
                <label class="field-label" for="login-identifier">USUARIO O CORREO ELECTRÓNICO</label>
                <input
                  id="login-identifier"
                  type="text"
                  class="styled-input"
                  placeholder="Ej: StrikerPro o correo@dominio.com"
                  autocomplete="username"
                  bind:value={loginIdentifier}
                  required
                />
              </div>

              <div class="field-block">
                <label class="field-label" for="login-password">CONTRASEÑA</label>
                <input
                  id="login-password"
                  type="password"
                  class="styled-input"
                  placeholder="Tu contraseña..."
                  autocomplete="current-password"
                  bind:value={loginPassword}
                  required
                />
              </div>

              <button
                type="submit"
                class="primary-cyan-btn"
                disabled={userProfile.isLoading || !loginIdentifier.trim() || !loginPassword}
              >
                <span>{userProfile.isLoading ? 'CONECTANDO...' : 'INICIAR SESIÓN'}</span>
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </form>
          {:else}
            <form class="auth-form" onsubmit={handleAccountRegister}>
              <div class="field-block">
                <div class="label-split">
                  <label class="field-label" for="reg-username">NOMBRE DE USUARIO (3-15 ALFANUMÉRICO)</label>
                  <span class="hint-mono">{regUsername.trim().length}/15</span>
                </div>
                <input
                  id="reg-username"
                  type="text"
                  maxlength="15"
                  class="styled-input"
                  placeholder="Sin prefijo inv_ (ej: CyberStriker)"
                  autocomplete="username"
                  bind:value={regUsername}
                  required
                />
                {#if regUsernameValidation && !regUsernameValidation.valid}
                  <span class="inline-field-err">{regUsernameValidation.error}</span>
                {/if}
              </div>

              <div class="field-block">
                <label class="field-label" for="reg-email">CORREO ELECTRÓNICO</label>
                <input
                  id="reg-email"
                  type="email"
                  class="styled-input"
                  placeholder="correo@ejemplo.com"
                  autocomplete="email"
                  bind:value={regEmail}
                  required
                />
              </div>

              <div class="field-block">
                <label class="field-label" for="reg-password">CONTRASEÑA (MÍN. 8 CARACTERES)</label>
                <input
                  id="reg-password"
                  type="password"
                  minlength="8"
                  class="styled-input"
                  placeholder="Mínimo 8 caracteres..."
                  autocomplete="new-password"
                  bind:value={regPassword}
                  required
                />
              </div>

              <button
                type="submit"
                class="primary-cyan-btn"
                disabled={
                  userProfile.isLoading ||
                  Boolean(regUsernameValidation && !regUsernameValidation.valid) ||
                  !regUsername.trim() ||
                  !regEmail.trim() ||
                  regPassword.length < 8
                }
              >
                <span>{userProfile.isLoading ? 'CREANDO CUENTA...' : 'CREAR CUENTA Y ENVIAR CÓDIGO'}</span>
              </button>
            </form>
          {/if}
        {/if}
      </section>

      <!-- SECCIÓN 2: JUGAR COMO INVITADO -->
      <section class="panel-card guest-panel">
        <div class="panel-heading">
          <div class="heading-left">
            <span class="accent-pill amber"></span>
            <h2 class="panel-title">JUGAR COMO INVITADO</h2>
          </div>
          <span class="guest-prefix-chip">{guestPreviewName}</span>
        </div>

        <!-- Aviso Claro en Ámbar -->
        <div class="amber-warning-box" role="note">
          <svg class="warn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <p>Entrarás como invitado. No se guardará tu progreso, estadísticas ni puntuaciones en el ranking.</p>
        </div>

        <div class="guest-form">
          <div class="field-block">
            <div class="label-split">
              <label class="field-label" for="guest-nick-input">NICKNAME DE INVITADO</label>
              <span class="hint-mono">Prefijo fijo: inv_</span>
            </div>
            <div class="prefixed-input-row">
              <span class="immutable-prefix">inv_</span>
              <input
                id="guest-nick-input"
                type="text"
                maxlength="18"
                class="prefixed-input"
                placeholder="Tu apodo..."
                value={guestRawName}
                oninput={handleGuestInput}
              />
            </div>
          </div>

          <!-- Selector de Avatar en Cancha -->
          <div class="field-block">
            <div class="avatar-header">
              <label class="field-label" for="avatar-input">AVATAR EN CANCHA</label>
              <div class="avatar-mode-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={gameUI.avatarMode === 'letters'}
                  class="mode-tab-btn"
                  class:active={gameUI.avatarMode === 'letters'}
                  onclick={() => toggleAvatarMode(false)}
                >
                  Letras / Números
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={gameUI.avatarMode === 'emoji'}
                  class="mode-tab-btn"
                  class:active={gameUI.avatarMode === 'emoji'}
                  onclick={() => toggleAvatarMode(true)}
                >
                   Símbolos Disco
                </button>
              </div>
            </div>

            {#if gameUI.avatarMode === 'letters'}
              <div class="avatar-controls-row">
                <div class="avatar-disc-preview" title="Renderizado en cancha">
                  <span>{effectiveAvatar}</span>
                  <span class="status-dot-active"></span>
                </div>
                <input
                  id="avatar-input"
                  class="avatar-text-input"
                  type="text"
                  maxlength="2"
                  placeholder="10"
                  value={gameUI.avatarValue}
                  oninput={handleAvatarTextChange}
                />
              </div>
            {:else}
              <div class="avatar-emoji-block">
                <div class="avatar-disc-preview" title="Renderizado en cancha">
                  <span>{effectiveAvatar}</span>
                  <span class="status-dot-active"></span>
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

          <button
            type="button"
            class="guest-play-btn"
            disabled={!isGuestNameValid}
            onmouseenter={() => isGuestNameValid && soundFX.playUIHover()}
            onclick={handleEnterAsGuest}
          >
            <span>ENTRAR COMO {guestPreviewName}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </section>
    </main>
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
    background: radial-gradient(circle at 50% 20%, #152033 0%, #090e17 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
  }

  .gatekeeper-shell {
    width: min(980px, 96vw);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .brand-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  .logo-badge {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 1.5px solid #00e5ff;
    background: #0a101a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.28);
  }

  .logo-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .game-title {
    margin: 0;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
  }

  .cyan-accent {
    color: #00e5ff;
  }

  .game-subtitle {
    margin: 2px 0 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    color: #8fa3bf;
  }

  .dual-grid {
    display: grid;
    grid-template-columns: 1.08fr 0.92fr;
    gap: 18px;
    align-items: stretch;
  }

  @media (max-width: 840px) {
    .dual-grid {
      grid-template-columns: 1fr;
    }
  }

  .panel-card {
    background: #0b111c;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-sizing: border-box;
  }

  .account-panel {
    border: 1px solid #00e5ff;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 18px rgba(0, 229, 255, 0.16);
  }

  .guest-panel {
    border: 1px solid rgba(255, 215, 0, 0.38);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    justify-content: space-between;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .heading-left {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .accent-pill {
    width: 4px;
    height: 20px;
    border-radius: 2px;
  }

  .accent-pill.cyan {
    background: #00e5ff;
  }

  .accent-pill.amber {
    background: #ffd700;
  }

  .panel-title {
    margin: 0;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #f8fafc;
  }

  .competitive-tag {
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
  }

  .guest-prefix-chip {
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(255, 215, 0, 0.12);
    border: 1px solid rgba(255, 215, 0, 0.45);
    color: #ffd700;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 700;
  }

  .benefits-list {
    list-style: none;
    margin: 0;
    padding: 10px 12px;
    background: #070c14;
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .benefit-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Chivo', sans-serif;
    font-size: 12px;
    color: #d6e2f2;
  }

  .benefit-svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .benefit-svg.cyan {
    color: #00e5ff;
  }

  .benefit-svg.gold {
    color: #ffd700;
  }

  .auth-subtabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #070b13;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    padding: 3px;
    gap: 3px;
  }

  .oauth-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .google-oauth-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 42px;
    background: #0e1624;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    color: #e2e8f0;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }

  .google-oauth-btn:hover:not(:disabled) {
    background: #152238;
    border-color: #00e5ff;
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.25);
  }

  .google-oauth-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .google-icon {
    flex-shrink: 0;
  }

  .oauth-divider {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .divider-line {
    flex: 1;
    height: 1px;
    background: rgba(143, 163, 191, 0.2);
  }

  .divider-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #64748b;
    letter-spacing: 0.08em;
  }

  .subtab-btn {
    height: 34px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #8fa3bf;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }

  .subtab-btn.active {
    background: #00e5ff;
    color: #060b13;
  }

  .auth-form,
  .guest-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .label-split {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #93c5fd;
  }

  .hint-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #7c93b2;
  }

  .styled-input {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    background: #070b13;
    border: 1px solid rgba(0, 229, 255, 0.32);
    border-radius: 6px;
    color: #ffffff;
    font-family: 'Chivo', sans-serif;
    font-size: 13.5px;
    outline: none;
    box-sizing: border-box;
  }

  .styled-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.18);
  }

  .inline-field-err {
    font-size: 11px;
    color: #ff6b7a;
  }

  .feedback-msg {
    padding: 8px 10px;
    border-radius: 5px;
    font-size: 12px;
    line-height: 1.35;
  }

  .feedback-msg.error {
    background: #2b1118;
    border: 1px solid #ff4757;
    color: #ff9aa3;
  }

  .feedback-msg.notice {
    background: #09242f;
    border: 1px solid #00e5ff;
    color: #9ff3ff;
  }

  .primary-cyan-btn {
    width: 100%;
    height: 44px;
    background: #00e5ff;
    border: none;
    border-radius: 6px;
    color: #060b13;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: filter 140ms ease, transform 100ms ease;
  }

  .primary-cyan-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .primary-cyan-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ghost-outline-btn {
    height: 38px;
    border-radius: 6px;
    border: 1px solid #2b3d56;
    background: #101826;
    color: #bfd0e6;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .ghost-outline-btn:hover {
    border-color: #ff4757;
    color: #ff8590;
  }

  .active-session-box {
    background: #070d17;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 6px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .session-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .session-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #2ecc71;
  }

  .session-user {
    font-size: 18px;
    color: #ffffff;
  }

  .session-stats {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    color: #00e5ff;
  }

  .session-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* OTP 6 Casillas */
  .verify-box {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #070c14;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    padding: 14px;
  }

  .verify-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .verify-header h3 {
    margin: 0;
    font-size: 13px;
    color: #f1f5f9;
  }

  .verify-header p {
    margin: 3px 0 0;
    font-size: 11.5px;
    color: #9cb0ca;
  }

  .dev-code-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: 5px;
    background: #112236;
    border: 1px dashed #ffd700;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    color: #ffd700;
  }

  .otp-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }

  .otp-cell {
    width: 100%;
    height: 46px;
    text-align: center;
    background: #0d1524;
    border: 1.5px solid rgba(0, 229, 255, 0.4);
    border-radius: 6px;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 800;
    outline: none;
    box-sizing: border-box;
  }

  .otp-cell:focus {
    border-color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.35);
  }

  .verify-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .verify-sub-links {
    display: flex;
    justify-content: space-between;
  }

  .text-link-btn {
    background: none;
    border: none;
    color: #7dd3fc;
    font-size: 11.5px;
    cursor: pointer;
    padding: 2px 0;
    text-decoration: underline;
  }

  /* Invitado */
  .amber-warning-box {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 10px 12px;
    border-radius: 6px;
    background: #231b07;
    border: 1px solid rgba(255, 193, 7, 0.55);
    color: #ffd666;
  }

  .amber-warning-box p {
    margin: 0;
    font-size: 12px;
    line-height: 1.38;
  }

  .warn-svg {
    width: 18px;
    height: 18px;
    color: #ffd700;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .prefixed-input-row {
    display: flex;
    align-items: stretch;
    height: 42px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 215, 0, 0.4);
    background: #070b13;
  }

  .immutable-prefix {
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    background: #1c1709;
    border-right: 1px solid rgba(255, 215, 0, 0.32);
    color: #ffd700;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 800;
  }

  .prefixed-input {
    flex: 1;
    border: none;
    background: transparent;
    color: #ffffff;
    padding: 0 12px;
    font-family: 'Chivo', sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    outline: none;
  }

  .avatar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .avatar-mode-tabs {
    display: inline-flex;
    background: #070b13;
    border: 1px solid rgba(0, 229, 255, 0.28);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .mode-tab-btn {
    padding: 3px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #8fa0b5;
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .mode-tab-btn.active {
    background: rgba(0, 229, 255, 0.2);
    color: #00e5ff;
  }

  .avatar-controls-row,
  .avatar-emoji-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar-disc-preview {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #182235;
    border: 2px solid #ffd700;
    color: #ffd700;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .status-dot-active {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #2ecc71;
    border: 2px solid #070b13;
  }

  .avatar-text-input {
    flex: 1;
    height: 40px;
    background: #070b13;
    border: 1px solid rgba(255, 215, 0, 0.35);
    border-radius: 6px;
    color: #ffffff;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.12em;
    outline: none;
  }

  .emoji-grid-catalog {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
    flex: 1;
  }

  .emoji-choice-btn {
    height: 34px;
    background: #070b13;
    border: 1px solid rgba(0, 229, 255, 0.22);
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
  }

  .emoji-choice-btn.selected {
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.18);
  }

  .guest-play-btn {
    width: 100%;
    height: 44px;
    background: #162133;
    border: 1.5px solid #ffd700;
    border-radius: 6px;
    color: #ffd700;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.05em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }

  .guest-play-btn:hover:not(:disabled) {
    background: #ffd700;
    color: #060b13;
  }

  .guest-play-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
