import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { setupSignalingServer, registry } from './signalingServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determinar la ruta de compilación del cliente
// En Docker/producción suele estar en /app/packages/client/dist o relativo a server
const possibleClientDistPaths = [
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), 'packages/client/dist'),
  path.resolve(process.cwd(), 'dist')
];

export const clientDistPath = possibleClientDistPaths.find((p) => fs.existsSync(p)) || possibleClientDistPaths[0];

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2'
};

const PORT = Number(process.env.PORT) || 8080;

// 1. Crear servidor HTTP nativo para servir SPA estático y healthcheck
export function createHttpServer(distPath: string = clientDistPath): http.Server {
  return http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      return res.end('Bad Request');
    }

    // Healthcheck simple para balanceadores
    if (req.url === '/healthz' || req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
    }

    // Sanitizar ruta solicitada
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let filePath = path.join(distPath, parsedUrl.pathname);

    // Seguridad: evitar directory traversal
    const normalizedDistPath = path.resolve(distPath);
    let normalizedFilePath = path.resolve(filePath);
    if (!normalizedFilePath.startsWith(normalizedDistPath)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    // Si es un directorio o la raíz, servir index.html
    if (fs.existsSync(normalizedFilePath) && fs.statSync(normalizedFilePath).isDirectory()) {
      normalizedFilePath = path.join(normalizedFilePath, 'index.html');
    }

    // SPA Fallback: si el archivo no existe, servir index.html
    if (!fs.existsSync(normalizedFilePath)) {
      normalizedFilePath = path.join(normalizedDistPath, 'index.html');
    }

    // Leer y despachar archivo
    fs.readFile(normalizedFilePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found - Build client not found');
      }

      const ext = path.extname(normalizedFilePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Cache headers: index.html sin cache, assets hasheados con cache largo
      const headers: Record<string, string> = {
        'Content-Type': contentType
      };

      if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      } else if (normalizedFilePath.includes('/assets/') || normalizedFilePath.includes('\\assets\\')) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }

      res.writeHead(200, headers);
      res.end(data);
    });
  });
}

// 2. Asociar WebSocketServer a la instancia HTTP unificada
export function startSignalingServer(port: number = PORT, customHttpServer?: http.Server): WebSocketServer {
  const server = customHttpServer || createHttpServer();
  const wss = new WebSocketServer({ server });

  if (!server.listening) {
    server.listen(port, '0.0.0.0', () => {
      console.log(`[LegacyX-GO Server] HTTP & WebSockets escuchando en puerto ${port}`);
      console.log(`[LegacyX-GO Server] Sirviendo frontend desde: ${clientDistPath}`);
    });
  }

  // Interceptar close para limpiar servidor HTTP unificado
  const originalClose = wss.close.bind(wss);
  wss.close = function (this: WebSocketServer, cb?: (err?: Error) => void) {
    if (server.listening) {
      try {
        server.close();
      } catch {}
    }
    return originalClose(cb);
  };
  (wss as any).httpServer = server;

  // Conectar lógica de señalización y salas
  setupSignalingServer(wss);

  return wss;
}

export { registry };
export {
  getMeteredIceServers,
  resetCachedIceServers,
  getProvisionedIceServers,
  getRuntimeIceServers,
  setupSignalingServer,
  setupSignaling,
  type RoomConfig,
  type Room,
  type RTCIceServer
} from './signalingServer.js';

// Inicialización directa si se ejecuta como script principal
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.ts') ||
  process.argv[1].endsWith('index.js')
);

if (isDirectExecution) {
  startSignalingServer();
}
