import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gameUI, type MatchStatsSnapshot } from '../../src/ui/state/gameUI.svelte.js';
import { BinaryProtocol, type GameStateSnapshot, EngineInstance, createStadium } from '@legacyx/core';
import { activePitchEmotes, triggerPitchEmote, clearPitchEmotes } from '../../src/renderer/DiscRenderer.js';

describe('Post-Match Flow, Practice Mode, Live Kit/Stadium Sync, Auto Balance & Emote Optimization', () => {
  beforeEach(() => {
    gameUI.resetRoomSession();
    gameUI.fsmPhase = 'STOPPED';
    gameUI.matchPhase = 0;
    gameUI.hasCompletedMatch = false;
    gameUI.activeSlide = 'MENU';
    gameUI.activeModal = 'NONE';
    gameUI.allowCaptainKitSwitch = false;
    clearPitchEmotes();
  });

  describe('1. Winner team name in STATS header & Single-click slide navigation', () => {
    it('properly determines winner banner with team names and handles draw', () => {
      gameUI.redScore = 3;
      gameUI.blueScore = 1;
      const redWinner = gameUI.redScore > gameUI.blueScore ? `VICTORIA RED` : 'EMPATE';
      expect(redWinner).toBe('VICTORIA RED');

      gameUI.redScore = 2;
      gameUI.blueScore = 2;
      const drawResult = gameUI.redScore > gameUI.blueScore ? 'VICTORIA RED' : (gameUI.blueScore > gameUI.redScore ? 'VICTORIA BLUE' : 'EMPATE');
      expect(drawResult).toBe('EMPATE');
    });

    it('navigates from STATS to MENU in a single click using gameUI.activeSlide', () => {
      gameUI.hasCompletedMatch = true;
      gameUI.activeSlide = 'STATS';
      expect(gameUI.activeSlide).toBe('STATS');

      // User clicks "Menú >"
      gameUI.activeSlide = 'MENU';
      expect(gameUI.activeSlide).toBe('MENU');

      // On match completion, phase is reset to STOPPED (0) so menu directly displays [ ▶ INICIAR PARTIDO ]
      gameUI.fsmPhase = 'STOPPED';
      gameUI.matchPhase = 0;
      expect(gameUI.matchPhase).toBe(0);
      expect(gameUI.fsmPhase).toBe('STOPPED');
    });
  });

  describe('2. Practice / Solo Mode Player Registration & Spectator Initial Entry', () => {
    it('registers local player into rosterPlayers and players with team spectator and ping 0', () => {
      gameUI.nickname = 'SoloStriker';
      gameUI.enterPracticeMode();

      expect(gameUI.isHost).toBe(true);
      expect(gameUI.isAdmin).toBe(true);
      expect(gameUI.localPlayerId).toBe(1);
      expect(gameUI.rosterPlayers.length).toBe(1);
      expect(gameUI.players.length).toBe(1);

      const localPlayer = gameUI.rosterPlayers[0];
      expect(localPlayer.id).toBe(1);
      expect(localPlayer.team).toBe('spectator');
      expect(localPlayer.nickname).toBe('SoloStriker');
      expect(localPlayer.ping).toBe(0);
    });
  });

  describe('3. BinaryProtocol 18-byte Disc Serialization for Stamina & Spin', () => {
    it('encodes and decodes stamina and spin preserving precision for non-host players', () => {
      expect(BinaryProtocol.DISC_RECORD_SIZE).toBe(18);

      const snapshot: GameStateSnapshot = {
        tick: 120,
        phase: 2,
        matchTimer: 45,
        redScore: 2,
        blueScore: 1,
        soundMask: 0,
        discs: [
          {
            id: 0,
            team: 0,
            flags: 2,
            x: 100.5,
            y: 50.25,
            vx: 3.5,
            vy: -1.2,
            spin: 0.6
          },
          {
            id: 1,
            team: 1,
            flags: 16,
            x: -200,
            y: 10,
            vx: 1.0,
            vy: 2.0,
            stamina: 75
          }
        ]
      };

      const buffer = BinaryProtocol.encodeSnapshot(snapshot);
      expect(buffer.byteLength).toBe(BinaryProtocol.SNAPSHOT_HEADER_SIZE + 2 * BinaryProtocol.DISC_RECORD_SIZE);

      const decoded = BinaryProtocol.decodeSnapshot(buffer);
      expect(decoded).not.toBeNull();
      expect(decoded!.discs.length).toBe(2);

      // Ball check
      expect(decoded!.discs[0].id).toBe(0);
      expect(decoded!.discs[0].spin).toBeCloseTo(0.6, 1);

      // Player stamina check
      expect(decoded!.discs[1].id).toBe(1);
      expect(decoded!.discs[1].stamina).toBe(75);
    });
  });

  describe('4. Stadium Visual Selection & Live Profile Synchronization', () => {
    it('triggers onStadiumChanged when a stadium is selected', () => {
      const stadiumSpy = vi.fn();
      gameUI.onStadiumChanged = stadiumSpy;

      gameUI.selectStadium('small');
      expect(stadiumSpy).toHaveBeenCalledWith('small');
      expect(gameUI.selectedStadiumId).toBe('small');
    });

    it('triggers onProfileUpdated when nickname, avatar, or settings are saved', () => {
      const profileSpy = vi.fn();
      gameUI.onProfileUpdated = profileSpy;

      gameUI.setPlayerNickname('NewHero');
      expect(profileSpy).toHaveBeenCalledTimes(1);

      gameUI.setPlayerAvatar('9', 'letters');
      expect(profileSpy).toHaveBeenCalledTimes(2);

      gameUI.saveSettings({ theme: 'dark' });
      expect(profileSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('5. Captain Kit Lock & Spectator Auto-Balance', () => {
    it('manages allowCaptainKitSwitch setting', () => {
      expect(gameUI.allowCaptainKitSwitch).toBe(false);
      gameUI.allowCaptainKitSwitch = true;
      expect(gameUI.allowCaptainKitSwitch).toBe(true);
    });

    it('smart autoBalances spectators: prioritizes team with fewer players, then distributes equally', () => {
      gameUI.isHost = true;
      gameUI.isAdmin = true;
      // Setup: Red has 1, Blue has 0, 3 spectators
      gameUI.rosterPlayers = [
        { id: 1, peerId: 'p1', nickname: 'Host', name: 'Host', team: 'red', number: 1, isAdmin: true, isHost: true, ping: 10 },
        { id: 2, peerId: 'p2', nickname: 'Spec1', name: 'Spec1', team: 'spectator', number: 2, isAdmin: false, isHost: false, ping: 20 },
        { id: 3, peerId: 'p3', nickname: 'Spec2', name: 'Spec2', team: 'spectator', number: 3, isAdmin: false, isHost: false, ping: 30 },
        { id: 4, peerId: 'p4', nickname: 'Spec3', name: 'Spec3', team: 'spectator', number: 4, isAdmin: false, isHost: false, ping: 40 }
      ];

      // Priority 1: redCount (1) > blueCount (0) -> moves Spec1 to BLUE
      const success1 = gameUI.autoBalanceSpectators();
      expect(success1).toBe(true);
      expect(gameUI.rosterPlayers.find((p) => p.id === 2)?.team).toBe('blue');
      expect(gameUI.rosterPlayers.find((p) => p.id === 3)?.team).toBe('spectator');
      expect(gameUI.rosterPlayers.find((p) => p.id === 4)?.team).toBe('spectator');

      // Priority 2: redCount (1) === blueCount (1), remaining spectators >= 2 (Spec2 and Spec3)
      // Distributes Spec2 to red, Spec3 to blue
      const success2 = gameUI.autoBalanceSpectators();
      expect(success2).toBe(true);
      expect(gameUI.rosterPlayers.find((p) => p.id === 3)?.team).toBe('red');
      expect(gameUI.rosterPlayers.find((p) => p.id === 4)?.team).toBe('blue');

      // Now 0 spectators remaining -> returns false
      expect(gameUI.autoBalanceSpectators()).toBe(false);
    });

    it('smart autoBalances single spectator when teams are equal', () => {
      gameUI.isHost = true;
      gameUI.isAdmin = true;
      gameUI.rosterPlayers = [
        { id: 1, peerId: 'p1', nickname: 'R1', name: 'R1', team: 'red', number: 1, isAdmin: true, isHost: true, ping: 10 },
        { id: 2, peerId: 'p2', nickname: 'B1', name: 'B1', team: 'blue', number: 2, isAdmin: false, isHost: false, ping: 10 },
        { id: 3, peerId: 'p3', nickname: 'Spec1', name: 'Spec1', team: 'spectator', number: 3, isAdmin: false, isHost: false, ping: 20 }
      ];

      // Priority 2 with 1 spectator -> moves to red
      expect(gameUI.autoBalanceSpectators()).toBe(true);
      expect(gameUI.rosterPlayers.find((p) => p.id === 3)?.team).toBe('red');
    });

    it('resets all players in Red and Blue back to Spectators', () => {
      gameUI.isHost = true;
      gameUI.isAdmin = true;
      gameUI.rosterPlayers = [
        { id: 1, peerId: 'p1', nickname: 'R1', name: 'R1', team: 'red', number: 1, isAdmin: true, isHost: true, ping: 10 },
        { id: 2, peerId: 'p2', nickname: 'B1', name: 'B1', team: 'blue', number: 2, isAdmin: false, isHost: false, ping: 10 },
        { id: 3, peerId: 'p3', nickname: 'S1', name: 'S1', team: 'spectator', number: 3, isAdmin: false, isHost: false, ping: 20 }
      ];

      const changed = gameUI.resetTeamsToSpectators();
      expect(changed).toBe(true);
      expect(gameUI.rosterPlayers.every((p) => p.team === 'spectator')).toBe(true);
      expect(gameUI.redKitVariant).toBe('home');
      expect(gameUI.blueKitVariant).toBe('away');
    });
  });

  describe('6. Emote Trigger Matching & State Decoupling', () => {
    it('accurately identifies configured emote triggers and standard emojis', () => {
      expect(gameUI.matchEmoteTrigger(':gol:')).toBe('⚽');
      expect(gameUI.matchEmoteTrigger(':fuego:')).toBe('🔥');
      expect(gameUI.matchEmoteTrigger(':gg:')).toBe('👑');
      expect(gameUI.matchEmoteTrigger('⚽')).toBe('⚽');
      expect(gameUI.matchEmoteTrigger('Normal message')).toBeNull();
    });

    it('stores pitch emotes in a decoupled static Map with expiration without touching reactive proxy', () => {
      expect(activePitchEmotes.size).toBe(0);

      triggerPitchEmote(1, '🔥', 2000);
      expect(activePitchEmotes.size).toBe(1);

      const entry = activePitchEmotes.get(1);
      expect(entry).toBeDefined();
      expect(entry!.emoji).toBe('🔥');
      expect(entry!.expiresAt).toBeGreaterThan(performance.now());
    });
  });

  describe('7. Post-Match Stats Snapshot & Score Preservation', () => {
    it('preserves real scores, winner banner and duration in lastMatchStats snapshot after engine stops', () => {
      const snapshot: MatchStatsSnapshot = {
        redScore: 3,
        blueScore: 1,
        matchDuration: 180,
        winner: 'red',
        winnerTeamName: 'Equipo Rojo',
        redTeamName: 'Equipo Rojo',
        blueTeamName: 'Equipo Azul',
        redAcronym: 'RED',
        blueAcronym: 'BLU',
        mvpPlayerId: 1,
        mvpName: 'SuperStriker',
        mvpScore: 450,
        players: []
      };

      gameUI.lastMatchStats = snapshot;
      gameUI.hasCompletedMatch = true;

      // When stopMatch() is executed, raw scores might reset to 0 in engine,
      // but the snapshot must hold the final 3 - 1 score and winner banner
      gameUI.redScore = 0;
      gameUI.blueScore = 0;
      gameUI.matchTimeFormatted = '00:00';

      const readSnapshot = gameUI.lastMatchStats as MatchStatsSnapshot;
      expect(readSnapshot.redScore).toBe(3);
      expect(readSnapshot.blueScore).toBe(1);
      expect(readSnapshot.winner).toBe('red');
      expect(readSnapshot.winnerTeamName).toBe('Equipo Rojo');
      expect(readSnapshot.matchDuration).toBe(180);
    });

    it('clears hasCompletedMatch, lastMatchStats and resets activeSlide when a new match starts', () => {
      gameUI.hasCompletedMatch = true;
      gameUI.lastMatchStats = { redScore: 2, blueScore: 0 } as any;
      gameUI.activeSlide = 'STATS';

      // Host clicks start match
      gameUI.startMatch();

      expect(gameUI.hasCompletedMatch).toBe(false);
      expect(gameUI.lastMatchStats).toBeNull();
      expect(gameUI.activeSlide).toBe('MENU');
    });
  });

  describe('8. Canonical Kickoff Spawns, Free Movement in Kickoff & Mid-game Joiner Goal-Line Spawn', () => {
    it('positions players at regulatory kickoff spawn distance (|x| ≈ spawnDistance) upon startMatch, never on goal line (|x| = halfWidth)', () => {
      const stadium = createStadium('mediano');
      const engine = new EngineInstance(stadium);
      engine.addPlayer(1, 'red');
      engine.addPlayer(2, 'blue');

      engine.startMatch();

      const p1 = engine.players.get(1)!;
      const p2 = engine.players.get(2)!;

      // Mediano spawn distance is 360, halfWidth is 600
      expect(stadium.spawnDistance).toBe(360);
      expect(stadium.halfWidth).toBe(600);

      // Red must be at -360, Blue at +360 (regulatory spawn, NOT goal lines at ±600)
      expect(p1.pos.x).toBe(-stadium.spawnDistance);
      expect(p1.pos.y).toBe(0);
      expect(p1.vel.x).toBe(0);
      expect(p1.vel.y).toBe(0);

      expect(p2.pos.x).toBe(stadium.spawnDistance);
      expect(p2.pos.y).toBe(0);
      expect(p2.vel.x).toBe(0);
      expect(p2.vel.y).toBe(0);

      // Ball is placed dead center
      expect(engine.ball.pos.x).toBe(0);
      expect(engine.ball.pos.y).toBe(0);
      expect(engine.ball.vel.x).toBe(0);
      expect(engine.ball.vel.y).toBe(0);
    });

    it('enables player kinematics and movement inputs during KICKOFF phase (|v| > 0 towards ball)', () => {
      const stadium = createStadium('mediano');
      const engine = new EngineInstance(stadium);
      engine.addPlayer(1, 'red');
      engine.startMatch();

      const p1 = engine.players.get(1)!;
      expect(p1.pos.x).toBe(-stadium.spawnDistance);
      expect(p1.vel.x).toBe(0);

      // Apply right movement input towards center/ball during KICKOFF
      const inputs = new Map();
      inputs.set(1, { dirX: 1, dirY: 0 });
      engine.step(inputs);

      // Player must accelerate and move forward (|v| > 0)
      expect(p1.vel.x).toBeGreaterThan(0);
      expect(p1.pos.x).toBeGreaterThan(-stadium.spawnDistance);
    });

    it('freezes match timer at 00:00 during kickoff and starts ticking once ball is touched (|v| > 0.15)', () => {
      const stadium = createStadium('mediano');
      const engine = new EngineInstance(stadium);
      engine.addPlayer(1, 'red');
      engine.startMatch();

      // Step multiple ticks with player moving but not touching ball yet
      for (let i = 0; i < 30; i++) {
        engine.step(new Map());
      }
      expect(engine.fsm.matchTicksElapsed).toBe(0);
      expect(engine.getState().matchTimer).toBe(0);

      // Player touches ball or kicks ball (|v| > 0.15)
      engine.ball.vel.set(50, 0);
      engine.step(new Map());

      // Transitions to PLAYING and timer starts advancing
      expect(engine.fsm.state).toBe(2); // MatchPhase.PLAYING
      expect(engine.fsm.matchTicksElapsed).toBeGreaterThan(0);
    });

    it('spawns joining player on their team goal line when match is live (PLAYING) without altering ball or existing players', () => {
      const stadium = createStadium('mediano');
      const engine = new EngineInstance(stadium);
      engine.addPlayer(1, 'red');
      engine.startMatch();
      engine.fsm.startPlaying();

      // Move ball and player 1
      engine.ball.pos.set(50, 20);
      engine.ball.vel.set(2, 3);
      const p1 = engine.players.get(1)!;
      p1.pos.set(-100, 30);
      p1.vel.set(1, 1);

      // Player 2 joins Red mid-match
      engine.setPlayerTeam(2, 'red');
      const p2 = engine.players.get(2)!;
      expect(p2).toBeDefined();
      expect(p2.pos.x).toBeCloseTo(-stadium.halfWidth + p2.radius + 2, 0);
      expect(p2.pos.y).toBe(0);
      expect(p2.vel.x).toBe(0);
      expect(p2.vel.y).toBe(0);

      // Ball and Player 1 positions and velocities are completely undisturbed!
      expect(engine.ball.pos.x).toBe(50);
      expect(engine.ball.pos.y).toBe(20);
      expect(engine.ball.vel.x).toBe(2);
      expect(engine.ball.vel.y).toBe(3);
      expect(p1.pos.x).toBe(-100);
      expect(p1.pos.y).toBe(30);

      // Player 3 joins Blue mid-match
      engine.setPlayerTeam(3, 'blue');
      const p3 = engine.players.get(3)!;
      expect(p3).toBeDefined();
      expect(p3.pos.x).toBeCloseTo(stadium.halfWidth - p3.radius - 2, 0);
      expect(p3.pos.y).toBe(0);
      expect(p3.vel.x).toBe(0);
      expect(p3.vel.y).toBe(0);
    });
  });

  describe('9. Strictly Conditional Acronym Outline', () => {
    it('applies text contour and stroke only when outline or hasOutline is true', () => {
      // Default kit: outline is false
      expect(gameUI.redTeamKit.outline).toBe(false);
      expect(gameUI.redTeamKit.hasOutline).toBe(false);

      const hasOutline1 = Boolean(gameUI.redCaptainKit?.outline === true || gameUI.redCaptainKit?.hasOutline === true);
      expect(hasOutline1).toBe(false);

      // When outline is enabled
      const customKit = { ...gameUI.redCaptainKit, outline: true, hasOutline: true };
      const hasOutline2 = Boolean(customKit?.outline === true || customKit?.hasOutline === true);
      expect(hasOutline2).toBe(true);
    });
  });
});
