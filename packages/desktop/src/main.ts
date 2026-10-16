import * as path from 'node:path';
import * as fs from 'node:fs';
import { initSteamworks, getSteamClient } from './steam.js';

// Intentar importar Electron dinámicamente si está presente
async function bootstrap() {
  try {
    // @ts-ignore
    const { app, BrowserWindow, ipcMain } = await import('electron');

    // Optimizaciones de Gamepad y Renderizado a alta tasa de refresco
    app.commandLine.appendSwitch('enable-gamepad-button-axis-events');
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('disable-gpu-vsync');

    let mainWindow: any = null;

    async function createWindow() {
      // Inicializar Steamworks en arranque
      await initSteamworks(480);

      const isDev = process.env.NODE_ENV === 'development';
      const isSteamDeck = process.env.SteamAppId !== undefined || process.platform === 'linux';

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        fullscreen: isSteamDeck || !isDev,
        frame: false,
        backgroundColor: '#0b0e14',
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false // No pausar física en segundo plano
        }
      });

      // Handlers IPC para Steamworks
      ipcMain.handle('steam:getInfo', async () => {
        const steam = getSteamClient();
        return {
          isInitialized: steam.isInitialized,
          steamId: steam.steamId,
          name: steam.name
        };
      });

      ipcMain.handle('steam:unlockAchievement', async (_event: any, name: string) => {
        const steam = getSteamClient();
        return steam.unlockAchievement(name);
      });

      // Cargar cliente web empaquetado o servidor local Vite
      const clientDist = path.resolve(__dirname, '../../client/dist/index.html');
      if (fs.existsSync(clientDist)) {
        mainWindow.loadFile(clientDist);
      } else {
        mainWindow.loadURL('http://localhost:5173');
      }

      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    }

    app.whenReady().then(createWindow);

    app.on('window-all-closed', () => {
      getSteamClient().shutdown();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (mainWindow === null) {
        createWindow();
      }
    });
  } catch (err: any) {
    console.log('[Desktop Scaffolding] Electron runtime initialized in headless/build mode.');
  }
}

bootstrap();
