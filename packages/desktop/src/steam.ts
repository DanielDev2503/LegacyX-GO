/**
 * Adaptador y hooks para Steamworks API
 * Permite integración plug-and-play con steamworks.js si está presente en el entorno.
 */

export interface SteamClientWrapper {
  isInitialized: boolean;
  appId?: number;
  steamId?: string;
  name?: string;
  unlockAchievement(achievementName: string): boolean;
  setStat(statName: string, value: number): boolean;
  shutdown(): void;
}

class MockSteamClient implements SteamClientWrapper {
  public isInitialized = false;
  public steamId = '00000000000000000';
  public name = 'Offline Player';

  unlockAchievement(achievementName: string): boolean {
    console.log(`[Steamworks:Mock] Logro desbloqueado: ${achievementName}`);
    return true;
  }

  setStat(statName: string, value: number): boolean {
    console.log(`[Steamworks:Mock] Estadística guardada: ${statName} = ${value}`);
    return true;
  }

  shutdown(): void {
    console.log('[Steamworks:Mock] Sesión de Steam cerrada.');
  }
}

let activeClient: SteamClientWrapper | null = null;

export async function initSteamworks(appId = 480): Promise<SteamClientWrapper> {
  if (activeClient) return activeClient;

  try {
    // Intentar carga dinámica de steamworks.js si está instalado
    // @ts-ignore
    const steamworks = await import('steamworks.js').catch(() => null);
    if (steamworks && typeof steamworks.init === 'function') {
      const client = steamworks.init(appId);
      console.log(`[Steamworks] Inicializado exitosamente con AppID: ${appId}`);

      activeClient = {
        isInitialized: true,
        appId,
        steamId: client.localplayer?.getSteamId?.().steamId64?.toString(),
        name: client.localplayer?.getName?.(),
        unlockAchievement: (name: string) => client.achievement?.activate(name) ?? false,
        setStat: (name: string, value: number) => client.stats?.setInt(name, value) ?? false,
        shutdown: () => {}
      };
      return activeClient;
    }
  } catch (err: any) {
    console.warn(`[Steamworks] SDK nativo no disponible (${err.message}). Usando emulador mock para desarrollo.`);
  }

  activeClient = new MockSteamClient();
  return activeClient;
}

export function getSteamClient(): SteamClientWrapper {
  return activeClient ?? new MockSteamClient();
}
