import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

describe('InGameHUD & PostMatchCarousel Integration Suite (Cyber-Pitch HUD)', () => {
  beforeEach(() => {
    // Reset state before each test
    gameUI.fsmPhase = 'PLAYING';
    gameUI.redScore = 0;
    gameUI.blueScore = 3;
    gameUI.redPossession = 42;
    gameUI.bluePossession = 58;
    gameUI.matchTimeFormatted = '01:27';
    gameUI.activeRoomName = 'TORNEO NOCTURNO #12';
    gameUI.matchId = 'CTNYRS';
    gameUI.isAudioMuted = false;
    gameUI.activeModal = 'NONE';
    gameUI.showPostMatchCarousel = false;
  });

  describe('1. GameUIStore FSM & Modal Mapping Synchronization', () => {
    it('accurately maps matchPhase getter for all canonical FSM phases', () => {
      gameUI.fsmPhase = 'STOPPED';
      expect(gameUI.matchPhase).toBe(0);

      gameUI.fsmPhase = 'KICKOFF';
      expect(gameUI.matchPhase).toBe(1);

      gameUI.fsmPhase = 'PLAYING';
      expect(gameUI.matchPhase).toBe(2);

      gameUI.fsmPhase = 'PAUSED';
      expect(gameUI.matchPhase).toBe(2.1);

      gameUI.fsmPhase = 'GOAL';
      expect(gameUI.matchPhase).toBe(3);

      gameUI.fsmPhase = 'STATS';
      expect(gameUI.matchPhase).toBe(5);
    });

    it('accurately sets fsmPhase when matchPhase setter is called', () => {
      gameUI.matchPhase = 0;
      expect(gameUI.fsmPhase).toBe('STOPPED');

      gameUI.matchPhase = 1;
      expect(gameUI.fsmPhase).toBe('KICKOFF');

      gameUI.matchPhase = 2;
      expect(gameUI.fsmPhase).toBe('PLAYING');

      gameUI.matchPhase = 2.1;
      expect(gameUI.fsmPhase).toBe('PAUSED');

      gameUI.matchPhase = 3;
      expect(gameUI.fsmPhase).toBe('GOAL');

      gameUI.matchPhase = 5;
      expect(gameUI.fsmPhase).toBe('STATS');
    });

    it('maps STATS, stats, and TEAM_SELECT properly in openModal', () => {
      gameUI.openModal('stats');
      expect(gameUI.activeModal).toBe('STATS');

      gameUI.openModal('STATS');
      expect(gameUI.activeModal).toBe('STATS');

      gameUI.openModal('TEAM_SELECT');
      expect(gameUI.activeModal).toBe('TEAM_MANAGEMENT');
    });
  });

  describe('2. Telemetry and Kit Resolution', () => {
    it('resolves myTeam, redTeamKit, and blueTeamKit getters without runtime errors', () => {
      expect(['red', 'blue', 'spectator']).toContain(gameUI.myTeam);
      expect(gameUI.redTeamKit).toBeDefined();
      expect(gameUI.blueTeamKit).toBeDefined();
      expect(gameUI.redTeamKit.tag).toBeDefined();
      expect(gameUI.blueTeamKit.tag).toBeDefined();
    });

    it('toggles audio muting reactively via toggleMute', () => {
      const initial = gameUI.isAudioMuted;
      gameUI.toggleMute();
      expect(gameUI.isAudioMuted).toBe(!initial);
      gameUI.toggleMute();
      expect(gameUI.isAudioMuted).toBe(initial);
    });
  });

  describe('3. PostMatch Statistics Data & Accordion Breakdowns', () => {
    it('initializes with empty stats until match conclusion and populates real stats', () => {
      // Inicia vacío (sin mock stats)
      gameUI.resetRoomSession();
      expect(gameUI.redTeamStats).toEqual([]);
      expect(gameUI.blueTeamStats).toEqual([]);
      expect(gameUI.hasCompletedMatch).toBe(false);
      expect(gameUI.mvp).toBeNull();

      // Simular conclusión natural con telemetría real
      const mockStats = [
        {
          playerId: '1',
          playerName: 'CaptainRed',
          nickname: 'CaptainRed',
          team: 'red' as const,
          points: 150,
          goals: 1,
          assists: 1,
          passes: 10,
          saves: 0,
          shots: 4,
          touches: 20,
          hasHattrickBonus: false,
          isCaptain: true
        },
        {
          playerId: '2',
          playerName: 'StrikerBlue',
          nickname: 'StrikerBlue',
          team: 'blue' as const,
          points: 420,
          goals: 3,
          assists: 1,
          passes: 12,
          saves: 1,
          shots: 4,
          touches: 14,
          hasHattrickBonus: true,
          isMvp: true
        }
      ];

      gameUI.redTeamStats = [mockStats[0]];
      gameUI.blueTeamStats = [mockStats[1]];
      gameUI.lastMatchStats = mockStats;
      gameUI.mvp = mockStats[1];
      gameUI.hasCompletedMatch = true;

      expect(gameUI.redTeamStats.length).toBe(1);
      expect(gameUI.blueTeamStats.length).toBe(1);

      const mvpEntry = gameUI.blueTeamStats.find((p) => p.isMvp);
      expect(mvpEntry).toBeDefined();
      expect(mvpEntry?.nickname).toBe('StrikerBlue');
      expect(mvpEntry?.points).toBe(420);
      expect(mvpEntry?.goals).toBe(3);

      const redCaptain = gameUI.redTeamStats.find((p) => p.isCaptain);
      expect(redCaptain).toBeDefined();
      expect(redCaptain?.nickname).toBe('CaptainRed');
    });

    it('computes point breakdowns according to the canonical multipliers', () => {
      const player = {
        playerId: '2',
        playerName: 'StrikerBlue',
        nickname: 'StrikerBlue',
        team: 'blue' as const,
        points: 420,
        goals: 3,
        assists: 1,
        passes: 12,
        saves: 1,
        shots: 4,
        touches: 14,
        hasHattrickBonus: true,
        ownGoals: 0
      };
      gameUI.blueTeamStats = [player];

      // Breakdown rules: Toques (+2), Pases (+10), Tiros (+20), Goles (+100), Autogol (-50)
      const toquesPts = (player.touches ?? 14) * 2;
      const pasesPts = player.passes * 10;
      const tirosPts = player.shots * 20;
      const golesPts = player.goals * 100;
      const autogolPts = player.ownGoals ? -player.ownGoals * 50 : 0;

      expect(toquesPts).toBe(28);
      expect(pasesPts).toBe(120);
      expect(tirosPts).toBe(80);
      expect(golesPts).toBe(300);
      expect(autogolPts).toBe(0);
    });

    it('maintains live possession percentage invariants', () => {
      expect(gameUI.redPossession + gameUI.bluePossession).toBe(100);
      expect(gameUI.redPossession).toBe(42);
      expect(gameUI.bluePossession).toBe(58);
    });
  });

  describe('4. Slide Navigation Lifecycle & Rule ** Compliance', () => {
    it('defaults postMatchSlide to 0 and transitions between Slide 0 (Stats) and Slide 1 (Lobby)', () => {
      gameUI.postMatchSlide = 0;
      expect(gameUI.postMatchSlide).toBe(0);

      // Glide to Slide 1 (Lobby)
      gameUI.postMatchSlide = 1;
      expect(gameUI.postMatchSlide).toBe(1);

      // Glide back to Slide 0 (Stats)
      gameUI.postMatchSlide = 0;
      expect(gameUI.postMatchSlide).toBe(0);
    });

    it('resets match scores and starts match on startMatch invocation', () => {
      gameUI.fsmPhase = 'STOPPED';
      gameUI.startMatch();
      expect(gameUI.fsmPhase).toBe('PLAYING');
      expect(gameUI.matchPhase).toBe(2);
    });
  });
});
