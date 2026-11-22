import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const REPO_ROOT = path.resolve(__dirname, '../..');
const INTRO_DIR = path.join(REPO_ROOT, 'video intro');
const MUSIC_DIR = path.join(REPO_ROOT, 'musica');

const MEDIA_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
};

const INTRO_EXTS = new Set(['.mp4', '.webm', '.ogg']);
const MUSIC_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

function scanMediaDir(dir: string, exts: Set<string>, prefix: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && exts.has(path.extname(d.name).toLowerCase()))
    .map((d) => {
      const ext = path.extname(d.name);
      return {
        name: d.name,
        title: d.name.slice(0, d.name.length - ext.length),
        url: `${prefix}/${encodeURIComponent(d.name)}`
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

function streamRangeFile(req: IncomingMessage, res: ServerResponse, baseDir: string, rel: string): boolean {
  if (!fs.existsSync(baseDir)) return false;
  let decoded = '';
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    res.writeHead(400);
    res.end('Bad media path');
    return true;
  }
  const resolved = path.resolve(baseDir, decoded);
  if (resolved === baseDir || !resolved.startsWith(baseDir + path.sep) || !fs.existsSync(resolved)) {
    return false;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return false;
  const contentType = MEDIA_MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? Number.parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(Number.parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': contentType
        });
        fs.createReadStream(resolved, { start, end }).pipe(res);
        return true;
      }
    }
  }
  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(stat.size),
    'Content-Type': contentType
  });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

function copyDirFiles(srcDir: string, destDir: string, exts: Set<string>): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
      fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    }
  }
}

function legacyMediaPlugin(): Plugin {
  return {
    name: 'legacyx-media-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/api/media/list' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              success: true,
              intros: scanMediaDir(INTRO_DIR, INTRO_EXTS, '/media/intro'),
              music: scanMediaDir(MUSIC_DIR, MUSIC_EXTS, '/media/musica')
            })
          );
          return;
        }
        if (pathname.startsWith('/media/intro/')) {
          if (streamRangeFile(req, res, INTRO_DIR, pathname.slice('/media/intro/'.length))) return;
          res.writeHead(404);
          res.end('Intro not found');
          return;
        }
        if (pathname.startsWith('/media/musica/')) {
          if (streamRangeFile(req, res, MUSIC_DIR, pathname.slice('/media/musica/'.length))) return;
          res.writeHead(404);
          res.end('Track not found');
          return;
        }
        next();
      });
    },
    closeBundle() {
      const distMedia = path.resolve(__dirname, 'dist/media');
      copyDirFiles(INTRO_DIR, path.join(distMedia, 'intro'), INTRO_EXTS);
      copyDirFiles(MUSIC_DIR, path.join(distMedia, 'musica'), MUSIC_EXTS);
    }
  };
}

export default defineConfig({
  plugins: [svelte(), legacyMediaPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
