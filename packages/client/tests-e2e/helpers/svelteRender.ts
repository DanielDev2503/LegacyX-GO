import { render } from 'svelte/server';
import { compile } from 'svelte/compiler';
import { readClientFile, requireClientModule } from './moduleLoader';

function normalizeToClientRootSrc(relSrcPath: string): string {
  const clean = relSrcPath
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^packages\/client\//, '');
  return clean.startsWith('src/') ? clean : `src/${clean}`;
}

export async function renderSvelteComponent(
  relSrcPath: string,
  props?: Record<string, unknown>
): Promise<{ html: string; head: string; body: string }> {
  const mod = await requireClientModule<{ default: any }>(relSrcPath);
  const Component = mod.default;
  if (!Component) {
    throw new Error(
      `Svelte component "${relSrcPath}" did not export a default component.`
    );
  }
  const output = render(Component, props ? { props } : undefined);
  return {
    html: output.html,
    head: output.head,
    body: output.body
  };
}

export function compileSvelteSource(relSrcPath: string) {
  const rootPath = normalizeToClientRootSrc(relSrcPath);
  const source = readClientFile(rootPath);
  const result = compile(source, {
    filename: rootPath,
    generate: 'client',
    runes: true
  });
  return {
    js: result.js,
    css: result.css,
    warnings: result.warnings
  };
}
