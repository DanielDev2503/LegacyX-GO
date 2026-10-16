/**
 * gameUI.svelte.ts
 * Centralized Reactive UI State for LegacyX-GO using Svelte 5 Runes ($state).
 */

import { soundFX } from '../../audio/SoundFX.js';

export type ScreenType = 'GATEKEEPER' | 'LOBBY' | 'ROOM_CREATOR' | 'IN_GAME';
export type ModalType = 'NONE' | 'SETTINGS' | 'PHYSICS_MODIFIERS' | 'TEAM_MANAGEMENT' | 'PASSWORD_PROMPT' | 'STADIUM_SELECTOR';

export interface RoomInfo {
  id: string;
  name: string;
  playersCount: number;
  maxPlayers: number;
  ping: number;
  isPrivate: boolean;
  stadium: string;
}

export interface PlayerStatEntry {
  nickname: string;
  points: number;
  goals: number;
  assists: number;
  passes: number;
  shots: number;
  isCaptain?: boolean;
  isMvp?: boolean;
}

export interface PhysicsModifiers {
  gravity: number; // -50 to 50
  pitchFriction: number; // 0.900 to 0.999
  wallBounciness: number; // 0.10 to 1.20
  postBounciness: number; // 0.20 to 1.30
  baseKickStrength: number; // 200 to 900
  dashPower: number; // 100 to 600
  dashCooldown: number; // 0.2 to 5.0
  playerMass: number; // 0.5 to 3.0
  playerRadius: number; // 10 to 25
  ballMass: number; // 0.05 to 1.00
  ballRadius: number; // 6 to 20
  magnusCoefficient: number; // 0.0 to 0.010
  netElasticity: number; // 0.10 to 0.90
  netDamping: number; // 0.02 to 0.50
  goalCelebrationDuration: number; // 1.0 to 6.0
  goalLimit: number; // 1 to 15
  matchTimeMinutes: number; // 1.0 to 15.0
  goldenGoalOvertime: boolean; // true / false
  airDensity: number; // 0.0 to 3.0
}

export const DEFAULT_PHYSICS_MODIFIERS: Readonly<PhysicsModifiers> = {
  gravity: 0.0,
  pitchFriction: 0.990,
  wallBounciness: 0.80,
  postBounciness: 0.85,
  baseKickStrength: 450.0,
  dashPower: 280.0,
  dashCooldown: 1.5,
  playerMass: 1.0,
  playerRadius: 15.0,
  ballMass: 0.20,
  ballRadius: 10.0,
  magnusCoefficient: 0.0025,
  netElasticity: 0.45,
  netDamping: 0.12,
  goalCelebrationDuration: 3.0,
  goalLimit: 3,
  matchTimeMinutes: 3.0,
  goldenGoalOvertime: true,
  airDensity: 1.0
};

class GameUIStore {
  // Navigation & Screens
  public currentScreen = $state<ScreenType>('GATEKEEPER');
  public activeModal = $state<ModalType>('NONE');

  // Player identity
  public nickname = $state('yami');
  public avatarMode = $state<'letters' | 'emoji'>('letters');
  public avatarValue = $state('YA');
  public playerNumber = $state(10);
  public selectedRegion = $state('SA (Sudamérica)');

  // Rooms & Lobby
  public rooms = $state<RoomInfo[]>([
    { id: 'R-1', name: 'Torneo Oficial 3v3 #1', playersCount: 5, maxPlayers: 6, ping: 18, isPrivate: false, stadium: 'AF 3v3' },
    { id: 'R-2', name: 'AF Clásico Competitivo', playersCount: 3, maxPlayers: 4, ping: 24, isPrivate: true, stadium: 'Classic' },
    { id: 'R-3', name: 'Pachanga Nocturna Libre', playersCount: 2, maxPlayers: 8, ping: 38, isPrivate: false, stadium: 'Big Pitch' },
    { id: 'R-4', name: 'Pruebas de Modificadores', playersCount: 1, maxPlayers: 2, ping: 15, isPrivate: false, stadium: 'Small' },
    { id: 'R-5', name: 'Liga Diamante SA #2', playersCount: 4, maxPlayers: 6, ping: 22, isPrivate: true, stadium: 'AF 3v3' }
  ]);
  public roomFilterQuery = $state('');
  public filterLockedOnly = $state(false);
  public activeRoom = $state<RoomInfo | null>(null);
  public pendingPasswordRoom = $state<RoomInfo | null>(null);
  public pendingPasswordInput = $state('');

  // Match HUD Telemetry
  public matchId = $state('CTNYRS');
  public redScore = $state(0);
  public blueScore = $state(0);
  public matchTimeFormatted = $state('00:00');
  public fsmPhase = $state<'WARMUP' | 'KICKOFF' | 'PLAYING' | 'GOAL' | 'OVERTIME' | 'STATS'>('PLAYING');
  public redPossession = $state(48);
  public bluePossession = $state(52);
  public pingMs = $state(24);
  public fps = $state(60);
  public activeStadiumName = $state('AF 3v3 Official');

  // Post-match Carousel state (100vw slides)
  public postMatchSlide = $state<0 | 1 | 2>(0);
  public mvp = $state({
    nickname: 'yami',
    points: 420,
    goals: 3,
    assists: 1,
    team: 'blue' as 'red' | 'blue'
  });
  public redTeamStats = $state<PlayerStatEntry[]>([
    { nickname: 'kiko', points: 180, goals: 0, assists: 0, passes: 14, shots: 2, isCaptain: true },
    { nickname: 'dani', points: 140, goals: 0, assists: 0, passes: 9, shots: 1 },
    { nickname: 'mateo', points: 110, goals: 0, assists: 0, passes: 6, shots: 0 }
  ]);
  public blueTeamStats = $state<PlayerStatEntry[]>([
    { nickname: 'yami', points: 420, goals: 3, assists: 1, passes: 12, shots: 4, isMvp: true },
    { nickname: 'nano', points: 290, goals: 0, assists: 2, passes: 18, shots: 3, isCaptain: true },
    { nickname: 'leo', points: 210, goals: 0, assists: 0, passes: 11, shots: 1 }
  ]);

  // Physical Modifiers
  public modifiers = $state<PhysicsModifiers>({ ...DEFAULT_PHYSICS_MODIFIERS });
  public activeModifiersTab = $state<'player' | 'ball' | 'mechanics'>('player');

  // Audio settings
  public isAudioMuted = $state(false);
  public masterVolume = $state(0.5);

  // Callbacks for Worker integration
  public onModifiersChanged: ((modifiers: PhysicsModifiers) => void) | null = null;
  public onStartPracticeMode: (() => void) | null = null;

  // Actions
  public navigateTo(screen: ScreenType): void {
    soundFX.playUIClick();
    this.currentScreen = screen;
  }

  public openModal(modal: ModalType): void {
    soundFX.playUIClick();
    this.activeModal = modal;
  }

  public closeModal(): void {
    soundFX.playUIClick();
    this.activeModal = 'NONE';
    this.pendingPasswordRoom = null;
    this.pendingPasswordInput = '';
  }

  public toggleMute(): void {
    const muted = soundFX.toggleMute();
    this.isAudioMuted = muted;
  }

  public setVolume(val: number): void {
    this.masterVolume = val;
    soundFX.setMasterVolume(val);
  }

  public updateModifier<K extends keyof PhysicsModifiers>(key: K, value: PhysicsModifiers[K]): void {
    this.modifiers[key] = value;
    if (this.onModifiersChanged) {
      this.onModifiersChanged({ ...this.modifiers });
    }
  }

  public resetModifiersToDefault(): void {
    soundFX.playUIClick();
    this.modifiers = { ...DEFAULT_PHYSICS_MODIFIERS };
    if (this.onModifiersChanged) {
      this.onModifiersChanged({ ...this.modifiers });
    }
  }

  public selectRoomToJoin(room: RoomInfo): void {
    if (room.isPrivate) {
      this.pendingPasswordRoom = room;
      this.pendingPasswordInput = '';
      this.openModal('PASSWORD_PROMPT');
    } else {
      this.joinRoomDirectly(room);
    }
  }

  public joinRoomDirectly(room: RoomInfo): void {
    soundFX.playUIClick();
    this.activeRoom = room;
    this.activeStadiumName = room.stadium;
    this.navigateTo('IN_GAME');
  }

  public enterPracticeMode(): void {
    soundFX.playUIClick();
    this.activeRoom = {
      id: 'LOCAL-PRACTICE',
      name: 'Entrenamiento Táctico',
      playersCount: 1,
      maxPlayers: 1,
      ping: 0,
      isPrivate: false,
      stadium: 'AF 3v3'
    };
    this.navigateTo('IN_GAME');
    if (this.onStartPracticeMode) {
      this.onStartPracticeMode();
    }
  }

  public createRoomAndLaunch(name: string, stadium: string, maxPlayers: number, isPrivate: boolean): void {
    soundFX.playUIClick();
    const newRoom: RoomInfo = {
      id: `R-${Date.now().toString().slice(-4)}`,
      name: name || 'Nueva Sala',
      playersCount: 1,
      maxPlayers: maxPlayers,
      ping: 20,
      isPrivate: isPrivate,
      stadium: stadium
    };
    this.rooms.push(newRoom);
    this.activeRoom = newRoom;
    this.activeStadiumName = stadium;
    this.navigateTo('IN_GAME');
  }

  public get filteredRooms(): RoomInfo[] {
    return this.rooms.filter(room => {
      if (this.filterLockedOnly && !room.isPrivate) return false;
      if (this.roomFilterQuery.trim().length > 0) {
        const q = this.roomFilterQuery.toLowerCase();
        return room.name.toLowerCase().includes(q) || room.id.toLowerCase().includes(q);
      }
      return true;
    });
  }
}

export const gameUI = new GameUIStore();
