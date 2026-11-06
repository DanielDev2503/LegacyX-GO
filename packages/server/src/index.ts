import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { setupSignalingServer, registry } from './signalingServer.js';
import { authService, AuthService, type LeaderboardCategory, type UserRole } from './auth/AuthService.js';

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

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: object): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(payload));
}

// 1. Crear servidor HTTP nativo para servir SPA estático, API de cuentas/rankings y healthcheck
export function createHttpServer(distPath: string = clientDistPath): http.Server {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      return res.end('Bad Request');
    }

    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Healthcheck simple para balanceadores
    if (parsedUrl.pathname === '/healthz' || parsedUrl.pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', time: Date.now() });
    }

    if (parsedUrl.pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = authService.register({
        username: String(body.username || ''),
        email: String(body.email || ''),
        password: String(body.password || ''),
        displayName: body.displayName ? String(body.displayName) : undefined
      });
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (parsedUrl.pathname === '/api/auth/verify' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = authService.verifyEmail({
        usernameOrEmail: String(body.usernameOrEmail || body.username || body.email || ''),
        code: String(body.code || '')
      });
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (parsedUrl.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = authService.login({
        usernameOrEmail: String(body.usernameOrEmail || body.username || body.email || ''),
        password: String(body.password || '')
      });
      return sendJson(res, result.ok ? 200 : 401, result);
    }

    if (parsedUrl.pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const acc = authService.verifyToken(authHeader);
      if (!acc) {
        return sendJson(res, 401, { ok: false, error: 'Sesión inválida o expirada.' });
      }
      return sendJson(res, 200, { ok: true, user: authService.toPublicProfile(acc) });
    }

    if (parsedUrl.pathname === '/api/admin/role' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const authHeader = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const result = authService.updateUserRole({
        requesterToken: body.token || authHeader,
        targetUsername: String(body.targetUsername || ''),
        newRole: (body.newRole === 'representante' || body.newRole === 'superadmin' ? body.newRole : 'jugador') as UserRole
      });
      return sendJson(res, result.ok ? 200 : 403, result);
    }

    if (parsedUrl.pathname === '/api/rankings' && req.method === 'GET') {
      const catParam = parsedUrl.searchParams.get('category') || 'elo';
      const category: LeaderboardCategory =
        catParam === 'goals' || catParam === 'assists' || catParam === 'saves' ? catParam : 'elo';
      const limit = Number(parsedUrl.searchParams.get('limit') || 50);
      const viewerId = parsedUrl.searchParams.get('viewerId') || undefined;
      return sendJson(res, 200, authService.getLeaderboard(category, limit, viewerId));
    }

    if (parsedUrl.pathname === '/api/match/start' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = authService.issueRankedMatchToken({
        roomId: String(body.roomId || ''),
        hostId: String(body.hostId || ''),
        stadiumId: String(body.stadiumId || 'mediano'),
        participantIds: Array.isArray(body.participantIds) ? body.participantIds.map(String) : []
      });
      return sendJson(res, result.ok ? 200 : 403, result);
    }

    if (parsedUrl.pathname === '/api/match/report' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = authService.reportRankedMatch({
        matchToken: String(body.matchToken || ''),
        roomType: body.roomType === 'ranked' ? 'ranked' : 'casual',
        isPracticeMode: Boolean(body.isPracticeMode),
        durationSeconds: Number(body.durationSeconds || 180),
        redScore: Number(body.redScore || 0),
        blueScore: Number(body.blueScore || 0),
        winner: body.winner === 'red' || body.winner === 'blue' ? body.winner : 'draw',
        participants: Array.isArray(body.participants) ? body.participants : []
      });
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (parsedUrl.pathname === '/api/match/abort' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const aborted = body.matchToken
        ? authService.abortRankedMatchByToken(String(body.matchToken))
        : authService.abortRankedMatchForRoom(String(body.roomId || ''));
      return sendJson(res, 200, { ok: aborted, status: 'ABORTED' });
    }

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

export { registry, authService, AuthService };
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
