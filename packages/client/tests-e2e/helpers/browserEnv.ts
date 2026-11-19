import { createMockCanvas } from './canvasMock';

export type BrowserEnvPreset =
  | 'mobile-portrait'
  | 'mobile-landscape'
  | 'tablet-landscape'
  | 'desktop';

interface PresetSpec {
  width: number;
  height: number;
  dpr: number;
  touch: boolean;
  maxTouchPoints: number;
  orientationType: 'portrait-primary' | 'landscape-primary';
  orientationAngle: number;
  userAgent: string;
}

const PRESETS: Record<BrowserEnvPreset, PresetSpec> = {
  'mobile-portrait': {
    width: 390,
    height: 844,
    dpr: 3,
    touch: true,
    maxTouchPoints: 5,
    orientationType: 'portrait-primary',
    orientationAngle: 0,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  },
  'mobile-landscape': {
    width: 844,
    height: 390,
    dpr: 3,
    touch: true,
    maxTouchPoints: 5,
    orientationType: 'landscape-primary',
    orientationAngle: 90,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  },
  'tablet-landscape': {
    width: 1024,
    height: 768,
    dpr: 2,
    touch: true,
    maxTouchPoints: 5,
    orientationType: 'landscape-primary',
    orientationAngle: 90,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  },
  desktop: {
    width: 1280,
    height: 720,
    dpr: 1,
    touch: false,
    maxTouchPoints: 0,
    orientationType: 'landscape-primary',
    orientationAngle: 0,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  }
};

type EventListenerInput =
  | ((event: any) => void)
  | { handleEvent: (event: any) => void };

type EventListenerOptionsInput =
  | boolean
  | { capture?: boolean; once?: boolean; passive?: boolean; signal?: AbortSignal };

type ListenerEntry = {
  listener: EventListenerInput;
  capture: boolean;
  once: boolean;
  removed?: boolean;
  invoke: (event: any) => void;
};

type DispatchPhase = 'capture' | 'at-target' | 'bubble';

const immediateStoppedEvents = new WeakSet<object>();
const propagationStoppedEvents = new WeakSet<object>();
const wrappedStopEvents = new WeakSet<object>();

function instrumentEventPropagation(ev: any): void {
  if (!ev || typeof ev !== 'object' || wrappedStopEvents.has(ev)) return;
  wrappedStopEvents.add(ev);

  const origStopImmediate =
    typeof ev.stopImmediatePropagation === 'function' ? ev.stopImmediatePropagation : null;
  const origStopPropagation =
    typeof ev.stopPropagation === 'function' ? ev.stopPropagation : null;

  try {
    Object.defineProperty(ev, 'stopImmediatePropagation', {
      configurable: true,
      writable: true,
      value: function (...args: unknown[]) {
        immediateStoppedEvents.add(ev);
        propagationStoppedEvents.add(ev);
        if (origStopImmediate) {
          return origStopImmediate.apply(this, args);
        }
      }
    });
  } catch {
    // Ignore non-configurable properties
  }

  try {
    Object.defineProperty(ev, 'stopPropagation', {
      configurable: true,
      writable: true,
      value: function (...args: unknown[]) {
        propagationStoppedEvents.add(ev);
        if (origStopPropagation) {
          return origStopPropagation.apply(this, args);
        }
      }
    });
  } catch {
    // Ignore non-configurable properties
  }
}

function normalizeCapture(options?: EventListenerOptionsInput): boolean {
  return typeof options === 'boolean'
    ? options
    : Boolean(options && options.capture);
}

function isPropagationStopped(ev: any): boolean {
  return (
    Boolean(
      ev?.propagationStopped ||
        ev?.immediatePropagationStopped ||
        ev?.cancelBubble
    ) ||
    (typeof ev === 'object' &&
      ev !== null &&
      (propagationStoppedEvents.has(ev) || immediateStoppedEvents.has(ev)))
  );
}

function isImmediatePropagationStopped(ev: any): boolean {
  return (
    Boolean(ev?.immediatePropagationStopped) ||
    (typeof ev === 'object' && ev !== null && immediateStoppedEvents.has(ev))
  );
}

function setEventField(ev: any, key: string, value: unknown): void {
  if (!ev || typeof ev !== 'object') return;
  try {
    ev[key] = value;
  } catch {
    const desc = Object.getOwnPropertyDescriptor(ev, key);
    if (!desc || desc.configurable) {
      Object.defineProperty(ev, key, {
        value,
        configurable: true,
        writable: true,
        enumerable: true
      });
    }
  }
}

function createEmitter() {
  const listeners = new Map<string, ListenerEntry[]>();

  const api = {
    addEventListener(
      type: string,
      listener: EventListenerInput | null | undefined,
      options?: EventListenerOptionsInput
    ) {
      if (!listener) return;
      if (
        typeof listener !== 'function' &&
        typeof listener.handleEvent !== 'function'
      ) {
        return;
      }
      const capture = normalizeCapture(options);
      const once =
        typeof options === 'object' && options !== null
          ? Boolean(options.once)
          : false;
      const signal =
        typeof options === 'object' && options !== null
          ? options.signal
          : undefined;
      if (signal?.aborted) return;

      const list = listeners.get(type) ?? [];
      if (
        !list.some(
          (item) => item.listener === listener && item.capture === capture
        )
      ) {
        const invoke =
          typeof listener === 'function'
            ? listener
            : (ev: any) => listener.handleEvent(ev);
        list.push({ listener, capture, once, invoke });
        listeners.set(type, list);
        if (signal && typeof signal.addEventListener === 'function') {
          signal.addEventListener(
            'abort',
            () => api.removeEventListener(type, listener, capture),
            { once: true }
          );
        }
      }
    },
    removeEventListener(
      type: string,
      listener: EventListenerInput | null | undefined,
      options?: EventListenerOptionsInput
    ) {
      if (!listener) return;
      const capture = normalizeCapture(options);
      const list = listeners.get(type);
      if (!list) return;
      const remaining: ListenerEntry[] = [];
      for (const item of list) {
        if (item.listener === listener && item.capture === capture) {
          item.removed = true;
        } else {
          remaining.push(item);
        }
      }
      listeners.set(type, remaining);
    },
    invokePhase(ev: any, phase: DispatchPhase) {
      const list = listeners.get(ev?.type);
      if (!list || list.length === 0) return;
      for (const entry of [...list]) {
        if (entry.removed) continue;
        if (isImmediatePropagationStopped(ev)) break;
        if (phase === 'capture' && !entry.capture) continue;
        if (phase === 'bubble' && entry.capture) continue;
        if (entry.once) {
          api.removeEventListener(ev.type, entry.listener, entry.capture);
        }
        entry.invoke(ev);
      }
    },
    dispatchEvent(eventOrType: any, targetObj: unknown = null) {
      const ev =
        typeof eventOrType === 'string'
          ? createBasicEvent(eventOrType)
          : eventOrType;
      if (!ev || typeof ev !== 'object') return true;
      instrumentEventPropagation(ev);
      if (ev.target == null) {
        setEventField(ev, 'target', targetObj);
      }
      setEventField(ev, 'eventPhase', 2);
      setEventField(ev, 'currentTarget', targetObj);
      api.invokePhase(ev, 'at-target');
      setEventField(ev, 'currentTarget', null);
      setEventField(ev, 'eventPhase', 0);
      return !ev.defaultPrevented;
    },
    clear() {
      listeners.clear();
    }
  };

  return api;
}

const emitterByTarget = new WeakMap<object, ReturnType<typeof createEmitter>>();

function dispatchDomEvent(
  originTarget: any,
  eventOrType: any,
  docRef: any,
  winRef: any
): boolean {
  const ev =
    typeof eventOrType === 'string'
      ? createBasicEvent(eventOrType)
      : eventOrType;
  if (!ev || typeof ev !== 'object') return true;
  instrumentEventPropagation(ev);

  if (ev.target == null) {
    setEventField(ev, 'target', originTarget);
  }

  const path: any[] = [];
  const visited = new Set<any>();
  let cur: any = originTarget;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    path.push(cur);
    if (cur === docRef) {
      if (winRef && !visited.has(winRef)) {
        path.push(winRef);
      }
      break;
    }
    cur = cur.parentNode ?? null;
  }

  // Phase 1: Capture (root -> parent of target)
  for (let i = path.length - 1; i >= 1; i--) {
    if (isPropagationStopped(ev)) break;
    const node = path[i];
    setEventField(ev, 'eventPhase', 1);
    setEventField(ev, 'currentTarget', node);
    emitterByTarget.get(node)?.invokePhase(ev, 'capture');
  }

  // Phase 2: At target
  if (!isPropagationStopped(ev) && path.length > 0) {
    const targetNode = path[0];
    setEventField(ev, 'eventPhase', 2);
    setEventField(ev, 'currentTarget', targetNode);
    emitterByTarget.get(targetNode)?.invokePhase(ev, 'at-target');
  }

  // Phase 3: Bubble (parent of target -> root)
  if (ev.bubbles !== false) {
    for (let i = 1; i < path.length; i++) {
      if (isPropagationStopped(ev)) break;
      const node = path[i];
      setEventField(ev, 'eventPhase', 3);
      setEventField(ev, 'currentTarget', node);
      emitterByTarget.get(node)?.invokePhase(ev, 'bubble');
    }
  }

  setEventField(ev, 'currentTarget', null);
  setEventField(ev, 'eventPhase', 0);
  return !ev.defaultPrevented;
}

function isConnectedToDocument(el: any, docRef: any): boolean {
  let cur: any = el;
  const visited = new Set<any>();
  while (cur && !visited.has(cur)) {
    if (cur === docRef) return true;
    visited.add(cur);
    cur = cur.parentNode ?? null;
  }
  return false;
}

function createBasicEvent(type: string, init?: Record<string, unknown>) {
  const ev: Record<string, any> = {
    type,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    cancelBubble: false,
    target: null,
    currentTarget: null,
    eventPhase: 0,
    preventDefault() {
      if (ev.cancelable !== false) {
        ev.defaultPrevented = true;
      }
    },
    stopPropagation() {
      ev.propagationStopped = true;
      ev.cancelBubble = true;
    },
    stopImmediatePropagation() {
      ev.propagationStopped = true;
      ev.immediatePropagationStopped = true;
      ev.cancelBubble = true;
    },
    ...(init ?? {})
  };
  return ev;
}

function createStyleObject() {
  const props = new Map<string, string>();
  const target: Record<string, any> = {
    setProperty(name: string, value: string) {
      props.set(name, String(value));
    },
    getPropertyValue(name: string) {
      return props.get(name) ?? '';
    },
    removeProperty(name: string) {
      const prev = props.get(name) ?? '';
      props.delete(name);
      return prev;
    }
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'string' && !(prop in obj)) {
        return props.get(prop) ?? '';
      }
      return obj[prop as keyof typeof obj];
    },
    set(obj, prop, value) {
      if (typeof prop === 'string' && !(prop in obj)) {
        props.set(prop, String(value));
        return true;
      }
      obj[prop as keyof typeof obj] = value;
      return true;
    }
  });
}

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    }
  };
}

function createMockElement(tagName: string, docRef: any) {
  const emitter = createEmitter();
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const children: any[] = [];
  const activePointers = new Set<number>();

  const el: Record<string, any> = {
    tagName: tagName.toUpperCase(),
    id: '',
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val: string) {
      classes.clear();
      for (const token of String(val).split(/\s+/).filter(Boolean)) {
        classes.add(token);
      }
    },
    classList: {
      add(...tokens: string[]) {
        for (const t of tokens) classes.add(t);
      },
      remove(...tokens: string[]) {
        for (const t of tokens) classes.delete(t);
      },
      toggle(token: string, force?: boolean) {
        if (force === true) {
          classes.add(token);
          return true;
        }
        if (force === false) {
          classes.delete(token);
          return false;
        }
        if (classes.has(token)) {
          classes.delete(token);
          return false;
        }
        classes.add(token);
        return true;
      },
      contains(token: string) {
        return classes.has(token);
      }
    },
    style: createStyleObject(),
    dataset: {} as Record<string, string>,
    children,
    parentNode: null as any,
    parentElement: null as any,
    textContent: '',
    innerHTML: '',
    value: '',
    clientWidth: 0,
    clientHeight: 0,
    scrollTop: 0,
    scrollLeft: 0,
    setAttribute(name: string, value: string) {
      attrs.set(name, String(value));
      if (name === 'id') el.id = String(value);
      if (name === 'class') el.className = String(value);
    },
    getAttribute(name: string) {
      if (name === 'id' && el.id) return el.id;
      return attrs.get(name) ?? null;
    },
    removeAttribute(name: string) {
      attrs.delete(name);
      if (name === 'id') el.id = '';
    },
    appendChild(child: any) {
      if (!child) return child;
      if (typeof child.remove === 'function') {
        child.remove();
      } else if (
        child.parentNode &&
        typeof child.parentNode.removeChild === 'function'
      ) {
        child.parentNode.removeChild(child);
      }
      const existingIdx = children.indexOf(child);
      if (existingIdx !== -1) {
        children.splice(existingIdx, 1);
      }
      child.parentNode = el;
      child.parentElement = el;
      children.push(child);
      return child;
    },
    removeChild(child: any) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
        child.parentElement = null;
      }
      return child;
    },
    remove() {
      if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
        el.parentNode.removeChild(el);
      }
    },
    focus() {
      docRef.activeElement = el;
    },
    blur() {
      if (docRef.activeElement === el) {
        docRef.activeElement = docRef.body;
      }
    },
    click() {
      el.dispatchEvent(createBasicEvent('click', { target: el }));
    },
    getBoundingClientRect() {
      const w = Number(el.clientWidth || el.width || 0);
      const h = Number(el.clientHeight || el.height || 0);
      return {
        left: 0,
        top: 0,
        right: w,
        bottom: h,
        width: w,
        height: h,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        }
      };
    },
    querySelector(selector: string) {
      return findMatchingElement(el, selector);
    },
    querySelectorAll(selector: string) {
      return findMatchingElements(el, selector);
    },
    closest() {
      return null;
    },
    setPointerCapture(pointerId: number) {
      activePointers.add(pointerId);
    },
    releasePointerCapture(pointerId: number) {
      activePointers.delete(pointerId);
    },
    hasPointerCapture(pointerId: number) {
      return activePointers.has(pointerId);
    },
    addEventListener: emitter.addEventListener.bind(emitter),
    removeEventListener: emitter.removeEventListener.bind(emitter),
    dispatchEvent(event: any) {
      return dispatchDomEvent(el, event, docRef, docRef.defaultView);
    },
    async requestFullscreen() {
      docRef.fullscreenElement = el;
      if (isConnectedToDocument(el, docRef)) {
        el.dispatchEvent(
          createBasicEvent('fullscreenchange', { target: el, bubbles: true })
        );
      } else {
        el.dispatchEvent(
          createBasicEvent('fullscreenchange', { target: el, bubbles: false })
        );
        docRef.dispatchEvent(
          createBasicEvent('fullscreenchange', { target: docRef, bubbles: true })
        );
      }
    }
  };

  emitterByTarget.set(el, emitter);

  if (tagName.toLowerCase() === 'canvas') {
    const mock = createMockCanvas(300, 150);
    el.width = mock.canvas.width;
    el.height = mock.canvas.height;
    el.clientWidth = mock.canvas.width;
    el.clientHeight = mock.canvas.height;
    el.getContext = (type: string) => mock.canvas.getContext(type);
    el.toDataURL = () => 'data:image/png;base64,';
  }

  return el;
}

function matchesSelector(el: any, selector: string): boolean {
  if (!el || typeof selector !== 'string') return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return Boolean(el.classList?.contains(selector.slice(1)));
  return String(el.tagName || '').toLowerCase() === selector.toLowerCase();
}

function findMatchingElement(root: any, selector: string): any {
  for (const child of root.children ?? []) {
    if (matchesSelector(child, selector)) return child;
    const nested = findMatchingElement(child, selector);
    if (nested) return nested;
  }
  return null;
}

function findMatchingElements(root: any, selector: string): any[] {
  const out: any[] = [];
  for (const child of root.children ?? []) {
    if (matchesSelector(child, selector)) out.push(child);
    out.push(...findMatchingElements(child, selector));
  }
  return out;
}

const GLOBAL_KEYS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'matchMedia',
  'screen',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'innerWidth',
  'innerHeight',
  'devicePixelRatio',
  'getComputedStyle'
] as const;

interface ActiveEnvState {
  savedDescriptors: Map<string, PropertyDescriptor | undefined>;
  windowObj: Record<string, any>;
  documentObj: Record<string, any>;
  navigatorObj: Record<string, any>;
  screenObj: Record<string, any>;
  localStorageObj: Storage;
  sessionStorageObj: Storage;
  rafQueue: Map<number, (time: number) => void>;
  nextRafId: number;
  mediaQueries: Set<{ query: string; mql: Record<string, any>; matches: boolean }>;
  isTouch: boolean;
}

let activeEnv: ActiveEnvState | null = null;

function stripOuterParens(expr: string): string {
  let s = expr.trim();
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let wrapsEntire = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      if (depth === 0 && i < s.length - 1) {
        wrapsEntire = false;
        break;
      }
    }
    if (wrapsEntire && depth === 0) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

function evaluateMediaTerm(rawTerm: string, w: number, h: number, isTouch: boolean): boolean {
  let term = stripOuterParens(rawTerm.toLowerCase())
    .replace(/\s+/g, ' ')
    .replace(/:\s*/g, ': ');
  if (!term) return false;

  if (term.startsWith('not ')) {
    return !evaluateMediaTerm(term.slice(4), w, h, isTouch);
  }
  if (term.startsWith('only ')) {
    term = term.slice(5).trim();
  }

  if (term === 'all' || term === 'screen') return true;
  if (term === 'print' || term === 'speech') return false;

  if (term === 'pointer: coarse' || term === 'any-pointer: coarse') return isTouch;
  if (term === 'pointer: fine' || term === 'any-pointer: fine') return !isTouch;
  if (term === 'pointer: none' || term === 'any-pointer: none') return false;
  if (term === 'hover: none' || term === 'any-hover: none') return isTouch;
  if (term === 'hover: hover' || term === 'any-hover: hover') return !isTouch;
  if (term === 'orientation: portrait') return h > w;
  if (term === 'orientation: landscape') return w >= h;

  const maxW = term.match(/^max-width:\s*(\d+(?:\.\d+)?)px$/);
  if (maxW) return w <= Number(maxW[1]);
  const minW = term.match(/^min-width:\s*(\d+(?:\.\d+)?)px$/);
  if (minW) return w >= Number(minW[1]);
  const exactW = term.match(/^width:\s*(\d+(?:\.\d+)?)px$/);
  if (exactW) return w === Number(exactW[1]);

  const maxH = term.match(/^max-height:\s*(\d+(?:\.\d+)?)px$/);
  if (maxH) return h <= Number(maxH[1]);
  const minH = term.match(/^min-height:\s*(\d+(?:\.\d+)?)px$/);
  if (minH) return h >= Number(minH[1]);
  const exactH = term.match(/^height:\s*(\d+(?:\.\d+)?)px$/);
  if (exactH) return h === Number(exactH[1]);

  return false;
}

function splitTopLevelComma(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === ',' && depth === 0) {
      const segment = expr.slice(start, i).trim();
      if (segment) parts.push(segment);
      start = i + 1;
    }
  }
  const tail = expr.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function splitTopLevelAnd(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) depth--;
      continue;
    }
    if (
      depth === 0 &&
      expr.slice(i, i + 3) === 'and' &&
      (i === 0 || /[\s)]/.test(expr[i - 1]!)) &&
      (i + 3 === expr.length || /[\s(]/.test(expr[i + 3]!))
    ) {
      const segment = expr.slice(start, i).trim();
      if (segment) parts.push(segment);
      start = i + 3;
      i += 2;
    }
  }
  const tail = expr.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function evaluateMediaBranch(rawBranch: string, w: number, h: number, isTouch: boolean): boolean {
  let branch = stripOuterParens(rawBranch.trim().toLowerCase().replace(/\s+/g, ' '));
  if (!branch) return false;

  let negated = false;
  if (branch.startsWith('not ')) {
    negated = true;
    branch = stripOuterParens(branch.slice(4).trim());
  } else if (branch.startsWith('only ')) {
    branch = stripOuterParens(branch.slice(5).trim());
  }

  const terms = splitTopLevelAnd(branch);
  if (terms.length === 0) return false;

  const result =
    terms.length === 1
      ? evaluateMediaTerm(terms[0]!, w, h, isTouch)
      : terms.every((term) => evaluateMediaBranch(term, w, h, isTouch));
  return negated ? !result : result;
}

function evaluateMediaQuery(query: string, w: number, h: number, isTouch: boolean): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const branches = splitTopLevelComma(trimmed);
  if (branches.length === 0) return false;
  return branches.some((branch) => evaluateMediaBranch(branch, w, h, isTouch));
}

function setGlobalProperty(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: true
  });
}

export function installBrowserEnv(preset: BrowserEnvPreset = 'mobile-landscape') {
  if (activeEnv) {
    restoreBrowserEnv();
  }

  const savedDescriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const key of GLOBAL_KEYS) {
    savedDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  const spec = PRESETS[preset];
  const localStorageObj = createStorage();
  const sessionStorageObj = createStorage();
  const winEmitter = createEmitter();
  const docEmitter = createEmitter();
  const orientationEmitter = createEmitter();
  const rafQueue = new Map<number, (time: number) => void>();
  const mediaQueries = new Set<{
    query: string;
    mql: Record<string, any>;
    matches: boolean;
  }>();

  let windowObjRef: Record<string, any> = null as any;

  const documentObj: Record<string, any> = {
    visibilityState: 'visible',
    hidden: false,
    fullscreenElement: null as any,
    fullscreenEnabled: true,
    activeElement: null as any,
    body: null as any,
    documentElement: null as any,
    defaultView: null as any,
    parentNode: null as any,
    createElement(tag: string) {
      return createMockElement(tag, documentObj);
    },
    getElementById(id: string) {
      return findMatchingElement(documentObj.body, `#${id}`);
    },
    querySelector(selector: string) {
      return findMatchingElement(documentObj.body, selector);
    },
    querySelectorAll(selector: string) {
      return findMatchingElements(documentObj.body, selector);
    },
    async exitFullscreen() {
      const prev = documentObj.fullscreenElement;
      documentObj.fullscreenElement = null;
      if (prev && isConnectedToDocument(prev, documentObj)) {
        prev.dispatchEvent(
          createBasicEvent('fullscreenchange', {
            target: prev,
            bubbles: true
          })
        );
      } else {
        if (prev && typeof prev.dispatchEvent === 'function') {
          prev.dispatchEvent(
            createBasicEvent('fullscreenchange', {
              target: prev,
              bubbles: false
            })
          );
        }
        documentObj.dispatchEvent(
          createBasicEvent('fullscreenchange', {
            target: documentObj,
            bubbles: true
          })
        );
      }
    },
    addEventListener: docEmitter.addEventListener.bind(docEmitter),
    removeEventListener: docEmitter.removeEventListener.bind(docEmitter),
    dispatchEvent(event: any) {
      return dispatchDomEvent(documentObj, event, documentObj, windowObjRef);
    }
  };
  emitterByTarget.set(documentObj, docEmitter);

  const docEl = createMockElement('html', documentObj);
  docEl.clientWidth = spec.width;
  docEl.clientHeight = spec.height;
  docEl.parentNode = documentObj;
  docEl.parentElement = null;
  const bodyEl = createMockElement('body', documentObj);
  bodyEl.clientWidth = spec.width;
  bodyEl.clientHeight = spec.height;
  docEl.appendChild(bodyEl);
  bodyEl.parentElement = docEl;
  documentObj.documentElement = docEl;
  documentObj.body = bodyEl;
  documentObj.activeElement = bodyEl;

  const navigatorObj: Record<string, any> = {
    userAgent: spec.userAgent,
    maxTouchPoints: spec.maxTouchPoints,
    vibrate: (_pattern: number | number[]) => true,
    wakeLock: {
      async request(_type: 'screen' = 'screen') {
        const lockEmitter = createEmitter();
        const sentinel = {
          released: false,
          type: 'screen',
          async release() {
            sentinel.released = true;
            lockEmitter.dispatchEvent(createBasicEvent('release'));
          },
          addEventListener: lockEmitter.addEventListener.bind(lockEmitter),
          removeEventListener: lockEmitter.removeEventListener.bind(lockEmitter)
        };
        return sentinel;
      }
    },
    async share(_data: Record<string, unknown>) {},
    canShare(_data?: Record<string, unknown>) {
      return true;
    },
    clipboard: {
      async writeText(_text: string) {}
    }
  };

  const screenObj: Record<string, any> = {
    width: spec.width,
    height: spec.height,
    availWidth: spec.width,
    availHeight: spec.height,
    orientation: {
      type: spec.orientationType as 'portrait-primary' | 'landscape-primary',
      angle: spec.orientationAngle,
      async lock(orientation: string) {
        if (orientation.startsWith('portrait')) {
          screenObj.orientation.type = 'portrait-primary';
          screenObj.orientation.angle = 0;
        } else {
          screenObj.orientation.type = 'landscape-primary';
          screenObj.orientation.angle = 90;
        }
        orientationEmitter.dispatchEvent(createBasicEvent('change'));
      },
      unlock() {},
      addEventListener: orientationEmitter.addEventListener.bind(orientationEmitter),
      removeEventListener: orientationEmitter.removeEventListener.bind(orientationEmitter),
      dispatchEvent: orientationEmitter.dispatchEvent.bind(orientationEmitter)
    }
  };

  let stateRef: ActiveEnvState;

  const matchMediaFn = (query: string) => {
    const mqlEmitter = createEmitter();
    const mql: Record<string, any> = {
      get matches() {
        return evaluateMediaQuery(
          query,
          windowObj.innerWidth,
          windowObj.innerHeight,
          stateRef.isTouch
        );
      },
      media: query,
      onchange: null as ((ev: any) => void) | null,
      addEventListener(type: string, cb: any, options?: any) {
        if (type === 'change') mqlEmitter.addEventListener('change', cb, options);
      },
      removeEventListener(type: string, cb: any, options?: any) {
        if (type === 'change') mqlEmitter.removeEventListener('change', cb, options);
      },
      addListener(cb: any) {
        mqlEmitter.addEventListener('change', cb);
      },
      removeListener(cb: any) {
        mqlEmitter.removeEventListener('change', cb);
      },
      dispatchEvent(ev: any) {
        const eventObj = typeof ev === 'string' ? createBasicEvent(ev) : ev;
        if (eventObj && typeof eventObj === 'object') {
          instrumentEventPropagation(eventObj);
          if (eventObj.target == null) setEventField(eventObj, 'target', mql);
          setEventField(eventObj, 'currentTarget', mql);
        }
        if (eventObj?.type === 'change' && typeof mql.onchange === 'function') {
          mql.onchange(eventObj);
        }
        if (!isImmediatePropagationStopped(eventObj)) {
          mqlEmitter.invokePhase(eventObj, 'at-target');
        }
        if (eventObj && typeof eventObj === 'object') {
          setEventField(eventObj, 'currentTarget', null);
        }
        return !eventObj?.defaultPrevented;
      }
    };

    const entry = {
      query,
      mql,
      matches: evaluateMediaQuery(
        query,
        windowObj.innerWidth,
        windowObj.innerHeight,
        stateRef.isTouch
      )
    };
    mediaQueries.add(entry);

    return mql;
  };

  const rafFn = (cb: (time: number) => void): number => {
    const id = stateRef.nextRafId++;
    rafQueue.set(id, cb);
    return id;
  };

  const cafFn = (id: number): void => {
    rafQueue.delete(id);
  };

  const getComputedStyleFn = () => ({
    getPropertyValue: () => ''
  });

  const windowObj: Record<string, any> = {
    innerWidth: spec.width,
    innerHeight: spec.height,
    devicePixelRatio: spec.dpr,
    document: documentObj,
    localStorage: localStorageObj,
    sessionStorage: sessionStorageObj,
    navigator: navigatorObj,
    screen: screenObj,
    matchMedia: matchMediaFn,
    requestAnimationFrame: rafFn,
    cancelAnimationFrame: cafFn,
    getComputedStyle: getComputedStyleFn,
    location: {
      href: 'https://legacyx.local/',
      origin: 'https://legacyx.local',
      protocol: 'https:',
      host: 'legacyx.local',
      pathname: '/',
      search: '',
      hash: ''
    },
    history: {
      back() {},
      pushState() {},
      replaceState() {}
    },
    addEventListener: winEmitter.addEventListener.bind(winEmitter),
    removeEventListener: winEmitter.removeEventListener.bind(winEmitter),
    dispatchEvent(event: any) {
      return dispatchDomEvent(windowObj, event, documentObj, windowObj);
    }
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObjRef = windowObj;
  documentObj.defaultView = windowObj;
  emitterByTarget.set(windowObj, winEmitter);

  stateRef = {
    savedDescriptors,
    windowObj,
    documentObj,
    navigatorObj,
    screenObj,
    localStorageObj,
    sessionStorageObj,
    rafQueue,
    nextRafId: 1,
    mediaQueries,
    isTouch: spec.touch
  };
  activeEnv = stateRef;

  setGlobalProperty('window', windowObj);
  setGlobalProperty('document', documentObj);
  setGlobalProperty('localStorage', localStorageObj);
  setGlobalProperty('sessionStorage', sessionStorageObj);
  setGlobalProperty('navigator', navigatorObj);
  setGlobalProperty('matchMedia', matchMediaFn);
  setGlobalProperty('screen', screenObj);
  setGlobalProperty('requestAnimationFrame', rafFn);
  setGlobalProperty('cancelAnimationFrame', cafFn);
  setGlobalProperty('innerWidth', spec.width);
  setGlobalProperty('innerHeight', spec.height);
  setGlobalProperty('devicePixelRatio', spec.dpr);
  setGlobalProperty('getComputedStyle', getComputedStyleFn);

  return {
    window: windowObj,
    document: documentObj,
    localStorage: localStorageObj,
    sessionStorage: sessionStorageObj,
    navigator: navigatorObj,
    screen: screenObj
  };
}

export function setViewport(w: number, h: number, touch?: boolean): void {
  if (!activeEnv) {
    throw new Error('browserEnv is not installed. Call installBrowserEnv() before setViewport().');
  }

  const prevOrientation = activeEnv.screenObj.orientation.type;
  const nextOrientation = h > w ? 'portrait-primary' : 'landscape-primary';
  const nextAngle = h > w ? 0 : 90;

  activeEnv.windowObj.innerWidth = w;
  activeEnv.windowObj.innerHeight = h;
  activeEnv.documentObj.documentElement.clientWidth = w;
  activeEnv.documentObj.documentElement.clientHeight = h;
  activeEnv.documentObj.body.clientWidth = w;
  activeEnv.documentObj.body.clientHeight = h;
  activeEnv.screenObj.width = w;
  activeEnv.screenObj.height = h;
  activeEnv.screenObj.availWidth = w;
  activeEnv.screenObj.availHeight = h;
  activeEnv.screenObj.orientation.type = nextOrientation;
  activeEnv.screenObj.orientation.angle = nextAngle;

  setGlobalProperty('innerWidth', w);
  setGlobalProperty('innerHeight', h);

  if (typeof touch === 'boolean') {
    activeEnv.isTouch = touch;
    activeEnv.navigatorObj.maxTouchPoints = touch ? 5 : 0;
  }

  for (const mq of activeEnv.mediaQueries) {
    const nextMatch = evaluateMediaQuery(mq.query, w, h, activeEnv.isTouch);
    if (nextMatch !== mq.matches) {
      mq.matches = nextMatch;
      const ev = createBasicEvent('change', {
        matches: nextMatch,
        media: mq.query,
        bubbles: false
      });
      mq.mql.dispatchEvent(ev);
    }
  }

  activeEnv.windowObj.dispatchEvent(createBasicEvent('resize'));
  if (prevOrientation !== nextOrientation) {
    activeEnv.windowObj.dispatchEvent(createBasicEvent('orientationchange'));
    activeEnv.screenObj.orientation.dispatchEvent(createBasicEvent('change'));
  }
}

export function flushAnimationFrames(nowMs: number = performance.now()): number {
  if (!activeEnv) return 0;
  const pending = Array.from(activeEnv.rafQueue.entries());
  activeEnv.rafQueue.clear();
  for (const [, cb] of pending) {
    cb(nowMs);
  }
  return pending.length;
}

export function getStorageSnapshot(
  kind: 'local' | 'session' = 'local'
): Record<string, string> {
  const storage =
    kind === 'session'
      ? activeEnv?.sessionStorageObj ?? (globalThis as any).sessionStorage
      : activeEnv?.localStorageObj ?? (globalThis as any).localStorage;
  if (!storage) return {};
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      const val = storage.getItem(key);
      if (val !== null) snapshot[key] = val;
    }
  }
  return snapshot;
}

export function restoreBrowserEnv(): void {
  if (!activeEnv) return;

  activeEnv.rafQueue.clear();
  activeEnv.mediaQueries.clear();

  for (const key of GLOBAL_KEYS) {
    const desc = activeEnv.savedDescriptors.get(key);
    if (desc) {
      Object.defineProperty(globalThis, key, desc);
    } else {
      delete (globalThis as Record<string, unknown>)[key];
    }
  }

  activeEnv = null;
}
