import ts from 'typescript';
import { readClientFile } from './moduleLoader';

export interface ManifestActivity {
  attributes: Record<string, string>;
  name: string;
  screenOrientation?: string;
  launchMode?: string;
  configChanges?: string;
  exported?: string;
}

export interface AndroidManifestInfo {
  raw: string;
  permissions: string[];
  activities: ManifestActivity[];
  hasPermission(permission: string): boolean;
  getMainActivity(): ManifestActivity | undefined;
}

export interface CapacitorConfigInfo {
  raw: string;
  config: {
    appId?: string;
    appName?: string;
    webDir?: string;
    backgroundColor?: string;
    server?: Record<string, unknown>;
    android?: Record<string, unknown>;
    ios?: Record<string, unknown>;
    plugins?: Record<string, any>;
    [key: string]: unknown;
  };
  appId?: string;
  appName?: string;
  webDir?: string;
  plugins?: Record<string, any>;
  ios?: Record<string, unknown>;
  android?: Record<string, unknown>;
  server?: Record<string, unknown>;
}

export interface IndexHtmlInfo {
  raw: string;
  title: string;
  viewportContent: string;
  viewportDirectives: Record<string, string>;
  inlineStyle: string;
}

function stripXmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, '');
}

function parseXmlAttributes(attrBlock: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrBlock)) !== null) {
    attrs[match[1]!] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

export function readAndroidManifest(): AndroidManifestInfo {
  const raw = readClientFile('android/app/src/main/AndroidManifest.xml');
  const stripped = stripXmlComments(raw);

  const permissions: string[] = [];
  const permRegex = /<uses-permission(?=[\s>/])([\s\S]*?)\/?>/g;
  let permMatch: RegExpExecArray | null;
  while ((permMatch = permRegex.exec(stripped)) !== null) {
    const attrs = parseXmlAttributes(permMatch[1] ?? '');
    const name = attrs['android:name'] ?? attrs['name'];
    if (name) permissions.push(name);
  }

  const activities: ManifestActivity[] = [];
  const actRegex = /<activity(?=[\s>/])([\s\S]*?)>/g;
  let actMatch: RegExpExecArray | null;
  while ((actMatch = actRegex.exec(stripped)) !== null) {
    const attrs = parseXmlAttributes(actMatch[1] ?? '');
    activities.push({
      attributes: attrs,
      name: attrs['android:name'] ?? '',
      screenOrientation: attrs['android:screenOrientation'],
      launchMode: attrs['android:launchMode'],
      configChanges: attrs['android:configChanges'],
      exported: attrs['android:exported']
    });
  }

  return {
    raw,
    permissions,
    activities,
    hasPermission(permission: string) {
      return (
        permissions.includes(permission) ||
        permissions.includes(`android.permission.${permission}`)
      );
    },
    getMainActivity() {
      return activities.find((a) => a.name === '.MainActivity') ?? activities[0];
    }
  };
}

export function readCapacitorConfig(): CapacitorConfigInfo {
  const raw = readClientFile('capacitor.config.ts');

  const transpiled = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });

  const moduleObj = { exports: {} as Record<string, any> };
  const fn = new Function('exports', 'module', transpiled.outputText);
  fn(moduleObj.exports, moduleObj);

  const config = (moduleObj.exports.default ?? moduleObj.exports) as CapacitorConfigInfo['config'];

  return {
    raw,
    config,
    appId: config.appId,
    appName: config.appName,
    webDir: config.webDir,
    plugins: config.plugins,
    ios: config.ios,
    android: config.android,
    server: config.server
  };
}

export function readIndexHtml(): IndexHtmlInfo {
  const raw = readClientFile('index.html');
  const stripped = stripXmlComments(raw);

  const titleMatch = stripped.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? '';

  const metaTags = stripped.match(/<meta\b[^>]*>/gi) ?? [];
  let viewportContent = '';
  for (const tag of metaTags) {
    if (/name\s*=\s*["']viewport["']/i.test(tag)) {
      const contentMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
      viewportContent = contentMatch?.[1] ?? '';
      break;
    }
  }

  const viewportDirectives: Record<string, string> = {};
  for (const part of viewportContent.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      viewportDirectives[trimmed] = 'true';
    } else {
      viewportDirectives[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }

  const styleMatches = Array.from(stripped.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi));
  const inlineStyle = styleMatches
    .map((m) => (m[1] ?? '').trim())
    .filter(Boolean)
    .join('\n');

  return {
    raw,
    title,
    viewportContent,
    viewportDirectives,
    inlineStyle
  };
}
