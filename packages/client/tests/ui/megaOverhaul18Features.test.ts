import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'svelte/server';
import {
  EngineInstance,
  GameEngine,
  Player,
  PLAYER_POSITIONS,
  GAMEPLAY_CONFIG_LIMITS,
  DEFAULT_GAMEPLAY_CONFIG,
  sanitizeGameplayConfig,
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MOUSE_AIM,
  INPUT_UP,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_MAGNUS_LEFT
} from '@legacyx/core';
import { MatchPhase as GameEngineMatchPhase } from '../../../core/src/game/GameFSM.js';
import { gameUI, DEFAULT_GAMEPAD_BINDS } from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import { EMOJI_CATALOG } from '../../src/ui/utils/constants.js';
import { pollGamepadInput } from '../../src/controllers/InputManager.js';
import { DiscRenderer } from '../../src/renderer/DiscRenderer.js';
import {
  LEGAL_OPERATOR,
  getLegalHref,
  isLegalRoute,
  isKnownAppRoute,
  parseLegalDocFromLocation
} from '../../src/legal/legalContent.js';
import { SoundFX } from '../../src/audio/SoundFX.js';
import { musicPlayer } from '../../src/audio/MusicPlayer.svelte.js';
import { SignalingClient } from '../../src/net/SignalingClient.js';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import PhysicsModal from '../../src/ui/modals/PhysicsModal.svelte';
import TeamSelectModal from '../../src/ui/modals/TeamSelectModal.svelte';
import SettingsModal from '../../src/ui/modals/SettingsModal.svelte';
import LegalPage from '../../src/ui/screens/LegalPage.svelte';
import NotFoundPage from '../../src/ui/screens/NotFoundPage.svelte';
import Gatekeeper from '../../src/ui/screens/Gatekeeper.svelte';
import Lobby from '../../src/ui/screens/Lobby.svelte';

function createMockCanvasCtx() {
  const fillTextCalls: string[] = [];
  const ctx: any = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    fillText: vi.fn((text: string) => {
      fillTextCalls.push(String(text));
    }),
    strokeText: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: 'transparent',
    lineCap: 'round',
    lineJoin: 'round'
  };
  return { ctx: ctx as CanvasRenderingContext2D, fillTextCalls };
}

describe('Mega Overhaul Verification Suite (18 Features & UI Fixes)', () => {
  const origGetGamepads = typeof navigator !== 'undefined' ? navigator.getGamepads : undefined;

  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.localPlayerId = 1;
    gameUI.matchPhase = 0;
    gameUI.fsmPhase = 'STOPPED';
    gameUI.activeModal = 'NONE';
    gameUI.activeSlide = 'MENU';
    gameUI.rosterPlayers = [];
    gameUI.scoreLimitGoals = 3;
    gameUI.timeLimitMinutes = 3;
    gameUI.settings.isMuted = false;
    gameUI.settings.masterVolume = 1;
    gameUI.settings.musicVolume = 0.65;
    gameUI.settings.musicEnabled = true;
    gameUI.settings.musicInMatch = true;
    gameUI.settings.showPositionTags = true;
    gameUI.resetGameplayConfigToDefault();
    gameUI.resetGamepadBinds();
  });

  afterEach(() => {
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: origGetGamepads
      });
    }
    vi.restoreAllMocks();
  });

  it('1-2. Legal Center (/legal, legacyxgo.com) & Cyber-Pitch 404 routing', () => {
    expect(LEGAL_OPERATOR.domain).toBe('legacyxgo.com');
    expect(getLegalHref('privacy')).toBe('/legal/privacy');
    expect(getLegalHref('terms')).toBe('/legal/terms');
    expect(isLegalRoute('/legal')).toBe(true);
    expect(isLegalRoute('/legal/privacy')).toBe(true);
    expect(isLegalRoute('/legal/rights')).toBe(true);
    expect(isLegalRoute('/unknown-path')).toBe(false);
    expect(isKnownAppRoute('/')).toBe(true);
    expect(isKnownAppRoute('/room/ABC123')).toBe(true);
    expect(isKnownAppRoute('/no-existe')).toBe(false);
    expect(parseLegalDocFromLocation('', '/legal')).toBe('privacy');

    const { html: legalHtml } = render(LegalPage);
    expect(legalHtml).toContain('data-testid="standalone-legal-page"');
    expect(legalHtml).toContain('legacyxgo.com');

    const { html: notFoundHtml } = render(NotFoundPage);
    expect(notFoundHtml).toContain('data-testid="not-found-page"');
    expect(notFoundHtml).toContain('404');
  });

  it('3-4. Turbo Stamina Drain & Dash Stamina Cost % in Core + PhysicsModal', () => {
    expect(GAMEPLAY_CONFIG_LIMITS.turboStaminaDrain).toMatchObject({ min: 5, max: 100, step: 5 });
    expect(GAMEPLAY_CONFIG_LIMITS.dashStaminaCost).toMatchObject({ min: 10, max: 100, step: 1 });
    expect(DEFAULT_GAMEPLAY_CONFIG.turboStaminaDrain).toBe(40);
    expect(DEFAULT_GAMEPLAY_CONFIG.dashStaminaCost).toBe(33);

    const sanitized = sanitizeGameplayConfig({ turboStaminaDrain: 80, dashStaminaCost: 25 });
    expect(sanitized.turboStaminaDrain).toBe(80);
    expect(sanitized.dashStaminaCost).toBe(25);

    const engine = new GameEngine();
    engine.fsm.currentState = GameEngineMatchPhase.PLAYING;
    engine.ball.pos.set(1000, 1000);
    engine.setGameplayConfig({ turboStaminaDrain: 60, dashStaminaCost: 20, staminaRegenMoving: false });
    const p = new Player({ id: 'p1', name: 'Runner', team: 'red' });
    engine.addPlayer(p);
    const inputs = new Map<string, number>([['p1', INPUT_RIGHT | INPUT_TURBO]]);
    for (let i = 0; i < 60; i++) {
      engine.tick(inputs);
    }
    expect(p.stamina).toBeCloseTo(40, 0);

    p.stamina = 100;
    inputs.set('p1', INPUT_DASH);
    engine.tick(inputs);
    expect(p.stamina).toBeCloseTo(80, 4);

    gameUI.activeModifiersTab = 'mechanics';
    const { html } = render(PhysicsModal);
    expect(html).toContain('Consumo de estamina del turbo');
    expect(html).toContain('Porcentaje de estamina que consume el dash');
    expect(html).not.toContain('Cantidad de dashes por barra llena');
  });

  it('5. Expanded Emotes Catalog includes goalkeeper glove, hand up, and competitive football emotes', () => {
    expect(EMOJI_CATALOG.length).toBeGreaterThanOrEqual(24);
    expect(EMOJI_CATALOG).toContain('🧤');
    expect(EMOJI_CATALOG).toContain('✋');
    expect(EMOJI_CATALOG).toContain('👟');
    expect(EMOJI_CATALOG).toContain('🥅');
    expect(EMOJI_CATALOG).toContain('🟨');
    expect(EMOJI_CATALOG).toContain('🟥');
    expect(EMOJI_CATALOG).toContain('🐐');
    expect(gameUI.settings.emoteTriggers.length).toBeGreaterThanOrEqual(8);
  });

  it('6. Gamepad / Controller polling supports 360 analog stick, deadzone, D-Pad, and remapping', () => {
    const prev = new Set<string>();
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          connected: true,
          id: 'Xbox Wireless Controller (STANDARD GAMEPAD)',
          axes: [0.8, -0.6, 0, 0],
          buttons: Array.from({ length: 16 }, (_, idx) => ({
            pressed: idx === 0 || idx === 1 || idx === 12 || idx === 8,
            value: idx === 0 || idx === 1 || idx === 12 || idx === 8 ? 1 : 0
          }))
        } as unknown as Gamepad
      ]
    });

    const firstPoll = pollGamepadInput(DEFAULT_GAMEPAD_BINDS, 0.18, prev);
    expect(firstPoll.connected).toBe(true);
    expect(firstPoll.stickActive).toBe(true);
    expect(firstPoll.mask & INPUT_MOUSE_AIM).toBeTruthy();
    expect(firstPoll.mask & INPUT_KICK).toBeTruthy(); // Gamepad0 -> kick
    expect(firstPoll.mask & INPUT_DASH).toBeTruthy(); // Gamepad1 rising edge -> dash
    expect(firstPoll.dashRisingEdge).toBe(true);
    expect(firstPoll.menuRisingEdge).toBe(true); // Gamepad8 rising edge -> menu
    expect(firstPoll.mask & INPUT_UP).toBeTruthy(); // Gamepad12 D-Pad Up
    expect(firstPoll.aimThrottle).toBeCloseTo(1, 2);

    // Second frame with same buttons held must NOT re-trigger rising edges
    const secondPoll = pollGamepadInput(DEFAULT_GAMEPAD_BINDS, 0.18, prev);
    expect(secondPoll.dashRisingEdge).toBe(false);
    expect(secondPoll.menuRisingEdge).toBe(false);
    expect(secondPoll.mask & INPUT_DASH).toBe(0);

    // Deadzone filters drift
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          connected: true,
          id: 'Pad',
          axes: [0.05, 0.05, 0, 0],
          buttons: Array.from({ length: 16 }, (_, idx) => ({ pressed: idx === 14 || idx === 4, value: 1 }))
        } as unknown as Gamepad
      ]
    });
    const deadzonePoll = pollGamepadInput(DEFAULT_GAMEPAD_BINDS, 0.2, prev);
    expect(deadzonePoll.stickActive).toBe(false);
    expect(deadzonePoll.mask & INPUT_LEFT).toBeTruthy();
    expect(deadzonePoll.mask & INPUT_MAGNUS_LEFT).toBeTruthy();

    gameUI.remapGamepadButton('kick', 'Gamepad3');
    expect(gameUI.settings.gamepadBinds.kick).toEqual(['Gamepad3']);
    gameUI.resetGamepadBinds();
    expect(gameUI.settings.gamepadBinds.kick).toEqual(DEFAULT_GAMEPAD_BINDS.kick);

    gameUI.activeSettingsTab = 'controls';
    gameUI.activeControlsSubTab = 'gamepad';
    const { html } = render(SettingsModal);
    expect(html).toContain('data-testid="gamepad-controls-section"');
    expect(html).toContain('Zona muerta del Stick Izquierdo');
  });

  it('7-8-11. TeamSelectModal Redesign: Slide 1 Pitch Lineup, Goals/Min card, Bench chairs & Admin-only Slide 2', () => {
    gameUI.activeRoom = {
      id: 'R1',
      name: 'Copa Test',
      stadium: 'mediano',
      maxPlayers: 8,
      playersCount: 3,
      ping: 0,
      roomType: 'publica'
    };
    gameUI.rosterPlayers = [
      { id: 1, name: 'CapRed', nickname: 'CapRed', team: 'red', position: 'GK', teamOrder: 1, isAdmin: true, isHost: true },
      { id: 2, name: 'SubRed', nickname: 'SubRed', team: 'red', position: 'ST', teamOrder: 2 },
      { id: 3, name: 'Bench1', nickname: 'Bench1', team: 'spectator', teamOrder: 3 }
    ];

    // Admin view contains both Player List (with Goals/Minutes mini-card, 4 zones, bench chairs) and Settings slide
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    const { html: adminHtml } = render(TeamSelectModal);
    expect(adminHtml).toContain('id="slide-lobby"');
    expect(adminHtml).toContain('id="slide-settings"');
    expect(adminHtml).toContain('data-testid="match-rules-minicard"');
    expect(adminHtml).toContain('id="btn-match-toggle"');
    expect(adminHtml).toContain('Banquillo');
    // Bench renders maxPlayers (8) chair slots
    const chairMatches = adminHtml.match(/bench-seat-slot/g) || [];
    expect(chairMatches.length).toBeGreaterThanOrEqual(8);

    // Non-admin user sees Player List & Rules card, NOT Ajustes de Sala (#slide-settings)
    gameUI.isHost = false;
    gameUI.isAdmin = false;
    const { html: guestHtml } = render(TeamSelectModal);
    expect(guestHtml).toContain('id="slide-lobby"');
    expect(guestHtml).not.toContain('id="slide-settings"');
    expect(guestHtml).not.toContain('id="btn-match-toggle"');
  });

  it('9-10. 4-Zone Spawns & On-Pitch Position Badges (GK, DFC, MC, ST) + Toggle', () => {
    const engine = new EngineInstance('mediano');
    engine.setPlayerTeam(1, 'red');
    engine.setPlayerPosition(1, 'GK');
    engine.setPlayerTeam(2, 'red');
    engine.setPlayerPosition(2, 'DFC');
    engine.setPlayerTeam(3, 'red');
    engine.setPlayerPosition(3, 'MC');
    engine.setPlayerTeam(4, 'red');
    engine.setPlayerPosition(4, 'ST');
    engine.resetPositions();

    const pGk = engine.players.get(1)!;
    const pDfc = engine.players.get(2)!;
    const pMc = engine.players.get(3)!;
    const pSt = engine.players.get(4)!;

    // On Red (left side, negative X): GK < DFC < MC < ST < 0
    expect(pGk.pos.x).toBeLessThan(pDfc.pos.x);
    expect(pDfc.pos.x).toBeLessThan(pMc.pos.x);
    expect(pMc.pos.x).toBeLessThan(pSt.pos.x);
    expect(pSt.pos.x).toBeLessThan(0);

    const discRenderer = new DiscRenderer();
    discRenderer.playerInfos.set(1, { nickname: 'Keeper', position: 'GK' });

    const { ctx, fillTextCalls } = createMockCanvasCtx();
    discRenderer.showPositionTags = true;
    discRenderer.draw(
      ctx,
      [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, radius: 15, team: 1, avatar: '1', kicking: false, stamina: 100 }],
      1
    );
    expect(fillTextCalls).toContain('GK');

    const { ctx: ctxOff, fillTextCalls: callsOff } = createMockCanvasCtx();
    discRenderer.showPositionTags = false;
    discRenderer.draw(
      ctxOff,
      [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, radius: 15, team: 1, avatar: '1', kicking: false, stamina: 100 }],
      1
    );
    expect(callsOff).not.toContain('GK');
  });

  it('11-12. First-Joined Captaincy Invariance, Team-Empty Reset & Captain-Only Own-Team Position Permissions', () => {
    // Host first-joined captaincy via teamOrder
    const sig = new SignalingClient('ws://localhost:8080');
    const host = new NetworkHost(sig, 'Alpha');
    host.players.set(2, {
      id: 2,
      peerId: 'p2',
      nickname: 'Beta',
      name: 'Beta',
      team: 'spectator',
      number: 7,
      isAdmin: false,
      isHost: false,
      ping: 15,
      avatar: '2'
    });
    host.players.set(3, {
      id: 3,
      peerId: 'p3',
      nickname: 'ZetaFirst',
      name: 'ZetaFirst',
      team: 'spectator',
      number: 9,
      isAdmin: false,
      isHost: false,
      ping: 12,
      avatar: '3'
    });

    // Player 3 (ZetaFirst) joins Red first, then Alpha, then Beta -> ZetaFirst stays Red captain!
    host.setPlayerTeam(3, 'red');
    host.setPlayerTeam(1, 'red');
    host.setPlayerTeam(2, 'red');
    const redBeforeLeave = host.getPlayers().filter((p) => p.team === 'red');
    expect(redBeforeLeave.map((p) => p.id)).toEqual([3, 1, 2]);
    expect(redBeforeLeave[0]!.position).toBe('GK');

    // Empty Red team -> teamOrder resets; when Alpha joins Red again, Alpha becomes captain
    host.setPlayerTeam(3, 'spectator');
    host.setPlayerTeam(1, 'spectator');
    host.setPlayerTeam(2, 'spectator');
    host.setPlayerTeam(1, 'red');
    host.setPlayerTeam(3, 'red');
    const redAfterReset = host.getPlayers().filter((p) => p.team === 'red');
    expect(redAfterReset[0]!.id).toBe(1);

    // Non-admin captain permission checks: player 3 is Blue captain, player 4 is Blue mate, player 2 is Red mate
    host.players.set(4, {
      id: 4,
      peerId: 'p4',
      nickname: 'BlueMate',
      name: 'BlueMate',
      team: 'blue',
      position: 'GK',
      teamOrder: 20,
      number: 5,
      isAdmin: false,
      isHost: false,
      ping: 20,
      avatar: '4'
    });
    host.players.get(3)!.team = 'blue';
    host.players.get(3)!.position = 'ST';
    host.players.get(3)!.teamOrder = 10; // First in Blue -> Captain!
    host.players.get(2)!.team = 'red';
    host.players.get(2)!.position = 'DFC';
    host.players.get(2)!.teamOrder = 15;

    // Blue captain CAN promote self to GK (automatically swapping BlueMate out of GK)
    expect(host.setPlayerPosition(3, 'GK', 3)).toBe(true);
    expect(host.players.get(3)!.position).toBe('GK');
    expect(host.players.get(4)!.position).toBe('ST');

    // Blue captain CANNOT move Red player (2) or Spectator!
    host.players.get(2)!.team = 'red';
    expect(host.setPlayerPosition(2, 'GK', 3)).toBe(false);
    expect(host.players.get(2)!.position).toBe('DFC');

    // Check gameUI helper parity
    gameUI.isHost = false;
    gameUI.isAdmin = false;
    gameUI.localPlayerId = 3;
    gameUI.rosterPlayers = [
      { id: 1, name: 'HostRed', nickname: 'HostRed', team: 'red', position: 'GK', teamOrder: 1 },
      { id: 3, name: 'BlueCap', nickname: 'BlueCap', team: 'blue', position: 'GK', teamOrder: 2 },
      { id: 4, name: 'BlueSub', nickname: 'BlueSub', team: 'blue', position: 'DFC', teamOrder: 3 }
    ];
    expect(gameUI.getTeamCaptain('blue')?.id).toBe(3);
    expect(gameUI.canManageTeamPositions('blue')).toBe(true);
    expect(gameUI.canManageTeamPositions('red')).toBe(false);
  });

  it('13-15. SoundFX procedural overhaul & MusicPlayer volume policies', () => {
    const fx = new SoundFX();
    expect(() => {
      fx.playGoalCelebration();
      fx.playWhistle('fulltime');
      fx.playCrowdGasp();
      fx.playBarrasChant();
      fx.playDashWhoosh();
      fx.playMagnusSwirl();
      fx.playGoldenGoalSiren();
      fx.playNetSwish();
      fx.playCountdownTick(true);
    }).not.toThrow();

    gameUI.settings.isMuted = false;
    gameUI.settings.masterVolume = 0.8;
    gameUI.settings.musicVolume = 0.5;
    gameUI.settings.musicEnabled = true;
    gameUI.settings.musicInMatch = false;

    expect(musicPlayer.computeTargetVolume(false)).toBeCloseTo(0.4, 4);
    expect(musicPlayer.computeTargetVolume(true)).toBe(0);
    gameUI.settings.musicInMatch = true;
    expect(musicPlayer.computeTargetVolume(true)).toBeCloseTo(0.4, 4);
  });

  it('16-18. Gatekeeper, Lobby, and Settings render with updated layout and no banned blur/legacy syntax', () => {
    userProfile.gatekeeperTab = 'register';
    const { html: gkHtml } = render(Gatekeeper);
    expect(gkHtml).toContain('/legal/privacy');
    expect(gkHtml).not.toContain('gatekeeper-bottom-strip');

    const { html: lobbyHtml } = render(Lobby);
    expect(lobbyHtml).not.toContain('data-testid="lobby-community-footer"');
    expect(lobbyHtml).toContain('data-testid="btn-open-tutorial"');

    gameUI.activeSettingsTab = 'social';
    const { html: settingsSocialHtml } = render(SettingsModal);
    expect(settingsSocialHtml).toContain('https://discord.gg/VBg4fqdY4N');

    gameUI.activeSettingsTab = 'legal';
    const { html: settingsLegalHtml } = render(SettingsModal);
    expect(settingsLegalHtml).toContain('/legal/privacy');

    gameUI.activeSettingsTab = 'audio';
    const { html: settingsAudioHtml } = render(SettingsModal);
    expect(settingsAudioHtml).toContain('data-testid="music-player-card"');

    gameUI.activeSettingsTab = 'video';
    const { html: settingsVideoHtml } = render(SettingsModal);
    expect(settingsVideoHtml).toContain('data-testid="toggle-position-tags"');
  });
});
