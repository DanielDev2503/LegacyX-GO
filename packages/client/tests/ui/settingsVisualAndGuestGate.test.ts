import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  gameUI,
  normalizeBallSettings,
  type BallSkinType,
  type ScoreboardDesignType
} from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';

function makeMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('Task: Visual Settings, Auto-Extrapolation, HUD Hooks & Guest Gating', () => {
  let memoryStorage: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memoryStorage = makeMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    userProfile.isAuthenticated = false;
    userProfile.isGuest = true;
    userProfile.username = '';
    gameUI.onHudStateChange = undefined;
    gameUI.resetRoomSession();
    gameUI.saveSettings({
      ...DEFAULT_SETTINGS,
      localKit: { ...DEFAULT_SETTINGS.localKit },
      visitorKit: { ...DEFAULT_SETTINGS.visitorKit },
      emoteTriggers: [...DEFAULT_SETTINGS.emoteTriggers]
    });
  });

  afterEach(() => {
    gameUI.onHudStateChange = undefined;
    vi.unstubAllGlobals();
  });

  describe('1. BallSkinType, ScoreboardDesignType & Persistence', () => {
    it('supports all 11 ball texture skins including World Cup 2006-2026 and still normalizes solid -> color', () => {
      const textures: BallSkinType[] = [
        'classic',
        'retro',
        'neon',
        'cyber',
        'gold',
        'wc2006',
        'wc2010',
        'wc2014',
        'wc2018',
        'wc2022',
        'wc2026'
      ];

      for (const skin of textures) {
        const normalized = normalizeBallSettings({
          ballMode: 'texture',
          ballSkin: skin,
          ballCustomColor: '#ff0055'
        });
        expect(normalized.ballMode).toBe('texture');
        expect(normalized.ballSkin).toBe(skin);
        expect(normalized.ballCustomColor).toBe('#ff0055');
      }

      const solidNormalized = normalizeBallSettings({
        ballMode: 'texture',
        ballSkin: 'solid',
        ballCustomColor: '#00ff88'
      });
      expect(solidNormalized.ballMode).toBe('color');
      expect(solidNormalized.ballSkin).toBe('classic');
      expect(solidNormalized.ballCustomColor).toBe('#00ff88');
    });

    it('defaults scoreboardDesign to original and persists World Cup scoreboard designs in localStorage', () => {
      expect(DEFAULT_SETTINGS.scoreboardDesign).toBe('original');
      expect(gameUI.settings.scoreboardDesign).toBe('original');

      const designs: ScoreboardDesignType[] = [
        'original',
        'wc2006',
        'wc2010',
        'wc2014',
        'wc2018',
        'wc2022',
        'wc2026'
      ];

      for (const design of designs) {
        gameUI.saveSettings({ scoreboardDesign: design });
        const persisted = JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
        expect(persisted.scoreboardDesign).toBe(design);
      }

      gameUI.settings.scoreboardDesign = 'original';
      gameUI.loadPersistedState();
      expect(gameUI.settings.scoreboardDesign).toBe('wc2026');
    });
  });

  describe('2. Auto-Extrapolation Scaling', () => {
    it('defaults autoExtrapolation to true and scales effectiveExtrapolationMs smoothly from pingMs (0ms <= 20ms, up to 85ms)', () => {
      expect(DEFAULT_SETTINGS.autoExtrapolation).toBe(true);
      expect(gameUI.settings.autoExtrapolation).toBe(true);

      gameUI.pingMs = 0;
      expect(gameUI.effectiveExtrapolationMs).toBe(0);

      gameUI.pingMs = 20;
      expect(gameUI.effectiveExtrapolationMs).toBe(0);

      gameUI.pingMs = 60;
      const midLow = gameUI.effectiveExtrapolationMs;
      expect(midLow).toBeGreaterThan(0);
      expect(midLow).toBeLessThan(85);

      gameUI.pingMs = 120;
      const midHigh = gameUI.effectiveExtrapolationMs;
      expect(midHigh).toBeGreaterThan(midLow);
      expect(midHigh).toBeLessThanOrEqual(85);

      gameUI.pingMs = 240;
      expect(gameUI.effectiveExtrapolationMs).toBe(85);

      gameUI.pingMs = 400;
      expect(gameUI.effectiveExtrapolationMs).toBe(85);
    });

    it('uses manual settings.extrapolationMs when autoExtrapolation is false', () => {
      gameUI.pingMs = 180;
      gameUI.saveSettings({ autoExtrapolation: false });
      gameUI.setExtrapolationMs(140);
      expect(gameUI.effectiveExtrapolationMs).toBe(140);

      gameUI.setExtrapolationMs(35);
      expect(gameUI.effectiveExtrapolationMs).toBe(35);
    });
  });

  describe('3. Goal Replay Phase 3.5 & Active Scorer Tracking', () => {
    it('tracks activeGoalScorerId and derives isGoalReplay from matchPhase === 3.5', () => {
      expect(gameUI.activeGoalScorerId).toBeNull();
      expect(gameUI.isGoalReplay).toBe(false);

      gameUI.activeGoalScorerId = 7;
      gameUI.matchPhase = 3.5;
      expect(gameUI.fsmPhase).toBe('GOAL_REPLAY');
      expect(gameUI.matchPhase).toBe(3.5);
      expect(gameUI.isGoalReplay).toBe(true);
      expect(gameUI.isMatchActive).toBe(true);

      gameUI.matchPhase = 1;
      expect(gameUI.isGoalReplay).toBe(false);

      gameUI.resetRoomSession();
      expect(gameUI.activeGoalScorerId).toBeNull();
    });
  });

  describe('4. HUD Timeline Observer Hooks', () => {
    it('emits onHudStateChange for telemetry, score_event, chat, banner, ui_overlay, and kits_updated', () => {
      const events: Array<{ kind: string; detail: any }> = [];
      gameUI.onHudStateChange = (kind, detail) => {
        events.push({ kind, detail });
      };

      gameUI.recordTelemetrySample(42, 60);
      gameUI.pushScoreEvent({
        playerName: 'Striker',
        eventType: 'GOL',
        pointsText: '+100 PTS',
        color: '#22c55e',
        team: 'red'
      });
      gameUI.addChatMessage({
        id: 'chat-1',
        team: 'RED',
        sender: 'Striker',
        text: 'Vamos!'
      });
      gameUI.applyMatchBanner({ kind: 'GOAL', scoringTeam: 'red', scorerName: 'Striker', speedKmh: 112 });
      gameUI.openModal('TEAM_MANAGEMENT');
      gameUI.activeSlide = 'STATS';
      gameUI.closeOverlay();
      gameUI.setRedKitVariant('away');

      const kinds = events.map((e) => e.kind);
      expect(kinds).toContain('telemetry');
      expect(kinds).toContain('score_event');
      expect(kinds).toContain('chat');
      expect(kinds).toContain('banner');
      expect(kinds).toContain('ui_overlay');
      expect(kinds).toContain('kits_updated');

      const telemetryEvt = events.find((e) => e.kind === 'telemetry');
      expect(telemetryEvt?.detail).toMatchObject({ pingMs: 42, fps: 60 });
    });
  });

  describe('5. Guest Fallback Enforcement (!userProfile.isAuthenticated)', () => {
    it('returns clean defaults for guests without erasing saved account settings, and restores them on login', () => {
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      gameUI.saveSettings({
        ballMode: 'texture',
        ballSkin: 'wc2022',
        ballCustomColor: '#123456',
        scoreboardDesign: 'wc2018',
        localKit: {
          name: 'CUSTOM RED',
          tag: 'CRD',
          primaryColor: '#ff00aa',
          secondaryColor: '#111111',
          tertiaryColor: '#ffee00',
          outlineColor: '#000000',
          hasOutline: true,
          outline: true,
          pattern: 'vertical'
        },
        visitorKit: {
          name: 'CUSTOM BLUE',
          tag: 'CBL',
          primaryColor: '#00aa55',
          secondaryColor: '#222222',
          tertiaryColor: '#ffffff',
          outlineColor: '#000000',
          hasOutline: true,
          outline: true,
          pattern: 'checkerboard'
        }
      });

      expect(gameUI.effectiveBallMode).toBe('texture');
      expect(gameUI.effectiveBallSkin).toBe('wc2022');
      expect(gameUI.effectiveBallCustomColor).toBe('#123456');
      expect(gameUI.effectiveScoreboardDesign).toBe('wc2018');
      expect(gameUI.effectiveLocalKit.primaryColor).toBe('#ff00aa');
      expect(gameUI.effectiveVisitorKit.primaryColor).toBe('#00aa55');

      // Switch to Guest (unauthenticated)
      userProfile.isAuthenticated = false;
      userProfile.isGuest = true;
      gameUI.setPlayerNickname('inv_Visitante');
      gameUI.rosterPlayers = [
        {
          id: 1,
          peerId: 'host',
          nickname: 'inv_Visitante',
          name: 'inv_Visitante',
          avatar: '1',
          team: 'red',
          isAdmin: true,
          isHost: true,
          ping: 0,
          localKit: { ...gameUI.settings.localKit },
          visitorKit: { ...gameUI.settings.visitorKit }
        },
        {
          id: 2,
          peerId: 'p2',
          nickname: 'inv_Rival',
          name: 'inv_Rival',
          avatar: '2',
          team: 'blue',
          isAdmin: false,
          isHost: false,
          ping: 25,
          localKit: { ...gameUI.settings.localKit },
          visitorKit: { ...gameUI.settings.visitorKit }
        }
      ];

      expect(gameUI.effectiveBallMode).toBe('texture');
      expect(gameUI.effectiveBallSkin).toBe('classic');
      expect(gameUI.effectiveBallCustomColor).toBe('#ffffff');
      expect(gameUI.effectiveScoreboardDesign).toBe('original');
      expect(gameUI.effectiveLocalKit.primaryColor).toBe('#e74c3c');
      expect(gameUI.effectiveLocalKit.pattern).toBe('solid');
      expect(gameUI.effectiveVisitorKit.primaryColor).toBe('#3498db');
      expect(gameUI.effectiveVisitorKit.pattern).toBe('solid');
      expect(gameUI.redCaptainKit.primaryColor).toBe('#e74c3c');
      expect(gameUI.redCaptainKit.pattern).toBe('solid');
      expect(gameUI.blueCaptainKit.primaryColor).toBe('#3498db');
      expect(gameUI.blueCaptainKit.pattern).toBe('solid');

      // Saved settings MUST remain intact for when user signs back in
      expect(gameUI.settings.ballSkin).toBe('wc2022');
      expect(gameUI.settings.scoreboardDesign).toBe('wc2018');
      expect(gameUI.settings.localKit.primaryColor).toBe('#ff00aa');

      // Log back in -> custom settings immediately return
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      expect(gameUI.effectiveBallSkin).toBe('wc2022');
      expect(gameUI.effectiveScoreboardDesign).toBe('wc2018');
      expect(gameUI.effectiveLocalKit.primaryColor).toBe('#ff00aa');
    });
  });

  describe('6. SettingsModal.svelte: Visual Tab, Auto-Extrapolation, Guest Gates & Svelte 5 Compliance', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const modalPath = resolve(__dirname, '../../src/ui/modals/SettingsModal.svelte');
    const modalSrc = readFileSync(modalPath, 'utf8');

    it('compiles cleanly with Svelte 5 compiler (runes only, scoped style, zero warnings)', () => {
      const compiled = compile(modalSrc, {
        filename: 'SettingsModal.svelte',
        generate: 'client'
      });
      expect(compiled.js.code.length).toBeGreaterThan(0);
      expect(compiled.warnings).toEqual([]);
      expect(modalSrc).not.toMatch(/\bexport\s+let\b/);
      expect(modalSrc).not.toMatch(/^\s*\$:/m);
      expect(modalSrc).not.toMatch(/backdrop-filter\s*:\s*blur/i);
    });

    it('exposes Personalización visual tab with all 11 ball skins, Color sólido, and 7 MatchScoreboard previews', () => {
      expect(modalSrc).toContain("'visual'");
      expect(modalSrc).toContain('Personalización visual');
      expect(modalSrc).toContain('Personalización del Balón');
      expect(modalSrc).toContain('Color sólido');
      expect(modalSrc).toContain('Personalización del Marcador');
      expect(modalSrc).toContain("import MatchScoreboard from '../components/MatchScoreboard.svelte'");
      expect(modalSrc).toContain('<MatchScoreboard');

      const expectedSkins: BallSkinType[] = [
        'classic',
        'retro',
        'neon',
        'cyber',
        'gold',
        'wc2006',
        'wc2010',
        'wc2014',
        'wc2018',
        'wc2022',
        'wc2026'
      ];
      for (const skin of expectedSkins) {
        expect(modalSrc).toContain(`'${skin}'`);
      }

      const expectedDesigns: ScoreboardDesignType[] = [
        'original',
        'wc2006',
        'wc2010',
        'wc2014',
        'wc2018',
        'wc2022',
        'wc2026'
      ];
      for (const design of expectedDesigns) {
        expect(modalSrc).toContain(`'${design}'`);
      }

      // Ball customization moved out of video tab into visual tab
      const videoStart = modalSrc.indexOf("{:else if activeTab === 'video'}");
      const visualStart = modalSrc.indexOf("{:else if activeTab === 'visual'}");
      expect(videoStart).toBeGreaterThan(-1);
      expect(visualStart).toBeGreaterThan(videoStart);
      const videoSection = modalSrc.slice(videoStart, visualStart);
      expect(videoSection).not.toContain('Personalización del Balón');
      expect(videoSection).toContain('Extrapolación automática (según ping)');
      expect(videoSection).toContain('gameUI.effectiveExtrapolationMs');
    });

    it('gates visual, kits, avatar, and account tabs for guests with lock badges, account-only cards, and KitPatternBadge', () => {
      // Sidebar lock icons on restricted tabs when !userProfile.isAuthenticated
      const navStart = modalSrc.indexOf('<nav class="nav-tabs"');
      const navEnd = modalSrc.indexOf('</nav>', navStart);
      const navHtml = modalSrc.slice(navStart, navEnd);
      for (const tab of ['visual', 'kits', 'avatar', 'account']) {
        const idx = navHtml.indexOf(`switchTab('${tab}')`);
        expect(idx).toBeGreaterThan(-1);
        const btnEnd = navHtml.indexOf('</button>', idx);
        expect(navHtml.slice(idx, btnEnd)).toContain('lockBadge()');
      }
      for (const openTab of ['controls', 'audio', 'video']) {
        const idx = navHtml.indexOf(`switchTab('${openTab}')`);
        expect(idx).toBeGreaterThan(-1);
        const btnEnd = navHtml.indexOf('</button>', idx);
        expect(navHtml.slice(idx, btnEnd)).not.toContain('lockBadge()');
      }

      // Guest lock card text & auth CTA
      expect(modalSrc).toContain('Exclusivo para cuentas registradas');
      expect(modalSrc).toContain('Iniciar sesión / Crear cuenta');
      expect(modalSrc).toContain('onclick={goToAuthFromSettings}');

      // Each restricted section checks !userProfile.isAuthenticated before rendering editors
      for (const section of ['visual', 'kits', 'avatar', 'account']) {
        const marker = `{:else if activeTab === '${section}'}`;
        const secStart = modalSrc.indexOf(marker);
        expect(secStart).toBeGreaterThan(-1);
        const nextMarker = modalSrc.indexOf('{:else if activeTab ===', secStart + marker.length);
        const secBody = nextMarker > -1 ? modalSrc.slice(secStart, nextMarker) : modalSrc.slice(secStart);
        expect(secBody).toMatch(/userProfile\.isAuthenticated/);
        expect(secBody).toContain('guestLockCard(');
      }

      // Kit preview uses KitPatternBadge instead of gradient badge
      expect(modalSrc).toContain("import KitPatternBadge from '../components/KitPatternBadge.svelte'");
      expect(modalSrc).toContain('<KitPatternBadge');
      expect(modalSrc).not.toContain('scoreboard-preview-badge');
    });

    it('renders locked guest state and unlocked authenticated state cleanly when components are present', async () => {
      const scoreboardCompPath = resolve(__dirname, '../../src/ui/components/MatchScoreboard.svelte');
      const kitBadgeCompPath = resolve(__dirname, '../../src/ui/components/KitPatternBadge.svelte');
      if (!existsSync(scoreboardCompPath) || !existsSync(kitBadgeCompPath)) {
        // Components arrive on coordinator merge of visual-designs branch
        return;
      }
      const { render } = await import('svelte/server');
      const { default: SettingsModal } = await import('../../src/ui/modals/SettingsModal.svelte');

      userProfile.isAuthenticated = false;
      gameUI.activeSettingsTab = 'visual';
      const guestHtml = render(SettingsModal).body;
      expect(guestHtml).toContain('Exclusivo para cuentas registradas');
      expect(guestHtml).toContain('Iniciar sesión / Crear cuenta');

      userProfile.isAuthenticated = true;
      gameUI.activeSettingsTab = 'visual';
      const authVisualHtml = render(SettingsModal).body;
      expect(authVisualHtml).toContain('Personalización del Balón');
      expect(authVisualHtml).toContain('Personalización del Marcador');
    });
  });
});
