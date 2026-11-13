import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import { gameUI, type PlayerStatEntry, type TeamKitConfig } from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import { getKitPatternCss, KIT_PATTERNS } from '../../src/ui/utils/kitPatterns.js';
import InGameHUD from '../../src/ui/hud/InGameHUD.svelte';
import PostMatchCarousel from '../../src/ui/hud/PostMatchCarousel.svelte';
import TeamSelectModal from '../../src/ui/modals/TeamSelectModal.svelte';

const SRC_ROOT = resolve(__dirname, '../../src/ui');

function readUiFile(relPath: string): string {
  return readFileSync(resolve(SRC_ROOT, relPath), 'utf8');
}

function makeKit(overrides: Partial<TeamKitConfig> = {}): TeamKitConfig {
  return {
    name: 'Equipo Prueba',
    tag: 'PRB',
    primaryColor: '#e11d48',
    secondaryColor: '#facc15',
    tertiaryColor: '#111827',
    outlineColor: '#000000',
    hasOutline: true,
    outline: true,
    pattern: 'vertical',
    ...overrides
  };
}

function makePlayerStat(
  overrides: Partial<PlayerStatEntry> & { nickname: string; team: 'red' | 'blue' }
): PlayerStatEntry {
  return {
    goals: 1,
    assists: 0,
    saves: 2,
    shots: 3,
    passes: 5,
    points: 190,
    isMvp: false,
    ...overrides
  };
}

describe('Team Kit Cards, World Cup Scoreboard, Goal Replay HUD & Ranked Room Card', () => {
  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.fsmPhase = 'PLAYING';
    gameUI.matchPhase = 2;
    gameUI.activeModal = 'NONE';
    gameUI.overlayStack = [];
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.isPracticeMode = false;
    gameUI.roomType = 'casual';
    gameUI.activeRoomName = 'Copa Nocturna';
    gameUI.matchId = 'WC2026';
    gameUI.localPlayerId = 1;
    gameUI.nickname = 'CapRojo';
    gameUI.timeLimit = 3;
    gameUI.matchTimerSeconds = 45;
    gameUI.redScore = 2;
    gameUI.blueScore = 1;
    gameUI.isGoldenGoal = false;
    gameUI.activeBanner = { kind: 'NONE' };
    (gameUI as any).activeGoalScorerId = null;
    (gameUI as any).slidingEventQueue = [];
    gameUI.showPostMatchCarousel = false;
    gameUI.redKitVariant = 'home';
    gameUI.blueKitVariant = 'away';
    (gameUI.settings as any).scoreboardDesign = 'original';

    const redKit = makeKit({
      name: 'Atletico',
      tag: 'ATL',
      primaryColor: '#dc2626',
      secondaryColor: '#ffffff',
      tertiaryColor: '#fde047',
      pattern: 'vertical',
      hasOutline: true,
      outline: true
    });
    const blueKit = makeKit({
      name: 'Inter',
      tag: 'INT',
      primaryColor: '#1d4ed8',
      secondaryColor: '#0f172a',
      tertiaryColor: '#38bdf8',
      pattern: 'hoop',
      hasOutline: false,
      outline: false
    });

    gameUI.rosterPlayers = [
      {
        id: 1,
        name: 'CapRojo',
        nickname: 'CapRojo',
        team: 'red',
        avatar: 'CR',
        isHost: true,
        localKit: redKit,
        kit: redKit
      },
      {
        id: 2,
        name: 'CapAzul',
        nickname: 'CapAzul',
        team: 'blue',
        avatar: 'CA',
        visitorKit: blueKit,
        kit: blueKit
      }
    ];
    gameUI.players = [...gameUI.rosterPlayers];
    gameUI.redTeamStats = [makePlayerStat({ nickname: 'CapRojo', team: 'red', isCaptain: true })];
    gameUI.blueTeamStats = [makePlayerStat({ nickname: 'CapAzul', team: 'blue', isCaptain: true })];
    gameUI.lastMatchStats = {
      redScore: 2,
      blueScore: 1,
      matchDuration: 180,
      winner: 'red',
      winnerTeamName: 'Atletico',
      redTeamName: 'Atletico',
      blueTeamName: 'Inter',
      redTeam: gameUI.redTeamStats,
      blueTeam: gameUI.blueTeamStats,
      mvp: gameUI.redTeamStats[0]
    };

    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
  });

  describe('1. Top-Left Room Card Yellow on Ranked (InGameHUD)', () => {
    it('adds .is-ranked and yellow RANKED badge when roomType is ranked and not practice mode', () => {
      gameUI.roomType = 'ranked';
      gameUI.isPracticeMode = false;

      const { html } = render(InGameHUD);
      expect(html).toContain('top-card-left is-ranked');
      expect(html).toContain('RANKED');

      (gameUI.settings as any).scoreboardDesign = 'wc2026';
      const { html: wcHtml } = render(InGameHUD);
      expect(wcHtml).toContain('top-card-left is-ranked');
      expect(wcHtml).toContain('data-design="wc2026"');

      const hudSrc = readUiFile('hud/InGameHUD.svelte');
      expect(hudSrc).toContain('.top-card-left.is-ranked');
      expect(hudSrc).toContain('#ffd700');
      expect(hudSrc).toContain('rgba(234, 179, 8, 0.16)');
      expect(hudSrc).toContain('#422006');
    });

    it('omits .is-ranked in casual rooms and practice mode', () => {
      gameUI.roomType = 'casual';
      gameUI.isPracticeMode = false;
      const { html: casualHtml } = render(InGameHUD);
      expect(casualHtml).not.toContain('top-card-left is-ranked');

      gameUI.roomType = 'ranked';
      gameUI.isPracticeMode = true;
      const { html: practiceHtml } = render(InGameHUD);
      expect(practiceHtml).not.toContain('top-card-left is-ranked');
    });
  });

  describe('2. World Cup / Original Scoreboard Integration (InGameHUD)', () => {
    it('delegates top-center scoreboard to MatchScoreboard and keeps 30s pulse + Golden Goal gold ball SVG', () => {
      const hudSrc = readUiFile('hud/InGameHUD.svelte');
      expect(hudSrc).toContain("import MatchScoreboard from '../components/MatchScoreboard.svelte'");
      expect(hudSrc).toContain('<MatchScoreboard');
      expect(hudSrc).not.toContain('class="scoreboard-main-row"');

      (gameUI.settings as any).scoreboardDesign = 'wc2010';
      const { html: wcHtml } = render(InGameHUD);
      expect(wcHtml).toContain('data-design="wc2010"');
      expect(wcHtml).toContain('00:45');

      gameUI.timeLimit = 3;
      gameUI.matchTimerSeconds = 160; // 20s left
      gameUI.isGoldenGoal = false;
      const { html: warnHtml } = render(InGameHUD);
      expect(warnHtml).toContain('is-warning-30s');

      gameUI.isGoldenGoal = true;
      const { html: ggHtml } = render(InGameHUD);
      expect(ggHtml).toContain('glowing-ball-svg');
      expect(ggHtml).toContain('#FEF9C3');
      expect(ggHtml).toContain('#FACC15');
    });
  });

  describe('3. Goal Replay HUD Indicator & Scorer-Only Enter Skip Hint', () => {
    it('renders REPETICIÓN DEL GOL during phase 3.5 and shows Enter skip hint only for the goal scorer', () => {
      gameUI.matchPhase = 3.5;
      gameUI.localPlayerId = 1;
      (gameUI as any).activeGoalScorerId = 1;

      const { html: scorerHtml } = render(InGameHUD);
      expect(scorerHtml).toContain('REPETICIÓN DEL GOL');
      expect(scorerHtml).toContain('Pulsa ENTER para saltar');

      gameUI.localPlayerId = 2;
      const { html: otherHtml } = render(InGameHUD);
      expect(otherHtml).toContain('REPETICIÓN DEL GOL');
      expect(otherHtml).not.toContain('Pulsa ENTER para saltar');

      gameUI.matchPhase = 2;
      const { html: playingHtml } = render(InGameHUD);
      expect(playingHtml).not.toContain('REPETICIÓN DEL GOL');
      expect(playingHtml).not.toContain('Pulsa ENTER para saltar');

      const hudSrc = readUiFile('hud/InGameHUD.svelte');
      const pillCss = hudSrc.match(/\.goal-replay-pill-bar\s*\{[\s\S]*?\}/);
      expect(pillCss).not.toBeNull();
      expect(pillCss![0]).toMatch(/pointer-events:\s*none\s*;/);
    });
  });

  describe('4. Real Team Jersey Patterns Across VS Banner, PostMatchCarousel & TeamSelectModal', () => {
    it('eliminates blended two-color gradients and uses getKitPatternCss / KitPatternBadge across all 8 patterns', () => {
      const patterns = ['solid', 'vertical', 'hoop', 'vertical_stripe', 'diagonal_right', 'diagonal_left', 'halves', 'checkerboard'] as const;
      expect(KIT_PATTERNS.length).toBeGreaterThanOrEqual(8);

      for (const pattern of patterns) {
        const kit = makeKit({
          pattern,
          tertiaryColor: '#fde047',
          hasOutline: true,
          outline: true
        });
        const css = getKitPatternCss(kit);
        expect(css).toBeTruthy();

        gameUI.rosterPlayers[0].localKit = kit;
        gameUI.rosterPlayers[0].kit = kit;
        gameUI.activeBanner = { kind: 'VS' };

        const { html: hudHtml } = render(InGameHUD);
        expect(hudHtml).toContain('vs-team-tag');
        expect(hudHtml).toContain('#fde047');
        expect(hudHtml).toContain('#000000');
      }

      gameUI.activeBanner = {
        kind: 'GOAL',
        scoringTeam: 'red',
        scorerName: 'CapRojo'
      };
      const { html: goalHtml } = render(InGameHUD);
      expect(goalHtml).toContain('goal-accent-strip');
      expect(goalHtml).toContain('kit-pattern-badge');

      gameUI.activeBanner = {
        kind: 'VICTORY',
        winner: 'red',
        redScore: 2,
        blueScore: 1
      };
      const { html: victoryHtml } = render(InGameHUD);
      expect(victoryHtml).toContain('victory-score-strip');
      expect(victoryHtml).toContain('kit-pattern-badge');

      gameUI.showPostMatchCarousel = true;
      const { html: carouselHtml } = render(PostMatchCarousel);
      expect(carouselHtml).toContain('stats-acronym-badge');
      expect(carouselHtml).toContain('captain-bicolor-header');
      expect(carouselHtml).toContain('#fde047');
      expect(carouselHtml).toContain('#000000');

      gameUI.matchPhase = 0;
      gameUI.hasCompletedMatch = true;
      gameUI.activeSlide = 'STATS';
      gameUI.activeModal = 'STATS';
      const { html: modalHtml } = render(TeamSelectModal);
      expect(modalHtml).toContain('stats-acronym-badge');
      expect(modalHtml).toContain('captain-bicolor-header');
      expect(modalHtml).toContain('#fde047');
      expect(modalHtml).toContain('#000000');

      const files = [
        'hud/InGameHUD.svelte',
        'hud/PostMatchCarousel.svelte',
        'modals/TeamSelectModal.svelte'
      ];
      for (const file of files) {
        const src = readUiFile(file);
        expect(src, `${file} must import getKitPatternCss`).toContain('getKitPatternCss');
        expect(src, `${file} must not keep old blended 25%/75% or 30%/70% team gradients`).not.toMatch(
          /linear-gradient\([^)]*(25%|30%)[^)]*(70%|75%)/
        );
        expect(src, `${file} must not use backdrop-filter: blur`).not.toMatch(/backdrop-filter\s*:\s*blur/i);
        expect(src, `${file} must not use legacy Svelte 3/4 export let`).not.toMatch(/\bexport\s+let\b/);
      }
    });
  });
});
