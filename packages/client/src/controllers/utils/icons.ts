export type IconNode = Array<[string, Record<string, string | number>]>;

export const Crown: IconNode = [['path', { d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z' }]];
export const ShieldCheck: IconNode = [['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }]];
export const Lock: IconNode = [['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }]];
export const Unlock: IconNode = [['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }]];
export const Settings: IconNode = [['circle', { cx: 12, cy: 12, r: 3 }]];
export const Play: IconNode = [['polygon', { points: '6 3 20 12 6 21 6 3' }]];
export const Square: IconNode = [['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }]];
export const Wifi: IconNode = [['path', { d: 'M12 20h.01' }]];
export const Timer: IconNode = [['circle', { cx: 12, cy: 14, r: 8 }]];
export const MoreVertical: IconNode = [['circle', { cx: 12, cy: 12, r: 1 }]];
export const User: IconNode = [['circle', { cx: 12, cy: 7, r: 4 }]];
export const PlusCircle: IconNode = [['circle', { cx: 12, cy: 12, r: 10 }]];
export const PlusSquare: IconNode = [['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }]];
export const Search: IconNode = [['circle', { cx: 11, cy: 11, r: 8 }]];
export const RefreshCw: IconNode = [['path', { d: 'M3 12a9 9 0 0 1 9-9' }]];
export const X: IconNode = [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]];
export const Sun: IconNode = [['circle', { cx: 12, cy: 12, r: 4 }]];
export const Moon: IconNode = [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]];

function createIconElement(iconNode: IconNode, attrs: Record<string, string | number> = {}): SVGElement | HTMLElement {
  const normalizedAttrs: Record<string, string | number> = { ...attrs };
  if (attrs.size !== undefined) {
    normalizedAttrs.width = attrs.size;
    normalizedAttrs.height = attrs.size;
    delete normalizedAttrs.size;
  }
  if (attrs.color !== undefined) {
    normalizedAttrs.stroke = attrs.color;
    delete normalizedAttrs.color;
  }

  if (typeof document !== 'undefined' && typeof (document as any).createElementNS === 'function') {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      for (const [k, v] of Object.entries(normalizedAttrs)) {
        svg.setAttribute(k, String(v));
      }
      for (const [tag, elAttrs] of iconNode) {
        const child = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [ak, av] of Object.entries(elAttrs)) {
          child.setAttribute(ak, String(av));
        }
        svg.appendChild(child);
      }
      return svg;
    } catch {
      // fallback
    }
  }
  const fallback =
    typeof document !== 'undefined' && document.createElement
      ? document.createElement('span')
      : ({ setAttribute: () => {}, innerHTML: '' } as any);
  return fallback;
}

export function renderIcon(
  targetOrIcon: HTMLElement | IconNode,
  iconOrAttrs?: IconNode | Record<string, string | number>,
  attrsOrNothing?: Record<string, string | number>
): SVGElement | HTMLElement {
  if (Array.isArray(targetOrIcon)) {
    const iconNode = targetOrIcon as IconNode;
    const attrs = (iconOrAttrs as Record<string, string | number>) || {};
    return createIconElement(iconNode, attrs);
  } else {
    const target = targetOrIcon as HTMLElement;
    const iconNode = iconOrAttrs as IconNode;
    const attrs = attrsOrNothing || {};
    const el = createIconElement(iconNode, attrs);
    if (target && typeof target.appendChild === 'function') {
      target.innerHTML = '';
      target.appendChild(el);
    }
    return el;
  }
}

export function renderIconHTML(iconNode: IconNode, attrs: Record<string, string | number> = {}): string {
  const width = attrs.width ?? 16;
  const height = attrs.height ?? 16;
  const stroke = attrs.stroke ?? 'currentColor';
  const strokeWidth = attrs['stroke-width'] ?? 2;
  const className = attrs.class ?? 'lucide-icon';

  const children = iconNode
    .map(([tag, elAttrs]) => {
      const attrStr = Object.entries(elAttrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr}></${tag}>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${className}">${children}</svg>`;
}
