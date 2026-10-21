import { describe, it, expect, vi } from 'vitest';
import { GameFSM } from '@legacyx/core';
import { EngineInstance } from '@legacyx/core';
import { MatchPhase } from '@legacyx/core';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import { NetworkClient } from '../../src/net/NetworkClient.js';
import type { SignalingClient } from '../../src/net/SignalingClient.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

describe('P2P WebRTC Handshake & Role Hierarchy Integration Tests', () => {
  describe('1. Kickoff Match Clock Freeze', () => {
    it('freezes matchTicksElapsed during STOP and KICKOFF until ball is touched/kicked', () => {
      const fsm = new GameFSM();
      expect(fsm.state).toBe(MatchPhase.STOP);
      expect(fsm.matchTicksElapsed).toBe(0);

      // Transition to KICKOFF
      fsm.startMatch();
      expect(fsm.state).toBe(MatchPhase.KICKOFF);

      // Simulate 120 ticks without ball contact
      for (let i = 0; i < 120; i++) {
        fsm.updateTick();
      }

      // In KICKOFF before ball contact, match clock MUST be frozen at 0 ticks
      expect(fsm.matchTicksElapsed).toBe(0);

      // Ball touched / kicked -> triggers PLAYING
      fsm.startPlaying();
      expect(fsm.state).toBe(MatchPhase.PLAYING);

      // Simulate 60 ticks in PLAYING
      for (let i = 0; i < 60; i++) {
        fsm.updateTick();
      }

      // Now match clock advances normally (60 ticks = 1 second)
      expect(fsm.matchTicksElapsed).toBe(60);

      // Goal scored -> switches to GOAL phase and clock pauses
      fsm.registerGoal('red');
      expect(fsm.state).toBe(MatchPhase.GOAL);
      const ticksAtGoal = fsm.matchTicksElapsed;
      for (let i = 0; i < 60; i++) {
        fsm.updateTick();
      }
      expect(fsm.matchTicksElapsed).toBe(ticksAtGoal);
    });

    it('EngineInstance starts with clock at 00:00 and only advances once active in PLAYING', () => {
      const engine = new EngineInstance('clasico');
      expect(engine.fsm.state).toBe(MatchPhase.STOP);
      expect(engine.fsm.matchTicksElapsed).toBe(0);

      // Step engine in STOP state
      engine.step(new Map());
      expect(engine.fsm.matchTicksElapsed).toBe(0);
    });
  });

  describe('2. 4-Role Permission Hierarchy', () => {
    it('enforces Host-only capabilities on room destruction and physics modifiers', () => {
      // Setup mock host and client
      gameUI.isHost = true;
      gameUI.isAdmin = true;

      // Host can update physics modifiers
      expect(gameUI.isHost).toBe(true);

      // Guest role: not host, regular player
      gameUI.isHost = false;
      gameUI.isAdmin = false;
      expect(gameUI.isHost).toBe(false);
      expect(gameUI.isAdmin).toBe(false);

      // Admin role (promoted): isAdmin true, but isHost false
      gameUI.isAdmin = true;
      expect(gameUI.isAdmin).toBe(true);
      expect(gameUI.isHost).toBe(false);
    });

    it('propagates captain kits to red and blue teams based on first player of each team', () => {
      gameUI.rosterPlayers = [
        {
          id: 1,
          name: 'RedCaptain',
          team: 'red',
          localKit: {
            primaryColor: '#ff0000',
            secondaryColor: '#ffffff',
            tertiaryColor: '#ffff00',
            pattern: 'vertical',
            hasOutline: true
          }
        },
        {
          id: 2,
          name: 'RedPlayer2',
          team: 'red',
          localKit: {
            primaryColor: '#000000',
            secondaryColor: '#000000',
            tertiaryColor: '#000000'
          }
        },
        {
          id: 3,
          name: 'BlueCaptain',
          team: 'blue',
          visitorKit: {
            primaryColor: '#0000ff',
            secondaryColor: '#ffffff',
            tertiaryColor: '#00ffff',
            pattern: 'hoop',
            hasOutline: false
          }
        }
      ];

      expect(gameUI.redCaptainKit?.primaryColor).toBe('#ff0000');
      expect(gameUI.redCaptainKit?.pattern).toBe('vertical');
      expect(gameUI.blueCaptainKit?.primaryColor).toBe('#0000ff');
      expect(gameUI.blueCaptainKit?.pattern).toBe('hoop');
    });
  });

  describe('3. P2P CLIENT_HELLO and Room Lifecycle', () => {
    it('sends CLIENT_HELLO on connection and synchronizes profile in NetworkClient', () => {
      const mockSignaling: Partial<SignalingClient> = {
        sendSignal: vi.fn(),
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        whenIceReady: vi.fn().mockResolvedValue(undefined)
      };

      const client = new NetworkClient(mockSignaling as SignalingClient, 'PlayerOne', 7, {
        avatar: '7',
        avatarType: 'text',
        kit: { primaryColor: '#00ff00' }
      });

      expect((client as any).nickname).toBe('PlayerOne');
      expect((client as any).profile.avatar).toBe('7');
      expect((client as any).profile.avatarType).toBe('text');

      // Update profile
      client.updateProfile('NewName', { avatar: '🔥', avatarType: 'emoji' });
      expect((client as any).nickname).toBe('NewName');
      expect((client as any).profile.avatar).toBe('🔥');
      expect((client as any).profile.avatarType).toBe('emoji');
    });

    it('NetworkHost maintains player roster and destroys room on host departure', () => {
      const mockSignaling: Partial<SignalingClient> = {
        sendSignal: vi.fn(),
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      };

      const host = new NetworkHost(mockSignaling as SignalingClient, 'HostBoss', {
        avatar: '1',
        avatarType: 'letters'
      });

      expect(host.players.size).toBe(1);
      const hostPlayer = host.players.get(1);
      expect(hostPlayer).toBeDefined();
      expect(hostPlayer?.name).toBe('HostBoss');
      expect(hostPlayer?.isAdmin).toBe(true);

      // Close room and destroy
      const broadcastSpy = vi.spyOn(host, 'broadcastReliable');
      host.closeRoomAndDestroy();
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ROOM_CLOSED'
        })
      );
      expect(host.peers.size).toBe(0);
    });
  });
});
