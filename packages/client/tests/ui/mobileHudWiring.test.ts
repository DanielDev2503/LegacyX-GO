import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import { compile } from 'svelte/compiler';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';
import InGameHUD from '../../src/ui/hud/InGameHUD.svelte';

const CLIENT_SRC = resolve(__dirname, '../../src');

function readClientFile(relPath: string): string {
  return readFileSync(resolve(CLIENT_SRC, relPath), 'utf8');
}

describe('Mobile HUD & App Wiring (Phase 5)', () => {
  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.fsmPhase = 'PLAYING';
    gameUI.matchPhase = 2;
    gameUI.activeModal = 'NONE';
    gameUI.overlayStack = [];
    gameUI.isHudEditorOpen = false;
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.isPracticeMode = false;
    gameUI.localPlayerId = 1;
    gameUI.nickname = 'Player1';
    gameUI.activeGoalScorerId = null;
    gameUI.onSkipGoalReplay = null;
    gameUI.settings.mobileControlsEnabled = 'auto';
    gameUI.setViewportEnvironment(1280, 720, false, false, false, false);
  });

  afterEach(() => {
    gameUI.isHudEditorOpen = false;
    gameUI.activeModal = 'NONE';
    gameUI.activeGoalScorerId = null;
    gameUI.settings.mobileControlsEnabled = 'auto';
    gameUI.setViewportEnvironment(1280, 720, false, false, false, false);
  });

  it('keeps desktop InGameHUD behavior untouched when isMobileLayout is false', () => {
    gameUI.matchPhase = 3.5;
    gameUI.activeGoalScorerId = 1;

    const { html } = render(InGameHUD);
    expect(gameUI.isMobileLayout).toBe(false);
    expect(html).not.toContain('hud-root is-mobile');
    expect(html).toContain('hud-chat-container');
    expect(html).not.toContain('mobile-controls-overlay');
    expect(html).not.toContain('id="btn-mobile-chat-toggle"');
    expect(html).not.toContain('id="btn-hud-pause"');
    expect(html).toContain('Pulsa ENTER para saltar');
  });

  it('mounts MobileControlsOverlay, collapsed chat, top-bar pause, and touch skip button on mobile layout', () => {
    gameUI.setViewportEnvironment(844, 390, true, false, true, true);
    expect(gameUI.isMobileLayout).toBe(true);

    // 1. Default mobile HUD while playing
    const { html: playHtml } = render(InGameHUD);
    expect(playHtml).toContain('is-mobile');
    expect(playHtml).toContain('mobile-controls-overlay');
    expect(playHtml).toContain('mobile-joystick-zone');
    expect(playHtml).toContain('mobile-action-cluster');
    expect(playHtml).toContain('id="btn-mobile-chat-toggle"');
    expect(playHtml).not.toContain('hud-chat-container');
    expect(playHtml).toContain('id="btn-hud-pause"');

    // 2. Modal open hides overlay unless HUD editor is active
    gameUI.activeModal = 'SETTINGS';
    const { html: settingsHtml } = render(InGameHUD);
    expect(settingsHtml).not.toContain('mobile-controls-overlay');

    gameUI.isHudEditorOpen = true;
    const { html: editorHtml } = render(InGameHUD);
    expect(editorHtml).toContain('mobile-controls-overlay');
    gameUI.isHudEditorOpen = false;
    gameUI.activeModal = 'NONE';

    // 3. Goal replay skip button renders touch copy when scorer
    gameUI.matchPhase = 3.5;
    gameUI.activeGoalScorerId = 1;
    const { html: replayHtml } = render(InGameHUD);
    expect(replayHtml).toContain('id="btn-hud-skip-replay"');
    expect(replayHtml).toContain('Saltar repetición ⏭');

    // 4. Pause button hides for non-host non-admin or in STOP phase
    gameUI.matchPhase = 2;
    gameUI.isHost = false;
    gameUI.isAdmin = false;
    const { html: guestHtml } = render(InGameHUD);
    expect(guestHtml).not.toContain('id="btn-hud-pause"');

    gameUI.isHost = true;
    gameUI.matchPhase = 0;
    const { html: stopHtml } = render(InGameHUD);
    expect(stopHtml).not.toContain('id="btn-hud-pause"');
  });

  it('compiles mobile-wired Svelte 5 components cleanly and verifies App.svelte + InGameHUD.svelte integration contracts', () => {
    const svelteTargets = [
      'ui/hud/InGameHUD.svelte',
      'ui/hud/MobileControlsOverlay.svelte'
    ];
    for (const rel of svelteTargets) {
      const code = readClientFile(rel);
      const result = compile(code, { filename: rel, runes: true });
      expect(result.js.code.length).toBeGreaterThan(100);
    }

    const appSrc = readClientFile('App.svelte');
    expect(appSrc).toContain('mobileTouchController.setMinimapRenderer');
    expect(appSrc).toContain('mobileTouchController.sampleInput');
    expect(appSrc).toContain('mobileTouchController.resetAll');
    expect(appSrc).toContain('mobileTouchController.isHoldingMinimap');
    expect(appSrc).not.toContain('dispatchImmediateGuestInput');
    expect(appSrc).toContain('renderer.isMobileLayout');
    expect(appSrc).toContain('renderer.getMobileAutoZoom()');
    expect(appSrc).toContain('renderer.mobileExclusionZones');
    expect(appSrc).toContain('gameUI.localStamina');
    expect(appSrc).toContain('gameUI.localDashCooldown');
    expect(appSrc).toContain('gameUI.localDashMaxCooldown');
    expect(appSrc).toContain('gameUI.localIsDashing');
    expect(appSrc).toContain('gameUI.localIsTurbo');
    expect(appSrc).toContain('gameUI.onSkipGoalReplay');
    expect(appSrc).toContain('mobileHaptics');
    expect(appSrc).toContain('!gameUI.isHudEditorOpen');

    const hudSrc = readClientFile('ui/hud/InGameHUD.svelte');
    const pillCss = hudSrc.match(/\.goal-replay-pill-bar\s*\{[\s\S]*?\}/);
    expect(pillCss?.[0] ?? '').toContain('pointer-events: none;');
    expect(hudSrc).toMatch(/\.hud-root\.is-mobile\s+\.hud-telemetry-corner\s*\{[\s\S]*?top:/);
    expect(hudSrc).toMatch(/\.hud-root\.is-mobile\s+\.hud-telemetry-corner\s*\{[\s\S]*?right:/);
    expect(hudSrc).toContain('id="btn-mobile-chat-close"');
    expect(hudSrc).toContain('touch-action: pan-y');
    expect(hudSrc).toContain('chatInputEl?.blur()');
  });
});
