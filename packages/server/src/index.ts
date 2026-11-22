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
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2'
};

const INTRO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg']);
const MUSIC_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

function resolveMediaDir(distPath: string, folder: 'video intro' | 'musica'): string | null {
  const distSubfolder = folder === 'video intro' ? 'intro' : 'musica';
  const candidates = [
    path.resolve(process.cwd(), folder),
    path.resolve(__dirname, `../../../${folder}`),
    path.resolve(__dirname, `../../${folder}`),
    path.join(path.resolve(distPath), 'media', distSubfolder)
  ];
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory()) || null;
}

function listMediaEntries(dir: string | null, allowedExts: Set<string>, urlPrefix: string) {
  if (!dir) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && allowedExts.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const ext = path.extname(entry.name);
        return {
          name: entry.name,
          title: entry.name.slice(0, entry.name.length - ext.length),
          url: `${urlPrefix}/${encodeURIComponent(entry.name)}`
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  } catch {
    return [];
  }
}

function isKnownServerRoute(pathname: string): boolean {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/index.html') return true;
  if (/^\/room\/[A-Za-z0-9_-]+$/.test(clean)) return true;
  const lower = clean.toLowerCase();
  return (
    lower === '/legal' ||
    /^\/legal\/(privacy|terms|legal|cookies|rights)$/.test(lower)
  );
}

function serveMediaWithRange(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  baseDir: string | null,
  rawName: string
): boolean {
  if (!baseDir) return false;
  let decodedName = '';
  try {
    decodedName = decodeURIComponent(rawName);
  } catch {
    res.writeHead(400);
    res.end('Invalid media path');
    return true;
  }

  const normalizedBase = path.resolve(baseDir);
  const resolvedFile = path.resolve(normalizedBase, decodedName);
  if (
    resolvedFile === normalizedBase ||
    !resolvedFile.startsWith(normalizedBase + path.sep) ||
    !fs.existsSync(resolvedFile)
  ) {
    res.writeHead(404);
    res.end('Media not found');
    return true;
  }

  const stat = fs.statSync(resolvedFile);
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end('Media not found');
    return true;
  }

  const ext = path.extname(resolvedFile).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return true;
    }
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(Number.parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return true;
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    fs.createReadStream(resolvedFile, { start, end }).pipe(res);
    return true;
  }

  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(fileSize),
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600'
  });
  fs.createReadStream(resolvedFile).pipe(res);
  return true;
}

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

        if (parsedUrl.pathname === '/api/auth/delete-account' && req.method === 'POST') {
          const authHeader = req.headers.authorization || '';
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
          const result = await authService.deleteAccount(token);
          return sendJson(res, result.success ? 200 : 401, result);
        }

        if (parsedUrl.pathname === '/api/leaderboard' && req.method === 'GET') {
          const category = (parsedUrl.searchParams.get('category') || 'elo') as LeaderboardCategory;
          const limit = Number(parsedUrl.searchParams.get('limit') || 50);
          const playerId = parsedUrl.searchParams.get('playerId') || undefined;
          const data = await authService.getLeaderboard(category, limit, playerId);
          return sendJson(res, 200, { success: true, ...data });
        }

        if (parsedUrl.pathname === '/api/media/list' && req.method === 'GET') {
          const introDir = resolveMediaDir(distPath, 'video intro');
          const musicDir = resolveMediaDir(distPath, 'musica');
          return sendJson(res, 200, {
            success: true,
            intros: listMediaEntries(introDir, INTRO_EXTENSIONS, '/media/intro'),
            music: listMediaEntries(musicDir, MUSIC_EXTENSIONS, '/media/musica')
          });
        }

        return sendJson(res, 404, { success: false, error: 'Endpoint API no encontrado.' });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err?.message || 'Error interno del servidor.' });
      }
    }

    if (parsedUrl.pathname.startsWith('/media/intro/')) {
      const rel = parsedUrl.pathname.slice('/media/intro/'.length);
      if (serveMediaWithRange(req, res, resolveMediaDir(distPath, 'video intro'), rel)) {
        return;
      }
      res.writeHead(404);
      return res.end('Intro media not found');
    }

    if (parsedUrl.pathname.startsWith('/media/musica/')) {
      const rel = parsedUrl.pathname.slice('/media/musica/'.length);
      if (serveMediaWithRange(req, res, resolveMediaDir(distPath, 'musica'), rel)) {
        return;
      }
      res.writeHead(404);
      return res.end('Music media not found');
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

    let isUnknownRoute = false;
    if (!fs.existsSync(normalizedFilePath)) {
      isUnknownRoute = !isKnownServerRoute(parsedUrl.pathname);
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

      res.writeHead(isUnknownRoute ? 404 : 200, headers);
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
