import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';
import { BinaryProtocol, type GameStateSnapshot } from '@legacyx/core';
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

  describe('2. Practice / Solo Mode Player Registration', () => {
    it('registers local player into rosterPlayers and players with team red and ping 0', () => {
      gameUI.nickname = 'SoloStriker';
      gameUI.enterPracticeMode();

      expect(gameUI.isHost).toBe(true);
      expect(gameUI.isAdmin).toBe(true);
      expect(gameUI.localPlayerId).toBe(1);
      expect(gameUI.rosterPlayers.length).toBe(1);
      expect(gameUI.players.length).toBe(1);

      const localPlayer = gameUI.rosterPlayers[0];
      expect(localPlayer.id).toBe(1);
      expect(localPlayer.team).toBe('red');
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

    it('autoBalances spectators distributing 1 to Red and 1 to Blue', () => {
      gameUI.isHost = true;
      gameUI.isAdmin = true;
      gameUI.rosterPlayers = [
        { id: 1, peerId: 'p1', nickname: 'Host', name: 'Host', team: 'red', number: 1, isAdmin: true, isHost: true, ping: 10 },
        { id: 2, peerId: 'p2', nickname: 'Spec1', name: 'Spec1', team: 'spectator', number: 2, isAdmin: false, isHost: false, ping: 20 },
        { id: 3, peerId: 'p3', nickname: 'Spec2', name: 'Spec2', team: 'spectator', number: 3, isAdmin: false, isHost: false, ping: 30 },
        { id: 4, peerId: 'p4', nickname: 'Spec3', name: 'Spec3', team: 'spectator', number: 4, isAdmin: false, isHost: false, ping: 40 }
      ];

      const success = gameUI.autoBalanceSpectators();
      expect(success).toBe(true);

      // Spec1 moved to red, Spec2 moved to blue
      expect(gameUI.rosterPlayers.find((p) => p.id === 2)?.team).toBe('red');
      expect(gameUI.rosterPlayers.find((p) => p.id === 3)?.team).toBe('blue');
      // Spec3 remains spectator until next click
      expect(gameUI.rosterPlayers.find((p) => p.id === 4)?.team).toBe('spectator');
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
});
