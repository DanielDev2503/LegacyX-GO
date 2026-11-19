import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CLIENT_ROOT = resolve(__dirname, '../..');

const SRC_MODULES = import.meta.glob('../../src/**/*.{ts,svelte}');

function normalizeSrcRelPath(relPathFromClientSrc: string): string {
  return relPathFromClientSrc
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^packages\/client\//, '')
    .replace(/^src\//, '');
}

function resolveSrcGlobKey(relPathFromClientSrc: string): string | null {
  const norm = normalizeSrcRelPath(relPathFromClientSrc);
  const candidates = [`../../src/${norm}`];

  if (norm.endsWith('.js')) {
    candidates.push(`../../src/${norm.slice(0, -3)}.ts`);
  } else if (norm.endsWith('.svelte')) {
    candidates.push(`../../src/${norm}.ts`);
  } else if (!/\.(ts|svelte)$/.test(norm)) {
    candidates.push(
      `../../src/${norm}.ts`,
      `../../src/${norm}.svelte`,
      `../../src/${norm}.svelte.ts`
    );
  }

  for (const key of candidates) {
    if (key in SRC_MODULES) {
      return key;
    }
  }
  return null;
}

function normalizeClientRootRelPath(relPathFromClientRoot: string): string {
  return relPathFromClientRoot
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^packages\/client\//, '');
}

export function clientSrcModuleExists(relPathFromClientSrc: string): boolean {
  return resolveSrcGlobKey(relPathFromClientSrc) !== null;
}

export async function requireClientModule<T = Record<string, unknown>>(
  relPathFromClientSrc: string
): Promise<T> {
  const norm = normalizeSrcRelPath(relPathFromClientSrc);
  const key = resolveSrcGlobKey(norm);
  if (!key) {
    throw new Error(
      `Missing required client module "src/${norm}": file does not exist in packages/client/src.`
    );
  }
  const loader = SRC_MODULES[key]!;
  return (await loader()) as T;
}

export function clientFileExists(relPathFromClientRoot: string): boolean {
  const norm = normalizeClientRootRelPath(relPathFromClientRoot);
  return existsSync(resolve(CLIENT_ROOT, norm));
}

export function readClientFile(relPathFromClientRoot: string): string {
  const norm = normalizeClientRootRelPath(relPathFromClientRoot);
  const absPath = resolve(CLIENT_ROOT, norm);
  if (!existsSync(absPath)) {
    throw new Error(
      `Missing required client file "${norm}": expected at "${absPath}".`
    );
  }
  return readFileSync(absPath, 'utf8');
}
