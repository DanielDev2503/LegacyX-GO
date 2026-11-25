<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import {
    mobileTouchController,
    resolveMobileControlPixelOffset,
    setMobileControlOffset,
    type ActionZone,
    type MobileHudControlId
  } from '../../controllers/MobileTouchController.js';

  let uiTick = $state(0);

  let joyBaseEl = $state<HTMLElement | null>(null);
  let kickBtnEl = $state<HTMLElement | null>(null);
  let curveLeftBtnEl = $state<HTMLElement | null>(null);
  let curveRightBtnEl = $state<HTMLElement | null>(null);
  let dashBtnEl = $state<HTMLElement | null>(null);
  let turboBtnEl = $state<HTMLElement | null>(null);
  let emotesBtnEl = $state<HTMLElement | null>(null);

  let draggingControlId = $state<MobileHudControlId | null>(null);
  let dragPointerId = $state<number | null>(null);
  let dragStartClientX = $state(0);
  let dragStartClientY = $state(0);
  let dragStartOffsetPx = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  let isEditorActive = $derived(
    Boolean(gameUI.isHudEditorOpen || (gameUI as unknown as { isEditingMobileHud?: boolean }).isEditingMobileHud)
  );

  let hudScale = $derived(
    Math.max(0.7, Math.min(1.5, Number(gameUI.settings.mobileHudScale) || 1.0))
  );
  let hudOpacity = $derived(
    Math.max(0.25, Math.min(1.0, Number(gameUI.settings.mobileHudOpacity) || 0.78))
  );

  let viewportW = $derived(gameUI.viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 844) || 844);
  let viewportH = $derived(gameUI.viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 390) || 390);

  let joystickOffset = $derived(
    resolveMobileControlPixelOffset('joystick', viewportW, viewportH, gameUI.settings.mobileCustomLayout)
  );
  let kickClusterOffset = $derived(
    resolveMobileControlPixelOffset('kickCluster', viewportW, viewportH, gameUI.settings.mobileCustomLayout)
  );
  let dashOffset = $derived(
    resolveMobileControlPixelOffset('dash', viewportW, viewportH, gameUI.settings.mobileCustomLayout)
  );
  let turboOffset = $derived(
    resolveMobileControlPixelOffset('turbo', viewportW, viewportH, gameUI.settings.mobileCustomLayout)
  );
  let emotesOffset = $derived(
    resolveMobileControlPixelOffset('emotes', viewportW, viewportH, gameUI.settings.mobileCustomLayout)
  );

  let joyState = $derived.by(() => {
    void uiTick;
    return mobileTouchController.getJoystickState();
  });

  let isKickPressed = $derived.by(() => {
    void uiTick;
    return mobileTouchController.isKickActive();
  });

  let isCurveLeftPressed = $derived.by(() => {
    void uiTick;
    return mobileTouchController.isCurveLeftActive();
  });

  let isCurveRightPressed = $derived.by(() => {
    void uiTick;
    return mobileTouchController.isCurveRightActive();
  });

  let isTurboActive = $derived.by(() => {
    void uiTick;
    return mobileTouchController.isTurboActive() || gameUI.localIsTurbo;
  });

  let isEmoteMenuOpen = $derived.by(() => {
    void uiTick;
    return mobileTouchController.isEmoteMenuOpen;
  });

  let hoveredEmoteIndex = $derived.by(() => {
    void uiTick;
    return mobileTouchController.hoveredEmoteIndex;
  });

  let emoteAuthWarning = $derived.by(() => {
    void uiTick;
    return mobileTouchController.emoteAuthWarning;
  });

  let isFocusingMinimap = $derived.by(() => {
    void uiTick;
    return mobileTouchController.isHoldingMinimap || gameUI.isFocusingBall;
  });

  let staminaPct = $derived(Math.max(0, Math.min(100, Number(gameUI.localStamina ?? 100))));
  let dashCooldownSec = $derived(Math.max(0, Number(gameUI.localDashCooldown ?? 0)));
  let dashMaxCooldownSec = $derived(
    Math.max(0.2, Number(gameUI.localDashMaxCooldown) || Number(gameUI.modifiers.dashCooldown) || 1.0)
  );
  let dashCooldownRatio = $derived(
    Math.max(0, Math.min(1, dashCooldownSec / dashMaxCooldownSec))
  );

  const RING_CIRCUMFERENCE = 2 * Math.PI * 28; // r = 28 -> ~175.93
  let dashRingOffset = $derived(RING_CIRCUMFERENCE * (1 - dashCooldownRatio));
  let staminaRingOffset = $derived(RING_CIRCUMFERENCE * (1 - staminaPct / 100));

  let emoteItems = $derived(
    (gameUI.settings.emoteTriggers || []).slice(0, 6)
  );

  let minimapHitBox = $derived.by(() => {
    const sz = gameUI.settings.minimapSize;
    const width =
      sz === 'small' || sz === 160 ? 160 : sz === 'large' || sz === 280 || sz === 240 ? 280 : 200;
    const height = Math.round(width * 0.48);
    return { width, height };
  });

  function syncZoneRects(): void {
    if (typeof window === 'undefined') return;
    if (joyBaseEl) {
      const r = joyBaseEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        mobileTouchController.setFixedJoystickCenter(r.left + r.width / 2, r.top + r.height / 2);
      }
    }
    const pairs: Array<[ActionZone, HTMLElement | null]> = [
      ['kick', kickBtnEl],
      ['curveLeft', curveLeftBtnEl],
      ['curveRight', curveRightBtnEl],
      ['dash', dashBtnEl],
      ['turbo', turboBtnEl],
      ['emotes', emotesBtnEl]
    ];
    for (const [zone, el] of pairs) {
      if (el) {
        const r = el.getBoundingClientRect();
        mobileTouchController.setZoneRect(zone, {
          x: r.left,
          y: r.top,
          width: r.width,
          height: r.height
        });
      }
    }
  }

  $effect(() => {
    const prevCb = mobileTouchController.onStateChanged;
    mobileTouchController.onStateChanged = () => {
      uiTick = (uiTick + 1) % 1000000;
      prevCb?.();
    };
    syncZoneRects();
    return () => {
      mobileTouchController.onStateChanged = prevCb;
    };
  });

  $effect(() => {
    void hudScale;
    void viewportW;
    void viewportH;
    void joystickOffset;
    void kickClusterOffset;
    void dashOffset;
    void turboOffset;
    void emotesOffset;
    syncZoneRects();
  });

  function startEditorDrag(controlId: MobileHudControlId, e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore synthetic events without pointer capture
    }
    draggingControlId = controlId;
    dragPointerId = e.pointerId;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragStartOffsetPx = resolveMobileControlPixelOffset(
      controlId,
      viewportW,
      viewportH,
      gameUI.settings.mobileCustomLayout
    );
  }

  function moveEditorDrag(e: PointerEvent): void {
    if (!isEditorActive || draggingControlId === null || dragPointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - dragStartClientX;
    const dy = e.clientY - dragStartClientY;
    setMobileControlOffset(
      draggingControlId,
      {
        x: dragStartOffsetPx.x + dx,
        y: dragStartOffsetPx.y + dy
      },
      { width: viewportW, height: viewportH }
    );
  }

  function endEditorDrag(e: PointerEvent): void {
    if (dragPointerId !== e.pointerId) return;
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    draggingControlId = null;
    dragPointerId = null;
    syncZoneRects();
  }

  function handleResetHudLayout(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    soundFX.playUIClick();
    mobileTouchController.resetCustomLayout();
    syncZoneRects();
  }

  function handleSaveHudLayout(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    soundFX.playUIClick();
    gameUI.saveSettings();
    gameUI.isHudEditorOpen = false;
    (gameUI as unknown as { isEditingMobileHud?: boolean }).isEditingMobileHud = false;
    syncZoneRects();
  }

  function onJoystickPointerDown(e: PointerEvent): void {
    if (isEditorActive) {
      startEditorDrag('joystick', e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    soundFX.ensureContext();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    if (joyBaseEl) {
      const r = joyBaseEl.getBoundingClientRect();
      mobileTouchController.startJoystick(
        e.pointerId,
        e.clientX,
        e.clientY,
        r.left + r.width / 2,
        r.top + r.height / 2
      );
    } else {
      mobileTouchController.startJoystick(e.pointerId, e.clientX, e.clientY);
    }
  }

  function onJoystickPointerMove(e: PointerEvent): void {
    if (isEditorActive) {
      moveEditorDrag(e);
      return;
    }
    e.preventDefault();
    mobileTouchController.moveJoystick(e.pointerId, e.clientX, e.clientY);
  }

  function onJoystickPointerUp(e: PointerEvent): void {
    if (isEditorActive) {
      endEditorDrag(e);
      return;
    }
    e.preventDefault();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    mobileTouchController.endJoystick(e.pointerId);
  }

  function onActionPointerDown(
    zone: ActionZone,
    editorControlId: MobileHudControlId,
    e: PointerEvent
  ): void {
    if (isEditorActive) {
      startEditorDrag(editorControlId, e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    soundFX.ensureContext();
    syncZoneRects();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    mobileTouchController.startActionPointer(e.pointerId, zone, e.clientX, e.clientY);
  }

  function onActionPointerMove(zone: ActionZone, e: PointerEvent): void {
    if (isEditorActive) {
      moveEditorDrag(e);
      return;
    }
    e.preventDefault();
    if (zone === 'emotes' && isEmoteMenuOpen) {
      if (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function') {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const emoteBtn = el?.closest?.('[data-emote-index]') as HTMLElement | null;
        if (emoteBtn) {
          const idx = Number(emoteBtn.getAttribute('data-emote-index'));
          mobileTouchController.setHoveredEmoteIndex(Number.isFinite(idx) ? idx : null);
        } else {
          mobileTouchController.setHoveredEmoteIndex(null);
        }
      }
      return;
    }
    mobileTouchController.moveActionPointer(e.pointerId, e.clientX, e.clientY);
  }

  function onActionPointerUp(e: PointerEvent): void {
    if (isEditorActive) {
      endEditorDrag(e);
      return;
    }
    e.preventDefault();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    mobileTouchController.endActionPointer(e.pointerId);
  }

  function onMinimapPointerDown(e: PointerEvent): void {
    if (isEditorActive) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    mobileTouchController.startActionPointer(e.pointerId, 'minimap', e.clientX, e.clientY);
  }

  function onMinimapPointerUp(e: PointerEvent): void {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement | null;
    try {
      target?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    mobileTouchController.endActionPointer(e.pointerId);
  }

  function getEmoteFanOffset(index: number, total: number): { x: number; y: number } {
    const count = Math.max(1, total);
    const startAngle = Math.PI * 0.72;
    const endAngle = Math.PI * 1.48;
    const angle =
      count === 1 ? Math.PI * 1.1 : startAngle + (index / (count - 1)) * (endAngle - startAngle);
    const radius = 50;
    return {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius)
    };
  }
</script>

<div
  class="mobile-controls-overlay"
  class:is-editing={isEditorActive}
  style:--hud-scale={hudScale}
  style:--hud-opacity={hudOpacity}
  aria-label="Controles táctiles móviles"
>
  <!-- ========================================================= -->
  <!-- 1. BOTTOM-LEFT: VIRTUAL JOYSTICK (360° / 8-DIR)           -->
  <!-- ========================================================= -->
  <div
    class="mobile-joystick-zone"
    class:is-editable={isEditorActive}
    class:is-active={joyState.active}
    style="transform: translate3d({joystickOffset.x}px, {joystickOffset.y}px, 0) scale({hudScale});"
    onpointerdown={onJoystickPointerDown}
    onpointermove={onJoystickPointerMove}
    onpointerup={onJoystickPointerUp}
    onpointercancel={onJoystickPointerUp}
    role="application"
    aria-label="Joystick virtual de movimiento"
  >
    <div
      class="joystick-base"
      bind:this={joyBaseEl}
      style={gameUI.settings.mobileJoystickAnchor === 'dynamic' && joyState.pointerId !== null
        ? `transform: translate3d(${Math.round(joyState.originX - mobileTouchController.fixedJoystickCenter.x)}px, ${Math.round(joyState.originY - mobileTouchController.fixedJoystickCenter.y)}px, 0);`
        : ''}
    >
      <span class="joy-arrow arrow-up" aria-hidden="true">^</span>
      <span class="joy-arrow arrow-down" aria-hidden="true">v</span>
      <span class="joy-arrow arrow-left" aria-hidden="true">&lt;</span>
      <span class="joy-arrow arrow-right" aria-hidden="true">&gt;</span>

      <div
        class="joystick-knob"
        class:is-engaged={joyState.active}
        style="transform: translate3d({Math.round(joyState.knobX)}px, {Math.round(joyState.knobY)}px, 0);"
      >
        <span class="knob-core"></span>
      </div>
    </div>
  </div>

  <!-- ========================================================= -->
  <!-- 2. BOTTOM-CENTER: MINIMAP HOLD-TO-FOCUS BALL HIT ZONE     -->
  <!-- ========================================================= -->
  {#if gameUI.settings.minimapEnabled !== false}
    <div
      class="mobile-minimap-hit-zone"
      class:is-focusing={isFocusingMinimap}
      style="width: {minimapHitBox.width}px; height: {minimapHitBox.height}px;"
      onpointerdown={onMinimapPointerDown}
      onpointerup={onMinimapPointerUp}
      onpointercancel={onMinimapPointerUp}
      role="button"
      tabindex="-1"
      aria-label="Mantener presionado minimapa para enfocar balón"
    >
      {#if isFocusingMinimap}
        <span class="minimap-focus-badge">ENFOCANDO BALÓN</span>
      {/if}
    </div>
  {/if}

  <!-- ========================================================= -->
  <!-- 3. BOTTOM-RIGHT: ACTION CLUSTER                           -->
  <!-- ========================================================= -->
  <div class="mobile-action-cluster">
    <!-- A) EMOTES BUTTON (Above-Left of Patear) + RADIAL FAN POPUP -->
    <div
      class="action-node node-emotes"
      class:is-editable={isEditorActive}
      style="transform: translate3d({emotesOffset.x}px, {emotesOffset.y}px, 0) scale({hudScale});"
    >
      {#if isEmoteMenuOpen && !isEditorActive}
        <div class="emote-radial-fan" role="menu" aria-label="Menú radial de emotes">
          {#each emoteItems as item, idx (item.trigger)}
            {@const pos = getEmoteFanOffset(idx, emoteItems.length)}
            <button
              type="button"
              class="emote-fan-item"
              class:is-hovered={hoveredEmoteIndex === idx}
              data-emote-index={idx}
              style="transform: translate3d({pos.x}px, {pos.y}px, 0);"
              onpointerdown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                mobileTouchController.selectEmoteByIndex(idx);
              }}
              aria-label={`Emote ${item.trigger} ${item.emoji}`}
            >
              <span class="fan-emoji">{item.emoji}</span>
            </button>
          {/each}
        </div>
      {/if}

      <button
        type="button"
        bind:this={emotesBtnEl}
        class="touch-btn btn-emotes"
        class:is-open={isEmoteMenuOpen}
        aria-label="Emotes"
        onpointerdown={(e) => onActionPointerDown('emotes', 'emotes', e)}
        onpointermove={(e) => onActionPointerMove('emotes', e)}
        onpointerup={onActionPointerUp}
        onpointercancel={onActionPointerUp}
      >
        <span class="btn-icon-emoji" aria-hidden="true">😊</span>
        <span class="btn-sub-label">Emotes</span>
      </button>

      {#if emoteAuthWarning}
        <div class="emote-auth-toast" role="alert">
          <span>🔒 {emoteAuthWarning}</span>
        </div>
      {/if}
    </div>

    <!-- B) TURBO BUTTON (Above-Right of Patear, with Stamina Arc & Slide to Patear) -->
    <div
      class="action-node node-turbo"
      class:is-editable={isEditorActive}
      style="transform: translate3d({turboOffset.x}px, {turboOffset.y}px, 0) scale({hudScale});"
    >
      <button
        type="button"
        bind:this={turboBtnEl}
        class="touch-btn btn-turbo"
        class:is-active={isTurboActive}
        aria-label="Turbo"
        aria-pressed={isTurboActive}
        onpointerdown={(e) => onActionPointerDown('turbo', 'turbo', e)}
        onpointermove={(e) => onActionPointerMove('turbo', e)}
        onpointerup={onActionPointerUp}
        onpointercancel={onActionPointerUp}
      >
        <svg class="radial-ring-svg" viewBox="0 0 64 64" aria-hidden="true">
          <circle class="ring-track" cx="32" cy="32" r="28"></circle>
          <circle
            class="ring-progress ring-stamina"
            class:is-low={staminaPct < 25}
            cx="32"
            cy="32"
            r="28"
            stroke-dasharray={RING_CIRCUMFERENCE}
            stroke-dashoffset={staminaRingOffset}
          ></circle>
        </svg>
        <span class="btn-main-label">Turbo</span>
        <span class="btn-telemetry-mini">{Math.round(staminaPct)}%</span>
      </button>
    </div>

    <!-- C) HYBRID PATEAR + < (Curva Izq) & > (Curva Der) CLUSTER -->
    <div
      class="action-node node-kick-cluster"
      class:is-editable={isEditorActive}
      style="transform: translate3d({kickClusterOffset.x}px, {kickClusterOffset.y}px, 0) scale({hudScale});"
    >
      <!-- Left Magnus Wing < -->
      <button
        type="button"
        bind:this={curveLeftBtnEl}
        class="btn-curve-wing wing-left"
        class:is-active={isCurveLeftPressed}
        aria-label="Curva Magnus Izquierda"
        onpointerdown={(e) => onActionPointerDown('curveLeft', 'kickCluster', e)}
        onpointermove={(e) => onActionPointerMove('curveLeft', e)}
        onpointerup={onActionPointerUp}
        onpointercancel={onActionPointerUp}
      >
        <span class="wing-symbol">&lt;</span>
      </button>

      <!-- Center Patear Circle -->
      <button
        type="button"
        bind:this={kickBtnEl}
        class="touch-btn btn-kick-main"
        class:is-active={isKickPressed}
        class:is-curving-left={isCurveLeftPressed}
        class:is-curving-right={isCurveRightPressed}
        aria-label="Patear"
        onpointerdown={(e) => onActionPointerDown('kick', 'kickCluster', e)}
        onpointermove={(e) => onActionPointerMove('kick', e)}
        onpointerup={onActionPointerUp}
        onpointercancel={onActionPointerUp}
      >
        <span class="kick-label">Patear</span>
        {#if isCurveLeftPressed}
          <span class="kick-curve-tag">&lt; CURVA</span>
        {:else if isCurveRightPressed}
          <span class="kick-curve-tag">CURVA &gt;</span>
        {/if}
      </button>

      <!-- Right Magnus Wing > -->
      <button
        type="button"
        bind:this={curveRightBtnEl}
        class="btn-curve-wing wing-right"
        class:is-active={isCurveRightPressed}
        aria-label="Curva Magnus Derecha"
        onpointerdown={(e) => onActionPointerDown('curveRight', 'kickCluster', e)}
        onpointermove={(e) => onActionPointerMove('curveRight', e)}
        onpointerup={onActionPointerUp}
        onpointercancel={onActionPointerUp}
      >
        <span class="wing-symbol">&gt;</span>
      </button>
    </div>

    <!-- D) DASH BUTTON (Right of Patear, with SVG Radial Cooldown Ring) -->
    <div
      class="action-node node-dash"
      class:is-editable={isEditorActive}
      style="transform: translate3d({dashOffset.x}px, {dashOffset.y}px, 0) scale({hudScale});"
    >
      <button
        type="button"
        bind:this={dashBtnEl}
        class="touch-btn btn-dash"
        class:is-dashing={gameUI.localIsDashing}
        class:is-cooldown={dashCooldownSec > 0.01}
        aria-label="Dash"
        onpointerdown={(e) => onActionPointerDown('dash', 'dash', e)}
        onpointermove={(e) => onActionPointerMove('dash', e)}
        onpointerup={onActionPointerUp}
        onpointercancel={onActionPointerUp}
      >
        <svg class="radial-ring-svg" viewBox="0 0 64 64" aria-hidden="true">
          <circle class="ring-track" cx="32" cy="32" r="28"></circle>
          <circle
            class="ring-progress ring-dash"
            class:is-cooling={dashCooldownSec > 0.01}
            cx="32"
            cy="32"
            r="28"
            stroke-dasharray={RING_CIRCUMFERENCE}
            stroke-dashoffset={dashRingOffset}
          ></circle>
        </svg>
        <span class="btn-main-label">Dash</span>
        {#if dashCooldownSec > 0.05}
          <span class="btn-telemetry-mini">{dashCooldownSec.toFixed(1)}s</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- ========================================================= -->
  <!-- 4. INTERACTIVE HUD LAYOUT EDITOR FLOATING TOOLBAR         -->
  <!-- ========================================================= -->
  {#if isEditorActive}
    <div class="hud-editor-toolbar" role="region" aria-label="Editor de disposición HUD móvil">
      <div class="hud-editor-header">
        <span class="hud-editor-title">EDITOR DE BOTONES EN PANTALLA</span>
        <span class="hud-editor-hint">Arrastra cualquier control para reubicarlo</span>
      </div>
      <div class="hud-editor-actions">
        <button
          type="button"
          class="hud-editor-btn btn-reset-sketch"
          onclick={handleResetHudLayout}
        >
          Restablecer al boceto original
        </button>
        <button
          type="button"
          class="hud-editor-btn btn-save-layout"
          onclick={handleSaveHudLayout}
        >
          Guardar
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .mobile-controls-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .mobile-controls-overlay.is-editing {
    background: rgba(5, 8, 17, 0.45);
    pointer-events: auto;
  }

  /* 1. VIRTUAL JOYSTICK (Bottom-Left) */
  .mobile-joystick-zone {
    pointer-events: auto;
    position: fixed;
    bottom: calc(18px + env(safe-area-inset-bottom, 0px));
    left: calc(22px + env(safe-area-inset-left, 0px));
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: var(--hud-opacity, 0.78);
    touch-action: none;
    transform-origin: bottom left;
  }

  .joystick-base {
    position: relative;
    width: 118px;
    height: 118px;
    border-radius: 9999px;
    background: rgba(8, 14, 26, 0.86);
    border: 2px solid rgba(0, 229, 255, 0.42);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.65), inset 0 0 18px rgba(0, 229, 255, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-joystick-zone.is-active .joystick-base {
    border-color: #00e5ff;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.35), inset 0 0 22px rgba(0, 229, 255, 0.2);
  }

  .joy-arrow {
    position: absolute;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    font-weight: 900;
    color: rgba(0, 229, 255, 0.65);
    line-height: 1;
    pointer-events: none;
  }

  .joy-arrow.arrow-up {
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
  }

  .joy-arrow.arrow-down {
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
  }

  .joy-arrow.arrow-left {
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
  }

  .joy-arrow.arrow-right {
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
  }

  .joystick-knob {
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    background: radial-gradient(circle at 35% 35%, #243b55, #0d1726);
    border: 2px solid rgba(0, 229, 255, 0.78);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .joystick-knob.is-engaged {
    background: radial-gradient(circle at 35% 35%, #00e5ff, #0284c7);
    border-color: #ffffff;
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.75);
  }

  .knob-core {
    width: 14px;
    height: 14px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.85);
  }

  /* 2. BOTTOM-CENTER MINIMAP FOCUS HIT ZONE */
  .mobile-minimap-hit-zone {
    pointer-events: auto;
    position: fixed;
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    touch-action: none;
    cursor: pointer;
  }

  .mobile-minimap-hit-zone.is-focusing {
    border-color: rgba(0, 229, 255, 0.75);
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.35);
  }

  .minimap-focus-badge {
    margin-top: -20px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #08101d;
    border: 1px solid #00e5ff;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  /* 3. BOTTOM-RIGHT ACTION CLUSTER */
  .mobile-action-cluster {
    position: fixed;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    right: calc(18px + env(safe-area-inset-right, 0px));
    width: 250px;
    height: 190px;
    pointer-events: none;
    opacity: var(--hud-opacity, 0.78);
  }

  .action-node {
    position: absolute;
    pointer-events: auto;
    touch-action: none;
    transform-origin: center center;
  }

  /* Layout matching user sketch:
     - Patear + < / > centered in bottom-right cluster
     - Dash to the right of Patear
     - Turbo above-right of Patear
     - Emotes above-left of Patear
  */
  .node-kick-cluster {
    bottom: 6px;
    right: 68px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .node-dash {
    bottom: 14px;
    right: 0;
  }

  .node-turbo {
    bottom: 92px;
    right: 36px;
  }

  .node-emotes {
    bottom: 146px;
    right: 132px;
  }

  .touch-btn {
    position: relative;
    border-radius: 9999px;
    background: #0b1424;
    border: 2px solid rgba(0, 229, 255, 0.45);
    color: #f1f5f9;
    font-family: 'Space Grotesk', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.72);
    cursor: pointer;
    padding: 0;
    touch-action: none;
    user-select: none;
  }

  .touch-btn:active,
  .touch-btn.is-active {
    transform: scale(0.95);
    border-color: #00e5ff;
    background: #10243d;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.55);
  }

  .btn-kick-main {
    width: 78px;
    height: 78px;
    border-width: 2.5px;
    border-color: rgba(0, 229, 255, 0.75);
    background: radial-gradient(circle at 50% 35%, #162a45, #0a1220);
  }

  .btn-kick-main.is-active {
    background: radial-gradient(circle at 50% 35%, #0284c7, #0f172a);
    border-color: #ffffff;
  }

  .btn-kick-main.is-curving-left,
  .btn-kick-main.is-curving-right {
    border-color: #facc15;
    box-shadow: 0 0 18px rgba(250, 204, 21, 0.65);
  }

  .kick-label {
    font-size: 0.82rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .kick-curve-tag {
    margin-top: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.54rem;
    font-weight: 800;
    color: #fde047;
  }

  .btn-curve-wing {
    width: 34px;
    height: 56px;
    background: #0c1628;
    border: 1.5px solid rgba(0, 229, 255, 0.4);
    color: #93c5fd;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    touch-action: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.65);
  }

  .btn-curve-wing.wing-left {
    border-radius: 26px 8px 8px 26px;
  }

  .btn-curve-wing.wing-right {
    border-radius: 8px 26px 26px 8px;
  }

  .btn-curve-wing.is-active,
  .btn-curve-wing:active {
    background: #3b2f0b;
    border-color: #facc15;
    color: #fef08a;
    box-shadow: 0 0 14px rgba(250, 204, 21, 0.55);
  }

  .wing-symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.05rem;
    font-weight: 900;
    line-height: 1;
  }

  .btn-dash,
  .btn-turbo {
    width: 60px;
    height: 60px;
  }

  .btn-emotes {
    width: 34px;
    height: 34px;
    border-width: 1.5px;
  }

  .btn-emotes .btn-icon-emoji {
    font-size: 0.95rem;
  }

  .btn-emotes .btn-sub-label {
    display: none;
  }

  .btn-turbo.is-active {
    background: #082f49;
    border-color: #38bdf8;
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.7);
  }

  .btn-dash.is-dashing {
    background: #14532d;
    border-color: #4ade80;
    box-shadow: 0 0 18px rgba(74, 222, 128, 0.7);
  }

  .btn-dash.is-cooldown {
    opacity: 0.75;
  }

  .radial-ring-svg {
    position: absolute;
    inset: -2px;
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    transform: rotate(-90deg);
    pointer-events: none;
  }

  .ring-track {
    fill: none;
    stroke: rgba(148, 163, 184, 0.16);
    stroke-width: 3.5;
  }

  .ring-progress {
    fill: none;
    stroke-width: 3.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 80ms linear;
  }

  .ring-stamina {
    stroke: #00e5ff;
  }

  .ring-stamina.is-low {
    stroke: #ff3366;
  }

  .ring-dash {
    stroke: #22c55e;
  }

  .ring-dash.is-cooling {
    stroke: #f59e0b;
  }

  .btn-main-label {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    color: #f8fafc;
    line-height: 1.1;
  }

  .btn-sub-label {
    font-size: 0.62rem;
    font-weight: 800;
    color: #cbd5e1;
    line-height: 1;
    margin-top: 2px;
  }

  .btn-icon-emoji {
    font-size: 1.05rem;
    line-height: 1;
  }

  .btn-telemetry-mini {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.56rem;
    font-weight: 700;
    color: #93c5fd;
    line-height: 1;
    margin-top: 1px;
  }

  /* EMOTE RADIAL FAN POPUP */
  .emote-radial-fan {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    z-index: 110;
    pointer-events: auto;
  }

  .emote-fan-item {
    position: absolute;
    left: -17px;
    top: -17px;
    width: 34px;
    height: 34px;
    border-radius: 9999px;
    background: #0d1729;
    border: 1.5px solid rgba(0, 229, 255, 0.6);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    touch-action: manipulation;
  }

  .emote-fan-item.is-hovered,
  .emote-fan-item:active {
    background: #163052;
    border-color: #ffd700;
    box-shadow: 0 0 14px rgba(255, 215, 0, 0.7);
  }

  .fan-emoji {
    font-size: 1.2rem;
    line-height: 1;
  }

  .emote-auth-toast {
    position: absolute;
    bottom: calc(100% + 10px);
    right: -20px;
    background: #181216;
    border: 1px solid #ef4444;
    color: #fca5a5;
    padding: 6px 10px;
    border-radius: 6px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.8);
    z-index: 120;
  }

  /* 4. HUD LAYOUT EDITOR MODE */
  .is-editable {
    outline: 2px dashed #facc15;
    outline-offset: 4px;
    border-radius: 16px;
    cursor: grab;
  }

  .is-editable:active {
    cursor: grabbing;
    outline-color: #00e5ff;
  }

  .hud-editor-toolbar {
    pointer-events: auto;
    position: fixed;
    top: 58px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 130;
    background: #0a1220;
    border: 1.5px solid #00e5ff;
    border-radius: 12px;
    padding: 10px 16px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .hud-editor-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .hud-editor-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    color: #00e5ff;
  }

  .hud-editor-hint {
    font-family: 'Chivo', sans-serif;
    font-size: 0.7rem;
    color: #cbd5e1;
  }

  .hud-editor-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .hud-editor-btn {
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 8px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .btn-reset-sketch {
    background: #172033;
    border: 1px solid rgba(250, 204, 21, 0.65);
    color: #fde047;
  }

  .btn-save-layout {
    background: #00e5ff;
    border: 1px solid #00e5ff;
    color: #041019;
  }
</style>
