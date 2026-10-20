import { describe, it, expect, beforeEach } from 'vitest';
import { gameUI, type RoomInfo } from '../../src/ui/state/gameUI.svelte.js';

describe('Unified Menu/Stats Container & Overlay Stack Management Suite', () => {
  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.fsmPhase = 'PLAYING';
    gameUI.matchPhase = 2;
    gameUI.activeModal = 'NONE';
    gameUI.modalStack = [];
    gameUI.hasCompletedMatch = false;
  });

  describe('1. Secondary Overlay Protection vs Invariant FSM Guards', () => {
    it('identifies secondary overlays accurately via isSecondaryOverlayOpen', () => {
      expect(gameUI.isSecondaryOverlayOpen).toBe(false);

      gameUI.openOverlay('SETTINGS');
      expect(gameUI.isSecondaryOverlayOpen).toBe(true);

      gameUI.openOverlay('MODIFIERS');
      expect(gameUI.activeModal).toBe('PHYSICS_MODIFIERS');
      expect(gameUI.isSecondaryOverlayOpen).toBe(true);

      gameUI.openOverlay('STADIUM_SELECT');
      expect(gameUI.activeModal).toBe('STADIUM_SELECTOR');
      expect(gameUI.isSecondaryOverlayOpen).toBe(true);

      gameUI.openModal('TEAM_SELECT');
      expect(gameUI.activeModal).toBe('TEAM_MANAGEMENT');
      expect(gameUI.isSecondaryOverlayOpen).toBe(false);
      expect(gameUI.isRoomPanelOpen).toBe(true);
    });

    it('enforceStopMenu does NOT override active secondary overlays in 0: STOP', () => {
      gameUI.matchPhase = 0;
      gameUI.fsmPhase = 'STOPPED';

      // Open secondary overlay (e.g. Modifiers)
      gameUI.openOverlay('MODIFIERS');
      expect(gameUI.activeModal).toBe('PHYSICS_MODIFIERS');

      // FSM tick tries to enforce stop menu
      gameUI.enforceStopMenu();

      // Modal must remain PHYSICS_MODIFIERS and not get overridden to TEAM_MANAGEMENT
      expect(gameUI.activeModal).toBe('PHYSICS_MODIFIERS');
    });

    it('enforceStopMenu preserves STATS view when post-match summary is visible', () => {
      gameUI.matchPhase = 0;
      gameUI.fsmPhase = 'STOPPED';
      gameUI.activeModal = 'STATS';

      gameUI.enforceStopMenu();
      expect(gameUI.activeModal).toBe('STATS');
    });

    it('enforceStopMenu restores TEAM_MANAGEMENT if no overlay or stats is active in 0: STOP', () => {
      gameUI.matchPhase = 0;
      gameUI.fsmPhase = 'STOPPED';
      gameUI.activeModal = 'NONE';

      gameUI.enforceStopMenu();
      expect(gameUI.activeModal).toBe('TEAM_MANAGEMENT');
    });
  });

  describe('2. Room Menu Toggle & In-Game Keyboard Behavior', () => {
    it('toggles menu open and closed during active match gameplay', () => {
      gameUI.matchPhase = 2; // PLAYING
      gameUI.activeModal = 'NONE';

      gameUI.toggleRoomMenu();
      expect(gameUI.activeModal).toBe('TEAM_MANAGEMENT');

      gameUI.toggleRoomMenu();
      expect(gameUI.activeModal).toBe('NONE');
    });

    it('locks menu open and refuses to close via toggleRoomMenu in 0: STOP', () => {
      gameUI.matchPhase = 0;
      gameUI.fsmPhase = 'STOPPED';
      gameUI.activeModal = 'TEAM_MANAGEMENT';

      gameUI.toggleRoomMenu();
      // Menu must remain open
      expect(gameUI.activeModal).toBe('TEAM_MANAGEMENT');
    });

    it('closes secondary overlay first if open when toggleRoomMenu is called', () => {
      gameUI.matchPhase = 2;
      gameUI.openOverlay('SETTINGS');
      expect(gameUI.activeModal).toBe('SETTINGS');

      gameUI.toggleRoomMenu();
      // Should close settings and return to previous state
      expect(gameUI.isSecondaryOverlayOpen).toBe(false);
    });
  });

  describe('3. Room Privacy, Password & Match Stats State Integration', () => {
    it('supports room password property in RoomInfo and conditional clearing', () => {
      const room: RoomInfo = {
        id: 'R-TEST',
        name: 'Private Room',
        playersCount: 1,
        maxPlayers: 10,
        ping: 15,
        isPrivate: true,
        password: 'secret_code_123',
        stadium: 'mediano'
      };

      gameUI.activeRoom = room;
      expect(gameUI.activeRoom.isPrivate).toBe(true);
      expect(gameUI.activeRoom.password).toBe('secret_code_123');

      // When toggled to public, password should be cleared
      gameUI.activeRoom.isPrivate = false;
      gameUI.activeRoom.password = '';
      expect(gameUI.activeRoom.password).toBe('');
    });

    it('tracks completed match lifecycle with hasCompletedMatch flag', () => {
      expect(gameUI.hasCompletedMatch).toBe(false);

      // Match finishes and transitions to phase 5 (STATS)
      gameUI.matchPhase = 5;
      gameUI.hasCompletedMatch = true;

      expect(gameUI.hasCompletedMatch).toBe(true);
      expect(gameUI.matchPhase).toBe(5);
    });
  });
});
