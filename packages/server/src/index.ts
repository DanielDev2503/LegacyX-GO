import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { setupSignalingServer, registry } from './signalingServer.js';
import { authService, type LeaderboardCategory, type UserRole } from './auth/AuthService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
      if (raw.length > 256_000) {
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(body));
}

export function createHttpServer(distPath: string = clientDistPath): http.Server {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      return res.end('Bad Request');
    }

    if (req.method === 'OPTIONS' && req.url.startsWith('/api/')) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }

    if (req.url === '/healthz' || req.url === '/api/health') {
      return sendJson(res, 200, { status: 'ok', time: Date.now() });
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Endpoints de Cuentas, Verificación por 6 Dígitos, Roles y Leaderboard Competitivo
    if (parsedUrl.pathname.startsWith('/api/')) {
      try {
        if (parsedUrl.pathname === '/api/auth/register' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await authService.register({
            username: body.username,
            email: body.email,
            password: body.password
          });
          return sendJson(res, result.success ? 200 : 400, result);
        }

        if (parsedUrl.pathname === '/api/auth/verify' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await authService.verifyCode({
            email: body.email,
            code: body.code,
            password: body.password
          });
          return sendJson(res, result.success ? 200 : 400, result);
        }

        if ((parsedUrl.pathname === '/api/auth/resend' || parsedUrl.pathname === '/api/auth/resend-code') && req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await authService.resendVerificationCode(body.email);
          return sendJson(res, result.success ? 200 : 400, result);
        }

        if (parsedUrl.pathname === '/api/auth/login' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await authService.login({
            identifier: body.identifier ?? body.username ?? body.email,
            password: body.password
          });
          return sendJson(res, result.success ? 200 : 401, result);
        }

        if (parsedUrl.pathname === '/api/auth/session' && req.method === 'GET') {
          const authHeader = req.headers.authorization || '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
          const profile = await authService.verifySession(token);
          if (!profile) {
            return sendJson(res, 401, { success: false, error: 'Sesión expirada o no válida.' });
          }
          return sendJson(res, 200, { success: true, profile });
        }

        if (parsedUrl.pathname === '/api/auth/role' && req.method === 'POST') {
          const authHeader = req.headers.authorization || '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
          const body = await readJsonBody(req);
          const result = await authService.setUserRole({
            accessToken: token,
            targetUsername: body.username,
            newRole: body.role as UserRole
          });
          return sendJson(res, result.success ? 200 : 403, result);
        }

        if (parsedUrl.pathname === '/api/leaderboard' && req.method === 'GET') {
          const category = (parsedUrl.searchParams.get('category') || 'elo') as LeaderboardCategory;
          const limit = Number(parsedUrl.searchParams.get('limit') || 50);
          const playerId = parsedUrl.searchParams.get('playerId') || undefined;
          const data = await authService.getLeaderboard(category, limit, playerId);
          return sendJson(res, 200, { success: true, ...data });
        }

        return sendJson(res, 404, { success: false, error: 'Endpoint API no encontrado.' });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err?.message || 'Error interno del servidor.' });
      }
    }

    let filePath = path.join(distPath, parsedUrl.pathname);

    const normalizedDistPath = path.resolve(distPath);
    let normalizedFilePath = path.resolve(filePath);
    if (!normalizedFilePath.startsWith(normalizedDistPath)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(normalizedFilePath) && fs.statSync(normalizedFilePath).isDirectory()) {
      normalizedFilePath = path.join(normalizedFilePath, 'index.html');
    }

    if (!fs.existsSync(normalizedFilePath)) {
      normalizedFilePath = path.join(normalizedDistPath, 'index.html');
    }

    fs.readFile(normalizedFilePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found - Build client not found');
      }

      const ext = path.extname(normalizedFilePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

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

export function startSignalingServer(port: number = PORT, customHttpServer?: http.Server): WebSocketServer {
  const server = customHttpServer || createHttpServer();
  const wss = new WebSocketServer({ server });

  if (!server.listening) {
    server.listen(port, '0.0.0.0', () => {
      console.log(`[LegacyX-GO Server] HTTP & WebSockets escuchando en puerto ${port}`);
      console.log(`[LegacyX-GO Server] Sirviendo frontend desde: ${clientDistPath}`);
    });
  }

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

  setupSignalingServer(wss);

  return wss;
}

export { registry };
export {
  authService,
  AuthService,
  formatGuestNickname,
  isGuestNickname,
  validateRegistrationUsername,
  canCreateRankedRoom,
  canJoinRankedRoom,
  calculateEloDelta,
  validateRankedMatchReport,
  RANKED_GUEST_REJECT_MESSAGE,
  type UserRole,
  type UserProfileRecord,
  type LeaderboardCategory,
  type LeaderboardEntry,
  type RankedMatchReportInput,
  type RankedMatchValidationResult
} from './auth/AuthService.js';
export { MAX_ROOM_PLAYERS } from './rooms/RoomRegistry.js';
export {
  getMeteredIceServers,
  resetCachedIceServers,
  getProvisionedIceServers,
  getRuntimeIceServers,
  setupSignalingServer,
  setupSignaling,
  resolveCountryCode,
  type RoomConfig,
  type Room,
  type RTCIceServer
} from './signalingServer.js';

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.ts') ||
  process.argv[1].endsWith('index.js')
);

if (isDirectExecution) {
  startSignalingServer();
}
