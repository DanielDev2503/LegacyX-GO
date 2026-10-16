/**
 * Preload Script seguro para Electron
 * Expone la API de plataforma, mandos y Steam al contexto de la UI en el renderizador.
 */

export interface DesktopAPI {
  platform: string;
  isSteamDeck: boolean;
  getSteamInfo: () => Promise<{ isInitialized: boolean; steamId?: string; name?: string }>;
  unlockAchievement: (name: string) => Promise<boolean>;
}

// Inyección segura en el contexto del navegador
try {
  // @ts-ignore
  const { contextBridge, ipcRenderer } = require('electron');

  const isSteamDeck = process.env.SteamAppId !== undefined || process.platform === 'linux';

  contextBridge.exposeInMainWorld('desktopAPI', {
    platform: process.platform,
    isSteamDeck,
    getSteamInfo: () => ipcRenderer.invoke('steam:getInfo'),
    unlockAchievement: (name: string) => ipcRenderer.invoke('steam:unlockAchievement', name)
  });
} catch {
  // Contexto no-electron (ej. test o build)
}
