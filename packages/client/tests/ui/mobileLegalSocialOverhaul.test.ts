import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import { GAMEPLAY_PRESETS } from '@legacyx/core';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import { SharedSimSync } from '../../src/net/SharedSimSync.js';
import { PeerConnection } from '../../src/net/PeerConnection.js';
import { parseLegalDocFromLocation, LEGAL_OPERATOR } from '../../src/legal/legalContent.js';
import PhysicsModal from '../../src/ui/modals/PhysicsModal.svelte';
import TeamSelectModal from '../../src/ui/modals/TeamSelectModal.svelte';
import InGameHUD from '../../src/ui/hud/InGameHUD.svelte';
import SettingsModal from '../../src/ui/modals/SettingsModal.svelte';
import Gatekeeper from '../../src/ui/screens/Gatekeeper.svelte';
import Lobby from '../../src/ui/screens/Lobby.svelte';
import LegalModal from '../../src/ui/modals/LegalModal.svelte';

const SRC_ROOT = resolve(__dirname, '../../src');

describe('Overhaul Client Suite: Mobile Carousel, Modifiers Presets, Legal, Discord & Net Fixes', () => {
  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.matchPhase = 2;
    gameUI.fsmPhase = 'PLAYING';
    gameUI.activeModal = 'NONE';
    gameUI.activeSlide = 'MENU';
    gameUI.setViewportEnvironment(1280, 720, false, false, false, false);
    gameUI.activeLegalDoc = null;
    gameUI.pingMs = 34;
    gameUI.fps = 60;
    gameUI.chatMessages = [];
    gameUI.resetGameplayConfigToDefault();

    userProfile.isAuthenticated = false;
    userProfile.isGuest = true;
    userProfile.username = '';
    userProfile.email = '';
  });

  it('PhysicsModal exposes Presets tab and staminaRechargeDelay modifier', () => {
    gameUI.activeModifiersTab = 'presets';
    const { html: presetsHtml } = render(PhysicsModal);
    for (const preset of Object.values(GAMEPLAY_PRESETS)) {
      const escaped = preset.name.replace(/&/g, '&amp;');
      expect(presetsHtml.includes(preset.name) || presetsHtml.includes(escaped)).toBe(true);
    }

    gameUI.activeModifiersTab = 'mechanics';
    const { html: mechHtml } = render(PhysicsModal);
    expect(mechHtml).toContain('Espera inmóvil para recarga');
  });

  it('Mobile UI hides HUD telemetry corner, shows Ping/FPS beside Room ID, and mounts 3-panel swipe carousel + Chat', () => {
    gameUI.setViewportEnvironment(844, 390, true, false, true, true);

    const { html: hudHtml } = render(InGameHUD);
    expect(hudHtml).not.toContain('class="hud-telemetry-corner"');

    const { html: menuHtml } = render(TeamSelectModal);
    expect(menuHtml).toContain('34 ms');
    expect(menuHtml).toContain('60 FPS');
    expect(menuHtml).toContain('slide-chat');
    expect(menuHtml).toContain('CHAT DE LA SALA');
    expect(menuHtml).toContain('mobile-carousel-indicator');
    expect(menuHtml).not.toContain('id="btn-goto-stats"');
    expect(menuHtml).not.toContain('id="btn-goto-menu"');
  });

  it('SettingsModal wraps kits inside settings-scroll-area and exposes Social + Legal + Delete Account', () => {
    const src = readFileSync(resolve(SRC_ROOT, 'ui/modals/SettingsModal.svelte'), 'utf8');
    expect(src).toContain('class="settings-scroll-area kits-scroll-area"');

    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
    userProfile.username = 'ProPlayer';

    gameUI.activeSettingsTab = 'social';
    const { html: socialHtml } = render(SettingsModal);
    expect(socialHtml).toContain('https://discord.gg/VBg4fqdY4N');
    expect(socialHtml).toContain('Instagram');
    expect(socialHtml).toContain('TikTok');

    gameUI.activeSettingsTab = 'legal';
    const { html: legalTabHtml } = render(SettingsModal);
    expect(legalTabHtml).toContain(LEGAL_OPERATOR.owner);
    expect(legalTabHtml).toContain(LEGAL_OPERATOR.supportEmail);

    gameUI.activeSettingsTab = 'account';
    const { html: accountHtml } = render(SettingsModal);
    expect(accountHtml).toContain('Eliminar cuenta permanentemente');
  });

  it('Gatekeeper, Lobby, Settings and LegalModal enforce consent checkbox and WebRTC P2P disclosure (with footer cards moved into Settings)', () => {
    userProfile.gatekeeperTab = 'register';
    const { html: gateHtml } = render(Gatekeeper);
    expect(gateHtml).toContain('Política de Privacidad');
    expect(gateHtml).toContain('WebRTC P2P');
    expect(gateHtml).not.toContain('gatekeeper-bottom-strip');

    const { html: lobbyHtml } = render(Lobby);
    expect(lobbyHtml).not.toContain('lobby-community-footer');

    expect(parseLegalDocFromLocation('?legal=privacy', '/')).toBe('privacy');
    expect(parseLegalDocFromLocation('', '/legal/terms')).toBe('terms');
    expect(parseLegalDocFromLocation('?support=1', '/')).toBe('rights');

    gameUI.activeLegalDoc = 'privacy';
    const { html: modalHtml } = render(LegalModal);
    expect(modalHtml).toContain(LEGAL_OPERATOR.owner);
    expect(modalHtml).toContain(LEGAL_OPERATOR.country);
    expect(modalHtml).toContain(LEGAL_OPERATOR.supportEmail);
    expect(modalHtml).toContain('IP pública');
  });

  it('SharedSimSync resets local step counter strictly on snapshot transitions across GOAL_REPLAY and KICKOFF', () => {
    const sync = new SharedSimSync('mediano');
    sync.onSnapshot(
      {
        tick: 10,
        phase: 2,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 }]
      },
      1000
    );
    sync.update(0.05, 1050);
    expect(sync.getTelemetry(undefined, 1050).localStepsSinceSnap).toBeGreaterThan(0);

    // Transition to GOAL_REPLAY resets localStepsSinceSnap and freezes local sim steps
    sync.onSnapshot(
      {
        tick: 11,
        phase: 3.5,
        matchTimer: 10,
        redScore: 1,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: 200, y: 0, vx: 0, vy: 0, flags: 0 }]
      },
      1066
    );
    sync.update(0.05, 1116);
    expect(sync.getTelemetry(undefined, 1116).localStepsSinceSnap).toBe(0);
  });

  it('PeerConnection.sendReliable queues critical packets instead of dropping onto unreliable channel', () => {
    const origRtc = (globalThis as any).RTCPeerConnection;
    (globalThis as any).RTCPeerConnection = function MockRTC() {
      return {
        createDataChannel: () => ({ readyState: 'connecting', bufferedAmount: 0, send: () => {} }),
        close: () => {},
        addEventListener: () => {}
      };
    };
    try {
      const pc = new PeerConnection('peer-1', { reliableChannel: null as any });
      const sentUnreliable: any[] = [];
      const sentReliable: any[] = [];
      (pc as any).dataChannel = {
        readyState: 'open',
        bufferedAmount: 0,
        send: (d: any) => sentUnreliable.push(d)
      };
      (pc as any).reliableChannel = {
        readyState: 'connecting',
        bufferedAmount: 0,
        send: (d: any) => sentReliable.push(d)
      };

      const payload = new Uint8Array([10, 20, 30]).buffer;
      pc.sendReliable(payload);
      // Must NOT fall back to unreliable dataChannel while reliableChannel is simply still connecting
      expect(sentUnreliable.length).toBe(0);
      expect(sentReliable.length).toBe(0);

      // Flushes cleanly once reliableChannel opens
      (pc as any).reliableChannel.readyState = 'open';
      (pc as any).flushReliableOutbox();
      expect(sentReliable.length).toBe(1);
    } finally {
      (globalThis as any).RTCPeerConnection = origRtc;
    }
  });
});
