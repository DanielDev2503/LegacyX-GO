import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installBrowserEnv,
  restoreBrowserEnv,
  setViewport,
  getStorageSnapshot,
  flushAnimationFrames
} from './helpers/browserEnv';
import {
  installCapacitorMock,
  getCapacitorCalls,
  triggerBackButton,
  resetCapacitorMock,
  createCapacitorMockModules
} from './helpers/capacitorMock';
import {
  makePointerEvent,
  dispatchPointerSequence,
  gestureTap,
  gestureHold,
  gestureSwipe
} from './helpers/pointerSim';
import { createMockCanvas } from './helpers/canvasMock';
import {
  requireClientModule,
  clientSrcModuleExists,
  clientFileExists,
  readClientFile
} from './helpers/moduleLoader';
import { renderSvelteComponent, compileSvelteSource } from './helpers/svelteRender';
import {
  readAndroidManifest,
  readCapacitorConfig,
  readIndexHtml
} from './helpers/manifestInspect';

vi.mock('@capacitor/core', async () => {
  const { createCapacitorMockModules: createMocks } = await import('./helpers/capacitorMock');
  return createMocks().core;
});
vi.mock('@capacitor/app', async () => {
  const { createCapacitorMockModules: createMocks } = await import('./helpers/capacitorMock');
  return createMocks().app;
});
vi.mock('@capacitor/haptics', async () => {
  const { createCapacitorMockModules: createMocks } = await import('./helpers/capacitorMock');
  return createMocks().haptics;
});
vi.mock('@capacitor/screen-orientation', async () => {
  const { createCapacitorMockModules: createMocks } = await import('./helpers/capacitorMock');
  return createMocks().screenOrientation;
});
vi.mock('@capacitor/status-bar', async () => {
  const { createCapacitorMockModules: createMocks } = await import('./helpers/capacitorMock');
  return createMocks().statusBar;
});
vi.mock('@capacitor-community/keep-awake', async () => {
  const { createCapacitorMockModules: createMocks } = await import('./helpers/capacitorMock');
  return createMocks().keepAwake;
});

describe('E2E Test Harness Smoke Suite', () => {
  beforeEach(() => {
    installBrowserEnv('mobile-landscape');
    resetCapacitorMock();
  });

  afterEach(() => {
    restoreBrowserEnv();
    resetCapacitorMock();
  });

  it('browserEnv presets, setViewport events, RAF flushing, and localStorage isolation work deterministically', () => {
    // mobile-landscape initial preset
    expect(window.innerWidth).toBe(844);
    expect(window.innerHeight).toBe(390);
    expect(navigator.maxTouchPoints).toBeGreaterThan(0);
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    expect(screen.orientation.type).toBe('landscape-primary');

    localStorage.setItem('e2e_test_key', 'alpha');
    expect(getStorageSnapshot()).toEqual({ e2e_test_key: 'alpha' });

    const events: string[] = [];
    window.addEventListener('resize', () => events.push('resize'));
    window.addEventListener('orientationchange', () => events.push('orientationchange'));

    // Transition to portrait
    setViewport(390, 844, true);
    expect(window.innerWidth).toBe(390);
    expect(window.innerHeight).toBe(844);
    expect(screen.orientation.type).toBe('portrait-primary');
    expect(events).toEqual(['resize', 'orientationchange']);

    // Check RAF deterministic flush
    let rafTimestamp = 0;
    requestAnimationFrame((ts) => {
      rafTimestamp = ts;
    });
    expect(flushAnimationFrames(1234)).toBe(1);
    expect(rafTimestamp).toBe(1234);

    // Preset switching & storage isolation
    installBrowserEnv('desktop');
    expect(window.innerWidth).toBe(1280);
    expect(window.innerHeight).toBe(720);
    expect(navigator.maxTouchPoints).toBe(0);
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    expect(getStorageSnapshot()).toEqual({});

    installBrowserEnv('mobile-portrait');
    expect(window.innerWidth).toBe(390);
    expect(window.innerHeight).toBe(844);
    expect(screen.orientation.type).toBe('portrait-primary');

    installBrowserEnv('tablet-landscape');
    expect(window.innerWidth).toBe(1024);
    expect(window.innerHeight).toBe(768);
    expect(navigator.maxTouchPoints).toBeGreaterThan(0);

    restoreBrowserEnv();
    expect((globalThis as any).window).toBeUndefined();
  });

  it('capacitorMock simulates android, ios, and web, records plugin calls, and triggers backButton', async () => {
    installCapacitorMock('android');
    const { Capacitor } = await import('@capacitor/core');
    const { App } = await import('@capacitor/app');
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { KeepAwake } = await import('@capacitor-community/keep-awake');

    expect(Capacitor.isNativePlatform()).toBe(true);
    expect(Capacitor.getPlatform()).toBe('android');

    const backEvents: boolean[] = [];
    await App.addListener('backButton', ({ canGoBack }) => {
      backEvents.push(canGoBack);
    });
    await Haptics.impact({ style: ImpactStyle.Medium });
    await ScreenOrientation.lock({ orientation: 'landscape' });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.hide();
    await KeepAwake.keepAwake();

    expect(triggerBackButton(false)).toBe(1);
    expect(backEvents).toEqual([false]);

    const calls = getCapacitorCalls();
    expect(calls.map((c) => `${c.plugin}.${c.method}`)).toEqual([
      'App.addListener',
      'Haptics.impact',
      'ScreenOrientation.lock',
      'StatusBar.setStyle',
      'StatusBar.hide',
      'KeepAwake.keepAwake'
    ]);

    installCapacitorMock('ios');
    expect(Capacitor.isNativePlatform()).toBe(true);
    expect(Capacitor.getPlatform()).toBe('ios');
    expect(getCapacitorCalls()).toEqual([]);

    installCapacitorMock('web');
    expect(Capacitor.isNativePlatform()).toBe(false);
    expect(Capacitor.getPlatform()).toBe('web');

    // Direct factory smoke check
    const modules = createCapacitorMockModules();
    expect(modules.core.Capacitor.getPlatform()).toBe('web');
  });

  it('pointerSim builds and dispatches concurrent multitouch PointerEvents with distinct pointerIds', () => {
    const received: Array<{ type: string; pointerId: number; x: number; y: number }> = [];
    const target = {
      dispatchEvent(ev: any) {
        received.push({
          type: ev.type,
          pointerId: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY
        });
        return !ev.defaultPrevented;
      }
    };

    const leftThumb = gestureHold(target, { pointerId: 101, x: 110, y: 290 });
    const rightSwipe = gestureSwipe(target, {
      pointerId: 202,
      fromX: 700,
      fromY: 260,
      toX: 640,
      toY: 260,
      steps: 2,
      release: false
    });
    leftThumb.moveTo(150, 260);
    dispatchPointerSequence(target, [
      makePointerEvent('pointerup', {
        pointerId: 202,
        clientX: 640,
        clientY: 260,
        target
      })
    ]);
    leftThumb.release();
    gestureTap(target, { pointerId: 303, x: 760, y: 180 });

    expect(rightSwipe.length).toBe(3); // down + 2 moves
    expect(received.filter((e) => e.pointerId === 101).map((e) => e.type)).toEqual([
      'pointerdown',
      'pointermove',
      'pointerup'
    ]);
    expect(received.filter((e) => e.pointerId === 202).map((e) => e.type)).toEqual([
      'pointerdown',
      'pointermove',
      'pointermove',
      'pointerup'
    ]);
    expect(received.filter((e) => e.pointerId === 303).map((e) => e.type)).toEqual([
      'pointerdown',
      'pointerup'
    ]);
  });

  it('canvasMock records save, restore, translate, scale, fillRect, arc, fillText, and clip ops accurately', () => {
    const { canvas, ctx, ops } = createMockCanvas(844, 390);
    expect(canvas.getContext('2d')).toBe(ctx);
    expect(canvas.getContext('webgl')).toBeNull();

    ctx.save();
    ctx.translate(422, 195);
    ctx.scale(0.75, 0.75);
    ctx.beginPath();
    ctx.rect(-100, -50, 200, 100);
    ctx.clip();
    ctx.fillRect(-50, -25, 100, 50);
    ctx.strokeRect(-50, -25, 100, 50);
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillText('GOL', 10, 20);
    ctx.restore();

    expect(ops).toEqual([
      { op: 'save', args: [] },
      { op: 'translate', args: [422, 195] },
      { op: 'scale', args: [0.75, 0.75] },
      { op: 'beginPath', args: [] },
      { op: 'rect', args: [-100, -50, 200, 100] },
      { op: 'clip', args: [] },
      { op: 'fillRect', args: [-50, -25, 100, 50] },
      { op: 'strokeRect', args: [-50, -25, 100, 50] },
      { op: 'arc', args: [0, 0, 18, 0, Math.PI * 2, false] },
      { op: 'fillText', args: ['GOL', 10, 20, undefined] },
      { op: 'restore', args: [] }
    ]);
  });

  it('moduleLoader loads existing Svelte 5 runes module and throws descriptive error on missing module', async () => {
    expect(clientSrcModuleExists('ui/state/gameUI.svelte.ts')).toBe(true);
    expect(clientSrcModuleExists('controllers/DoesNotExist.ts')).toBe(false);
    expect(clientFileExists('index.html')).toBe(true);
    expect(readClientFile('index.html')).toContain('LegacyX-GO');

    const mod = await requireClientModule<{
      gameUI: { currentScreen: string; settings: Record<string, unknown> };
      SETTINGS_STORAGE_KEY: string;
    }>('ui/state/gameUI.svelte.ts');

    expect(mod.SETTINGS_STORAGE_KEY).toBe('haxball_settings_v1');
    expect(mod.gameUI).toBeDefined();
    expect(typeof mod.gameUI.currentScreen).toBe('string');

    await expect(requireClientModule('controllers/DoesNotExist.ts')).rejects.toThrow(
      /Missing required client module "src\/controllers\/DoesNotExist\.ts"/
    );
  });

  it('svelteRender SSR-renders Lobby.svelte and compiles its Svelte 5 source cleanly', async () => {
    const rendered = await renderSvelteComponent('ui/screens/Lobby.svelte');
    expect(rendered.html.length).toBeGreaterThan(100);
    expect(rendered.body).toBe(rendered.html);

    const compiled = compileSvelteSource('ui/screens/Lobby.svelte');
    expect(compiled.js.code).toContain('Lobby');
    expect(Array.isArray(compiled.warnings)).toBe(true);
  });

  it('manifestInspect parses AndroidManifest.xml, capacitor.config.ts, and index.html cleanly', () => {
    const manifest = readAndroidManifest();
    expect(manifest.raw).toContain('<manifest');
    expect(manifest.hasPermission('INTERNET')).toBe(true);
    expect(manifest.getMainActivity()?.name).toBe('.MainActivity');

    const cap = readCapacitorConfig();
    expect(cap.appId).toBe('com.legacyx.go');
    expect(cap.appName).toBe('LegacyX-GO');
    expect(cap.webDir).toBe('dist');
    expect(cap.plugins?.ScreenOrientation?.orientation).toBe('landscape');
    expect(cap.ios?.contentInset).toBe('never');

    const html = readIndexHtml();
    expect(html.title).toBe('LegacyX-GO');
    expect(html.viewportContent).toContain('viewport-fit=cover');
    expect(html.viewportDirectives['user-scalable']).toBe('no');
  });

  it('browserEnv evaluates compound matchMedia (and/comma/not) queries and invokes mql.onchange on viewport changes', () => {
    installBrowserEnv('mobile-portrait'); // 390x844, touch=true

    expect(window.matchMedia('(pointer: coarse) and (orientation: landscape)').matches).toBe(false);
    expect(window.matchMedia('(pointer: coarse) and (max-height: 500px)').matches).toBe(false);
    expect(window.matchMedia('(pointer: coarse) and (orientation: portrait)').matches).toBe(true);
    expect(window.matchMedia('(max-width: 500px), (orientation: landscape)').matches).toBe(true);
    expect(window.matchMedia('not (orientation: landscape)').matches).toBe(true);

    const compoundMql = window.matchMedia('(pointer: coarse) and (orientation: landscape)');
    const onchangeEvents: Array<{ matches: boolean; media: string }> = [];
    const listenerEvents: Array<{ matches: boolean; media: string }> = [];
    compoundMql.onchange = (ev: any) => {
      onchangeEvents.push({ matches: ev.matches, media: ev.media });
    };
    compoundMql.addEventListener('change', (ev: any) => {
      listenerEvents.push({ matches: ev.matches, media: ev.media });
    });

    setViewport(500, 800, true);
    expect(window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches).toBe(false);
    expect(window.matchMedia('(max-width: 500px), (orientation: landscape)').matches).toBe(true);
    expect(onchangeEvents).toEqual([]);

    setViewport(844, 390, true);
    expect(compoundMql.matches).toBe(true);
    expect(window.matchMedia('(pointer: coarse) and (max-height: 500px)').matches).toBe(true);
    expect(window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches).toBe(true);
    expect(onchangeEvents).toEqual([
      { matches: true, media: '(pointer: coarse) and (orientation: landscape)' }
    ]);
    expect(listenerEvents).toEqual([
      { matches: true, media: '(pointer: coarse) and (orientation: landscape)' }
    ]);

    setViewport(600, 700, false);
    expect(window.matchMedia('(max-width: 500px), (orientation: landscape)').matches).toBe(false);
    expect(window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches).toBe(false);
    expect(window.matchMedia('screen and (pointer: fine) and (min-width: 500px)').matches).toBe(true);
    expect(onchangeEvents).toEqual([
      { matches: true, media: '(pointer: coarse) and (orientation: landscape)' },
      { matches: false, media: '(pointer: coarse) and (orientation: landscape)' }
    ]);

    // Unchanged state (still false) must not re-fire onchange
    setViewport(1280, 720, false);
    expect(onchangeEvents.length).toBe(2);
    expect(listenerEvents.length).toBe(2);
  });

  it('browserEnv + pointerSim support DOM bubbling, capture phase, currentTarget vs target, stopPropagation, and stopImmediatePropagation', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    document.body.appendChild(parent);

    const trace: Array<{ node: string; targetIsChild: boolean; currentTargetMatches: boolean }> = [];
    const record = (name: string, expectedCurrent: unknown) => (ev: any) => {
      trace.push({
        node: name,
        targetIsChild: ev.target === child,
        currentTargetMatches: ev.currentTarget === expectedCurrent
      });
    };

    parent.addEventListener('pointerdown', record('parent:capture', parent), true);
    child.addEventListener('pointerdown', record('child', child));
    parent.addEventListener('pointerdown', record('parent', parent));
    document.body.addEventListener('pointerdown', record('body', document.body));
    document.documentElement.addEventListener('pointerdown', record('html', document.documentElement));
    document.addEventListener('pointerdown', record('document', document));
    window.addEventListener('pointerdown', record('window', window));

    const [downEv] = gestureTap(child, { pointerId: 10, x: 50, y: 50 });
    expect(trace).toEqual([
      { node: 'parent:capture', targetIsChild: true, currentTargetMatches: true },
      { node: 'child', targetIsChild: true, currentTargetMatches: true },
      { node: 'parent', targetIsChild: true, currentTargetMatches: true },
      { node: 'body', targetIsChild: true, currentTargetMatches: true },
      { node: 'html', targetIsChild: true, currentTargetMatches: true },
      { node: 'document', targetIsChild: true, currentTargetMatches: true },
      { node: 'window', targetIsChild: true, currentTargetMatches: true }
    ]);
    expect(downEv.target).toBe(child);
    expect(downEv.currentTarget).toBeNull();

    // gestureSwipe also bubbles intermediate pointermove and final pointerup events
    const swipedTypes: string[] = [];
    const swipeParent = document.createElement('div');
    const swipeChild = document.createElement('div');
    swipeParent.appendChild(swipeChild);
    document.body.appendChild(swipeParent);
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      swipeParent.addEventListener(type, (ev: any) => {
        if (ev.target === swipeChild && ev.currentTarget === swipeParent) {
          swipedTypes.push(ev.type);
        }
      });
    }
    gestureSwipe(swipeChild, { pointerId: 11, fromX: 10, fromY: 10, toX: 30, toY: 10, steps: 2 });
    expect(swipedTypes).toEqual(['pointerdown', 'pointermove', 'pointermove', 'pointerup']);

    // stopPropagation stops ancestors but allows sibling listeners on same element
    const stopChild = document.createElement('div');
    const stopParent = document.createElement('div');
    stopParent.appendChild(stopChild);
    document.body.appendChild(stopParent);
    const stopLog: string[] = [];
    stopChild.addEventListener('pointerdown', (ev: any) => {
      stopLog.push('child-1');
      ev.stopPropagation();
    });
    stopChild.addEventListener('pointerdown', () => stopLog.push('child-2'));
    stopParent.addEventListener('pointerdown', () => stopLog.push('parent'));
    gestureTap(stopChild, { pointerId: 12, x: 10, y: 10 });
    expect(stopLog).toEqual(['child-1', 'child-2']);

    // stopImmediatePropagation stops remaining listeners on same element AND ancestors
    const immChild = document.createElement('div');
    const immParent = document.createElement('div');
    immParent.appendChild(immChild);
    document.body.appendChild(immParent);
    const immLog: string[] = [];
    immChild.addEventListener('pointerdown', (ev: any) => {
      immLog.push('imm-1');
      ev.stopImmediatePropagation();
    });
    immChild.addEventListener('pointerdown', () => immLog.push('imm-2'));
    immParent.addEventListener('pointerdown', () => immLog.push('imm-parent'));
    gestureTap(immChild, { pointerId: 13, x: 10, y: 10 });
    expect(immLog).toEqual(['imm-1']);
  });

  it('browserEnv removes { handleEvent } listener objects and respects capture/once options', () => {
    const el = document.createElement('button');
    let count = 0;
    const listenerObj = {
      handleEvent() {
        count += 1;
      }
    };

    el.addEventListener('click', listenerObj);
    el.click();
    expect(count).toBe(1);

    el.removeEventListener('click', listenerObj);
    el.click();
    expect(count).toBe(1);

    // Capture listener is tracked independently from bubble listener
    let captureCount = 0;
    const captureObj = {
      handleEvent() {
        captureCount += 1;
      }
    };
    el.addEventListener('click', captureObj, { capture: true });
    el.removeEventListener('click', captureObj); // capture: false -> should not remove capture: true
    el.click();
    expect(captureCount).toBe(1);

    el.removeEventListener('click', captureObj, { capture: true });
    el.click();
    expect(captureCount).toBe(1);

    // once: true with { handleEvent }
    let onceCount = 0;
    const onceObj = {
      handleEvent() {
        onceCount += 1;
      }
    };
    el.addEventListener('click', onceObj, { once: true });
    el.click();
    el.click();
    expect(onceCount).toBe(1);
  });

  it('browserEnv supports requestFullscreen() on arbitrary createElement nodes and exitFullscreen()', async () => {
    const detachedDiv = document.createElement('div');
    expect(typeof detachedDiv.requestFullscreen).toBe('function');

    let docChanges = 0;
    let elChanges = 0;
    document.addEventListener('fullscreenchange', () => {
      docChanges += 1;
    });
    detachedDiv.addEventListener('fullscreenchange', () => {
      elChanges += 1;
    });

    await detachedDiv.requestFullscreen();
    expect(document.fullscreenElement).toBe(detachedDiv);
    expect(docChanges).toBe(1);
    expect(elChanges).toBe(1);

    await document.exitFullscreen();
    expect(document.fullscreenElement).toBeNull();
    expect(docChanges).toBe(2);

    // Connected element bubbles fullscreenchange to document exactly once
    const connectedDiv = document.createElement('div');
    document.body.appendChild(connectedDiv);
    let connectedElChanges = 0;
    connectedDiv.addEventListener('fullscreenchange', () => {
      connectedElChanges += 1;
    });

    await connectedDiv.requestFullscreen();
    expect(document.fullscreenElement).toBe(connectedDiv);
    expect(connectedElChanges).toBe(1);
    expect(docChanges).toBe(3);

    await document.exitFullscreen();
    expect(document.fullscreenElement).toBeNull();
    expect(docChanges).toBe(4);
  });

  it('browserEnv fixes same-orientation setViewport, CustomEvent.stopImmediatePropagation, connected exitFullscreen, in-flight listener removal, appendChild reparenting, nested paren matchMedia, and mql.onchange guard', async () => {
    // 1. Same-orientation resize (844x390 -> 1024x768) must NOT emit orientationchange or screen.orientation change
    installBrowserEnv('mobile-landscape');
    let orientationEvents = 0;
    let screenOrientationEvents = 0;
    let resizeEvents = 0;
    window.addEventListener('resize', () => {
      resizeEvents += 1;
    });
    window.addEventListener('orientationchange', () => {
      orientationEvents += 1;
    });
    screen.orientation.addEventListener('change', () => {
      screenOrientationEvents += 1;
    });
    setViewport(1024, 768, true);
    expect(resizeEvents).toBe(1);
    expect(orientationEvents).toBe(0);
    expect(screenOrientationEvents).toBe(0);

    // 2. Native CustomEvent.stopImmediatePropagation() halts sibling & ancestor listeners
    const natParent = document.createElement('div');
    const natChild = document.createElement('button');
    natParent.appendChild(natChild);
    document.body.appendChild(natParent);
    const natLog: string[] = [];
    natChild.addEventListener('custom-imm', (ev: any) => {
      natLog.push('nat-1');
      ev.stopImmediatePropagation();
    });
    natChild.addEventListener('custom-imm', () => natLog.push('nat-2'));
    natParent.addEventListener('custom-imm', () => natLog.push('nat-parent'));
    natChild.dispatchEvent(new CustomEvent('custom-imm', { bubbles: true, cancelable: true }));
    expect(natLog).toEqual(['nat-1']);

    // 3. document.exitFullscreen() bubbles from connected fullscreenElement through ancestors
    const fsParent = document.createElement('div');
    const fsChild = document.createElement('div');
    fsParent.appendChild(fsChild);
    document.body.appendChild(fsParent);
    await fsChild.requestFullscreen();
    const exitTrace: string[] = [];
    fsChild.addEventListener('fullscreenchange', () => exitTrace.push('child'));
    fsParent.addEventListener('fullscreenchange', () => exitTrace.push('parent'));
    document.body.addEventListener('fullscreenchange', () => exitTrace.push('body'));
    document.addEventListener('fullscreenchange', () => exitTrace.push('document'));
    await document.exitFullscreen();
    expect(exitTrace).toEqual(['child', 'parent', 'body', 'document']);

    // 4. In-flight removeEventListener skips removed sibling listener in the same phase
    const rmEl = document.createElement('button');
    const rmLog: string[] = [];
    const fn2 = () => rmLog.push('fn2');
    const fn1 = () => {
      rmLog.push('fn1');
      rmEl.removeEventListener('click', fn2);
    };
    rmEl.addEventListener('click', fn1);
    rmEl.addEventListener('click', fn2);
    rmEl.click();
    expect(rmLog).toEqual(['fn1']);

    // 5. appendChild detaches child from its previous parent
    const parentA = document.createElement('div');
    const parentB = document.createElement('div');
    const moving = document.createElement('span');
    parentA.appendChild(moving);
    expect(parentA.children.length).toBe(1);
    parentB.appendChild(moving);
    expect(parentA.children.length).toBe(0);
    expect(parentB.children).toEqual([moving]);
    expect(moving.parentNode).toBe(parentB);

    // 6. Nested parenthesized `and` queries in matchMedia
    setViewport(844, 390, true);
    const nestedQuery = '(min-width: 768px) and ((pointer: coarse) and (orientation: landscape))';
    expect(window.matchMedia(nestedQuery).matches).toBe(true);
    setViewport(844, 390, false);
    expect(window.matchMedia(nestedQuery).matches).toBe(false);
    setViewport(700, 390, true);
    expect(window.matchMedia(nestedQuery).matches).toBe(false);

    // 7. mql.onchange ignores non-'change' events
    const mql = window.matchMedia('(pointer: coarse)');
    const mqlTypes: string[] = [];
    mql.onchange = (ev: any) => mqlTypes.push(ev.type);
    mql.dispatchEvent(new Event('other'));
    expect(mqlTypes).toEqual([]);
    mql.dispatchEvent(new Event('change'));
    expect(mqlTypes).toEqual(['change']);
  });

  it('canvasMock saves/restores full 2D state stack & transform matrix, clones setLineDash args, and implements getTransform()', () => {
    const { ctx, ops } = createMockCanvas(844, 390);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#112233';
    ctx.strokeStyle = '#445566';
    ctx.lineWidth = 3;
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.setLineDash([4, 2]);
    ctx.translate(10, 20);
    ctx.scale(2, 3);

    const beforeTransform = ctx.getTransform();
    expect(beforeTransform).toEqual({
      a: 2,
      b: 0,
      c: 0,
      d: 3,
      e: 10,
      f: 20,
      m11: 2,
      m12: 0,
      m21: 0,
      m22: 3,
      m41: 10,
      m42: 20
    });

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ff0000';
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 8;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    const scratchDash = [1, 5];
    ctx.setLineDash(scratchDash);
    scratchDash[0] = 999; // Must not mutate recorded op or internal dash
    ctx.rotate(Math.PI / 2);
    ctx.translate(5, 6);
    expect(ctx.getTransform().e).not.toBe(10);

    ctx.restore();
    expect(ctx.globalAlpha).toBe(0.9);
    expect(ctx.fillStyle).toBe('#112233');
    expect(ctx.strokeStyle).toBe('#445566');
    expect(ctx.lineWidth).toBe(3);
    expect(ctx.font).toBe('16px monospace');
    expect(ctx.textAlign).toBe('center');
    expect(ctx.getLineDash()).toEqual([4, 2]);
    expect(ctx.getTransform()).toEqual(beforeTransform);

    // Extra restore() underflow is a safe no-op
    ctx.restore();
    expect(ctx.globalAlpha).toBe(0.9);

    const dashOps = ops.filter((o) => o.op === 'setLineDash');
    expect(dashOps.map((o) => o.args[0])).toEqual([
      [4, 2],
      [1, 5]
    ]);
  });

  it('manifestInspect ignores XML/HTML comments and <activity-alias>, supports single-quoted attributes, and collects all <style> blocks', async () => {
    vi.resetModules();
    vi.doMock('./helpers/moduleLoader', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./helpers/moduleLoader')>();
      return {
        ...actual,
        readClientFile(relPath: string) {
          if (relPath === 'android/app/src/main/AndroidManifest.xml') {
            return `
              <manifest>
                <!-- <uses-permission android:name="android.permission.CAMERA" /> -->
                <uses-permission android:name='android.permission.VIBRATE' />
                <application>
                  <!-- <activity android:name=".CommentedActivity" /> -->
                  <activity-alias android:name='.AliasActivity' android:targetActivity='.MainActivity' />
                  <activity android:name='.MainActivity' android:screenOrientation='sensorLandscape' android:exported='true' />
                </application>
              </manifest>
            `;
          }
          if (relPath === 'index.html') {
            return `
              <html>
                <head>
                  <!-- <title>Fake</title> -->
                  <title>RealTitle</title>
                  <!-- <meta name="viewport" content="width=100" /> -->
                  <meta name='viewport' content='width=device-width, viewport-fit=cover' />
                  <style>body { margin: 0; }</style>
                  <!-- <style>.commented { color: red; }</style> -->
                  <style>.hud { opacity: 1; }</style>
                </head>
              </html>
            `;
          }
          return actual.readClientFile(relPath);
        }
      };
    });

    try {
      const { readAndroidManifest: readMockManifest, readIndexHtml: readMockHtml } = await import(
        './helpers/manifestInspect'
      );
      const manifest = readMockManifest();
      expect(manifest.hasPermission('CAMERA')).toBe(false);
      expect(manifest.hasPermission('VIBRATE')).toBe(true);
      expect(manifest.activities).toHaveLength(1);
      expect(manifest.getMainActivity()?.name).toBe('.MainActivity');
      expect(manifest.getMainActivity()?.screenOrientation).toBe('sensorLandscape');

      const html = readMockHtml();
      expect(html.title).toBe('RealTitle');
      expect(html.viewportDirectives['viewport-fit']).toBe('cover');
      expect(html.viewportDirectives['width']).toBe('device-width');
      expect(html.inlineStyle).toContain('body { margin: 0; }');
      expect(html.inlineStyle).toContain('.hud { opacity: 1; }');
      expect(html.inlineStyle).not.toContain('.commented');
    } finally {
      vi.doUnmock('./helpers/moduleLoader');
      vi.resetModules();
    }
  });

  it('capacitorMock deep-clones recorded call args and preserves -secondary orientations; moduleLoader resolves extensionless .svelte.ts', async () => {
    installCapacitorMock('android');
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');

    const impactOpts = { style: ImpactStyle.Heavy };
    await Haptics.impact(impactOpts);
    (impactOpts as { style: string }).style = 'MUTATED';

    const firstSnapshot = getCapacitorCalls();
    expect(firstSnapshot[0].args[0]).toEqual({ style: ImpactStyle.Heavy });
    (firstSnapshot[0].args[0] as { style: string }).style = 'MUTATED_AGAIN';
    expect(getCapacitorCalls()[0].args[0]).toEqual({ style: ImpactStyle.Heavy });

    await ScreenOrientation.lock({ orientation: 'landscape-secondary' });
    expect((await ScreenOrientation.orientation()).type).toBe('landscape-secondary');
    await ScreenOrientation.lock({ orientation: 'portrait-secondary' });
    expect((await ScreenOrientation.orientation()).type).toBe('portrait-secondary');

    expect(clientSrcModuleExists('ui/state/gameUI.svelte')).toBe(true);
    const mod = await requireClientModule<{ SETTINGS_STORAGE_KEY: string }>('ui/state/gameUI.svelte');
    expect(mod.SETTINGS_STORAGE_KEY).toBe('haxball_settings_v1');
  });
});
