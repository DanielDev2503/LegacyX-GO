import {
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  INPUT_FLAG_MAGNUS_LEFT,
  INPUT_FLAG_MAGNUS_RIGHT,
  INPUT_FLAG_MOUSE_AIM,
  INPUT_FLAG_MOUSE_ACTIVE,
  type PlayerInput
} from '@legacyx/core';
import {
  gameUI,
  type MobileHudLayoutMap,
  type MobileJoystickAnchor,
  type MobileJoystickMode,
  type MobileTurboMode
} from '../ui/state/gameUI.svelte.js';
import { userProfile } from '../ui/state/userProfile.svelte.js';
import { mobileHaptics } from './MobileHaptics.js';

export type MobileHudControlId =
  | 'joystick'
  | 'kickCluster'
  | 'dash'
  | 'turbo'
  | 'emotes'
  | 'chatBtn';

export const MOBILE_HUD_CONTROL_IDS: readonly MobileHudControlId[] = [
  'joystick',
  'kickCluster',
  'dash',
  'turbo',
  'emotes',
  'chatBtn'
] as const;

export type ActionZone =
  | 'kick'
  | 'curveLeft'
  | 'curveRight'
  | 'dash'
  | 'turbo'
  | 'emotes'
  | 'minimap';

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JoystickMathResult {
  active: boolean;
  aimAngle: number | null;
  aimThrottle: number;
  knobX: number;
  knobY: number;
  directionMask: number;
  inputMask: number;
}

export interface JoystickState extends JoystickMathResult {
  pointerId: number | null;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export interface ActiveActionPointer {
  pointerId: number;
  originZone: ActionZone;
  currentZone: ActionZone;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  kickEntryX: number | null;
  retainsTurbo: boolean;
  slidFromTurbo: boolean;
}

export interface MinimapHitTester {
  hitTest: (screenX: number, screenY: number) => boolean;
}

export const DEFAULT_JOYSTICK_MAX_RADIUS = 54;
export const DEFAULT_JOYSTICK_DEADZONE = 6;
export const DEFAULT_KICK_SWIPE_THRESHOLD_PX = 22;
export const EMOTE_AUTH_WARNING_TEXT = 'Solo cuentas registradas pueden usar emotes en la cancha.';

// Bridge gameUI.isEditingMobileHud and gameUI.resetMobileCustomLayout onto GameUIStore prototype
// so any caller using either isHudEditorOpen or isEditingMobileHud shares the same $state signal.
const gameUIProto = Object.getPrototypeOf(gameUI);
if (gameUIProto && !Object.getOwnPropertyDescriptor(gameUIProto, 'isEditingMobileHud')) {
  Object.defineProperty(gameUIProto, 'isEditingMobileHud', {
    get(this: typeof gameUI) {
      return this.isHudEditorOpen;
    },
    set(this: typeof gameUI, value: boolean) {
      this.isHudEditorOpen = Boolean(value);
    },
    configurable: true
  });
}
if (gameUIProto && typeof gameUIProto.resetMobileCustomLayout !== 'function') {
  gameUIProto.resetMobileCustomLayout = function (this: typeof gameUI): void {
    this.resetMobileHudLayout();
  };
}

/**
 * Quantizes a continuous radian angle [-PI, PI] into 8-way digital directional flags.
 */
export function quantizeAngleTo8DirMask(angleRad: number): number {
  if (!Number.isFinite(angleRad)) return 0;
  const twoPi = Math.PI * 2;
  const normalized = ((angleRad % twoPi) + twoPi) % twoPi;
  const sector = Math.round(normalized / (Math.PI / 4)) % 8;

  switch (sector) {
    case 0:
      return INPUT_FLAG_RIGHT;
    case 1:
      return INPUT_FLAG_DOWN | INPUT_FLAG_RIGHT;
    case 2:
      return INPUT_FLAG_DOWN;
    case 3:
      return INPUT_FLAG_DOWN | INPUT_FLAG_LEFT;
    case 4:
      return INPUT_FLAG_LEFT;
    case 5:
      return INPUT_FLAG_UP | INPUT_FLAG_LEFT;
    case 6:
      return INPUT_FLAG_UP;
    case 7:
      return INPUT_FLAG_UP | INPUT_FLAG_RIGHT;
    default:
      return 0;
  }
}

/**
 * Computes virtual joystick displacement, 360° analog vector or 8-direction digital flags.
 */
export function computeJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number = DEFAULT_JOYSTICK_MAX_RADIUS,
  deadzone: number = DEFAULT_JOYSTICK_DEADZONE,
  mode: MobileJoystickMode = '360'
): JoystickMathResult {
  const safeMaxRadius = Number.isFinite(maxRadius) && maxRadius > 0 ? maxRadius : DEFAULT_JOYSTICK_MAX_RADIUS;
  const safeDeadzone =
    Number.isFinite(deadzone) && deadzone >= 0 ? Math.min(safeMaxRadius * 0.9, deadzone) : DEFAULT_JOYSTICK_DEADZONE;
  const dist = Math.hypot(dx, dy);

  if (!Number.isFinite(dist) || dist <= safeDeadzone) {
    return {
      active: false,
      aimAngle: null,
      aimThrottle: 0,
      knobX: 0,
      knobY: 0,
      directionMask: 0,
      inputMask: 0
    };
  }

  const angle = Math.atan2(dy, dx);
  const clampedDist = Math.min(safeMaxRadius, dist);
  const knobX = Math.cos(angle) * clampedDist;
  const knobY = Math.sin(angle) * clampedDist;
  const span = Math.max(1e-6, safeMaxRadius - safeDeadzone);
  const rawThrottle = Math.max(0, Math.min(1, (clampedDist - safeDeadzone) / span));
  const directionMask = quantizeAngleTo8DirMask(angle);

  if (mode === '8dir') {
    return {
      active: true,
      aimAngle: null,
      aimThrottle: 0,
      knobX,
      knobY,
      directionMask,
      inputMask: directionMask
    };
  }

  const active = rawThrottle > 0;
  return {
    active,
    aimAngle: active ? angle : null,
    aimThrottle: active ? rawThrottle : 0,
    knobX,
    knobY,
    directionMask,
    inputMask: active ? INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE : 0
  };
}

/**
 * Reads a control's custom offset from `gameUI.settings.mobileCustomLayout`.
 */
export function getMobileControlOffset(
  controlId: MobileHudControlId | string,
  layoutMap: MobileHudLayoutMap = gameUI.settings.mobileCustomLayout
): { x: number; y: number } {
  if (!layoutMap || typeof layoutMap !== 'object') {
    return { x: 0, y: 0 };
  }
  const entry = layoutMap[controlId];
  if (
    entry &&
    typeof entry === 'object' &&
    typeof entry.x === 'number' &&
    Number.isFinite(entry.x) &&
    typeof entry.y === 'number' &&
    Number.isFinite(entry.y)
  ) {
    return { x: entry.x, y: entry.y };
  }
  return { x: 0, y: 0 };
}

/**
 * Writes a normalized (or pixel) custom offset for a HUD control into `gameUI.settings.mobileCustomLayout`
 * and persists it via `gameUI.saveSettings`.
 */
export function setMobileControlOffset(
  controlId: MobileHudControlId | string,
  offset: { x: number; y: number },
  viewport?: { width: number; height: number },
  maxNormalizedOffset: number = 0.65
): { x: number; y: number } {
  let x = Number(offset?.x ?? 0);
  let y = Number(offset?.y ?? 0);
  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;

  if (
    viewport &&
    Number.isFinite(viewport.width) &&
    viewport.width > 0 &&
    Number.isFinite(viewport.height) &&
    viewport.height > 0
  ) {
    x = x / viewport.width;
    y = y / viewport.height;
  }

  if (Math.abs(x) <= 1.5 && Math.abs(y) <= 1.5 && maxNormalizedOffset > 0) {
    const limit = Math.max(0.1, Math.min(1.0, maxNormalizedOffset));
    x = Math.max(-limit, Math.min(limit, Number(x.toFixed(4))));
    y = Math.max(-limit, Math.min(limit, Number(y.toFixed(4))));
  } else {
    x = Math.max(-600, Math.min(600, Math.round(x * 100) / 100));
    y = Math.max(-600, Math.min(600, Math.round(y * 100) / 100));
  }

  const nextLayout: MobileHudLayoutMap = {
    ...(gameUI.settings.mobileCustomLayout || {}),
    [controlId]: { x, y }
  };
  gameUI.saveSettings({ mobileCustomLayout: nextLayout });
  return { x, y };
}

/**
 * Resolves a stored offset into screen pixels for a given viewport.
 * Normalized offsets (|x| <= 1 and |y| <= 1) scale by viewport dimensions;
 * larger values are treated directly as pixel offsets.
 */
export function resolveMobileControlPixelOffset(
  controlId: MobileHudControlId | string,
  viewportWidth: number = gameUI.viewportWidth || 844,
  viewportHeight: number = gameUI.viewportHeight || 390,
  layoutMap: MobileHudLayoutMap = gameUI.settings.mobileCustomLayout
): { x: number; y: number } {
  const raw = getMobileControlOffset(controlId, layoutMap);
  if (raw.x === 0 && raw.y === 0) {
    return { x: 0, y: 0 };
  }
  const vw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 844;
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 390;
  if (Math.abs(raw.x) <= 1 && Math.abs(raw.y) <= 1) {
    return {
      x: Math.round(raw.x * vw),
      y: Math.round(raw.y * vh)
    };
  }
  return {
    x: Math.round(raw.x),
    y: Math.round(raw.y)
  };
}

/**
 * Resets all custom HUD control positions back to the default sketch layout (`{}`).
 */
export function resetMobileCustomLayout(): void {
  gameUI.resetMobileHudLayout();
}

export class MobileTouchController {
  public joystickMaxRadius: number = DEFAULT_JOYSTICK_MAX_RADIUS;
  public joystickDeadzone: number = DEFAULT_JOYSTICK_DEADZONE;
  public kickSwipeThresholdPx: number = DEFAULT_KICK_SWIPE_THRESHOLD_PX;
  public fixedJoystickCenter: { x: number; y: number } = { x: 96, y: 290 };

  public onInputChanged: (() => void) | null = null;
  public onStateChanged: (() => void) | null = null;

  private joystickPointerId: number | null = null;
  private joystickOriginX: number = 96;
  private joystickOriginY: number = 290;
  private joystickCurrentX: number = 96;
  private joystickCurrentY: number = 290;
  private joystickMath: JoystickMathResult = {
    active: false,
    aimAngle: null,
    aimThrottle: 0,
    knobX: 0,
    knobY: 0,
    directionMask: 0,
    inputMask: 0
  };

  private actionPointers: Map<number, ActiveActionPointer> = new Map();
  private zoneRects: Map<ActionZone, ZoneRect> = new Map();
  private minimapTester: MinimapHitTester | null = null;

  private dashPending: boolean = false;
  private turboLatched: boolean = false;
  public isHoldingMinimap: boolean = false;

  public isEmoteMenuOpen: boolean = false;
  public hoveredEmoteIndex: number | null = null;
  private emoteOpenedOnCurrentPress: boolean = false;
  public emoteAuthWarning: string | null = null;
  private emoteWarningTimer: ReturnType<typeof setTimeout> | null = null;

  private lastEmittedMask: number = 0;
  private lastEmittedAngle: number | null = null;
  private lastEmittedThrottle: number = 0;

  public get joystickMode(): MobileJoystickMode {
    return gameUI.settings.mobileJoystickMode === '8dir' ? '8dir' : '360';
  }

  public get joystickAnchor(): MobileJoystickAnchor {
    return gameUI.settings.mobileJoystickAnchor === 'dynamic' ? 'dynamic' : 'fixed';
  }

  public get turboMode(): MobileTurboMode {
    return gameUI.settings.mobileTurboMode === 'toggle' ? 'toggle' : 'hold';
  }

  public get isTurboLatched(): boolean {
    return this.turboLatched;
  }

  public set isTurboLatched(val: boolean) {
    this.turboLatched = Boolean(val);
    this.notifyChange();
  }

  public get hasPendingDash(): boolean {
    return this.dashPending;
  }

  public get dashCooldown(): number {
    return Math.max(0, Number(gameUI.localDashCooldown) || 0);
  }

  public get dashMaxCooldown(): number {
    return Math.max(0.2, Number(gameUI.localDashMaxCooldown) || Number(gameUI.modifiers.dashCooldown) || 1.0);
  }

  public get stamina(): number {
    return Math.max(0, Math.min(100, Number(gameUI.localStamina ?? 100)));
  }

  public getDashCooldownProgress(
    cooldown: number = this.dashCooldown,
    maxCooldown: number = this.dashMaxCooldown
  ): number {
    const safeCool = Number.isFinite(cooldown) ? Math.max(0, cooldown) : 0;
    const safeMax = Number.isFinite(maxCooldown) && maxCooldown > 0 ? maxCooldown : 1.0;
    return Math.max(0, Math.min(1, safeCool / safeMax));
  }

  public isDashReady(cooldown: number = this.dashCooldown, stamina: number = this.stamina): boolean {
    return cooldown <= 1e-4 && stamina >= 0;
  }

  public setFixedJoystickCenter(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      this.fixedJoystickCenter = { x, y };
      if (this.joystickPointerId === null) {
        this.joystickOriginX = x;
        this.joystickOriginY = y;
        this.joystickCurrentX = x;
        this.joystickCurrentY = y;
      }
    }
  }

  public setZoneRect(zone: ActionZone, rect: ZoneRect | null): void {
    if (!rect) {
      this.zoneRects.delete(zone);
      return;
    }
    this.zoneRects.set(zone, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
  }

  public setMinimapRenderer(tester: MinimapHitTester | null): void {
    this.minimapTester = tester;
  }

  public hitTestZone(clientX: number, clientY: number): ActionZone | null {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const priorityOrder: ActionZone[] = [
      'curveLeft',
      'curveRight',
      'kick',
      'dash',
      'turbo',
      'emotes',
      'minimap'
    ];
    for (const zone of priorityOrder) {
      const r = this.zoneRects.get(zone);
      if (
        r &&
        r.width > 0 &&
        r.height > 0 &&
        clientX >= r.x &&
        clientX <= r.x + r.width &&
        clientY >= r.y &&
        clientY <= r.y + r.height
      ) {
        return zone;
      }
    }
    if (this.minimapTester && this.minimapTester.hitTest(clientX, clientY)) {
      return 'minimap';
    }
    return null;
  }

  public getJoystickState(): JoystickState {
    return {
      ...this.joystickMath,
      pointerId: this.joystickPointerId,
      originX: this.joystickOriginX,
      originY: this.joystickOriginY,
      currentX: this.joystickCurrentX,
      currentY: this.joystickCurrentY
    };
  }

  public startJoystick(
    pointerId: number,
    clientX: number,
    clientY: number,
    fixedCenterX?: number,
    fixedCenterY?: number
  ): JoystickState {
    if (this.joystickPointerId !== null && this.joystickPointerId !== pointerId) {
      return this.getJoystickState();
    }

    if (typeof fixedCenterX === 'number' && typeof fixedCenterY === 'number') {
      this.fixedJoystickCenter = { x: fixedCenterX, y: fixedCenterY };
    }

    this.joystickPointerId = pointerId;
    if (this.joystickAnchor === 'dynamic') {
      this.joystickOriginX = clientX;
      this.joystickOriginY = clientY;
    } else {
      this.joystickOriginX = this.fixedJoystickCenter.x;
      this.joystickOriginY = this.fixedJoystickCenter.y;
    }

    this.joystickCurrentX = clientX;
    this.joystickCurrentY = clientY;
    this.recomputeJoystick();
    this.notifyChange();
    return this.getJoystickState();
  }

  public moveJoystick(pointerId: number, clientX: number, clientY: number): JoystickState {
    if (this.joystickPointerId !== pointerId) {
      return this.getJoystickState();
    }
    this.joystickCurrentX = clientX;
    this.joystickCurrentY = clientY;
    this.recomputeJoystick();
    this.notifyChange();
    return this.getJoystickState();
  }

  public endJoystick(pointerId: number): JoystickState {
    if (this.joystickPointerId !== pointerId) {
      return this.getJoystickState();
    }
    this.joystickPointerId = null;
    this.joystickOriginX = this.fixedJoystickCenter.x;
    this.joystickOriginY = this.fixedJoystickCenter.y;
    this.joystickCurrentX = this.fixedJoystickCenter.x;
    this.joystickCurrentY = this.fixedJoystickCenter.y;
    this.joystickMath = {
      active: false,
      aimAngle: null,
      aimThrottle: 0,
      knobX: 0,
      knobY: 0,
      directionMask: 0,
      inputMask: 0
    };
    this.notifyChange();
    return this.getJoystickState();
  }

  private recomputeJoystick(): void {
    const dx = this.joystickCurrentX - this.joystickOriginX;
    const dy = this.joystickCurrentY - this.joystickOriginY;
    this.joystickMath = computeJoystickVector(
      dx,
      dy,
      this.joystickMaxRadius,
      this.joystickDeadzone,
      this.joystickMode
    );
  }

  public startActionPointer(
    pointerId: number,
    zone: ActionZone,
    clientX: number = 0,
    clientY: number = 0
  ): void {
    const isKickZone = zone === 'kick' || zone === 'curveLeft' || zone === 'curveRight';
    const isTurboZone = zone === 'turbo';

    const ptr: ActiveActionPointer = {
      pointerId,
      originZone: zone,
      currentZone: zone,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
      kickEntryX: isKickZone ? clientX : null,
      retainsTurbo: isTurboZone,
      slidFromTurbo: false
    };

    this.actionPointers.set(pointerId, ptr);

    if (isKickZone) {
      void mobileHaptics.impactLight();
    } else if (zone === 'dash') {
      this.dashPending = true;
      void mobileHaptics.impactMedium();
    } else if (zone === 'turbo') {
      if (this.turboMode === 'toggle') {
        this.turboLatched = !this.turboLatched;
      }
      void mobileHaptics.selection();
    } else if (zone === 'emotes') {
      this.handleEmoteButtonPress();
    } else if (zone === 'minimap') {
      this.isHoldingMinimap = true;
      gameUI.isFocusingBall = true;
    }

    this.notifyChange();
  }

  public moveActionPointer(
    pointerId: number,
    clientX: number,
    clientY: number,
    targetZoneOverride?: ActionZone | null
  ): void {
    const ptr = this.actionPointers.get(pointerId);
    if (!ptr) return;

    ptr.currentX = clientX;
    ptr.currentY = clientY;

    const hitZone = targetZoneOverride !== undefined ? targetZoneOverride : this.hitTestZone(clientX, clientY);

    if (ptr.originZone === 'kick' || ptr.originZone === 'curveLeft' || ptr.originZone === 'curveRight') {
      let nextZone: ActionZone = ptr.currentZone;

      if (hitZone === 'curveLeft' || hitZone === 'curveRight' || hitZone === 'kick') {
        nextZone = hitZone;
      }

      // If starting on kick (or currently in kick cluster without explicit wing rect override), evaluate swipe delta
      if (ptr.originZone === 'kick' && targetZoneOverride === undefined) {
        const anchorX = ptr.kickEntryX ?? ptr.startX;
        const dx = clientX - anchorX;
        if (hitZone === 'curveLeft' || dx <= -this.kickSwipeThresholdPx) {
          nextZone = 'curveLeft';
        } else if (hitZone === 'curveRight' || dx >= this.kickSwipeThresholdPx) {
          nextZone = 'curveRight';
        } else {
          nextZone = 'kick';
        }
      }

      if (ptr.currentZone !== nextZone) {
        ptr.currentZone = nextZone;
        void mobileHaptics.selection();
      }
    } else if (ptr.originZone === 'turbo') {
      // Slide transition: Turbo -> Patear (or < / >) keeps INPUT_FLAG_TURBO + INPUT_FLAG_KICK (+ Magnus curve)
      if (hitZone === 'kick' || hitZone === 'curveLeft' || hitZone === 'curveRight') {
        const wasOnTurbo = !ptr.slidFromTurbo;
        ptr.slidFromTurbo = true;
        ptr.retainsTurbo = true;
        if (ptr.kickEntryX === null) {
          ptr.kickEntryX = clientX;
        }

        let nextZone: ActionZone = hitZone;
        if (targetZoneOverride === undefined && hitZone === 'kick') {
          const dx = clientX - ptr.kickEntryX;
          if (dx <= -this.kickSwipeThresholdPx) {
            nextZone = 'curveLeft';
          } else if (dx >= this.kickSwipeThresholdPx) {
            nextZone = 'curveRight';
          }
        }

        if (ptr.currentZone !== nextZone) {
          ptr.currentZone = nextZone;
          if (wasOnTurbo) {
            void mobileHaptics.impactLight();
          } else {
            void mobileHaptics.selection();
          }
        }
      } else if (ptr.slidFromTurbo && ptr.kickEntryX !== null && targetZoneOverride === undefined) {
        // Once slid onto Patear, horizontal swipe delta transitions between < / Patear / >
        const dx = clientX - ptr.kickEntryX;
        const nextZone: ActionZone =
          dx <= -this.kickSwipeThresholdPx
            ? 'curveLeft'
            : dx >= this.kickSwipeThresholdPx
              ? 'curveRight'
              : 'kick';
        if (ptr.currentZone !== nextZone) {
          ptr.currentZone = nextZone;
          void mobileHaptics.selection();
        }
      }
    }

    this.notifyChange();
  }

  public endActionPointer(pointerId: number, releasedEmoteIndex?: number | null): void {
    const ptr = this.actionPointers.get(pointerId);
    if (!ptr) return;

    if (ptr.originZone === 'emotes' && this.isEmoteMenuOpen) {
      const idx = releasedEmoteIndex !== undefined ? releasedEmoteIndex : this.hoveredEmoteIndex;
      if (typeof idx === 'number' && idx >= 0) {
        this.selectEmoteByIndex(idx);
      } else if (!this.emoteOpenedOnCurrentPress) {
        this.closeEmoteMenu();
      }
    }

    this.actionPointers.delete(pointerId);

    if (ptr.originZone === 'minimap') {
      let anyStillHoldingMinimap = false;
      for (const other of this.actionPointers.values()) {
        if (other.originZone === 'minimap') {
          anyStillHoldingMinimap = true;
          break;
        }
      }
      this.isHoldingMinimap = anyStillHoldingMinimap;
      gameUI.isFocusingBall = anyStillHoldingMinimap;
    }

    this.notifyChange();
  }

  public releasePointer(pointerId: number, releasedEmoteIndex?: number | null): void {
    if (this.joystickPointerId === pointerId) {
      this.endJoystick(pointerId);
    }
    if (this.actionPointers.has(pointerId)) {
      this.endActionPointer(pointerId, releasedEmoteIndex);
    }
  }

  public handleMinimapPointerDown(pointerId: number, clientX: number, clientY: number): boolean {
    if (this.minimapTester && !this.minimapTester.hitTest(clientX, clientY)) {
      return false;
    }
    this.startActionPointer(pointerId, 'minimap', clientX, clientY);
    return true;
  }

  public triggerDash(): void {
    this.dashPending = true;
    void mobileHaptics.impactMedium();
    this.notifyChange();
  }

  public consumeDash(): boolean {
    if (!this.dashPending) return false;
    this.dashPending = false;
    return true;
  }

  private isRegisteredAccount(): boolean {
    return Boolean((!userProfile.isGuest && userProfile.isAuthenticated) || gameUI.isAuthenticatedUser);
  }

  private showEmoteAuthToast(): void {
    this.emoteAuthWarning = EMOTE_AUTH_WARNING_TEXT;
    if (this.emoteWarningTimer !== null) {
      clearTimeout(this.emoteWarningTimer);
    }
    this.emoteWarningTimer = setTimeout(() => {
      this.emoteAuthWarning = null;
      this.emoteWarningTimer = null;
      this.onStateChanged?.();
    }, 3200);
    this.onStateChanged?.();
  }

  private handleEmoteButtonPress(): void {
    if (!this.isRegisteredAccount()) {
      this.isEmoteMenuOpen = false;
      this.hoveredEmoteIndex = null;
      this.showEmoteAuthToast();
      return;
    }
    this.emoteOpenedOnCurrentPress = !this.isEmoteMenuOpen;
    this.isEmoteMenuOpen = true;
    this.hoveredEmoteIndex = null;
    void mobileHaptics.selection();
    this.onStateChanged?.();
  }

  public setHoveredEmoteIndex(index: number | null): void {
    if (this.hoveredEmoteIndex !== index) {
      this.hoveredEmoteIndex = index;
      if (index !== null) {
        void mobileHaptics.selection();
      }
      this.onStateChanged?.();
    }
  }

  public closeEmoteMenu(): void {
    if (this.isEmoteMenuOpen || this.hoveredEmoteIndex !== null) {
      this.isEmoteMenuOpen = false;
      this.hoveredEmoteIndex = null;
      this.onStateChanged?.();
    }
  }

  public selectEmoteByIndex(index: number): boolean {
    const triggers = gameUI.settings.emoteTriggers || [];
    const item = triggers[index];
    if (!item) {
      this.closeEmoteMenu();
      return false;
    }
    return this.dispatchEmote(item.trigger, item.emoji);
  }

  public dispatchEmote(trigger: string, emoji?: string): boolean {
    if (!this.isRegisteredAccount()) {
      this.closeEmoteMenu();
      this.showEmoteAuthToast();
      return false;
    }

    const resolvedEmoji = emoji ?? gameUI.matchEmoteTrigger(trigger) ?? trigger;
    const cleanTrigger = trigger.trim();
    if (!cleanTrigger) return false;

    let emoteTriggeredDuringChat = false;
    const prevOnPlayerEmote = gameUI.onPlayerEmote;
    gameUI.onPlayerEmote = (pid: number, em: string) => {
      emoteTriggeredDuringChat = true;
      prevOnPlayerEmote?.(pid, em);
    };

    try {
      gameUI.onChatSent?.(cleanTrigger);
    } finally {
      gameUI.onPlayerEmote = prevOnPlayerEmote;
    }

    if (!emoteTriggeredDuringChat && resolvedEmoji) {
      gameUI.triggerPlayerEmote(gameUI.localPlayerId || 1, resolvedEmoji);
    }

    void mobileHaptics.selection();
    this.closeEmoteMenu();
    return true;
  }

  public isKickActive(): boolean {
    for (const ptr of this.actionPointers.values()) {
      if (
        ptr.currentZone === 'kick' ||
        ptr.currentZone === 'curveLeft' ||
        ptr.currentZone === 'curveRight'
      ) {
        return true;
      }
    }
    return false;
  }

  public isCurveLeftActive(): boolean {
    for (const ptr of this.actionPointers.values()) {
      if (ptr.currentZone === 'curveLeft') return true;
    }
    return false;
  }

  public isCurveRightActive(): boolean {
    for (const ptr of this.actionPointers.values()) {
      if (ptr.currentZone === 'curveRight') return true;
    }
    return false;
  }

  public isTurboActive(): boolean {
    if (this.turboMode === 'toggle' && this.turboLatched) {
      return true;
    }
    for (const ptr of this.actionPointers.values()) {
      if (this.turboMode === 'hold' && ptr.retainsTurbo) {
        return true;
      }
      if (ptr.slidFromTurbo && ptr.retainsTurbo) {
        return true;
      }
    }
    return false;
  }

  public getInputMask(consumeDash: boolean = false): number {
    let mask = 0;

    if (this.joystickMath.active) {
      mask |= this.joystickMath.inputMask;
    }

    for (const ptr of this.actionPointers.values()) {
      if (ptr.currentZone === 'kick') {
        mask |= INPUT_FLAG_KICK;
      } else if (ptr.currentZone === 'curveLeft') {
        mask |= INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_LEFT;
      } else if (ptr.currentZone === 'curveRight') {
        mask |= INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_RIGHT;
      }
    }

    if (this.isTurboActive()) {
      mask |= INPUT_FLAG_TURBO;
    }

    if (this.dashPending) {
      mask |= INPUT_FLAG_DASH;
      if (consumeDash) {
        this.dashPending = false;
      }
    }

    return mask;
  }

  public sampleInput(consumeDash: boolean = false): PlayerInput {
    const mask = this.getInputMask(consumeDash);
    if (
      this.joystickMode === '360' &&
      this.joystickMath.active &&
      this.joystickMath.aimAngle !== null &&
      this.joystickMath.aimThrottle > 0
    ) {
      return {
        inputMask: mask,
        aimAngle: this.joystickMath.aimAngle,
        aimThrottle: this.joystickMath.aimThrottle
      };
    }

    return {
      inputMask: mask,
      aimAngle: null,
      aimThrottle: 0
    };
  }

  public hasActiveInput(): boolean {
    return (
      this.joystickPointerId !== null ||
      this.actionPointers.size > 0 ||
      this.dashPending ||
      (this.turboMode === 'toggle' && this.turboLatched) ||
      this.isHoldingMinimap
    );
  }

  public getControlOffset(controlId: MobileHudControlId | string): { x: number; y: number } {
    return getMobileControlOffset(controlId);
  }

  public setControlOffset(
    controlId: MobileHudControlId | string,
    offset: { x: number; y: number },
    viewport?: { width: number; height: number }
  ): { x: number; y: number } {
    const res = setMobileControlOffset(controlId, offset, viewport);
    this.onStateChanged?.();
    return res;
  }

  public resetCustomLayout(): void {
    resetMobileCustomLayout();
    this.onStateChanged?.();
  }

  public resetAll(): void {
    const hadAny = this.hasActiveInput() || this.isEmoteMenuOpen;
    this.joystickPointerId = null;
    this.joystickOriginX = this.fixedJoystickCenter.x;
    this.joystickOriginY = this.fixedJoystickCenter.y;
    this.joystickCurrentX = this.fixedJoystickCenter.x;
    this.joystickCurrentY = this.fixedJoystickCenter.y;
    this.joystickMath = {
      active: false,
      aimAngle: null,
      aimThrottle: 0,
      knobX: 0,
      knobY: 0,
      directionMask: 0,
      inputMask: 0
    };
    this.actionPointers.clear();
    this.dashPending = false;
    this.turboLatched = false;
    if (this.isHoldingMinimap) {
      this.isHoldingMinimap = false;
      gameUI.isFocusingBall = false;
    }
    this.isEmoteMenuOpen = false;
    this.hoveredEmoteIndex = null;
    this.emoteOpenedOnCurrentPress = false;
    if (hadAny) {
      this.notifyChange();
    }
  }

  private notifyChange(): void {
    this.onStateChanged?.();
    const mask = this.getInputMask(false);
    const angle = this.joystickMode === '360' && this.joystickMath.active ? this.joystickMath.aimAngle : null;
    const throttle =
      this.joystickMode === '360' && this.joystickMath.active ? this.joystickMath.aimThrottle : 0;

    if (
      mask !== this.lastEmittedMask ||
      angle !== this.lastEmittedAngle ||
      Math.abs(throttle - this.lastEmittedThrottle) > 1e-4
    ) {
      this.lastEmittedMask = mask;
      this.lastEmittedAngle = angle;
      this.lastEmittedThrottle = throttle;
      this.onInputChanged?.();
    }
  }
}

export const mobileTouchController = new MobileTouchController();
