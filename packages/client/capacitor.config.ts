/**
 * Configuración de Capacitor para LegacyX-GO en Plataformas Móviles (Android / iOS)
 * Directivas de despliegue: Bloqueo de orientación horizontal y anulación de rebote táctil.
 */
export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  backgroundColor?: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
    allowNavigation?: string[];
  };
  android?: {
    allowMixedContent?: boolean;
    captureInput?: boolean;
    webContentsDebuggingEnabled?: boolean;
    backgroundColor?: string;
  };
  ios?: {
    contentInset?: 'always' | 'automatic' | 'never' | 'scrollable';
    allowsLinkPreview?: boolean;
    scrollEnabled?: boolean;
    preferredContentMode?: 'mobile' | 'desktop';
    backgroundColor?: string;
  };
  plugins?: {
    ScreenOrientation?: {
      orientation?: 'landscape' | 'landscapePrimary' | 'landscapeSecondary' | 'portrait';
    };
    Keyboard?: {
      resize?: 'none' | 'native' | 'body' | 'ionic';
      resizeOnFullScreen?: boolean;
    };
    StatusBar?: {
      overlaysWebView?: boolean;
      style?: 'DARK' | 'LIGHT' | 'DEFAULT';
    };
    [key: string]: unknown;
  };
}

const config: CapacitorConfig = {
  appId: 'com.legacyx.go',
  appName: 'LegacyX-GO',
  webDir: 'dist',
  backgroundColor: '#0b0e14',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    captureInput: true,
    backgroundColor: '#0b0e14'
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
    backgroundColor: '#0b0e14'
  },
  plugins: {
    ScreenOrientation: {
      orientation: 'landscape'
    },
    Keyboard: {
      resize: 'none'
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK'
    }
  }
};

export default config;
