import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const capMocks = vi.hoisted(() => {
  const state = {
    native: false,
    platform: 'web'
  };
  return {
    state,
    isNativePlatform: vi.fn(() => state.native),
    getPlatform: vi.fn(() => state.platform),
    hapticsImpact: vi.fn(async () => {}),
    hapticsSelectionStart: vi.fn(async () => {}),
    hapticsSelectionChanged: vi.fn(async () => {}),
    hapticsSelectionEnd: vi.fn(async () => {}),
    appAddListener: vi.fn(),
    appMinimizeApp: vi.fn(async () => {}),
    appExitApp: vi.fn(async () => {}),
    orientationLock: vi.fn(async () => {}),
    statusBarSetOverlaysWebView: vi.fn(async () => {}),
    statusBarSetStyle: vi.fn(async () => {}),
    statusBarHide: vi.fn(async () => {}),
    keepAwake: vi.fn(async () => {}),
    allowSleep: vi.fn(async () => {})
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capMocks.isNativePlatform,
    getPlatform: capMocks.getPlatform
  }
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: capMocks.hapticsImpact,
    selectionStart: capMocks.hapticsSelectionStart,
    selectionChanged: capMocks.hapticsSelectionChanged,
    selectionEnd: capMocks.hapticsSelectionEnd
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY'
  }
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: capMocks.appAddListener,
    minimizeApp: capMocks.appMinimizeApp,
    exitApp: capMocks.appExitApp
  }
}));

vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: capMocks.orientationLock
  }
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setOverlaysWebView: capMocks.statusBarSetOverlaysWebView,
    setStyle: capMocks.statusBarSetStyle,
    hide: capMocks.statusBarHide
  },
  Style: {
    Dark: 'DARK',
    Light: 'LIGHT',
    Default: 'DEFAULT'
  }
}));

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: capMocks.keepAwake,
    allowSleep: capMocks.allowSleep
  }
}));

import {
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  KEYBINDS_STORAGE_KEY,
  LEGACYX_EXTRAPOLATION_KEY,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  SETTINGS_VERSION_KEY,
  gameUI,
  normalizeMobileSettings,
  resolveMobileLayout
} from '../../src/ui/state/gameUI.svelte.js';
import {
  mobileHaptics,
  MobileHaptics,
  impactLight,
  impactMedium,
  impactHeavy,
  selection
} from '../../src/controllers/MobileHaptics.js';
import {
  initMobileRuntime,
  lockLandscapeOrientation,
  enterImmersiveMode,
  setHostWakeLock,
  detectMobileTouchEnvironment,
  isHostWakeLockActive,
  resetMobileRuntimeForTests
} from '../../src/controllers/MobileRuntime.js';

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

describe('M1: Mobile UI State, Haptics & Capacitor Runtime', () => {
  let memoryStorage: ReturnType<typeof makeMemoryStorage>;

  beforeEach(async () => {
    memoryStorage = makeMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    capMocks.state.native = false;
    capMocks.state.platform = 'web';
    vi.clearAllMocks();
    await resetMobileRuntimeForTests();

    gameUI.resetRoomSession();
    gameUI.setViewportEnvironment(1280, 720, false, false, false, false);
    gameUI.saveSettings({
      ...DEFAULT_SETTINGS,
      localKit: { ...DEFAULT_SETTINGS.localKit },
      visitorKit: { ...DEFAULT_SETTINGS.visitorKit },
      emoteTriggers: [...DEFAULT_SETTINGS.emoteTriggers],
      mobileCustomLayout: {}
    });
  });

  afterEach(async () => {
    await resetMobileRuntimeForTests();
    vi.unstubAllGlobals();
  });

  describe('1. gameUI mobile settings persistence, normalization & telemetry', () => {
    it('exposes expected defaults and never mutates DEFAULT_SETTINGS.mobileCustomLayout', () => {
      expect(DEFAULT_SETTINGS.mobileControlsEnabled).toBe('auto');
      expect(DEFAULT_SETTINGS.mobileJoystickMode).toBe('360');
      expect(DEFAULT_SETTINGS.mobileJoystickAnchor).toBe('fixed');
      expect(DEFAULT_SETTINGS.mobileTurboMode).toBe('hold');
      expect(DEFAULT_SETTINGS.mobileHudScale).toBe(1.0);
      expect(DEFAULT_SETTINGS.mobileHudOpacity).toBe(0.78);
      expect(DEFAULT_SETTINGS.mobileHapticsEnabled).toBe(true);
      expect(DEFAULT_SETTINGS.mobileCustomLayout).toEqual({});

      const custom = { kick: { x: 120, y: -30 } };
      gameUI.saveSettings({ mobileCustomLayout: custom });
      custom.kick.x = 999;

      expect(gameUI.settings.mobileCustomLayout.kick).toEqual({ x: 120, y: -30 });
      expect(DEFAULT_SETTINGS.mobileCustomLayout).toEqual({});
    });

    it('clamps and sanitizes mobile settings in both saveSettings() and loadPersistedState()', () => {
      const normalized = normalizeMobileSettings({
        mobileControlsEnabled: 'bogus' as any,
        mobileJoystickMode: '4dir' as any,
        mobileJoystickAnchor: 'floating' as any,
        mobileTurboMode: 'always' as any,
        mobileHudScale: 3.5,
        mobileHudOpacity: 0.05,
        mobileHapticsEnabled: 'yes' as any,
        mobileCustomLayout: {
          kick: { x: 10, y: 20 },
          badNum: { x: Number.NaN, y: 5 },
          badShape: null as any
        }
      });

      expect(normalized.mobileControlsEnabled).toBe('auto');
      expect(normalized.mobileJoystickMode).toBe('360');
      expect(normalized.mobileJoystickAnchor).toBe('fixed');
      expect(normalized.mobileTurboMode).toBe('hold');
      expect(normalized.mobileHudScale).toBe(1.5);
      expect(normalized.mobileHudOpacity).toBe(0.25);
      expect(normalized.mobileHapticsEnabled).toBe(true);
      expect(normalized.mobileCustomLayout).toEqual({ kick: { x: 10, y: 20 } });

      // Persist invalid out-of-range values directly into localStorage and reload
      memoryStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          mobileControlsEnabled: 'on',
          mobileJoystickMode: '8dir',
          mobileJoystickAnchor: 'dynamic',
          mobileTurboMode: 'toggle',
          mobileHudScale: 0.2,
          mobileHudOpacity: 2.0,
          mobileHapticsEnabled: false,
          mobileCustomLayout: {
            joystick: { x: -12, y: 44 },
            invalid: { x: Infinity, y: 1 }
          }
        })
      );

      gameUI.loadPersistedState();
      expect(gameUI.settings.mobileControlsEnabled).toBe('on');
      expect(gameUI.settings.mobileJoystickMode).toBe('8dir');
      expect(gameUI.settings.mobileJoystickAnchor).toBe('dynamic');
      expect(gameUI.settings.mobileTurboMode).toBe('toggle');
      expect(gameUI.settings.mobileHudScale).toBe(0.7);
      expect(gameUI.settings.mobileHudOpacity).toBe(1.0);
      expect(gameUI.settings.mobileHapticsEnabled).toBe(false);
      expect(gameUI.settings.mobileCustomLayout).toEqual({ joystick: { x: -12, y: 44 } });

      // saveSettings also clamps and persists
      gameUI.saveSettings({ mobileHudScale: 99, mobileHudOpacity: -1 });
      expect(gameUI.settings.mobileHudScale).toBe(1.5);
      expect(gameUI.settings.mobileHudOpacity).toBe(0.25);
      const stored = JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.mobileHudScale).toBe(1.5);
      expect(stored.mobileHudOpacity).toBe(0.25);
    });

    it('resetMobileHudLayout clears mobileCustomLayout and persists empty map', () => {
      gameUI.saveSettings({
        mobileCustomLayout: { kick: { x: 15, y: -8 }, dash: { x: 40, y: 12 } }
      });
      expect(Object.keys(gameUI.settings.mobileCustomLayout)).toHaveLength(2);

      gameUI.resetMobileHudLayout();
      expect(gameUI.settings.mobileCustomLayout).toEqual({});
      const stored = JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(stored.mobileCustomLayout).toEqual({});
    });

    it('resets ephemeral mobile telemetry and editor state on resetRoomSession()', () => {
      gameUI.isHudEditorOpen = true;
      gameUI.isFocusingBall = true;
      gameUI.localStamina = 32;
      gameUI.localDashCooldown = 0.65;
      gameUI.localDashMaxCooldown = 1.5;
      gameUI.localIsDashing = true;
      gameUI.localIsTurbo = true;

      gameUI.resetRoomSession();

      expect(gameUI.isHudEditorOpen).toBe(false);
      expect(gameUI.isFocusingBall).toBe(false);
      expect(gameUI.localStamina).toBe(100);
      expect(gameUI.localDashCooldown).toBe(0);
      expect(gameUI.localDashMaxCooldown).toBe(1.0);
      expect(gameUI.localIsDashing).toBe(false);
      expect(gameUI.localIsTurbo).toBe(false);
    });

    it('rejects prototype-polluting and Object.prototype-shadowing keys in normalizeMobileSettings()', () => {
      const parsed = JSON.parse(
        '{"mobileCustomLayout":{"__proto__":{"x":10,"y":20},"constructor":{"x":1,"y":2},"toString":{"x":3,"y":4},"prototype":{"x":7,"y":8},"kick":{"x":5,"y":6}}}'
      );
      const res = normalizeMobileSettings(parsed);

      expect(Object.getPrototypeOf(res.mobileCustomLayout)).toBe(Object.prototype);
      expect(typeof res.mobileCustomLayout.toString).toBe('function');
      expect(typeof res.mobileCustomLayout.hasOwnProperty).toBe('function');
      expect(() => String(res.mobileCustomLayout)).not.toThrow();
      expect((res.mobileCustomLayout as Record<string, unknown>).x).toBeUndefined();
      expect(res.mobileCustomLayout).toEqual({ kick: { x: 5, y: 6 } });
    });

    it('isolates corrupt or non-object SETTINGS_STORAGE_KEY in loadPersistedState() without aborting keybinds/extrapolation or spreading indices', () => {
      for (const badSettingsPayload of ['{corrupt', 'null', '"corrupt"', '[1,2]']) {
        memoryStorage.clear();
        gameUI.keybinds = { ...DEFAULT_KEYBINDS };
        gameUI.extrapolationMs = 0;

        memoryStorage.setItem(SETTINGS_VERSION_KEY, String(SETTINGS_VERSION));
        memoryStorage.setItem('lxg_audio_max_default_v1', '1');
        memoryStorage.setItem(SETTINGS_STORAGE_KEY, badSettingsPayload);
        memoryStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify({ kick: ['KeyJ'] }));
        memoryStorage.setItem(LEGACYX_EXTRAPOLATION_KEY, '75');

        gameUI.loadPersistedState();

        expect(gameUI.keybinds.kick).toEqual(['KeyJ']);
        expect(gameUI.extrapolationMs).toBe(75);
        expect(Object.keys(gameUI.settings).some((k) => /^\d+$/.test(k))).toBe(false);
      }

      // Non-object KEYBINDS_STORAGE_KEY and non-object localKit/visitorKit are also ignored safely
      memoryStorage.clear();
      gameUI.keybinds = { ...DEFAULT_KEYBINDS };
      memoryStorage.setItem(SETTINGS_VERSION_KEY, String(SETTINGS_VERSION));
      memoryStorage.setItem('lxg_audio_max_default_v1', '1');
      memoryStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ localKit: 'bad-kit', visitorKit: ['x', 'y'] })
      );
      memoryStorage.setItem(KEYBINDS_STORAGE_KEY, '"corrupt"');

      gameUI.loadPersistedState();
      expect(gameUI.keybinds.kick).toEqual(DEFAULT_KEYBINDS.kick);
      expect(Object.keys(gameUI.keybinds).some((k) => /^\d+$/.test(k))).toBe(false);
      expect(Object.keys(gameUI.settings.localKit).some((k) => /^\d+$/.test(k))).toBe(false);
      expect(Object.keys(gameUI.settings.visitorKit).some((k) => /^\d+$/.test(k))).toBe(false);
    });
  });

  describe('2. isMobileLayout & isPortraitOnMobile detection', () => {
    it('respects auto / on / off modes and prevents desktop touchscreen false positives', () => {
      // Desktop non-touch
      gameUI.setViewportEnvironment(1920, 1080, false, false, false, false);
      expect(gameUI.isMobileLayout).toBe(false);

      // Desktop touchscreen laptop (hasTouch=true, fine pointer, non-mobile UA, 1920x1080)
      gameUI.setViewportEnvironment(1920, 1080, true, false, false, false);
      expect(gameUI.isMobileLayout).toBe(false);

      // Phone landscape in web browser
      gameUI.setViewportEnvironment(844, 390, true, false, true, true);
      expect(gameUI.isMobileLayout).toBe(true);
      expect(gameUI.isPortraitOnMobile).toBe(false);

      // Phone portrait in web browser
      gameUI.setViewportEnvironment(390, 844, true, false, true, true);
      expect(gameUI.isMobileLayout).toBe(true);
      expect(gameUI.isPortraitOnMobile).toBe(true);

      // Forced off overrides even native Capacitor
      gameUI.setViewportEnvironment(844, 390, true, true, true, true);
      gameUI.saveSettings({ mobileControlsEnabled: 'off' });
      expect(gameUI.isMobileLayout).toBe(false);
      expect(gameUI.isPortraitOnMobile).toBe(false);

      // Forced on enables mobile layout even on desktop viewport
      gameUI.setViewportEnvironment(1920, 1080, false, false, false, false);
      gameUI.saveSettings({ mobileControlsEnabled: 'on' });
      expect(gameUI.isMobileLayout).toBe(true);
      expect(gameUI.isPortraitOnMobile).toBe(false);

      // Tablet with coarse pointer (e.g. iPad landscape 1180x820)
      expect(
        resolveMobileLayout({
          mode: 'auto',
          isCapacitorNative: false,
          hasTouchCapability: true,
          hasCoarsePointer: true,
          isMobileUserAgent: false,
          viewportWidth: 1180,
          viewportHeight: 820
        })
      ).toBe(true);
    });
  });

  describe('3. MobileHaptics service (Node / Web / Native / Disabled)', () => {
    it('is safe in Node without navigator.vibrate and exports aliases', async () => {
      expect(MobileHaptics).toBe(mobileHaptics);
      vi.stubGlobal('navigator', {});
      await expect(impactLight()).resolves.toBeUndefined();
      await expect(impactMedium()).resolves.toBeUndefined();
      await expect(impactHeavy()).resolves.toBeUndefined();
      await expect(selection()).resolves.toBeUndefined();
    });

    it('uses navigator.vibrate fallback on Web and respects mobileHapticsEnabled gate', async () => {
      const vibrate = vi.fn(() => true);
      vi.stubGlobal('navigator', { vibrate });

      await impactLight();
      await impactMedium();
      await impactHeavy();
      await selection();

      expect(vibrate.mock.calls).toEqual([[12], [24], [45], [8]]);
      expect(capMocks.hapticsImpact).not.toHaveBeenCalled();

      vibrate.mockClear();
      gameUI.saveSettings({ mobileHapticsEnabled: false });
      await impactLight();
      await impactMedium();
      await impactHeavy();
      await selection();
      expect(vibrate).not.toHaveBeenCalled();
    });

    it('uses Capacitor Haptics on native platforms and falls back to Light impact when selection fails', async () => {
      capMocks.state.native = true;
      capMocks.state.platform = 'android';

      await impactLight();
      await impactMedium();
      await impactHeavy();
      await selection();

      expect(capMocks.hapticsImpact).toHaveBeenNthCalledWith(1, { style: 'LIGHT' });
      expect(capMocks.hapticsImpact).toHaveBeenNthCalledWith(2, { style: 'MEDIUM' });
      expect(capMocks.hapticsImpact).toHaveBeenNthCalledWith(3, { style: 'HEAVY' });
      expect(capMocks.hapticsSelectionStart).toHaveBeenCalledTimes(1);
      expect(capMocks.hapticsSelectionChanged).toHaveBeenCalledTimes(1);
      expect(capMocks.hapticsSelectionEnd).toHaveBeenCalledTimes(1);

      capMocks.hapticsImpact.mockClear();
      capMocks.hapticsSelectionStart.mockRejectedValueOnce(new Error('unsupported'));
      await selection();
      expect(capMocks.hapticsImpact).toHaveBeenCalledWith({ style: 'LIGHT' });

      capMocks.hapticsImpact.mockClear();
      gameUI.saveSettings({ mobileHapticsEnabled: false });
      await impactHeavy();
      expect(capMocks.hapticsImpact).not.toHaveBeenCalled();
    });
  });

  describe('4. MobileRuntime (Node / Web / Native Android)', () => {
    it('runs cleanly in Node when window/document/screen are absent', async () => {
      const cleanup = initMobileRuntime({
        onBackButton: () => false
      });
      expect(detectMobileTouchEnvironment()).toBe(false);
      await expect(lockLandscapeOrientation()).resolves.toBeUndefined();
      await expect(enterImmersiveMode()).resolves.toBeUndefined();
      await expect(setHostWakeLock(true)).resolves.toBeUndefined();
      expect(isHostWakeLockActive()).toBe(false);
      await expect(setHostWakeLock(false)).resolves.toBeUndefined();
      expect(() => cleanup()).not.toThrow();
    });

    it('wires Web viewport detection, orientation lock, fullscreen, and idempotent WakeLock with visibility re-acquire', async () => {
      const winListeners = new Map<string, Set<() => void>>();
      const docListeners = new Map<string, Set<() => void>>();
      const mockSentinel = {
        released: false,
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          mockSentinel.released = true;
        })
      };
      const requestWakeLock = vi.fn(async () => mockSentinel);
      const requestFullscreen = vi.fn(async () => {});
      const screenLock = vi.fn(async () => {});

      const mockWindow = {
        innerWidth: 844,
        innerHeight: 390,
        ontouchstart: null,
        matchMedia: vi.fn((q: string) => ({
          matches: q === '(pointer: coarse)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        })),
        addEventListener: vi.fn((ev: string, fn: () => void) => {
          if (!winListeners.has(ev)) winListeners.set(ev, new Set());
          winListeners.get(ev)!.add(fn);
        }),
        removeEventListener: vi.fn((ev: string, fn: () => void) => {
          winListeners.get(ev)?.delete(fn);
        })
      };
      const mockDocument = {
        fullscreenEnabled: true,
        fullscreenElement: null,
        visibilityState: 'visible',
        documentElement: { clientWidth: 844, clientHeight: 390, requestFullscreen },
        addEventListener: vi.fn((ev: string, fn: () => void) => {
          if (!docListeners.has(ev)) docListeners.set(ev, new Set());
          docListeners.get(ev)!.add(fn);
        }),
        removeEventListener: vi.fn((ev: string, fn: () => void) => {
          docListeners.get(ev)?.delete(fn);
        })
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('screen', { orientation: { lock: screenLock, addEventListener: vi.fn(), removeEventListener: vi.fn() } });
      vi.stubGlobal('navigator', {
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
        wakeLock: { request: requestWakeLock }
      });

      const onViewportChange = vi.fn();
      const cleanup = initMobileRuntime({
        onBackButton: () => false,
        onViewportChange
      });

      expect(onViewportChange).toHaveBeenCalledWith(844, 390, true);

      mockWindow.innerWidth = 390;
      mockWindow.innerHeight = 844;
      for (const fn of winListeners.get('resize') ?? []) fn();
      expect(onViewportChange).toHaveBeenLastCalledWith(390, 844, true);

      await lockLandscapeOrientation();
      expect(screenLock).toHaveBeenCalledWith('landscape');

      await enterImmersiveMode();
      expect(requestFullscreen).toHaveBeenCalledTimes(1);

      // Idempotent multi-owner WakeLock
      await setHostWakeLock(true, 'app');
      await setHostWakeLock(true, 'app');
      await setHostWakeLock(true, 'room');
      expect(requestWakeLock).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(true);

      // Releasing one owner keeps WakeLock active
      await setHostWakeLock(false, 'room');
      expect(mockSentinel.release).not.toHaveBeenCalled();
      expect(isHostWakeLockActive()).toBe(true);

      // Releasing last owner releases sentinel and removes visibilitychange listener
      await setHostWakeLock(false, 'app');
      expect(mockSentinel.release).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(false);
      expect(docListeners.get('visibilitychange')?.size ?? 0).toBe(0);

      cleanup();
      expect(winListeners.get('resize')?.size ?? 0).toBe(0);
    });

    it('handles Native Android backButton listener, async disposal race, StatusBar isolation, and KeepAwake', async () => {
      capMocks.state.native = true;
      capMocks.state.platform = 'android';

      let capturedBackCb: (() => void) | null = null;
      const removeHandle = vi.fn(async () => {});
      capMocks.appAddListener.mockImplementationOnce(async (_event: string, cb: () => void) => {
        capturedBackCb = cb;
        return { remove: removeHandle };
      });

      const onBackButton = vi.fn(() => true);
      const cleanup = initMobileRuntime({ onBackButton });

      // Flush microtask so App.addListener promise resolves
      await Promise.resolve();
      expect(capMocks.appAddListener).toHaveBeenCalledWith('backButton', expect.any(Function));

      capturedBackCb!();
      expect(onBackButton).toHaveBeenCalledTimes(1);
      expect(capMocks.appMinimizeApp).not.toHaveBeenCalled();

      onBackButton.mockReturnValueOnce(false);
      capturedBackCb!();
      expect(capMocks.appMinimizeApp).toHaveBeenCalledTimes(1);

      cleanup();
      expect(removeHandle).toHaveBeenCalledTimes(1);

      // Disposal race: cleanup runs BEFORE App.addListener promise resolves
      let resolveDelayed!: (h: { remove: () => Promise<void> }) => void;
      const delayedRemove = vi.fn(async () => {});
      capMocks.appAddListener.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDelayed = resolve;
          })
      );
      const cleanupEarly = initMobileRuntime({ onBackButton: () => true });
      cleanupEarly();
      resolveDelayed({ remove: delayedRemove });
      await Promise.resolve();
      await Promise.resolve();
      expect(delayedRemove).toHaveBeenCalledTimes(1);

      // Android 15+ StatusBar: setOverlaysWebView rejection must not block setStyle/hide
      capMocks.statusBarSetOverlaysWebView.mockRejectedValueOnce(new Error('Not available on Android 15+'));
      await enterImmersiveMode();
      expect(capMocks.statusBarSetStyle).toHaveBeenCalledWith({ style: 'DARK' });
      expect(capMocks.statusBarHide).toHaveBeenCalledTimes(1);

      await lockLandscapeOrientation();
      expect(capMocks.orientationLock).toHaveBeenCalledWith({ orientation: 'landscape' });

      await setHostWakeLock(true, 'host');
      expect(capMocks.keepAwake).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(true);
      await setHostWakeLock(false, 'host');
      expect(capMocks.allowSleep).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(false);
    });

    it('prevents native KeepAwake allowSleep race on rapid toggle and concurrent multi-owner acquire', async () => {
      capMocks.state.native = true;
      capMocks.state.platform = 'android';

      // Scenario 1: rapid true -> false -> true while first keepAwake() is still pending
      const callOrder: string[] = [];
      let resolveFirstKeepAwake!: () => void;
      capMocks.keepAwake.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            callOrder.push('keepAwake#1');
            resolveFirstKeepAwake = resolve;
          })
      );
      capMocks.allowSleep.mockImplementation(async () => {
        callOrder.push('allowSleep');
      });

      const p1 = setHostWakeLock(true, 'game');
      const p2 = setHostWakeLock(false, 'game');
      const p3 = setHostWakeLock(true, 'host-room');

      resolveFirstKeepAwake();
      await Promise.all([p1, p2, p3]);

      expect(callOrder).not.toContain('allowSleep');
      expect(capMocks.allowSleep).not.toHaveBeenCalled();
      expect(isHostWakeLockActive()).toBe(true);

      await setHostWakeLock(false, 'host-room');
      expect(capMocks.allowSleep).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(false);

      // Scenario 2: concurrent dual-owner acquire before first keepAwake resolves
      vi.clearAllMocks();
      const concurrentOrder: string[] = [];
      let resolveConcurrentKeepAwake!: () => void;
      capMocks.keepAwake.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            concurrentOrder.push('keepAwake#1');
            resolveConcurrentKeepAwake = resolve;
          })
      );
      capMocks.allowSleep.mockImplementation(async () => {
        concurrentOrder.push('allowSleep');
      });

      const a1 = setHostWakeLock(true, 'game');
      const a2 = setHostWakeLock(true, 'host-room');
      resolveConcurrentKeepAwake();
      await Promise.all([a1, a2]);

      expect(concurrentOrder).not.toContain('allowSleep');
      expect(isHostWakeLockActive()).toBe(true);

      await setHostWakeLock(false, 'game');
      expect(capMocks.allowSleep).not.toHaveBeenCalled();
      expect(isHostWakeLockActive()).toBe(true);

      await setHostWakeLock(false, 'host-room');
      expect(capMocks.allowSleep).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(false);

      // Scenario 3: true -> false while keepAwake() is still pending releases cleanly via allowSleep()
      vi.clearAllMocks();
      let resolvePendingKeepAwake!: () => void;
      capMocks.keepAwake.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvePendingKeepAwake = resolve;
          })
      );
      const pendingAcquire = setHostWakeLock(true, 'game');
      const pendingRelease = setHostWakeLock(false, 'game');
      resolvePendingKeepAwake();
      await Promise.all([pendingAcquire, pendingRelease]);

      expect(capMocks.keepAwake).toHaveBeenCalledTimes(1);
      expect(capMocks.allowSleep).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(false);
    });

    it('re-acquires Web WakeLock on visibilitychange when sentinel.released is true without release event', async () => {
      const docListeners = new Map<string, Set<() => void>>();
      const sentinel1 = {
        released: false,
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          sentinel1.released = true;
        })
      };
      const sentinel2 = {
        released: false,
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          sentinel2.released = true;
        })
      };
      const requestWakeLock = vi
        .fn()
        .mockResolvedValueOnce(sentinel1)
        .mockResolvedValueOnce(sentinel2);

      const mockDocument = {
        visibilityState: 'visible',
        addEventListener: vi.fn((ev: string, fn: () => void) => {
          if (!docListeners.has(ev)) docListeners.set(ev, new Set());
          docListeners.get(ev)!.add(fn);
        }),
        removeEventListener: vi.fn((ev: string, fn: () => void) => {
          docListeners.get(ev)?.delete(fn);
        })
      };

      vi.stubGlobal('window', {
        innerWidth: 844,
        innerHeight: 390,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });
      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('navigator', {
        wakeLock: { request: requestWakeLock }
      });

      await setHostWakeLock(true, 'host');
      expect(requestWakeLock).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(true);

      // Browser silently marks sentinel.released = true without emitting 'release'
      sentinel1.released = true;
      expect(isHostWakeLockActive()).toBe(false);

      mockDocument.visibilityState = 'visible';
      for (const fn of docListeners.get('visibilitychange') ?? []) {
        fn();
      }
      await Promise.resolve();
      await Promise.resolve();

      expect(requestWakeLock).toHaveBeenCalledTimes(2);
      expect(isHostWakeLockActive()).toBe(true);

      await setHostWakeLock(false, 'host');
      expect(sentinel2.release).toHaveBeenCalledTimes(1);
    });

    it('releases superseded sentinel cleanly when consecutive visibilitychange visible events fire while request() is pending', async () => {
      const docListeners = new Map<string, Set<() => void>>();
      const initialSentinel = {
        released: false,
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          initialSentinel.released = true;
        })
      };
      const pendingSentinel1 = {
        released: false,
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          pendingSentinel1.released = true;
        })
      };
      const pendingSentinel2 = {
        released: false,
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          pendingSentinel2.released = true;
        })
      };

      let resolveReq1!: (s: typeof pendingSentinel1) => void;
      let resolveReq2!: (s: typeof pendingSentinel2) => void;
      const requestWakeLock = vi
        .fn()
        .mockResolvedValueOnce(initialSentinel)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveReq1 = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveReq2 = resolve;
            })
        );

      const mockDocument = {
        visibilityState: 'visible',
        addEventListener: vi.fn((ev: string, fn: () => void) => {
          if (!docListeners.has(ev)) docListeners.set(ev, new Set());
          docListeners.get(ev)!.add(fn);
        }),
        removeEventListener: vi.fn((ev: string, fn: () => void) => {
          docListeners.get(ev)?.delete(fn);
        })
      };

      vi.stubGlobal('window', {
        innerWidth: 844,
        innerHeight: 390,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });
      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('navigator', {
        wakeLock: { request: requestWakeLock }
      });

      await setHostWakeLock(true, 'host');
      expect(requestWakeLock).toHaveBeenCalledTimes(1);

      // Simulate browser releasing sentinel before two consecutive visible events while requests stay pending
      initialSentinel.released = true;
      mockDocument.visibilityState = 'visible';
      for (const fn of docListeners.get('visibilitychange') ?? []) fn();
      for (const fn of docListeners.get('visibilitychange') ?? []) fn();

      expect(requestWakeLock).toHaveBeenCalledTimes(3);

      // First pending request resolves after being superseded by second visibility event
      resolveReq1(pendingSentinel1);
      await Promise.resolve();
      await Promise.resolve();
      expect(pendingSentinel1.release).toHaveBeenCalledTimes(1);

      // Latest request resolves and becomes the active sentinel
      resolveReq2(pendingSentinel2);
      await Promise.resolve();
      await Promise.resolve();
      expect(pendingSentinel2.release).not.toHaveBeenCalled();
      expect(isHostWakeLockActive()).toBe(true);

      await setHostWakeLock(false, 'host');
      expect(pendingSentinel2.release).toHaveBeenCalledTimes(1);
      expect(isHostWakeLockActive()).toBe(false);
    });

    it('catches synchronous App.minimizeApp() throws and safely falls back to App.exitApp()', async () => {
      capMocks.state.native = true;
      capMocks.state.platform = 'android';

      let capturedBackCb: (() => void) | null = null;
      capMocks.appAddListener.mockImplementationOnce(async (_event: string, cb: () => void) => {
        capturedBackCb = cb;
        return { remove: vi.fn(async () => {}) };
      });

      const cleanup = initMobileRuntime({ onBackButton: () => false });
      await Promise.resolve();

      // Case 1: minimizeApp throws synchronously, exitApp succeeds
      capMocks.appMinimizeApp.mockImplementationOnce(() => {
        throw new Error('sync throw');
      });
      expect(() => capturedBackCb!()).not.toThrow();
      expect(capMocks.appExitApp).toHaveBeenCalledTimes(1);

      // Case 2: minimizeApp throws synchronously AND exitApp throws/rejects
      capMocks.appMinimizeApp.mockImplementationOnce(() => {
        throw new Error('sync throw 2');
      });
      capMocks.appExitApp.mockImplementationOnce(() => {
        throw new Error('exit sync throw');
      });
      expect(() => capturedBackCb!()).not.toThrow();

      // Case 3: minimizeApp rejects asynchronously AND exitApp rejects asynchronously
      capMocks.appMinimizeApp.mockRejectedValueOnce(new Error('async reject'));
      capMocks.appExitApp.mockRejectedValueOnce(new Error('exit async reject'));
      expect(() => capturedBackCb!()).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();
      expect(capMocks.appExitApp).toHaveBeenCalledTimes(3);

      cleanup();
    });
  });
});
