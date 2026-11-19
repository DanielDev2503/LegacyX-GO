export type CapacitorPlatform = 'android' | 'ios' | 'web';

export interface CapacitorCallRecord {
  plugin: string;
  method: string;
  args: unknown[];
}

interface ListenerEntry {
  id: number;
  plugin: string;
  eventName: string;
  callback: (payload?: any) => void;
}

const mockState = {
  platform: 'web' as CapacitorPlatform,
  calls: [] as CapacitorCallRecord[],
  listeners: [] as ListenerEntry[],
  nextListenerId: 1,
  orientation: 'landscape-primary',
  statusBarVisible: true,
  statusBarOverlays: true,
  statusBarStyle: 'DARK',
  statusBarColor: '#0b0e14',
  keptAwake: false
};

function cloneArg<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return Array.isArray(value) ? ([...value] as unknown as T) : ({ ...value } as T);
    }
  }
}

function recordCall(plugin: string, method: string, args: unknown[] = []): void {
  mockState.calls.push({
    plugin,
    method,
    args: args.map((arg) => cloneArg(arg))
  });
}

function addPluginListener(
  plugin: string,
  eventName: string,
  callback: (payload?: any) => void
) {
  const id = mockState.nextListenerId++;
  mockState.listeners.push({ id, plugin, eventName, callback });
  return {
    remove: async () => {
      mockState.listeners = mockState.listeners.filter((l) => l.id !== id);
    }
  };
}

function removePluginListeners(plugin: string): void {
  mockState.listeners = mockState.listeners.filter((l) => l.plugin !== plugin);
}

export function installCapacitorMock(platform: CapacitorPlatform) {
  mockState.platform = platform;
  mockState.calls = [];
  mockState.listeners = [];
  mockState.orientation = 'landscape-primary';
  mockState.statusBarVisible = true;
  mockState.statusBarOverlays = true;
  mockState.statusBarStyle = 'DARK';
  mockState.statusBarColor = '#0b0e14';
  mockState.keptAwake = false;

  return createCapacitorMockModules();
}

export function resetCapacitorMock(): void {
  mockState.platform = 'web';
  mockState.calls = [];
  mockState.listeners = [];
  mockState.orientation = 'landscape-primary';
  mockState.statusBarVisible = true;
  mockState.statusBarOverlays = true;
  mockState.statusBarStyle = 'DARK';
  mockState.statusBarColor = '#0b0e14';
  mockState.keptAwake = false;
}

export function getCapacitorCalls(): CapacitorCallRecord[] {
  return mockState.calls.map((c) => ({
    ...c,
    args: c.args.map((arg) => cloneArg(arg))
  }));
}

export function triggerBackButton(canGoBack: boolean = false): number {
  const listeners = mockState.listeners.filter(
    (l) => l.plugin === 'App' && l.eventName === 'backButton'
  );
  for (const entry of [...listeners]) {
    entry.callback({ canGoBack });
  }
  return listeners.length;
}

/**
 * Returns live module mocks for Capacitor plugins backed by the active mock controller.
 * Suitable for top-level vi.mock() factories via:
 *   vi.mock('@capacitor/core', async () => (await import('./helpers/capacitorMock')).createCapacitorMockModules().core);
 */
export function createCapacitorMockModules() {
  const core = {
    Capacitor: {
      getPlatform: () => mockState.platform,
      isNativePlatform: () => mockState.platform !== 'web',
      isPluginAvailable: (_name: string) => mockState.platform !== 'web',
      convertFileSrc: (path: string) => path
    },
    registerPlugin: (name: string) => ({ name }),
    WebPlugin: class WebPlugin {},
    CapacitorException: class CapacitorException extends Error {},
    ExceptionCode: { Unimplemented: 'UNIMPLEMENTED', Unavailable: 'UNAVAILABLE' }
  };

  const app = {
    App: {
      async addListener(eventName: string, callback: (payload?: any) => void) {
        recordCall('App', 'addListener', [eventName]);
        return addPluginListener('App', eventName, callback);
      },
      async removeAllListeners() {
        recordCall('App', 'removeAllListeners');
        removePluginListeners('App');
      },
      async exitApp() {
        recordCall('App', 'exitApp');
      },
      async minimizeApp() {
        recordCall('App', 'minimizeApp');
      },
      async getInfo() {
        recordCall('App', 'getInfo');
        return { name: 'LegacyX-GO', id: 'com.legacyx.go', build: '1', version: '1.0.0' };
      },
      async getState() {
        recordCall('App', 'getState');
        return { isActive: true };
      },
      async getLaunchUrl() {
        recordCall('App', 'getLaunchUrl');
        return undefined;
      },
      async toggleBackButtonHandler(options: { enabled: boolean }) {
        recordCall('App', 'toggleBackButtonHandler', [options]);
      }
    }
  };

  const ImpactStyle = {
    Heavy: 'HEAVY',
    Medium: 'MEDIUM',
    Light: 'LIGHT'
  } as const;

  const NotificationType = {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR'
  } as const;

  const haptics = {
    ImpactStyle,
    NotificationType,
    Haptics: {
      async impact(options?: { style: string }) {
        recordCall('Haptics', 'impact', [options]);
      },
      async notification(options?: { type: string }) {
        recordCall('Haptics', 'notification', [options]);
      },
      async vibrate(options?: { duration?: number }) {
        recordCall('Haptics', 'vibrate', [options]);
      },
      async selectionStart() {
        recordCall('Haptics', 'selectionStart');
      },
      async selectionChanged() {
        recordCall('Haptics', 'selectionChanged');
      },
      async selectionEnd() {
        recordCall('Haptics', 'selectionEnd');
      }
    }
  };

  const screenOrientation = {
    ScreenOrientation: {
      async orientation() {
        recordCall('ScreenOrientation', 'orientation');
        return { type: mockState.orientation };
      },
      async lock(options: { orientation: string }) {
        recordCall('ScreenOrientation', 'lock', [options]);
        const req = options.orientation;
        if (req === 'portrait-secondary') {
          mockState.orientation = 'portrait-secondary';
        } else if (req.startsWith('portrait')) {
          mockState.orientation = 'portrait-primary';
        } else if (req === 'landscape-secondary') {
          mockState.orientation = 'landscape-secondary';
        } else {
          mockState.orientation = 'landscape-primary';
        }
        const listeners = mockState.listeners.filter(
          (l) => l.plugin === 'ScreenOrientation' && l.eventName === 'screenOrientationChange'
        );
        for (const l of listeners) {
          l.callback({ type: mockState.orientation });
        }
      },
      async unlock() {
        recordCall('ScreenOrientation', 'unlock');
      },
      async addListener(eventName: string, callback: (payload?: any) => void) {
        recordCall('ScreenOrientation', 'addListener', [eventName]);
        return addPluginListener('ScreenOrientation', eventName, callback);
      },
      async removeAllListeners() {
        recordCall('ScreenOrientation', 'removeAllListeners');
        removePluginListeners('ScreenOrientation');
      }
    }
  };

  const Style = {
    Dark: 'DARK',
    Light: 'LIGHT',
    Default: 'DEFAULT'
  } as const;

  const Animation = {
    None: 'NONE',
    Slide: 'SLIDE',
    Fade: 'FADE'
  } as const;

  const statusBar = {
    Style,
    Animation,
    StatusBarStyle: Style,
    StatusBarAnimation: Animation,
    StatusBar: {
      async setStyle(options: { style: string }) {
        recordCall('StatusBar', 'setStyle', [options]);
        mockState.statusBarStyle = options.style;
      },
      async setBackgroundColor(options: { color: string }) {
        recordCall('StatusBar', 'setBackgroundColor', [options]);
        mockState.statusBarColor = options.color;
      },
      async show(options?: { animation?: string }) {
        recordCall('StatusBar', 'show', options ? [options] : []);
        mockState.statusBarVisible = true;
      },
      async hide(options?: { animation?: string }) {
        recordCall('StatusBar', 'hide', options ? [options] : []);
        mockState.statusBarVisible = false;
      },
      async getInfo() {
        recordCall('StatusBar', 'getInfo');
        return {
          visible: mockState.statusBarVisible,
          style: mockState.statusBarStyle,
          color: mockState.statusBarColor,
          overlays: mockState.statusBarOverlays,
          height: mockState.statusBarVisible ? 24 : 0
        };
      },
      async setOverlaysWebView(options: { overlay: boolean }) {
        recordCall('StatusBar', 'setOverlaysWebView', [options]);
        mockState.statusBarOverlays = options.overlay;
      },
      async addListener(eventName: string, callback: (payload?: any) => void) {
        recordCall('StatusBar', 'addListener', [eventName]);
        return addPluginListener('StatusBar', eventName, callback);
      }
    }
  };

  const keepAwake = {
    KeepAwake: {
      async keepAwake() {
        recordCall('KeepAwake', 'keepAwake');
        mockState.keptAwake = true;
      },
      async allowSleep() {
        recordCall('KeepAwake', 'allowSleep');
        mockState.keptAwake = false;
      },
      async isSupported() {
        recordCall('KeepAwake', 'isSupported');
        return { isSupported: mockState.platform !== 'web' };
      },
      async isKeptAwake() {
        recordCall('KeepAwake', 'isKeptAwake');
        return { isKeptAwake: mockState.keptAwake };
      }
    }
  };

  return {
    core,
    app,
    haptics,
    screenOrientation,
    statusBar,
    keepAwake
  };
}
