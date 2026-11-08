import {
  INPUT_UP,
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MAGNUS_LEFT,
  INPUT_MAGNUS_RIGHT,
  INPUT_MOUSE_AIM
} from '../../../core/src/game/Player';
import { MatchPhase } from '../../../core/src/game/GameFSM';
import { UIStateMachine } from './UIStateMachine';
import { $matchPhase } from './stores/gameStore';

export const MOUSE_DEADZONE_PX = 6;
export const MOUSE_FINE_CONTROL_RADIUS_PX = 42;

export function mouseButtonToCode(button: number): 'Mouse0' | 'Mouse1' | 'Mouse2' | null {
  if (button === 0) return 'Mouse0';
  if (button === 1) return 'Mouse1';
  if (button === 2) return 'Mouse2';
  return null;
}

export function computeMouseMovementVector(
  playerX: number,
  playerY: number,
  mouseWorldX: number,
  mouseWorldY: number
): { active: boolean; angle: number; throttle: number; distance: number } {
  const dx = mouseWorldX - playerX;
  const dy = mouseWorldY - playerY;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist <= MOUSE_DEADZONE_PX) {
    return { active: false, angle: 0, throttle: 0, distance: Number.isFinite(dist) ? dist : 0 };
  }
  const angle = Math.atan2(dy, dx);
  const span = MOUSE_FINE_CONTROL_RADIUS_PX - MOUSE_DEADZONE_PX; // 36 px
  const throttle = dist < MOUSE_FINE_CONTROL_RADIUS_PX ? (dist - MOUSE_DEADZONE_PX) / span : 1.0;
  return { active: true, angle, throttle, distance: dist };
}

export interface KeyBinds {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  kick: string[];
  turbo: string[];
  dash: string[];
  curveLeft: string[];
  curveRight: string[];
  focusBall: string[];
  menu: string[];
  pause: string[];
  chat: string[];
}

export const DEFAULT_KEYBINDS: KeyBinds = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  kick: ['Space'],
  turbo: ['ShiftLeft', 'ShiftRight'],
  dash: ['ArrowUp'],
  curveLeft: ['ArrowLeft'],
  curveRight: ['ArrowRight'],
  focusBall: ['KeyV', 'Tab'],
  menu: ['Escape'],
  pause: ['KeyP'],
  chat: ['Enter', 'NumpadEnter']
};

export const KEYBIND_STORAGE_KEY = 'haxball_keybinds';

export class InputManager {
  private keyStates: Record<string, boolean> = Object.create(null);
  public currentMask: number = 0;
  public onInputChanged?: (mask: number) => void;
  public onImmediateInput?: (mask: number) => void;
  public onKickImmediate?: () => void;
  public keyBinds: KeyBinds;
  public isEnabled: boolean = false;
  public movementMode: 'keyboard' | 'mouse' = 'keyboard';
  public mouseScreenX: number = 0;
  public mouseScreenY: number = 0;
  public currentAimAngle: number = 0;
  public currentAimThrottle: number = 0;
  public isFocusingBall: boolean = false;
  private dashTriggered: boolean = false;
  private curveVec = { x: 0, y: 0 };

  public chatInput: HTMLElement | null = null;
  public gameApp?: any = null;
  public uiStateMachine?: UIStateMachine | null = null;

  constructor() {
    this.keyBinds = this.loadKeyBinds();
    this.setupListeners();
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.resetMovement();
    }
  }

  public loadKeyBinds(): KeyBinds {
    if (typeof localStorage === 'undefined') {
      return JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
    }
    try {
      const version = Number(localStorage.getItem('haxball_settings_version') || 0);
      if (version < 2) {
        localStorage.setItem('haxball_settings_version', '2');
        const defs: KeyBinds = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
        this.saveKeyBinds(defs);
        return defs;
      }
      const saved = localStorage.getItem(KEYBIND_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          up: Array.isArray(parsed.up) ? parsed.up : DEFAULT_KEYBINDS.up,
          down: Array.isArray(parsed.down) ? parsed.down : DEFAULT_KEYBINDS.down,
          left: Array.isArray(parsed.left) ? parsed.left : DEFAULT_KEYBINDS.left,
          right: Array.isArray(parsed.right) ? parsed.right : DEFAULT_KEYBINDS.right,
          kick: Array.isArray(parsed.kick) ? parsed.kick : DEFAULT_KEYBINDS.kick,
          turbo: Array.isArray(parsed.turbo) ? parsed.turbo : DEFAULT_KEYBINDS.turbo,
          dash: Array.isArray(parsed.dash) ? parsed.dash : DEFAULT_KEYBINDS.dash,
          curveLeft: Array.isArray(parsed.curveLeft) ? parsed.curveLeft : DEFAULT_KEYBINDS.curveLeft,
          curveRight: Array.isArray(parsed.curveRight) ? parsed.curveRight : DEFAULT_KEYBINDS.curveRight,
          focusBall: Array.isArray(parsed.focusBall) ? parsed.focusBall : DEFAULT_KEYBINDS.focusBall,
          menu: Array.isArray(parsed.menu) ? parsed.menu : DEFAULT_KEYBINDS.menu,
          pause: Array.isArray(parsed.pause) ? parsed.pause : DEFAULT_KEYBINDS.pause,
          chat: Array.isArray(parsed.chat) ? parsed.chat : DEFAULT_KEYBINDS.chat
        };
      }
    } catch (e) {
      console.warn('Error al cargar keybinds desde localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
  }

  public saveKeyBinds(binds: KeyBinds): void {
    this.keyBinds = binds;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(KEYBIND_STORAGE_KEY, JSON.stringify(binds));
    } catch (e) {
      console.warn('Error al guardar keybinds en localStorage:', e);
    }
  }

  public resetToDefaultKeyBinds(): KeyBinds {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
    this.saveKeyBinds(defaults);
    return defaults;
  }

  public isActionKey(action: keyof KeyBinds, code: string): boolean {
    return this.keyBinds[action]?.includes(code) ?? false;
  }

  private isGameplayKey(code: string): boolean {
    return (
      this.keyBinds.up.includes(code) ||
      this.keyBinds.down.includes(code) ||
      this.keyBinds.left.includes(code) ||
      this.keyBinds.right.includes(code) ||
      this.keyBinds.kick.includes(code) ||
      this.keyBinds.curveLeft.includes(code) ||
      this.keyBinds.curveRight.includes(code) ||
      this.keyBinds.turbo.includes(code) ||
      this.keyBinds.dash.includes(code) ||
      (this.keyBinds.focusBall?.includes(code) ?? false)
    );
  }

  private setupListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || this.isActionKey('menu', e.code)) {
        if (this.uiStateMachine && this.uiStateMachine.getState() !== 'STATE_IN_GAME') return;
        e.preventDefault();
        // Si el chat tiene el foco, desenfocar y no abrir/cerrar menús
        const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
        const chatInputEl = this.chatInput || (typeof document !== 'undefined' ? (document.getElementById('chat-input') || document.getElementById('chatInput')) : null);
        if (activeEl && (activeEl === this.chatInput || activeEl === chatInputEl)) {
          if (this.chatInput) {
            this.chatInput.blur();
          } else if (chatInputEl) {
            (chatInputEl as HTMLElement).blur();
          }
          return;
        }

        // Si el modal de teclas/ajustes está abierto, cerrarlo
        const settingsModal = typeof document !== 'undefined' ? document.getElementById('settingsModal') : null;
        if (settingsModal && settingsModal.style.display !== 'none' && !settingsModal.classList.contains('ui-screen-hidden') && !settingsModal.classList.contains('u-hidden')) {
          settingsModal.style.display = 'none';
          settingsModal.classList.add('u-hidden');
          return;
        }

        // En STOPPED el menú es obligatorio; no se cierra
        const phase = this.gameApp?.matchPhase ?? ($matchPhase.get());
        if (phase === MatchPhase.STOPPED) return;
        this.uiStateMachine?.toggleModal('teamSelect');
        return;
      }

      if (!this.isEnabled) return;
      if (e.repeat) return; // Edge-trigger estricto: descartar auto-repeticiones del sistema operativo

      // Evitar que el gestor global bloquee combinaciones estándar del OS (Ctrl+C, Cmd+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Si el foco está en un input/textarea, no capturamos controles de juego
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (this.isGameplayKey(e.code)) {
        e.preventDefault();
      }

      if (this.isActionKey('dash', e.code)) {
        this.dashTriggered = true;
      }

      const wasPressed = Boolean(this.keyStates[e.code]);
      if (!wasPressed) {
        this.keyStates[e.code] = true;
        this.updateMask();

        // Despacho inmediato de input (sin esperar acumulador de 60 Hz)
        if (this.isGameplayKey(e.code)) {
          const immediateMask = this.dashTriggered ? (this.currentMask | INPUT_DASH) : this.currentMask;
          this.onImmediateInput?.(immediateMask);
        }

        // Minimizar latencia de pateo: disparo inmediato por RTCDataChannel
        if (this.isActionKey('kick', e.code)) {
          this.onKickImmediate?.();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (!this.isEnabled) return;

      if (this.keyStates[e.code]) {
        this.keyStates[e.code] = false;
        this.updateMask();
        if (this.isGameplayKey(e.code)) {
          this.onImmediateInput?.(this.currentMask);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseScreenX = e.clientX;
      this.mouseScreenY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isEnabled) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement ||
        (e.target instanceof HTMLElement && e.target.closest('button, input, textarea, select, [role="dialog"]'))
      ) {
        return;
      }
      const mCode = mouseButtonToCode(e.button);
      if (!mCode) return;
      if (this.isGameplayKey(mCode)) {
        e.preventDefault();
      }
      if (this.isActionKey('dash', mCode)) {
        this.dashTriggered = true;
      }
      if (!this.keyStates[mCode]) {
        this.keyStates[mCode] = true;
        this.updateMask();
        if (this.isGameplayKey(mCode)) {
          const immediateMask = this.dashTriggered ? (this.currentMask | INPUT_DASH) : this.currentMask;
          this.onImmediateInput?.(immediateMask);
        }
        if (this.isActionKey('kick', mCode)) {
          this.onKickImmediate?.();
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      const mCode = mouseButtonToCode(e.button);
      if (!mCode) return;
      if (this.keyStates[mCode]) {
        this.keyStates[mCode] = false;
        this.updateMask();
        if (this.isGameplayKey(mCode)) {
          this.onImmediateInput?.(this.currentMask);
        }
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (e.target instanceof HTMLCanvasElement) {
        e.preventDefault();
      }
    });

    // Reset inputs if window loses focus
    window.addEventListener('blur', () => {
      this.resetMovement();
    });

    // Reset inputs immediately if any text field gains focus
    document.addEventListener('focusin', (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        this.resetMovement();
      }
    });
  }

  public resetMovement(): void {
    for (const key in this.keyStates) {
      this.keyStates[key] = false;
    }
    this.dashTriggered = false;
    if (this.currentMask !== 0) {
      this.currentMask = 0;
      if (this.onInputChanged) {
        this.onInputChanged(0);
      }
    }
  }

  private isAnyCodePressed(codes?: string[]): boolean {
    if (!codes) return false;
    for (let i = 0; i < codes.length; i++) {
      if (this.keyStates[codes[i]]) return true;
    }
    return false;
  }

  private updateMask(): void {
    let mask = 0;

    if (this.movementMode === 'keyboard') {
      if (this.isAnyCodePressed(this.keyBinds.up)) mask |= INPUT_UP;
      if (this.isAnyCodePressed(this.keyBinds.down)) mask |= INPUT_DOWN;
      if (this.isAnyCodePressed(this.keyBinds.left)) mask |= INPUT_LEFT;
      if (this.isAnyCodePressed(this.keyBinds.right)) mask |= INPUT_RIGHT;
    } else if (this.currentAimThrottle > 0) {
      mask |= INPUT_MOUSE_AIM;
    }
    if (this.isAnyCodePressed(this.keyBinds.kick)) mask |= INPUT_KICK;
    if (this.isAnyCodePressed(this.keyBinds.turbo)) mask |= INPUT_TURBO;
    if (this.isAnyCodePressed(this.keyBinds.curveLeft)) mask |= INPUT_MAGNUS_LEFT;
    if (this.isAnyCodePressed(this.keyBinds.curveRight)) mask |= INPUT_MAGNUS_RIGHT;

    this.isFocusingBall = this.isAnyCodePressed(this.keyBinds.focusBall);

    if (mask !== this.currentMask) {
      this.currentMask = mask;
      if (this.onInputChanged) {
        this.onInputChanged(mask);
      }
    }
  }

  public sampleMouseAimPacket(
    camera: { screenToWorld: (sx: number, sy: number, safeBottom?: number) => { x: number; y: number } },
    playerX: number,
    playerY: number,
    canvasRect?: { left: number; top: number; width: number; height: number },
    canvasBufferSize?: { width: number; height: number },
    safeAreaBottom: number = 0
  ): { active: boolean; aimAngle: number; aimThrottle: number } {
    if (this.movementMode !== 'mouse') {
      this.currentAimAngle = 0;
      this.currentAimThrottle = 0;
      return { active: false, aimAngle: 0, aimThrottle: 0 };
    }
    let sx = this.mouseScreenX;
    let sy = this.mouseScreenY;
    if (canvasRect && canvasRect.width > 0 && canvasRect.height > 0 && canvasBufferSize) {
      sx = (sx - canvasRect.left) * (canvasBufferSize.width / canvasRect.width);
      sy = (sy - canvasRect.top) * (canvasBufferSize.height / canvasRect.height);
    }
    const worldPt = camera.screenToWorld(sx, sy, safeAreaBottom);
    const vec = computeMouseMovementVector(playerX, playerY, worldPt.x, worldPt.y);
    this.currentAimAngle = vec.angle;
    this.currentAimThrottle = vec.throttle;
    this.updateMask();
    return { active: vec.active, aimAngle: vec.angle, aimThrottle: vec.throttle };
  }

  public getMask(withDashTrigger: boolean = false): number {
    if (withDashTrigger && this.dashTriggered) {
      this.dashTriggered = false;
      return this.currentMask | INPUT_DASH;
    }
    return this.currentMask;
  }

  public getCurveVector(): { x: number; y: number } {
    let cx = 0;
    if (this.isAnyCodePressed(this.keyBinds.curveLeft)) cx -= 1;
    if (this.isAnyCodePressed(this.keyBinds.curveRight)) cx += 1;
    this.curveVec.x = cx;
    this.curveVec.y = 0;
    return this.curveVec;
  }

  /**
   * Retorna los 2 bits de comba continua:
   * 00 (0): ninguno
   * 01 (1): Z / Tecla Izquierda
   * 10 (2): C / Tecla Derecha
   */
  public getCurveInput(): number {
    const left = this.isAnyCodePressed(this.keyBinds.curveLeft) || Boolean(this.keyStates['KeyZ']);
    const right = this.isAnyCodePressed(this.keyBinds.curveRight) || Boolean(this.keyStates['KeyC']);
    if (left && !right) return 1; // 01: Left (Z)
    if (right && !left) return 2; // 10: Right (C)
    return 0; // 00: Ninguno
  }

  public isTurboActive(): boolean {
    return this.isAnyCodePressed(this.keyBinds.turbo);
  }

  public consumeDashTrigger(): boolean {
    const triggered = this.dashTriggered;
    this.dashTriggered = false;
    return triggered;
  }
}
