import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar, Style } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';

export interface MobileRuntimeHandlers {
  onBackButton: () => boolean;
  onViewportChange?: (w: number, h: number, isTouch: boolean) => void;
}

const wakeLockOwners = new Set<string>();
let nativeAwakeHeld = false;
let nativeSyncPromise: Promise<void> | null = null;
let nativeSyncDirty = false;
let webSentinel: WakeLockSentinel | null = null;
let wakeLockSeq = 0;
let visibilityListenerAttached = false;

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

function safeIsNativePlatform(): boolean {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function safeGetPlatform(): string {
  try {
    return Capacitor?.getPlatform?.() ?? 'web';
  } catch {
    return 'web';
  }
}

function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  const width =
    window.innerWidth || (typeof document !== 'undefined' ? document.documentElement?.clientWidth : 0) || 0;
  const height =
    window.innerHeight || (typeof document !== 'undefined' ? document.documentElement?.clientHeight : 0) || 0;
  return { width, height };
}

export function detectMobileTouchEnvironment(viewportW?: number, viewportH?: number): boolean {
  if (safeIsNativePlatform()) return true;
  if (typeof window === 'undefined') return false;

  const size = readViewportSize();
  const w = viewportW ?? size.width;
  const h = viewportH ?? size.height;

  let coarsePointer = false;
  try {
    coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  } catch {
    coarsePointer = false;
  }
  if (coarsePointer) return true;

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const maxTouchPoints = typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  const hasTouchApi = 'ontouchstart' in window || maxTouchPoints > 0;
  if (!hasTouchApi) return false;

  const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
  const platform = typeof nav?.platform === 'string' ? nav.platform : '';
  const isIpadDesktopUa = platform === 'MacIntel' && maxTouchPoints > 1;
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua) || isIpadDesktopUa;
  if (isMobileUa) return true;

  let anyCoarse = false;
  try {
    anyCoarse = Boolean(window.matchMedia?.('(any-pointer: coarse)')?.matches);
  } catch {
    anyCoarse = false;
  }
  const minDim = Math.min(w || 0, h || 0);
  const maxDim = Math.max(w || 0, h || 0);
  if (anyCoarse && minDim > 0 && minDim <= 900) return true;

  return minDim > 0 && minDim <= 600 && maxDim <= 1024;
}

export function initMobileRuntime(handlers: MobileRuntimeHandlers): () => void {
  const cleanups: Array<() => void> = [];

  const emitViewport = () => {
    const { width, height } = readViewportSize();
    const isTouch = detectMobileTouchEnvironment(width, height);
    handlers.onViewportChange?.(width, height, isTouch);
  };

  if (typeof window !== 'undefined') {
    emitViewport();

    window.addEventListener?.('resize', emitViewport);
    window.addEventListener?.('orientationchange', emitViewport);
    cleanups.push(() => {
      window.removeEventListener?.('resize', emitViewport);
      window.removeEventListener?.('orientationchange', emitViewport);
    });

    const screenOrientation = typeof screen !== 'undefined' ? screen.orientation : undefined;
    if (screenOrientation && typeof screenOrientation.addEventListener === 'function') {
      screenOrientation.addEventListener('change', emitViewport);
      cleanups.push(() => {
        screenOrientation.removeEventListener?.('change', emitViewport);
      });
    }

    let coarseQuery: MediaQueryList | undefined;
    try {
      coarseQuery = window.matchMedia?.('(pointer: coarse)');
    } catch {
      coarseQuery = undefined;
    }
    if (coarseQuery) {
      if (typeof coarseQuery.addEventListener === 'function') {
        coarseQuery.addEventListener('change', emitViewport);
        cleanups.push(() => {
          coarseQuery?.removeEventListener?.('change', emitViewport);
        });
      } else if (typeof coarseQuery.addListener === 'function') {
        coarseQuery.addListener(emitViewport);
        cleanups.push(() => {
          coarseQuery?.removeListener?.(emitViewport);
        });
      }
    }
  }

  let disposed = false;
  let backHandle: PluginListenerHandle | null = null;

  if (safeIsNativePlatform() && safeGetPlatform() === 'android') {
    const fallbackToExit = () => {
      try {
        void Promise.resolve(App.exitApp()).catch(() => {});
      } catch {
        // Ignore synchronous exitApp errors
      }
    };

    try {
      Promise.resolve(
        App.addListener('backButton', () => {
          const handled = handlers.onBackButton();
          if (!handled) {
            try {
              void Promise.resolve(App.minimizeApp()).catch(fallbackToExit);
            } catch {
              fallbackToExit();
            }
          }
        })
      )
        .then((handle) => {
          if (!handle) return;
          if (disposed) {
            void handle.remove().catch(() => {});
          } else {
            backHandle = handle;
          }
        })
        .catch(() => {});
    } catch {
      // Ignore listener setup errors on unsupported environments
    }

    cleanups.push(() => {
      disposed = true;
      if (backHandle) {
        const handle = backHandle;
        backHandle = null;
        void handle.remove().catch(() => {});
      }
    });
  }

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // Ignore cleanup errors
      }
    }
  };
}

export async function lockLandscapeOrientation(): Promise<void> {
  if (safeIsNativePlatform()) {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
    } catch {
      // Ignore lock failures (e.g. Android 16 large-screen restriction or unsupported device)
    }
    return;
  }

  const orientationApi: LockableScreenOrientation | undefined =
    typeof screen !== 'undefined' ? (screen.orientation as LockableScreenOrientation) : undefined;
  if (orientationApi && typeof orientationApi.lock === 'function') {
    try {
      await orientationApi.lock('landscape');
    } catch {
      // Browsers often require fullscreen/user-gesture or reject on iOS Safari
    }
  }
}

export async function enterImmersiveMode(): Promise<void> {
  if (safeIsNativePlatform()) {
    // Wrap each StatusBar call independently so Android 15+ restrictions do not abort hide()
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      // Ignore on Android 15+ / unsupported platforms
    }
    try {
      await StatusBar.setStyle({ style: Style.Dark });
    } catch {
      // Ignore style failure
    }
    try {
      await StatusBar.hide();
    } catch {
      // Ignore hide failure
    }
    return;
  }

  if (typeof document !== 'undefined') {
    const doc = document as Document & {
      webkitFullscreenEnabled?: boolean;
      webkitFullscreenElement?: Element | null;
    };
    const fullscreenSupported = Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
    const alreadyFullscreen = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
    if (fullscreenSupported && !alreadyFullscreen) {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      try {
        if (typeof el?.requestFullscreen === 'function') {
          await el.requestFullscreen();
        } else if (typeof el?.webkitRequestFullscreen === 'function') {
          await el.webkitRequestFullscreen();
        }
      } catch {
        // Ignore user-gesture errors in web browsers
      }
    }
  }
}

async function requestWebWakeLock(seq: number): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !('wakeLock' in navigator) ||
    typeof navigator.wakeLock?.request !== 'function'
  ) {
    return;
  }
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    if (seq !== wakeLockSeq || wakeLockOwners.size === 0) {
      try {
        await sentinel.release();
      } catch {
        // Ignore release error
      }
      return;
    }
    webSentinel = sentinel;
    sentinel.addEventListener?.('release', () => {
      if (webSentinel === sentinel) {
        webSentinel = null;
      }
    });
  } catch {
    // Ignore WakeLock permission / battery-saver errors
  }
}

function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  if (
    document.visibilityState === 'visible' &&
    wakeLockOwners.size > 0 &&
    (!webSentinel || webSentinel.released) &&
    !safeIsNativePlatform()
  ) {
    const seq = ++wakeLockSeq;
    void requestWebWakeLock(seq);
  }
}

function attachVisibilityListener(): void {
  if (visibilityListenerAttached) return;
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = true;
  }
}

function detachVisibilityListener(): void {
  if (!visibilityListenerAttached) return;
  visibilityListenerAttached = false;
  if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
}

function syncNativeWakeLock(): Promise<void> {
  nativeSyncDirty = true;
  if (nativeSyncPromise) {
    return nativeSyncPromise;
  }

  let running = true;
  const loopPromise = (async () => {
    try {
      while (nativeSyncDirty) {
        nativeSyncDirty = false;
        const shouldKeepAwake = wakeLockOwners.size > 0;
        if (shouldKeepAwake && !nativeAwakeHeld) {
          try {
            await KeepAwake.keepAwake();
            nativeAwakeHeld = true;
          } catch {
            // Ignore native KeepAwake errors
          }
        } else if (!shouldKeepAwake && nativeAwakeHeld) {
          nativeAwakeHeld = false;
          try {
            await KeepAwake.allowSleep();
          } catch {
            // Ignore native allowSleep errors
          }
        }
      }
    } finally {
      running = false;
      nativeSyncPromise = null;
    }
  })();

  if (running) {
    nativeSyncPromise = loopPromise;
  }
  return loopPromise;
}

export async function setHostWakeLock(active: boolean, owner: string = 'default'): Promise<void> {
  if (active) {
    const wasActive = wakeLockOwners.size > 0;
    wakeLockOwners.add(owner);

    if (safeIsNativePlatform()) {
      if (wasActive && nativeAwakeHeld && !nativeSyncPromise) {
        return;
      }
      await syncNativeWakeLock();
      return;
    }

    if (wasActive && webSentinel !== null && !webSentinel.released) {
      return;
    }
    const seq = ++wakeLockSeq;
    attachVisibilityListener();
    await requestWebWakeLock(seq);
    return;
  }

  wakeLockOwners.delete(owner);
  if (wakeLockOwners.size > 0) {
    return;
  }

  ++wakeLockSeq;
  detachVisibilityListener();

  if (safeIsNativePlatform()) {
    await syncNativeWakeLock();
    return;
  }

  if (webSentinel) {
    const sentinel = webSentinel;
    webSentinel = null;
    try {
      if (!sentinel.released) {
        await sentinel.release();
      }
    } catch {
      // Ignore release errors
    }
  }
}

export function isHostWakeLockActive(): boolean {
  return nativeAwakeHeld || (webSentinel !== null && !webSentinel.released);
}

export async function resetMobileRuntimeForTests(): Promise<void> {
  wakeLockOwners.clear();
  ++wakeLockSeq;
  detachVisibilityListener();
  if (nativeSyncPromise) {
    try {
      await syncNativeWakeLock();
    } catch {
      // Ignore
    }
  }
  if (nativeAwakeHeld) {
    nativeAwakeHeld = false;
    try {
      await KeepAwake.allowSleep();
    } catch {
      // Ignore
    }
  }
  if (webSentinel) {
    const s = webSentinel;
    webSentinel = null;
    try {
      if (!s.released) await s.release();
    } catch {
      // Ignore
    }
  }
}
