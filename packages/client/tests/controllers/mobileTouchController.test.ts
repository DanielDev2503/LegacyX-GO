import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  INPUT_FLAG_MOUSE_ACTIVE
} from '@legacyx/core';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  gameUI
} from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import {
  MobileTouchController,
  computeJoystickVector,
  quantizeAngleTo8DirMask,
  getMobileControlOffset,
  setMobileControlOffset,
  resolveMobileControlPixelOffset,
  resetMobileCustomLayout,
  EMOTE_AUTH_WARNING_TEXT
} from '../../src/controllers/MobileTouchController.js';

function makeMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('Fase 3 & 5: MobileTouchController (Multitouch Joystick, Hybrid Kick+Magnus, Turbo Slide, Dash, Emotes & HUD Layout)', () => {
  let controller: MobileTouchController;
  let memoryStorage: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memoryStorage = makeMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    gameUI.resetRoomSession();
    gameUI.setViewportEnvironment(844, 390, true, false, true, true);
    gameUI.saveSettings({
      ...DEFAULT_SETTINGS,
      mobileControlsEnabled: 'on',
      mobileJoystickMode: '360',
      mobileJoystickAnchor: 'fixed',
      mobileTurboMode: 'hold',
      mobileCustomLayout: {}
    });
    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
    controller = new MobileTouchController();
  });

  describe('1. 360° analog joystick math & 8-direction quantization', () => {
    it('returns inactive zero vector inside deadzone and proportional throttle/angle in 360° mode', () => {
      const dead = computeJoystickVector(3, 4, 54, 6, '360'); // dist = 5 <= 6
      expect(dead.active).toBe(false);
      expect(dead.aimAngle).toBeNull();
      expect(dead.aimThrottle).toBe(0);
      expect(dead.inputMask).toBe(0);

      // Halfway between deadzone (6) and maxRadius (54) -> dist = 30 -> throttle = 24 / 48 = 0.5
      const halfRight = computeJoystickVector(30, 0, 54, 6, '360');
      expect(halfRight.active).toBe(true);
      expect(halfRight.aimAngle).toBeCloseTo(0, 5);
      expect(halfRight.aimThrottle).toBeCloseTo(0.5, 5);
      expect(halfRight.knobX).toBeCloseTo(30, 5);
      expect(halfRight.knobY).toBeCloseTo(0, 5);
      expect(halfRight.inputMask).toBe(INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE);

      // Clamped beyond maxRadius (dist = 100 > 54) at -90 deg (Up)
      const fullUp = computeJoystickVector(0, -100, 54, 6, '360');
      expect(fullUp.active).toBe(true);
      expect(fullUp.aimAngle).toBeCloseTo(-Math.PI / 2, 5);
      expect(fullUp.aimThrottle).toBe(1);
      expect(fullUp.knobX).toBeCloseTo(0, 4);
      expect(fullUp.knobY).toBeCloseTo(-54, 4);
      expect(fullUp.inputMask).toBe(INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE);
    });

    it('quantizes all 8 cardinal and diagonal sectors in 8dir mode with aimAngle=null and aimThrottle=0', () => {
      expect(quantizeAngleTo8DirMask(0)).toBe(INPUT_FLAG_RIGHT);
      expect(quantizeAngleTo8DirMask(Math.PI / 4)).toBe(INPUT_FLAG_DOWN | INPUT_FLAG_RIGHT);
      expect(quantizeAngleTo8DirMask(Math.PI / 2)).toBe(INPUT_FLAG_DOWN);
      expect(quantizeAngleTo8DirMask((3 * Math.PI) / 4)).toBe(INPUT_FLAG_DOWN | INPUT_FLAG_LEFT);
      expect(quantizeAngleTo8DirMask(Math.PI)).toBe(INPUT_FLAG_LEFT);
      expect(quantizeAngleTo8DirMask(-Math.PI)).toBe(INPUT_FLAG_LEFT);
      expect(quantizeAngleTo8DirMask((-3 * Math.PI) / 4)).toBe(INPUT_FLAG_UP | INPUT_FLAG_LEFT);
      expect(quantizeAngleTo8DirMask(-Math.PI / 2)).toBe(INPUT_FLAG_UP);
      expect(quantizeAngleTo8DirMask(-Math.PI / 4)).toBe(INPUT_FLAG_UP | INPUT_FLAG_RIGHT);

      gameUI.saveSettings({ mobileJoystickMode: '8dir' });
      controller.startJoystick(1, 96, 290, 96, 290);
      controller.moveJoystick(1, 96 - 40, 290 - 40); // Up-Left
      const pkt = controller.sampleInput(false);
      expect(pkt.aimAngle).toBeNull();
      expect(pkt.aimThrottle).toBe(0);
      expect(pkt.inputMask).toBe(INPUT_FLAG_UP | INPUT_FLAG_LEFT);
    });
  });

  describe('2. Fixed vs Dynamic joystick anchor & pointerId isolation', () => {
    it('evaluates initial displacement immediately from fixed center in fixed anchor mode', () => {
      gameUI.saveSettings({ mobileJoystickAnchor: 'fixed', mobileJoystickMode: '360' });
      // Fixed center at (100, 300), pointerdown directly at (154, 300) -> full right throttle
      const state = controller.startJoystick(10, 154, 300, 100, 300);
      expect(state.originX).toBe(100);
      expect(state.originY).toBe(300);
      expect(state.active).toBe(true);
      expect(state.aimThrottle).toBe(1);
      expect(state.aimAngle).toBeCloseTo(0, 5);

      // Second pointer on joystick is ignored while pointer 10 owns the joystick
      controller.startJoystick(99, 50, 300, 100, 300);
      controller.moveJoystick(99, 40, 300);
      expect(controller.getJoystickState().pointerId).toBe(10);
      expect(controller.sampleInput().aimAngle).toBeCloseTo(0, 5);

      controller.endJoystick(10);
      expect(controller.getJoystickState().active).toBe(false);
      expect(controller.sampleInput().inputMask).toBe(0);
    });

    it('spawns origin at pointerdown position in dynamic anchor mode and computes delta on move', () => {
      gameUI.saveSettings({ mobileJoystickAnchor: 'dynamic', mobileJoystickMode: '360' });
      const downState = controller.startJoystick(11, 145, 260, 100, 300);
      expect(downState.originX).toBe(145);
      expect(downState.originY).toBe(260);
      expect(downState.active).toBe(false);
      expect(downState.aimThrottle).toBe(0);

      // Move 54px down from dynamic origin (145, 260) -> (145, 314)
      const moveState = controller.moveJoystick(11, 145, 314);
      expect(moveState.active).toBe(true);
      expect(moveState.aimAngle).toBeCloseTo(Math.PI / 2, 5);
      expect(moveState.aimThrottle).toBe(1);

      controller.endJoystick(11);
      const resetState = controller.getJoystickState();
      expect(resetState.active).toBe(false);
      expect(resetState.originX).toBe(100);
      expect(resetState.originY).toBe(300);
    });
  });

  describe('3. Hybrid Patear + < (Curva Izq) and > (Curva Der) (Swipe & Direct Tap)', () => {
    it('supports pressing Patear and swiping same pointer left (<) and right (>)', () => {
      // Press Patear at X=700
      controller.startActionPointer(2, 'kick', 700, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_KICK);

      // Swipe same pointer left beyond threshold (700 -> 670, dx = -30 <= -22)
      controller.moveActionPointer(2, 670, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_LEFT);
      expect(controller.isCurveLeftActive()).toBe(true);

      // Swipe same pointer right beyond threshold (700 -> 732, dx = +32 >= 22)
      controller.moveActionPointer(2, 732, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_RIGHT);
      expect(controller.isCurveRightActive()).toBe(true);

      // Return pointer to center Patear
      controller.moveActionPointer(2, 704, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_KICK);

      // Release pointer
      controller.endActionPointer(2);
      expect(controller.getInputMask()).toBe(0);
    });

    it('supports direct tap/hold on < (curveLeft) and > (curveRight) wings', () => {
      controller.startActionPointer(3, 'curveLeft', 650, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_LEFT);
      controller.endActionPointer(3);
      expect(controller.getInputMask()).toBe(0);

      controller.startActionPointer(4, 'curveRight', 750, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_RIGHT);
      controller.endActionPointer(4);
      expect(controller.getInputMask()).toBe(0);
    });
  });

  describe('4. Turbo hold/toggle modes & Slide Transition Turbo -> Patear (< / >)', () => {
    it('activates Turbo while held in hold mode and latches/unlatches in toggle mode', () => {
      gameUI.saveSettings({ mobileTurboMode: 'hold' });
      controller.startActionPointer(5, 'turbo', 740, 220);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_TURBO);
      controller.endActionPointer(5);
      expect(controller.getInputMask()).toBe(0);

      gameUI.saveSettings({ mobileTurboMode: 'toggle' });
      // First tap latches turbo ON
      controller.startActionPointer(6, 'turbo', 740, 220);
      controller.endActionPointer(6);
      expect(controller.isTurboLatched).toBe(true);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_TURBO);

      // Second tap unlatches turbo OFF
      controller.startActionPointer(7, 'turbo', 740, 220);
      controller.endActionPointer(7);
      expect(controller.isTurboLatched).toBe(false);
      expect(controller.getInputMask()).toBe(0);
    });

    it('keeps INPUT_FLAG_TURBO active together with INPUT_FLAG_KICK (and Magnus curve) when sliding Turbo -> Patear -> < / >', () => {
      gameUI.saveSettings({ mobileTurboMode: 'hold' });
      controller.setZoneRect('turbo', { x: 710, y: 190, width: 64, height: 64 });
      controller.setZoneRect('kick', { x: 668, y: 268, width: 76, height: 76 });
      controller.setZoneRect('curveLeft', { x: 620, y: 276, width: 44, height: 60 });
      controller.setZoneRect('curveRight', { x: 748, y: 276, width: 44, height: 60 });

      // Finger starts on Turbo
      controller.startActionPointer(8, 'turbo', 740, 220);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_TURBO);

      // Slide that same finger onto Patear center
      controller.moveActionPointer(8, 705, 300);
      expect(controller.getInputMask()).toBe(INPUT_FLAG_TURBO | INPUT_FLAG_KICK);

      // Slide further left into < (Magnus Left)
      controller.moveActionPointer(8, 640, 300);
      expect(controller.getInputMask()).toBe(
        INPUT_FLAG_TURBO | INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_LEFT
      );

      // Slide right into > (Magnus Right)
      controller.moveActionPointer(8, 765, 300);
      expect(controller.getInputMask()).toBe(
        INPUT_FLAG_TURBO | INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_RIGHT
      );

      // Release finger clears both Turbo and Kick
      controller.endActionPointer(8);
      expect(controller.getInputMask()).toBe(0);
    });
  });

  describe('5. Dash edge trigger, consumeDash(), cooldown progress & multitouch concurrency', () => {
    it('edge-triggers INPUT_FLAG_DASH on pointerdown, consumes once via consumeDash(), and computes radial cooldown progress', () => {
      controller.startActionPointer(9, 'dash', 800, 300);
      expect(controller.hasPendingDash).toBe(true);
      expect(controller.getInputMask(false) & INPUT_FLAG_DASH).toBe(INPUT_FLAG_DASH);

      // Consuming dash clears pending flag
      expect(controller.consumeDash()).toBe(true);
      expect(controller.consumeDash()).toBe(false);
      expect(controller.getInputMask(false) & INPUT_FLAG_DASH).toBe(0);
      controller.endActionPointer(9);

      // Cooldown radial progress math
      gameUI.localDashMaxCooldown = 2.0;
      gameUI.localDashCooldown = 0.5;
      expect(controller.getDashCooldownProgress()).toBeCloseTo(0.25, 5);
      expect(controller.isDashReady()).toBe(false);

      gameUI.localDashCooldown = 0;
      expect(controller.getDashCooldownProgress()).toBe(0);
      expect(controller.isDashReady()).toBe(true);
    });

    it('combines simultaneous left-thumb 360° joystick + right-thumb Turbo->Kick + second-finger Dash', () => {
      const onInputChanged = vi.fn();
      controller.onInputChanged = onInputChanged;

      controller.startJoystick(1, 100, 300, 100, 300);
      controller.moveJoystick(1, 154, 300); // Full right analog
      controller.startActionPointer(2, 'turbo', 740, 220);
      controller.moveActionPointer(2, 705, 300, 'kick'); // Slide Turbo -> Patear
      controller.startActionPointer(3, 'dash', 800, 300);

      const sampled = controller.sampleInput(true);
      expect(sampled.aimAngle).toBeCloseTo(0, 5);
      expect(sampled.aimThrottle).toBe(1);
      expect(sampled.inputMask).toBe(
        INPUT_FLAG_MOUSE_AIM |
          INPUT_FLAG_MOUSE_ACTIVE |
          INPUT_FLAG_TURBO |
          INPUT_FLAG_KICK |
          INPUT_FLAG_DASH
      );
      expect(onInputChanged).toHaveBeenCalled();

      // Dash was consumed on sampleInput(true), while Joystick + Turbo + Kick remain active
      const nextSample = controller.sampleInput(false);
      expect(nextSample.inputMask).toBe(
        INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE | INPUT_FLAG_TURBO | INPUT_FLAG_KICK
      );
    });
  });

  describe('6. Emotes radial menu & registered-account-only enforcement', () => {
    it('blocks guests with a warning toast and dispatches emote for authenticated accounts', () => {
      const chatSpy = vi.fn();
      const emoteSpy = vi.spyOn(gameUI, 'triggerPlayerEmote');
      gameUI.onChatSent = chatSpy;

      // Guest account attempt
      userProfile.isGuest = true;
      userProfile.isAuthenticated = false;
      controller.startActionPointer(12, 'emotes', 650, 220);
      expect(controller.isEmoteMenuOpen).toBe(false);
      expect(controller.emoteAuthWarning).toBe(EMOTE_AUTH_WARNING_TEXT);
      expect(chatSpy).not.toHaveBeenCalled();
      controller.endActionPointer(12);

      // Registered account attempt: hold Emotes, slide to index 0 ('gol' -> '⚽'), release
      userProfile.isGuest = false;
      userProfile.isAuthenticated = true;
      controller.startActionPointer(13, 'emotes', 650, 220);
      expect(controller.isEmoteMenuOpen).toBe(true);
      controller.setHoveredEmoteIndex(0);
      controller.endActionPointer(13);

      expect(controller.isEmoteMenuOpen).toBe(false);
      expect(chatSpy).toHaveBeenCalledWith('gol');
      expect(emoteSpy).toHaveBeenCalledWith(gameUI.localPlayerId, '⚽');
    });
  });

  describe('7. HUD Layout Editor custom offsets persistence & reset to original sketch', () => {
    it('reads, normalizes, persists, resolves pixel offsets, and resets mobileCustomLayout to {}', () => {
      expect(getMobileControlOffset('joystick')).toEqual({ x: 0, y: 0 });

      // Write normalized offset using viewport dimensions (844x390)
      const saved = setMobileControlOffset('joystick', { x: 84.4, y: -39 }, { width: 844, height: 390 });
      expect(saved.x).toBeCloseTo(0.1, 3);
      expect(saved.y).toBeCloseTo(-0.1, 3);
      expect(gameUI.settings.mobileCustomLayout.joystick).toEqual(saved);

      const px = resolveMobileControlPixelOffset('joystick', 844, 390);
      expect(px).toEqual({ x: 84, y: -39 });

      setMobileControlOffset('kickCluster', { x: -0.05, y: 0.08 });
      expect(Object.keys(gameUI.settings.mobileCustomLayout)).toEqual(['joystick', 'kickCluster']);

      const storedBeforeReset = JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(storedBeforeReset.mobileCustomLayout.joystick).toEqual(saved);

      // Reset to original sketch layout
      resetMobileCustomLayout();
      expect(gameUI.settings.mobileCustomLayout).toEqual({});
      const storedAfterReset = JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(storedAfterReset.mobileCustomLayout).toEqual({});

      // Verify gameUI.isEditingMobileHud alias synchronizes with gameUI.isHudEditorOpen
      (gameUI as any).isEditingMobileHud = true;
      expect(gameUI.isHudEditorOpen).toBe(true);
      gameUI.isHudEditorOpen = false;
      expect((gameUI as any).isEditingMobileHud).toBe(false);
    });
  });
});
