import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import { gameUI, type PlayerStatEntry } from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import { matchRecorder } from '../../src/recorder/MatchRecorder.svelte.js';
import InGameHUD from '../../src/ui/hud/InGameHUD.svelte';
import ReplayViewerModal from '../../src/ui/modals/ReplayViewerModal.svelte';
import SettingsModal from '../../src/ui/modals/SettingsModal.svelte';
import PostMatchCarousel from '../../src/ui/hud/PostMatchCarousel.svelte';

const SRC_ROOT = resolve(__dirname, '../../src/ui');

function readUiFile(relPath: string): string {
  return readFileSync(resolve(SRC_ROOT, relPath), 'utf8');
}

function makePlayerStat(overrides: Partial<PlayerStatEntry> & { nickname: string; team: 'red' | 'blue' }): PlayerStatEntry {
  return {
    goals: 0,
    assists: 0,
    saves: 0,
    touches: 12,
    shotsOnTarget: 2,
    shotsTotal: 4,
    passes: 6,
    points: 100,
    isMvp: false,
    ...overrides
  };
}

function makeFakeJwt(expOffsetSec = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSec })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('UI Fixes: Replay Modal Overlay, Golden Goal Ball Icon, Goal Banner, Ball Skins & HUD/PostMatch Parity', () => {
  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.fsmPhase = 'PLAYING';
    gameUI.matchPhase = 2;
    gameUI.activeModal = 'NONE';
    gameUI.overlayStack = [];
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.isPracticeMode = false;
    gameUI.activeRoomMode = 'casual';
    gameUI.activeRoomName = 'Arena Cyber-Pitch';
    gameUI.matchId = 'TEST01';
    gameUI.nickname = 'CyberHost';
    gameUI.localPlayerId = 1;
    gameUI.timeLimit = 3;
    gameUI.matchTimerSeconds = 0;
    gameUI.redScore = 2;
    gameUI.blueScore = 1;
    gameUI.isGoldenGoal = false;
    gameUI.currentBanner = null;
    gameUI.currentSlidingEvent = null;
    (gameUI as any).slidingEventQueue = [];
    gameUI.showPostMatchCarousel = false;
    gameUI.postMatchSlide = 0;
    gameUI.redTeamStats = [];
    gameUI.blueTeamStats = [];
    gameUI.lastMatchStats = null;
    gameUI.mvp = null;
    gameUI.rosterPlayers = [
      { id: 1, name: 'CyberHost', nickname: 'CyberHost', team: 'red', avatar: 'CH', isHost: true },
      { id: 2, name: 'Striker', nickname: 'Striker', team: 'blue', avatar: 'ST' }
    ];
    gameUI.players = [...gameUI.rosterPlayers];
    gameUI.activeSettingsTab = 'controls';
    gameUI.settings.ballMode = 'texture';
    gameUI.settings.ballSkin = 'classic';

    userProfile.isAuthenticated = false;
    userProfile.isGuest = true;
    userProfile.id = '';
    userProfile.username = '';
    userProfile.displayName = '';
    userProfile.nameChanged = false;
    userProfile.email = '';
    userProfile.jwt = '';
    userProfile.refreshToken = '';
    userProfile.role = 'player';
    userProfile.isVerified = false;
    userProfile.elo = 1000;
    userProfile.userReplays = [];
    userProfile.authError = null;
    userProfile.stats = {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      mvpCount: 0
    };

    if (matchRecorder.isRecording) {
      matchRecorder.stop();
    }
    matchRecorder.dismissPrompt();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Item 4: ReplayViewerModal captures pointer events cleanly and prevents click leaks', () => {
    it('sets pointer-events: auto on .modal-backdrop and .replay-shell while keeping .hud-logical-layer pointer-events: none', () => {
      const replaySrc = readUiFile('modals/ReplayViewerModal.svelte');

      const backdropMatch = replaySrc.match(/\.modal-backdrop\s*\{[\s\S]*?\}/);
      expect(backdropMatch, '.modal-backdrop CSS block must exist').not.toBeNull();
      expect(backdropMatch![0]).toMatch(/pointer-events:\s*auto\s*;/);
      expect(backdropMatch![0]).toMatch(/z-index:\s*(9\d{2}|[1-9]\d{3,})\s*;/);

      const shellMatch = replaySrc.match(/\.replay-shell\s*\{[\s\S]*?\}/);
      expect(shellMatch, '.replay-shell CSS block must exist').not.toBeNull();
      expect(shellMatch![0]).toMatch(/pointer-events:\s*auto\s*;/);

      const hudLayerMatch = replaySrc.match(/\.hud-logical-layer\s*\{[\s\S]*?\}/);
      expect(hudLayerMatch, '.hud-logical-layer CSS block must exist').not.toBeNull();
      expect(hudLayerMatch![0]).toMatch(/pointer-events:\s*none\s*;/);
    });

    it('renders dialog backdrop, interactive controls, and contains zero backdrop-filter: blur', () => {
      const { html } = render(ReplayViewerModal);
      expect(html).toContain('class="modal-backdrop');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('close-btn');

      const ownedComponents = [
        'hud/InGameHUD.svelte',
        'modals/ReplayViewerModal.svelte',
        'modals/SettingsModal.svelte',
        'hud/PostMatchCarousel.svelte'
      ];
      for (const relPath of ownedComponents) {
        expect(readUiFile(relPath), `${relPath} must not use backdrop-filter: blur`).not.toMatch(
          /backdrop-filter\s*:\s*blur/i
        );
      }
    });
  });

  describe('Item 2: Golden Goal metallic gold ball SVG and icon-only replay button while keeping 30s warning glow', () => {
    it('InGameHUD keeps 30s warning pulse and renders ONLY metallic gold ball SVG (matching ballDesigns gold) when Golden Goal activates', () => {
      gameUI.timeLimit = 3;
      gameUI.matchTimerSeconds = 155; // 25s remaining
      gameUI.isGoldenGoal = false;

      const { html: warnHtml } = render(InGameHUD);
      expect(warnHtml).toContain('is-warning-30s');

      gameUI.isGoldenGoal = true;
      const { html: ggHtml } = render(InGameHUD);
      expect(ggHtml).toContain('glowing-ball-svg');
      expect(ggHtml).toContain('#FEF9C3');
      expect(ggHtml).toContain('#FACC15');
      expect(ggHtml).toContain('#CA8A04');
      expect(ggHtml).toContain('#713F12');
      expect(ggHtml).toContain('#451A03');
      expect(ggHtml).toContain('#854D0E');
      expect(ggHtml).not.toContain('golden-goal-floating-badge');
      expect(ggHtml).not.toMatch(/GOL DE ORO/i);

      const hudSrc = readUiFile('hud/InGameHUD.svelte');
      const ballCssMatch = hudSrc.match(/\.glowing-ball-svg\s*\{[\s\S]*?\}/);
      expect(ballCssMatch).not.toBeNull();
      expect(ballCssMatch![0]).not.toMatch(/border\s*:/);
      expect(ballCssMatch![0]).not.toMatch(/background\s*:/);
      expect(ballCssMatch![0]).toMatch(/drop-shadow\(/);
    });

    it('InGameHUD #btn-hud-replays renders icon-only play SVG without visible label span', () => {
      const { html } = render(InGameHUD);
      expect(html).toContain('id="btn-hud-replays"');
      expect(html).toContain('class="replay-btn-svg');
      expect(html).toContain('title="Ver Repeticiones guardadas"');
      expect(html).toContain('aria-label="Ver Repeticiones"');
      expect(html).not.toContain('replay-label');
      expect(html).not.toContain('>Ver Repeticiones<');
    });

    it('ReplayViewerModal keeps warning-pulse and uses metallic gold ball SVG without rectangular card or GOL DE ORO text', () => {
      const replaySrc = readUiFile('modals/ReplayViewerModal.svelte');

      expect(replaySrc).toContain('class:warning-pulse={hudIsWarning}');
      expect(replaySrc).not.toContain('golden-goal-badge');
      expect(replaySrc).not.toContain('class="gold-ball"');
      expect(replaySrc).not.toMatch(/GOL DE ORO/i);

      expect(replaySrc).toContain('#FEF9C3');
      expect(replaySrc).toContain('#FACC15');
      expect(replaySrc).toContain('#CA8A04');
      expect(replaySrc).toContain('#713F12');
      expect(replaySrc).toContain('#451A03');
      expect(replaySrc).toContain('#854D0E');
    });
  });

  describe('Item 5: Goal banner keeps team, scorer, assister & ball speed (km/h) and removes Power/Curve pills', () => {
    it('InGameHUD GOAL banner keeps speedKmh, scorer & assister while omitting POTENCIA +30 / EFECTO +30 pills', () => {
      gameUI.applyMatchBanner({
        kind: 'GOAL',
        scoringTeam: 'red',
        scorerName: 'Striker',
        assisterName: 'CyberHost',
        isOwnGoal: false,
        speedKmh: 128,
        isPower: true,
        isCurve: true
      });

      const { html } = render(InGameHUD);
      expect(html).toContain('id="hud-banner-goal"');
      expect(html).toContain('¡GOOOOL DE');
      expect(html).toContain('Striker');
      expect(html).toContain('CyberHost');
      expect(html).toContain('128 km/h');
      expect(html).toContain('goal-speed-pill');
      expect(html).not.toContain('POTENCIA +30');
      expect(html).not.toContain('EFECTO +30');
      expect(html).not.toContain('goal-bonus-pill');
    });

    it('InGameHUD own-goal banner keeps Autogol credit & speed without power/curve bonus pills', () => {
      gameUI.applyMatchBanner({
        kind: 'GOAL',
        scoringTeam: 'blue',
        scorerName: 'Keeper',
        isOwnGoal: true,
        speedKmh: 94,
        isPower: true,
        isCurve: true
      });

      const { html } = render(InGameHUD);
      expect(html).toContain('Autogol de:');
      expect(html).toContain('Keeper');
      expect(html).toContain('94 km/h');
      expect(html).not.toContain('POTENCIA +30');
      expect(html).not.toContain('EFECTO +30');
    });

    it('ReplayViewerModal GOAL banner keeps speed chip while omitting POTENTE / EFECTO chips', () => {
      const replaySrc = readUiFile('modals/ReplayViewerModal.svelte');
      expect(replaySrc).toContain('tele-chip speed');
      expect(replaySrc).toContain('km/h');
      expect(replaySrc).not.toContain('tele-chip power');
      expect(replaySrc).not.toContain('tele-chip curve');
      expect(replaySrc).not.toContain('>POTENTE<');
      expect(replaySrc).not.toContain('>EFECTO<');
    });
  });

  describe('Item 7: Ball customization removes "Sólido" from "Diseño" while preserving "Color sólido"', () => {
    it('renders Clásico, Retro, Neón, Cyber, Oro under Diseño and omits Sólido pattern card', () => {
      gameUI.activeSettingsTab = 'video';
      gameUI.settings.ballMode = 'texture';

      const { html } = render(SettingsModal);
      expect(html).toContain('Diseño');
      expect(html).toContain('Color sólido');

      const gridStart = html.indexOf('class="ball-cards-grid');
      expect(gridStart).toBeGreaterThan(-1);
      const gridEnd = html.indexOf('<!--]-->', gridStart);
      const gridHtml = html.slice(gridStart, gridEnd > gridStart ? gridEnd : gridStart + 2500);

      expect(gridHtml).toContain('Clásico');
      expect(gridHtml).toContain('Retro');
      expect(gridHtml).toContain('Neón');
      expect(gridHtml).toContain('Cyber');
      expect(gridHtml).toContain('Oro');
      expect(gridHtml).not.toContain('Sólido');

      const settingsSrc = readUiFile('modals/SettingsModal.svelte');
      expect(settingsSrc).not.toContain("ballSkin = 'solid'");
      expect(settingsSrc).toMatch(/\.ball-cards-grid\s*\{[^}]*repeat\(5,/);
    });
  });

  describe('Items 1 & 6: Sliding score events, PostMatchCarousel Stats visibility & SettingsModal Account reactivity', () => {
    it('InGameHUD renders sliding score events consistently for Host, Non-Host, Casual, Ranked, 1v0, and Practice', () => {
      const scenarios = [
        { name: 'Host Casual', isHost: true, isPracticeMode: false, mode: 'casual' as const, playerCount: 2 },
        { name: 'Non-Host Ranked', isHost: false, isPracticeMode: false, mode: 'ranked' as const, playerCount: 2 },
        { name: '1v0 Solo', isHost: true, isPracticeMode: false, mode: 'casual' as const, playerCount: 1 },
        { name: 'Entrenamiento Practice', isHost: true, isPracticeMode: true, mode: 'casual' as const, playerCount: 1 }
      ];

      for (const sc of scenarios) {
        gameUI.isHost = sc.isHost;
        gameUI.isPracticeMode = sc.isPracticeMode;
        gameUI.activeRoomMode = sc.mode;
        gameUI.players = sc.playerCount === 1 ? [gameUI.rosterPlayers[0]!] : [...gameUI.rosterPlayers];
        (gameUI as any).slidingEventQueue = [
          { id: 101, eventType: 'ATAPA', pointsText: '+20', team: 'red', color: '#ff4757' }
        ];

        const { html } = render(InGameHUD);
        expect(html, sc.name).toContain('hud-sliding-event-container');
        expect(html, sc.name).toContain('hud-sliding-event-card');
        expect(html, sc.name).toContain('ATAPA');
        expect(html, sc.name).toContain('+20');
      }

      const hudSrc = readUiFile('hud/InGameHUD.svelte');
      const containerCss = hudSrc.match(/\.hud-sliding-event-container\s*\{[\s\S]*?\}/);
      expect(containerCss).not.toBeNull();
      expect(containerCss![0]).toContain('top: 52px');
      expect(containerCss![0]).toContain('z-index: 39');
      expect(containerCss![0]).toContain('pointer-events: none');
    });

    it('PostMatchCarousel displays Stats slide and anchors floating navigation buttons inside stage bounds across modes & roles', () => {
      const scenarios = [
        { name: 'Host Casual', isHost: true, isPracticeMode: false, mode: 'casual' as const },
        { name: 'Non-Host Ranked', isHost: false, isPracticeMode: false, mode: 'ranked' as const },
        { name: 'Entrenamiento Practice', isHost: true, isPracticeMode: true, mode: 'casual' as const }
      ];

      gameUI.redScore = 4;
      gameUI.blueScore = 2;
      gameUI.redTeamStats = [makePlayerStat({ nickname: 'CyberHost', team: 'red', goals: 3, points: 320, isMvp: true })];
      gameUI.blueTeamStats = [makePlayerStat({ nickname: 'Striker', team: 'blue', goals: 2, points: 210 })];
      gameUI.mvp = { nickname: 'CyberHost', team: 'red', points: 320 };

      for (const sc of scenarios) {
        gameUI.showPostMatchCarousel = true;
        gameUI.isHost = sc.isHost;
        gameUI.isPracticeMode = sc.isPracticeMode;
        gameUI.activeRoomMode = sc.mode;

        const { html } = render(PostMatchCarousel);
        expect(html, sc.name).toContain('id="slide-stats"');
        expect(html, sc.name).toContain('id="post-score-red"');
        expect(html, sc.name).toContain('id="post-score-blue"');
        expect(html, sc.name).toContain('CyberHost');
        expect(html, sc.name).toContain('Striker');
        expect(html, sc.name).toContain('id="btn-goto-menu"');
        expect(html, sc.name).toContain('id="btn-goto-stats"');
      }

      const carouselSrc = readUiFile('hud/PostMatchCarousel.svelte');
      expect(carouselSrc).toContain('class="slide-card-stage"');
      expect(carouselSrc).toMatch(/\.slide-card-stage\s*\{[^}]*position:\s*relative\s*;/);
    });

    it('SettingsModal Account tab reflects userProfile.username and nameChanged lock state before and after changeUsernameOnce', async () => {
      (gameUI as any).activeSettingsTab = 'account';
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      userProfile.id = 'user-abc';
      userProfile.username = 'RookieOne';
      userProfile.displayName = 'RookieOne';
      userProfile.nameChanged = false;
      userProfile.email = 'rookie@legacyx.gg';
      userProfile.jwt = makeFakeJwt(3600);

      const { html: beforeHtml } = render(SettingsModal);
      expect(beforeHtml).toContain('RookieOne');
      expect(beforeHtml).toContain('id="new-username-input"');
      expect(beforeHtml).not.toContain('name-locked-notice');

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => [{ username: 'CampeonPro', display_name: 'CampeonPro', name_changed: true }]
        }))
      );
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn()
      });

      const ok = await userProfile.changeUsernameOnce('CampeonPro');
      expect(ok).toBe(true);
      expect(userProfile.username).toBe('CampeonPro');
      expect(userProfile.nameChanged).toBe(true);

      const { html: afterHtml } = render(SettingsModal);
      expect(afterHtml).toContain('CampeonPro');
      expect(afterHtml).toContain('name-locked-notice');
      expect(afterHtml).not.toContain('id="new-username-input"');
    });
  });
});
