/**
 * gameUI.svelte.ts
 * Centralized Reactive UI State for LegacyX-GO using Svelte 5 Runes ($state, $derived).
 */

import { soundFX } from '../../audio/SoundFX.js';
import { sharedSignaling, type SignalingClient } from '../../net/SignalingClient.js';
import { type GameplayConfig, DEFAULT_GAMEPLAY_CONFIG } from '@legacyx/core';
import { $gameConfig as gameConfigStore } from '../../controllers/stores/gameStore.js';
import { triggerPitchEmote } from '../../renderer/DiscRenderer.js';
import { EMOJI_CATALOG } from '../utils/constants.js';

export type ScreenType = 'GATEKEEPER' | 'LOBBY' | 'ROOM_CREATOR' | 'IN_GAME';
export type ModalType =
  | 'NONE'
  | 'SETTINGS'
  | 'KEYBINDS'
  | 'PHYSICS_MODIFIERS'
  | 'TEAM_MANAGEMENT'
  | 'PASSWORD_PROMPT'
  | 'STADIUM_SELECTOR'
  | 'MODIFIERS'
  | 'STADIUM_SELECT'
  | 'STATS'
  | 'TEAM_SELECT'
  | 'settings'
  | 'keybinds'
  | 'physics'
  | 'teamSelect'
  | 'stadiumSelect'
  | 'stats';

export type BallSkinType = 'classic' | 'retro' | 'neon';
export type StadiumPresetKey =
  | 'individual'
  | 'small'
  | 'medium'
  | 'mediano'
  | 'classic'
  | 'big'
  | '1v1'
  | '2v2'
  | '3v3'
  | '4v4'
  | 'Individual'
  | 'Pequeño'
  | 'Mediano'
  | 'Grande'
  | 'Individual (1v1)'
  | 'Pequeño (2v2)'
  | 'Mediano (3v3)'
  | 'Grande (4v4)'
  | 'af_3v3'
  | 'AF 3v3 Official'
  | 'Classic Field'
  | 'Big Stadium'
  | 'Small Arena'
  | 'Futsal Pro Court'
  | 'Hockey Rink Arena'
  | 'Small'
  | 'Medium'
  | 'Classic'
  | 'Big'
  | 'af3v3'
  | 'smallarena'
  | 'bigstadium'
  | 'futsal'
  | 'hockey';
export type TeamSlot = 'red' | 'blue' | 'spectator';

export type PatternType =
  | 'solid'
  | 'vertical'
  | 'hoop'
  | 'vertical_stripe'
  | 'diagonal_right'
  | 'diagonal_left'
  | 'halves'
  | 'checkerboard'
  | 'diagonal'
  | 'cross'
  | 'chevrons'
  | 'diagonal_checks';

export interface KitConfig {
  primaryColor: string;
  secondaryColor: string;
  pattern: PatternType;
  tertiaryColor?: string;
  outlineColor?: string;
  hasOutline?: boolean;
  outline?: boolean;
}

export interface TeamKitConfig {
  name: string;
  tag: string;
  primaryColor: string;
  secondaryColor: string;
  pattern: PatternType;
  tertiaryColor?: string;
  outlineColor?: string;
  hasOutline?: boolean;
  outline?: boolean;
}

export interface EmoteTrigger {
  trigger: string;
  emoji: string;
}

export const SETTINGS_STORAGE_KEY = 'haxball_settings_v1';
export const KEYBINDS_STORAGE_KEY = 'haxball_keybinds_v1';
export const SETTINGS_VERSION_KEY = 'haxball_settings_version';
export const SETTINGS_VERSION = 2;
export const LEGACYX_PLAYER_NAME_KEY = 'legacyx_player_name';
export const LEGACYX_PLAYER_AVATAR_KEY = 'legacyx_player_avatar';
export const LEGACYX_AVATAR_TYPE_KEY = 'legacyx_avatar_type';
export const NICKNAME_STORAGE_KEY = 'legacyx_player_name';
export const AVATAR_STORAGE_KEY = 'legacyx_player_avatar';

export interface SettingsConfig {
  theme: 'dark' | 'light';

  // 4-Canal Audio Hierarchy
  masterVolume: number;
  chatVolume: number;
  sfxVolume: number;
  envVolume: number;
  crowdVolume: number;
  isMuted: boolean;

  // Canal 2: Chat y Social
  chatNormalSoundEnabled: boolean;
  chatMentionSoundEnabled: boolean;
  chatEmotesSoundEnabled: boolean;
  chatSoundEnabled: boolean;

  // Canal 3: SFX
  kickSoundEnabled: boolean;
  postHitSoundEnabled: boolean;

  // Canal 4: Entorno
  whistleSoundEnabled: boolean;
  goalSoundEnabled: boolean;
  crowdSoundEnabled: boolean;
  ambientSoundEnabled: boolean;

  // Video y Gráficos
  cameraZoom: number;
  chatOpacity: number;
  minimapOpacity: number;

  // Togglers Visuales de Jugabilidad
  magnusTrailEnabled: boolean;
  ballTrailEnabled: boolean;
  fireShotEnabled: boolean;
  floatingPointsEnabled: boolean;
  minimapEnabled: boolean;
  offscreenIndicatorsEnabled: boolean;
  offscreenIndicators: boolean;
  playerGlowEnabled: boolean;
  screenShakeEnabled: boolean;
  goalShakeEnabled: boolean;
  cameraFrustumOnMinimap: boolean;
  minimapCameraFrustum: boolean;

  // Minimapa
  minimapSize: 'small' | 'medium' | 'large' | number;
  minimapMode: 'radar' | 'overlay' | 'hidden' | 'always' | 'auto' | 'off';
  minimapPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  // Personalización del Balón (Diseño vs Color)
  ballMode: 'texture' | 'color';
  ballSkin: BallSkinType | 'futsal';
  ballCustomColor: string;

  // Compatibility fields
  fpsCap: number;
  extrapolationMs: number;
  netDeformationEnabled: boolean;
  showStatsMonitor: boolean;

  // Equipaciones (Local / Visitante)
  localKit: TeamKitConfig;
  visitorKit: TeamKitConfig;

  // Avatar y Emotes
  showPitchEmotes: boolean;
  emoteTriggers: EmoteTrigger[];
}

export const DEFAULT_SETTINGS: SettingsConfig = {
  theme: 'dark',
  masterVolume: 0.5,
  chatVolume: 0.7,
  sfxVolume: 0.7,
  envVolume: 0.5,
  crowdVolume: 0.4,
  isMuted: false,

  chatNormalSoundEnabled: true,
  chatMentionSoundEnabled: true,
  chatEmotesSoundEnabled: true,
  chatSoundEnabled: true,

  kickSoundEnabled: true,
  postHitSoundEnabled: true,

  whistleSoundEnabled: true,
  goalSoundEnabled: true,
  crowdSoundEnabled: true,
  ambientSoundEnabled: true,

  cameraZoom: 1.0,
  chatOpacity: 85,
  minimapOpacity: 90,

  magnusTrailEnabled: true,
  ballTrailEnabled: true,
  fireShotEnabled: true,
  floatingPointsEnabled: true,
  minimapEnabled: true,
  offscreenIndicatorsEnabled: true,
  offscreenIndicators: true,
  playerGlowEnabled: true,
  screenShakeEnabled: true,
  goalShakeEnabled: true,
  cameraFrustumOnMinimap: true,
  minimapCameraFrustum: true,

  minimapSize: 'medium',
  minimapMode: 'radar',
  minimapPosition: 'top-left',

  ballMode: 'texture',
  ballSkin: 'classic',
  ballCustomColor: '#ffffff',

  fpsCap: 60,
  extrapolationMs: 0,
  netDeformationEnabled: true,
  showStatsMonitor: true,

  localKit: {
    name: 'RED',
    tag: 'RED',
    primaryColor: '#e74c3c',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    outlineColor: 'none',
    hasOutline: false,
    outline: false,
    pattern: 'solid'
  },
  visitorKit: {
    name: 'BLUE',
    tag: 'BLUE',
    primaryColor: '#00e5ff',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    outlineColor: 'none',
    hasOutline: false,
    outline: false,
    pattern: 'solid'
  },

  showPitchEmotes: true,
  emoteTriggers: [
    { trigger: 'gol', emoji: '⚽' },
    { trigger: 'gg', emoji: '👑' },
    { trigger: 'wow', emoji: '😮' },
    { trigger: 'fire', emoji: '🔥' },
    { trigger: 'fuego', emoji: '🔥' }
  ]
};

export interface KeybindConfig {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  kick: string[];
  turbo: string[];
  dash: string[];
  curveLeft: string[];
  curveRight: string[];
  pause: string[];
  menu: string[];
  chat: string[];
}

export const DEFAULT_KEYBINDS: KeybindConfig = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  kick: ['Space'],
  turbo: ['ShiftLeft'],
  dash: ['ArrowUp'],
  curveLeft: ['ArrowLeft'],
  curveRight: ['ArrowRight'],
  pause: ['KeyP'],
  menu: ['Escape'],
  chat: ['Enter']
};

export interface RoomInfo {
  id: string;
  name: string;
  playersCount: number;
  maxPlayers: number;
  ping: number;
  isPrivate: boolean;
  password?: string;
  stadium: string;
  timeLimit?: number;
  scoreLimit?: number;
}

export interface RosterPlayer {
  id: number;
  peerId: string;
  nickname: string;
  name?: string;
  number?: number;
  avatar: string;
  avatarType?: 'letters' | 'emoji' | string;
  team: TeamSlot;
  isAdmin: boolean;
  isHost: boolean;
  ping: number;
  kit?: TeamKitConfig;
  localKit?: TeamKitConfig;
  visitorKit?: TeamKitConfig;
  activeEmote?: { emoji: string; timer: number };
}

export interface ChatEntry {
  id: number | string;
  team: 'RED' | 'BLUE' | 'SPEC' | 'SYSTEM';
  sender: string;
  isHost?: boolean;
  isSystem?: boolean;
  senderTeam?: 'red' | 'blue' | 'spectator' | 'system';
  text: string;
}

export interface PlayerStatEntry {
  nickname: string;
  points: number;
  goals: number;
  assists: number;
  passes: number;
  shots: number;
  touches?: number;
  ownGoals?: number;
  isCaptain?: boolean;
  isMvp?: boolean;
  isHost?: boolean;
}

export interface MatchStatsSnapshot {
  redScore: number;
  blueScore: number;
  matchDuration: number;
  winner: 'red' | 'blue' | 'draw';
  winnerTeamName: string;
  redTeamName: string;
  blueTeamName: string;
  redAcronym: string;
  blueAcronym: string;
  redKit?: any;
  blueKit?: any;
  mvpPlayerId: string | number | null;
  mvpName: string;
  mvpScore: number;
  players: any[];
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
  timeLimit?: number;
  scoreLimit?: number;
  // Full GameplayConfig parity fields
  playerMaxSpeed?: number;
  playerAcceleration?: number;
  playerFriction?: number;
  ballFriction?: number;
  ballRestitution?: number;
  kickStrength?: number;
  kickMargin?: number;
  boostMultiplier?: number;
  dashDistance?: number;
  dashesPerFullBar?: number;
  staminaRechargeRate?: number;
  magnusCurveStrength?: number;
  turboEnabled?: boolean;
  dashEnabled?: boolean;
  magnusEnabled?: boolean;
}

export const DEFAULT_PHYSICS_MODIFIERS: Readonly<PhysicsModifiers> = {
  gravity: 0.0,
  pitchFriction: 0.99,
  wallBounciness: 0.412,
  postBounciness: 0.5,
  baseKickStrength: 320.0,
  dashPower: 280.0,
  dashCooldown: 1.5,
  playerMass: 2.0,
  playerRadius: 15.0,
  ballMass: 1.0,
  ballRadius: 5.8,
  magnusCoefficient: 0.35,
  netElasticity: 0.45,
  netDamping: 0.12,
  goalCelebrationDuration: 3.0,
  goalLimit: 3,
  matchTimeMinutes: 3.0,
  goldenGoalOvertime: true,
  airDensity: 1.0,
  playerMaxSpeed: 2.8,
  playerAcceleration: 0.11,
  playerFriction: 0.96,
  ballFriction: 0.99,
  ballRestitution: 0.412,
  kickStrength: 4.545,
  kickMargin: 4.0,
  boostMultiplier: 1.75,
  dashDistance: 37.5,
  dashesPerFullBar: 4,
  staminaRechargeRate: 22.0,
  magnusCurveStrength: 0.35,
  turboEnabled: true,
  dashEnabled: true,
  magnusEnabled: true
};

export function detectUserRegion(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lower = tz.toLowerCase();

    // South America
    if (lower.includes('bogota') || lower.includes('colombia')) return 'SA - Bogotá';
    if (lower.includes('sao_paulo') || lower.includes('brazil') || lower.includes('rio')) return 'SA - São Paulo';
    if (lower.includes('buenos_aires') || lower.includes('argentina')) return 'SA - Buenos Aires';
    if (lower.includes('santiago') || lower.includes('chile')) return 'SA - Santiago';
    if (lower.includes('lima') || lower.includes('peru')) return 'SA - Lima';
    if (lower.includes('caracas') || lower.includes('venezuela')) return 'SA - Caracas';
    if (lower.includes('montevideo') || lower.includes('uruguay')) return 'SA - Montevideo';
    if (lower.includes('asuncion') || lower.includes('paraguay')) return 'SA - Asunción';
    if (lower.includes('la_paz') || lower.includes('bolivia')) return 'SA - La Paz';
    if (lower.includes('guayaquil') || lower.includes('ecuador')) return 'SA - Guayaquil';
    if (lower.includes('america/') && (lower.includes('south') || lower.includes('cordoba') || lower.includes('mendoza'))) {
      return 'SA - Sudamérica';
    }

    // North America
    if (lower.includes('new_york') || lower.includes('toronto') || lower.includes('montreal') || lower.includes('detroit') || lower.includes('indiana')) {
      return 'US - East';
    }
    if (lower.includes('chicago') || lower.includes('mexico') || lower.includes('winnipeg') || lower.includes('houston')) {
      return 'US - Central';
    }
    if (lower.includes('los_angeles') || lower.includes('vancouver') || lower.includes('seattle') || lower.includes('san_francisco')) {
      return 'US - West';
    }

    // Europe
    if (lower.includes('frankfurt') || lower.includes('berlin') || lower.includes('zurich') || lower.includes('amsterdam') || lower.includes('brussels') || lower.includes('vienna')) {
      return 'EU - Frankfurt';
    }
    if (lower.includes('madrid') || lower.includes('lisbon')) {
      return 'EU - Madrid';
    }
    if (lower.includes('london') || lower.includes('dublin')) {
      return 'EU - London';
    }
    if (lower.includes('paris') || lower.includes('rome')) {
      return 'EU - Paris';
    }
    if (lower.includes('europe/')) {
      return 'EU - Central';
    }

    // Asia & Pacific
    if (lower.includes('tokyo') || lower.includes('japan')) return 'AS - Tokyo';
    if (lower.includes('singapore')) return 'AS - Singapore';
    if (lower.includes('sydney') || lower.includes('australia')) return 'OC - Sydney';

    // Fallback if America/
    if (lower.startsWith('america/')) return 'SA - Bogotá';

    return tz ? tz.replace(/_/g, ' ') : 'SA - Bogotá';
  } catch {
    return 'SA - Bogotá';
  }
}

export function validateNickname(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 25) return false;
  return /^[\p{L}\p{N}_\- ]+$/u.test(trimmed);
}

class GameUIStore {
  // Navigation & Screens
  public currentScreen = $state<ScreenType>('GATEKEEPER');
  public activeModal = $state<ModalType>('NONE');

  // Player identity & Club
  public nickname = $state('');
  public avatarMode = $state<'letters' | 'emoji'>('letters');
  public avatarValue = $state('');
  public playerNumber = $state(10);
  public selectedRegion = $state(detectUserRegion());
  public realRegion = $state<string>(detectUserRegion());
  public localPlayerId = $state(1);
  public isHost = $state(true);
  private _isAdmin = $state(true);
  public clubName = $state('LegacyX Clan');
  public clubTag = $state('LEG');
  public redKit = $state<KitConfig>({
    primaryColor: '#e74c3c',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    outlineColor: '#000000',
    pattern: 'solid'
  });
  public blueKit = $state<KitConfig>({
    primaryColor: '#3498db',
    secondaryColor: '#00e5ff',
    tertiaryColor: '#ffffff',
    outlineColor: '#000000',
    pattern: 'solid'
  });

  // Live Signaling & Telemetry
  public realPing = $state<number | null>(null);
  public onlineUsersCount = $state<number>(1);
  public signaling: SignalingClient | null = null;
  public createRoomTeamsLocked = $state<boolean>(false);

  // Settings & Keybinds
  public settings = $state<SettingsConfig>({ ...DEFAULT_SETTINGS });
  public activeSettingsTab = $state<'controls' | 'audio' | 'video' | 'kits' | 'avatar' | 'club'>('controls');
  public keybinds = $state<KeybindConfig>({
    up: [...DEFAULT_KEYBINDS.up],
    down: [...DEFAULT_KEYBINDS.down],
    left: [...DEFAULT_KEYBINDS.left],
    right: [...DEFAULT_KEYBINDS.right],
    kick: [...DEFAULT_KEYBINDS.kick],
    turbo: [...DEFAULT_KEYBINDS.turbo],
    dash: [...DEFAULT_KEYBINDS.dash],
    curveLeft: [...DEFAULT_KEYBINDS.curveLeft],
    curveRight: [...DEFAULT_KEYBINDS.curveRight],
    pause: [...DEFAULT_KEYBINDS.pause],
    menu: [...DEFAULT_KEYBINDS.menu],
    chat: [...DEFAULT_KEYBINDS.chat]
  });

  // Rooms & Lobby (Clean live state, zero mock rooms)
  public rooms = $state<RoomInfo[]>([]);
  public roomFilterQuery = $state('');
  public filterLockedOnly = $state(false);
  public activeRoom = $state<RoomInfo | null>(null);
  public pendingPasswordRoom = $state<RoomInfo | null>(null);
  public pendingPasswordInput = $state('');

  // Team Roster & Match Config
  public teamsLocked = $state(false);
  public isTeamSelectForcedOpen = $state(false);
  public showPostMatchCarousel = $state(false);
  public selectedStadiumId = $state<'small' | 'medium' | 'big' | 'af_3v3' | 'classic' | 'mediano'>('mediano');
  public activeStadiumName = $state('Mediano');
  public rosterPlayers = $state<RosterPlayer[]>([
    { id: 1, peerId: 'host', nickname: 'Jugador', name: 'Jugador', number: 10, avatar: '1', team: 'spectator', isAdmin: true, isHost: true, ping: 16 }
  ]);

  // Match HUD Telemetry
  public matchId = $state('CTNYRS');
  public redScore = $state(0);
  public blueScore = $state(0);
  public matchTimeFormatted = $state('00:00');
  public fsmPhase = $state<'STOPPED' | 'WARMUP' | 'KICKOFF' | 'PLAYING' | 'PAUSED' | 'GOAL' | 'OVERTIME' | 'STATS'>('STOPPED');
  public previousMatchPhase = $state<number>(0);
  public hasJoinedInitialSync = $state<boolean>(false);
  public isGoldenGoal = $state(false);
  public redPossession = $state(50);
  public bluePossession = $state(50);
  public pingMs = $state(0);
  public jitterMs = $state(2);
  public fps = $state(60);

  // Zero-GC Telemetry Circular Buffer (40 samples)
  public readonly telemetryCapacity = 40;
  public readonly pingSamples = new Float32Array(40);
  public pingSampleHead = $state(0);
  public pingSampleCount = $state(0);
  public avgPingMs = $state(0);

  // Chat State (Responsive & Dynamic Height)
  public chatHeight = $state(160);
  public isChatFocused = $state(false);
  public chatMessages = $state<ChatEntry[]>([]);

  // Modos de equipación activa por capitán ('home' para Red por defecto, 'away' para Blue por defecto)
  public redKitVariant = $state<'home' | 'away'>('home');
  public blueKitVariant = $state<'home' | 'away'>('away');

  // Post-match Carousel state (100vw slides)
  public postMatchSlide = $state<0 | 1 | 2>(0);
  public hasCompletedMatch = $state(false);
  public lastMatchStats = $state<MatchStatsSnapshot | any[] | null>(null);
  public mvp = $state<{
    nickname: string;
    points: number;
    goals: number;
    assists: number;
    team: 'red' | 'blue';
  } | null>(null);
  public redTeamStats = $state<PlayerStatEntry[]>([]);
  public blueTeamStats = $state<PlayerStatEntry[]>([]);

  // Physical Modifiers and Gameplay Config
  public modifiers = $state<PhysicsModifiers>({ ...DEFAULT_PHYSICS_MODIFIERS });
  public gameplayConfig = $state<GameplayConfig>({ ...DEFAULT_GAMEPLAY_CONFIG });
  public activeModifiersTab = $state<'player' | 'ball' | 'mechanics'>('player');

  // Audio convenience getters/state
  public isAudioMuted = $state(false);
  public masterVolume = $state(0.5);

  // Diapositiva activa del carrusel ('MENU' | 'STATS')
  public activeSlide = $state<'MENU' | 'STATS'>('MENU');

  // Ajuste de sala: permitir a capitanes conmutar su kit
  public allowCaptainKitSwitch = $state(false);

  // Callbacks for Engine / Worker / Netcode integration
  public onModifiersChanged: ((modifiers: PhysicsModifiers) => void) | null = null;
  public onStartPracticeMode: (() => void) | null = null;
  public onStadiumChanged: ((stadiumId: string) => void) | null = null;
  public onTogglePause: (() => void) | null = null;
  public onStartMatch: (() => void) | null = null;
  public onStopMatch: (() => void) | null = null;
  public onSettingsChanged: ((settings: SettingsConfig) => void) | null = null;
  public onChatSent: ((text: string) => void) | null = null;
  public onTeamChanged: ((playerId: number, team: 'red' | 'blue' | 'spectator') => void) | null = null;
  public onPlayerEmote: ((playerId: number, emoji: string) => void) | null = null;
  public onLeaveRoom: (() => void) | null = null;
  public onAdminAction: ((action: string, payload?: any) => void) | null = null;
  public onRoomConfigChanged: ((patch: any) => void) | null = null;
  public onProfileUpdated: (() => void) | null = null;

  public triggerPlayerEmote(playerId: number, emoji: string): void {
    if (this.settings.showPitchEmotes !== false) {
      triggerPitchEmote(playerId, emoji);
      if (this.settings.chatEmotesSoundEnabled !== false) {
        soundFX.playPitchEmoteSound();
      }
    }
    this.onPlayerEmote?.(playerId, emoji);
  }

  public matchEmoteTrigger(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const cleanWord = lower.replace(/^[:/]+|[:/]+$/g, '');
    const triggers = this.settings.emoteTriggers || [];
    for (const t of triggers) {
      const triggerClean = t.trigger.toLowerCase().replace(/^[:/]+|[:/]+$/g, '');
      if (t.trigger.toLowerCase() === lower || triggerClean === cleanWord || t.trigger.toLowerCase() === cleanWord) {
        return t.emoji;
      }
    }
    if ((EMOJI_CATALOG as readonly string[]).includes(trimmed)) {
      return trimmed;
    }
    return null;
  }

  public autoBalanceSpectators(): boolean {
    if (!this.isHost && !this.isAdmin) return false;
    const spectators = this.rosterPlayers.filter((p) => p.team === 'spectator');
    if (spectators.length === 0) return false;

    soundFX.playUIClick();
    const redCount = this.rosterPlayers.filter((p) => p.team === 'red').length;
    const blueCount = this.rosterPlayers.filter((p) => p.team === 'blue').length;

    if (redCount < blueCount) {
      // Prioridad 1: Equipo rojo tiene menos jugadores
      const first = spectators[0];
      this.movePlayerToTeam(first.id, 'red');
      this.onTeamChanged?.(first.id, 'red');
    } else if (blueCount < redCount) {
      // Prioridad 1: Equipo azul tiene menos jugadores
      const first = spectators[0];
      this.movePlayerToTeam(first.id, 'blue');
      this.onTeamChanged?.(first.id, 'blue');
    } else {
      // Prioridad 2: Ambos equipos tienen igual cantidad
      if (spectators.length >= 2) {
        const first = spectators[0];
        const second = spectators[1];
        this.movePlayerToTeam(first.id, 'red');
        this.onTeamChanged?.(first.id, 'red');
        this.movePlayerToTeam(second.id, 'blue');
        this.onTeamChanged?.(second.id, 'blue');
      } else {
        const first = spectators[0];
        this.movePlayerToTeam(first.id, 'red');
        this.onTeamChanged?.(first.id, 'red');
      }
    }

    if (!this.isHost) {
      this.onAdminAction?.('AUTO_BALANCE', {});
    }
    return true;
  }

  public resetTeamsToSpectators(): boolean {
    if (!this.isHost && !this.isAdmin) return false;
    soundFX.playUIClick();
    let changed = false;
    for (const p of this.rosterPlayers) {
      if (p.team === 'red' || p.team === 'blue') {
        p.team = 'spectator';
        this.onTeamChanged?.(p.id, 'spectator');
        changed = true;
      }
    }
    this.redKitVariant = 'home';
    this.blueKitVariant = 'away';
    if (!this.isHost) {
      this.onAdminAction?.('RESET_TEAMS', {});
    }
    return changed;
  }

  constructor() {
    this.loadPersistedState();
    if (typeof window !== 'undefined') {
      this.initSignaling();
    }
  }

  public initSignaling(client: SignalingClient = sharedSignaling): void {
    if (typeof window === 'undefined') return;
    this.signaling = client;

    client.on('telemetry', (data: { pingMs: number | null; onlineCount: number }) => {
      this.realPing = data.pingMs;
      if (typeof data.onlineCount === 'number') {
        this.onlineUsersCount = data.onlineCount;
      }
    });

    client.on('room_list', (data: { rooms?: Array<any>; onlineCount?: number }) => {
      if (typeof data.onlineCount === 'number') {
        this.onlineUsersCount = data.onlineCount;
      }
      if (Array.isArray(data.rooms)) {
        this.rooms = data.rooms.map((r: any) => ({
          id: r.id || `R-${Math.random().toString(36).substring(2, 6)}`,
          name: r.name || 'Sala Pública',
          playersCount: r.playerCount ?? r.playersCount ?? 1,
          maxPlayers: r.maxPlayers ?? 12,
          ping: this.realPing ?? 20,
          isPrivate: Boolean(r.isPrivate),
          stadium: r.stadiumId || r.stadium || 'AF 3v3'
        }));
      }
    });

    if (!client.isConnected) {
      client.connect().catch(() => {
        // Fallback silently if offline
      });
    }
  }

  public refreshRooms(): void {
    if (!this.signaling || !this.signaling.isOpen()) {
      this.initSignaling();
    } else {
      this.signaling.requestRooms();
      this.signaling.measurePing();
    }
  }

  public loadPersistedState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedNick = localStorage.getItem(LEGACYX_PLAYER_NAME_KEY) ?? localStorage.getItem('haxball_nickname');
      if (savedNick) {
        this.nickname = savedNick;
        const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
        if (hostEntry) {
          hostEntry.nickname = savedNick;
          hostEntry.name = savedNick;
        }
      }
      const savedAvatar = localStorage.getItem(LEGACYX_PLAYER_AVATAR_KEY) ?? localStorage.getItem('haxball_avatar');
      if (savedAvatar) {
        this.avatarValue = savedAvatar;
        const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
        if (hostEntry) {
          hostEntry.avatar = savedAvatar;
        }
      }
      const savedAvatarType = localStorage.getItem(LEGACYX_AVATAR_TYPE_KEY);
      if (savedAvatarType === 'emoji') {
        this.avatarMode = 'emoji';
      } else if (savedAvatarType === 'text' || savedAvatarType === 'letters') {
        this.avatarMode = 'letters';
      }
      const currentVersion = Number(localStorage.getItem(SETTINGS_VERSION_KEY) || 0);

      const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Partial<SettingsConfig>;
        const localKit = { ...DEFAULT_SETTINGS.localKit, ...(parsed.localKit || {}) };
        if (localKit.name === 'Local FC') localKit.name = 'RED';
        if (localKit.tag === 'LOC') localKit.tag = 'RED';

        const visitorKit = { ...DEFAULT_SETTINGS.visitorKit, ...(parsed.visitorKit || {}) };
        if (visitorKit.name === 'Visitante CF') visitorKit.name = 'BLUE';
        if (visitorKit.tag === 'VIS') visitorKit.tag = 'BLUE';
        if (visitorKit.primaryColor === '#3498db') visitorKit.primaryColor = '#00e5ff';

        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          localKit,
          visitorKit,
          emoteTriggers: Array.isArray(parsed.emoteTriggers) && parsed.emoteTriggers.length > 0
            ? parsed.emoteTriggers
            : [...DEFAULT_SETTINGS.emoteTriggers]
        };
        this.isAudioMuted = this.settings.isMuted;
        this.masterVolume = this.settings.masterVolume;

        soundFX.setMuted(this.settings.isMuted);
        soundFX.setMasterVolume(this.settings.masterVolume);
        soundFX.setChatVolume(this.settings.chatVolume);
        soundFX.setSfxVolume(this.settings.sfxVolume);
        soundFX.setEnvVolume(this.settings.envVolume);
      }
      const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
      if (hostEntry) {
        hostEntry.avatarType = this.avatarMode;
        hostEntry.kit = { ...this.settings.localKit };
        hostEntry.localKit = { ...this.settings.localKit };
        hostEntry.visitorKit = { ...this.settings.visitorKit };
      }
      const rawKeybinds = localStorage.getItem(KEYBINDS_STORAGE_KEY);
      if (currentVersion < SETTINGS_VERSION || !rawKeybinds) {
        this.resetKeybinds();
        localStorage.setItem(SETTINGS_VERSION_KEY, String(SETTINGS_VERSION));
      } else {
        const parsedKeys = JSON.parse(rawKeybinds) as Partial<KeybindConfig>;
        this.keybinds = { ...DEFAULT_KEYBINDS, ...parsedKeys };
      }
    } catch {
      // Ignore corrupt localStorage
    }
  }

  public setPlayerNickname(name: string): void {
    this.nickname = name;
    const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (hostEntry) {
      hostEntry.nickname = name;
      hostEntry.name = name;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACYX_PLAYER_NAME_KEY, name);
        localStorage.setItem('haxball_nickname', name);
      } catch {
        // Ignore storage quota
      }
    }
    this.onProfileUpdated?.();
  }

  public setPlayerAvatar(avatar: string, type?: 'emoji' | 'text' | 'letters'): void {
    this.avatarValue = avatar;
    if (type) {
      this.avatarMode = type === 'emoji' ? 'emoji' : 'letters';
    }
    const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (hostEntry) {
      hostEntry.avatar = avatar;
      hostEntry.avatarType = this.avatarMode;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACYX_PLAYER_AVATAR_KEY, avatar);
        localStorage.setItem('haxball_avatar', avatar);
        if (type) {
          localStorage.setItem(LEGACYX_AVATAR_TYPE_KEY, type === 'emoji' ? 'emoji' : 'text');
        }
      } catch {
        // Ignore storage quota
      }
    }
    this.onProfileUpdated?.();
  }

  public saveProfile(nick: string, avatar: string, type?: 'emoji' | 'text' | 'letters'): void {
    this.nickname = nick;
    this.avatarValue = avatar;
    if (type) {
      this.avatarMode = type === 'emoji' ? 'emoji' : 'letters';
    }
    const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (hostEntry) {
      hostEntry.nickname = nick;
      hostEntry.name = nick;
      hostEntry.avatar = avatar;
      hostEntry.avatarType = this.avatarMode;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACYX_PLAYER_NAME_KEY, nick);
        localStorage.setItem('haxball_nickname', nick);
        localStorage.setItem(LEGACYX_PLAYER_AVATAR_KEY, avatar);
        localStorage.setItem('haxball_avatar', avatar);
        if (type) {
          localStorage.setItem(LEGACYX_AVATAR_TYPE_KEY, type === 'emoji' ? 'emoji' : 'text');
        }
      } catch {
        // Ignore storage quota errors
      }
    }
    this.onProfileUpdated?.();
  }

  public saveSettings(patch?: Partial<SettingsConfig>): void {
    if (patch) {
      this.settings = { ...this.settings, ...patch };
    }
    this.isAudioMuted = this.settings.isMuted;
    this.masterVolume = this.settings.masterVolume;

    // Sincronizar todos los 4 canales al motor Web Audio SoundFX
    soundFX.setMuted(this.settings.isMuted);
    soundFX.setMasterVolume(this.settings.masterVolume);
    soundFX.setChatVolume(this.settings.chatVolume);
    soundFX.setSfxVolume(this.settings.sfxVolume);
    soundFX.setEnvVolume(this.settings.envVolume);

    soundFX.chatNormalSoundEnabled = this.settings.chatNormalSoundEnabled;
    soundFX.chatMentionSoundEnabled = this.settings.chatMentionSoundEnabled;
    soundFX.chatEmotesSoundEnabled = this.settings.chatEmotesSoundEnabled;
    soundFX.chatSoundEnabled = this.settings.chatNormalSoundEnabled;

    soundFX.kickSoundEnabled = this.settings.kickSoundEnabled;
    soundFX.postHitSoundEnabled = this.settings.postHitSoundEnabled;

    soundFX.whistleSoundEnabled = this.settings.whistleSoundEnabled;
    soundFX.goalSoundEnabled = this.settings.goalSoundEnabled;
    soundFX.crowdSoundEnabled = this.settings.crowdSoundEnabled;
    soundFX.ambientSoundEnabled = this.settings.ambientSoundEnabled;

    // Sincronizar kits con redKit y blueKit para compatibilidad
    if (this.settings.localKit) {
      this.redKit.primaryColor = this.settings.localKit.primaryColor;
      this.redKit.secondaryColor = this.settings.localKit.secondaryColor;
      this.redKit.tertiaryColor = this.settings.localKit.tertiaryColor || '#ffffff';
      this.redKit.outlineColor = this.settings.localKit.outlineColor || '#000000';
      this.redKit.pattern = this.settings.localKit.pattern;
    }
    if (this.settings.visitorKit) {
      this.blueKit.primaryColor = this.settings.visitorKit.primaryColor;
      this.blueKit.secondaryColor = this.settings.visitorKit.secondaryColor;
      this.blueKit.tertiaryColor = this.settings.visitorKit.tertiaryColor || '#ffffff';
      this.blueKit.outlineColor = this.settings.visitorKit.outlineColor || '#000000';
      this.blueKit.pattern = this.settings.visitorKit.pattern;
    }

    const localEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (localEntry) {
      localEntry.kit = { ...this.settings.localKit };
      localEntry.localKit = { ...this.settings.localKit };
      localEntry.visitorKit = { ...this.settings.visitorKit };
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
        localStorage.setItem('haxball_ball_skin', this.settings.ballSkin);
      } catch {
        // Ignore storage error
      }
    }
    this.onSettingsChanged?.(this.settings);
    this.onProfileUpdated?.();
  }

  public resetGraphicsSettings(): void {
    this.settings.cameraZoom = DEFAULT_SETTINGS.cameraZoom;
    this.settings.chatOpacity = DEFAULT_SETTINGS.chatOpacity;
    this.settings.minimapOpacity = DEFAULT_SETTINGS.minimapOpacity;
    this.settings.magnusTrailEnabled = DEFAULT_SETTINGS.magnusTrailEnabled;
    this.settings.ballTrailEnabled = DEFAULT_SETTINGS.ballTrailEnabled;
    this.settings.fireShotEnabled = DEFAULT_SETTINGS.fireShotEnabled;
    this.settings.floatingPointsEnabled = DEFAULT_SETTINGS.floatingPointsEnabled;
    this.settings.minimapEnabled = DEFAULT_SETTINGS.minimapEnabled;
    this.settings.offscreenIndicatorsEnabled = DEFAULT_SETTINGS.offscreenIndicatorsEnabled;
    this.settings.offscreenIndicators = DEFAULT_SETTINGS.offscreenIndicators;
    this.settings.playerGlowEnabled = DEFAULT_SETTINGS.playerGlowEnabled;
    this.settings.screenShakeEnabled = DEFAULT_SETTINGS.screenShakeEnabled;
    this.settings.goalShakeEnabled = DEFAULT_SETTINGS.goalShakeEnabled;
    this.settings.cameraFrustumOnMinimap = DEFAULT_SETTINGS.cameraFrustumOnMinimap;
    this.settings.minimapCameraFrustum = DEFAULT_SETTINGS.minimapCameraFrustum;
    this.settings.minimapSize = DEFAULT_SETTINGS.minimapSize;
    this.settings.ballMode = DEFAULT_SETTINGS.ballMode;
    this.settings.ballSkin = DEFAULT_SETTINGS.ballSkin;
    this.settings.ballCustomColor = DEFAULT_SETTINGS.ballCustomColor;
    this.saveSettings();
  }

  public remapKey(action: keyof KeybindConfig, code: string): void {
    // Remove duplicate binding across other actions (except Space which can be shared by kick/dash if user desires, or clean conflict)
    for (const key of Object.keys(this.keybinds) as Array<keyof KeybindConfig>) {
      if (key !== action) {
        const filtered = this.keybinds[key].filter((k) => k !== code);
        if (filtered.length > 0) {
          this.keybinds[key] = filtered;
        }
      }
    }
    this.keybinds[action] = [code];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(this.keybinds));
      } catch {
        // Ignore storage error
      }
    }
  }

  public resetKeybinds(): void {
    this.keybinds = {
      up: [...DEFAULT_KEYBINDS.up],
      down: [...DEFAULT_KEYBINDS.down],
      left: [...DEFAULT_KEYBINDS.left],
      right: [...DEFAULT_KEYBINDS.right],
      kick: [...DEFAULT_KEYBINDS.kick],
      turbo: [...DEFAULT_KEYBINDS.turbo],
      dash: [...DEFAULT_KEYBINDS.dash],
      curveLeft: [...DEFAULT_KEYBINDS.curveLeft],
      curveRight: [...DEFAULT_KEYBINDS.curveRight],
      pause: [...DEFAULT_KEYBINDS.pause],
      menu: [...DEFAULT_KEYBINDS.menu],
      chat: [...DEFAULT_KEYBINDS.chat]
    };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(this.keybinds));
      } catch {
        // Ignore storage error
      }
    }
  }

  public get isAdmin(): boolean {
    return this.isHost || this._isAdmin;
  }

  public set isAdmin(val: boolean) {
    this._isAdmin = val;
  }

  public get matchTime(): string {
    return this.matchTimeFormatted;
  }

  public set matchTime(val: string) {
    this.matchTimeFormatted = val;
  }

  public get players(): RosterPlayer[] {
    return this.rosterPlayers;
  }

  public set players(val: RosterPlayer[]) {
    this.rosterPlayers = val;
  }

  public get matchState(): string {
    return this.fsmPhase === 'STATS' ? 'MATCH_ENDED' : this.fsmPhase;
  }

  public set matchState(val: string) {
    if (val === 'MATCH_ENDED' || val === 'VICTORY_CELEBRATION') {
      this.fsmPhase = 'STATS';
    } else if (val === 'GOAL_CELEBRATION') {
      this.fsmPhase = 'GOAL';
    } else {
      this.fsmPhase = val as typeof this.fsmPhase;
    }
  }

  public get selectedStadium(): StadiumPresetKey {
    return this.selectedStadiumId;
  }

  public set selectedStadium(id: StadiumPresetKey) {
    this.selectStadium(id);
  }

  public get timeLimitMinutes(): number {
    return this.modifiers.matchTimeMinutes;
  }

  public set timeLimitMinutes(val: number) {
    this.updateModifier('matchTimeMinutes', val);
  }

  public get scoreLimitGoals(): number {
    return this.modifiers.goalLimit;
  }

  public set scoreLimitGoals(val: number) {
    this.updateModifier('goalLimit', val);
  }

  public get physicsModifiers(): PhysicsModifiers {
    return this.modifiers;
  }

  public get activeRoomName(): string {
    return this.activeRoom?.name ?? 'LegacyX-GO Arena';
  }

  public set activeRoomName(name: string) {
    if (this.activeRoom) {
      this.activeRoom.name = name;
    } else {
      this.activeRoom = {
        id: this.matchId || 'CTNYRS',
        name,
        playersCount: 2,
        maxPlayers: 12,
        ping: 20,
        isPrivate: false,
        stadium: 'AF 3v3'
      };
    }
  }

  public get myTeam(): TeamSlot {
    const local = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    return local?.team ?? 'red';
  }

  public get redTeamKit(): TeamKitConfig {
    return this.settings.localKit;
  }

  public get blueTeamKit(): TeamKitConfig {
    return this.settings.visitorKit;
  }

  public static readonly DEFAULT_RED_KIT: TeamKitConfig = {
    name: 'ROJO',
    tag: 'RED',
    primaryColor: '#e74c3c',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    outlineColor: 'none',
    hasOutline: false,
    outline: false,
    pattern: 'solid'
  };

  public static readonly DEFAULT_BLUE_KIT: TeamKitConfig = {
    name: 'AZUL',
    tag: 'BLU',
    primaryColor: '#3498db',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    outlineColor: 'none',
    hasOutline: false,
    outline: false,
    pattern: 'solid'
  };

  public get ping(): number {
    return this.pingMs;
  }

  public set ping(val: number) {
    this.pingMs = val;
  }

  public setRedKitVariant(variant: 'home' | 'away'): void {
    this.redKitVariant = variant;
    this.onRoomConfigChanged?.({ redKitVariant: variant });
  }

  public setBlueKitVariant(variant: 'home' | 'away'): void {
    this.blueKitVariant = variant;
    this.onRoomConfigChanged?.({ blueKitVariant: variant });
  }

  /** Equipación activa del capitán RED (índice 0): su kit Local por defecto, o Visitante si se conmuta. */
  public get redCaptainKit(): TeamKitConfig {
    const redPlayers = this.rosterPlayers.filter((p) => p.team === 'red');
    if (redPlayers.length === 0) {
      return GameUIStore.DEFAULT_RED_KIT;
    }
    const cap = redPlayers[0];
    const kit = this.redKitVariant === 'home'
      ? (cap.localKit || cap.kit || this.settings.localKit || GameUIStore.DEFAULT_RED_KIT)
      : (cap.visitorKit || cap.kit || this.settings.visitorKit || GameUIStore.DEFAULT_RED_KIT);
    return kit;
  }

  /** Equipación activa del capitán BLUE (índice 0): su kit Visitante por defecto, o Local si se conmuta. */
  public get blueCaptainKit(): TeamKitConfig {
    const bluePlayers = this.rosterPlayers.filter((p) => p.team === 'blue');
    if (bluePlayers.length === 0) {
      return GameUIStore.DEFAULT_BLUE_KIT;
    }
    const cap = bluePlayers[0];
    const kit = this.blueKitVariant === 'away'
      ? (cap.visitorKit || cap.kit || this.settings.visitorKit || GameUIStore.DEFAULT_BLUE_KIT)
      : (cap.localKit || cap.kit || this.settings.localKit || GameUIStore.DEFAULT_BLUE_KIT);
    return kit;
  }

  public get theme(): 'dark' | 'light' {
    return this.settings.theme;
  }

  public setTheme(theme: 'dark' | 'light'): void {
    this.saveSettings({ theme });
  }

  public toggleTheme(): void {
    this.saveSettings({ theme: this.settings.theme === 'dark' ? 'light' : 'dark' });
  }

  public updateSettings(patch: Partial<SettingsConfig>): void {
    this.saveSettings(patch);
  }

  public setKeybind(action: keyof KeybindConfig, code: string): void {
    this.remapKey(action, code);
  }

  public changeTeam(playerId: number, team: 'red' | 'blue' | 'spectator'): boolean {
    return this.movePlayerToTeam(playerId, team);
  }

  public kickPlayer(playerId: number): boolean {
    return this.kickOrBanPlayer(playerId, false);
  }

  public banPlayer(playerId: number): boolean {
    return this.kickOrBanPlayer(playerId, true);
  }

  public toggleTeamsLock(): void {
    if (!this.isHost && !this.isAdmin) return;
    soundFX.playUIClick();
    this.teamsLocked = !this.teamsLocked;
  }

  public startMatch(): void {
    soundFX.playUIClick();
    this.hasCompletedMatch = false;
    this.lastMatchStats = null;
    this.activeSlide = 'MENU';
    this.fsmPhase = 'PLAYING';
    this.previousMatchPhase = 2;
    this.hasJoinedInitialSync = true;
    this.activeModal = 'NONE';
    this.clearModalStack();
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur();
    }
    this.onStartMatch?.();
  }

  public stopMatch(): void {
    soundFX.playUIClick();
    this.fsmPhase = 'STOPPED';
    this.previousMatchPhase = 0;
    this.onStopMatch?.();
  }

  public togglePause(): void {
    soundFX.playUIClick();
    this.fsmPhase = this.fsmPhase === 'PAUSED' ? 'PLAYING' : 'PAUSED';
    this.onTogglePause?.();
  }

  public leaveRoom(): void {
    soundFX.playUIClick();
    this.onLeaveRoom?.();
    this.clearModalStack();
    this.navigateTo('LOBBY');
  }

  public recordTelemetrySample(ping: number, currentFps: number): void {
    this.pingMs = Math.max(0, Math.round(ping));
    this.fps = Math.max(0, Math.round(currentFps));
    this.pingSamples[this.pingSampleHead] = this.pingMs;
    this.pingSampleHead = (this.pingSampleHead + 1) % this.telemetryCapacity;
    if (this.pingSampleCount < this.telemetryCapacity) {
      this.pingSampleCount++;
    }
    let sum = 0;
    for (let i = 0; i < this.pingSampleCount; i++) {
      sum += this.pingSamples[i]!;
    }
    this.avgPingMs = this.pingSampleCount > 0 ? Math.round(sum / this.pingSampleCount) : this.pingMs;
  }

  public get isMatchActive(): boolean {
    return (
      this.fsmPhase === 'PLAYING' ||
      this.fsmPhase === 'KICKOFF' ||
      this.fsmPhase === 'PAUSED' ||
      this.fsmPhase === 'GOAL' ||
      this.fsmPhase === 'OVERTIME'
    );
  }

  public get matchPhase(): number {
    switch (this.fsmPhase) {
      case 'STOPPED': return 0;
      case 'KICKOFF': return 1;
      case 'PLAYING': return 2;
      case 'PAUSED': return 2.1;
      case 'GOAL': return 3;
      case 'OVERTIME': return 2;
      case 'WARMUP': return 1;
      case 'STATS': return 5;
      default: return 0;
    }
  }

  public set matchPhase(phase: number) {
    if (phase !== 0 && phase !== 5) {
      this.hasCompletedMatch = false;
      this.lastMatchStats = null;
      this.activeSlide = 'MENU';
    }
    if (phase === 0) {
      this.fsmPhase = 'STOPPED';
    } else if (phase === 1) {
      this.fsmPhase = 'KICKOFF';
    } else if (phase === 2) {
      this.fsmPhase = 'PLAYING';
    } else if (phase === 2.1) {
      this.fsmPhase = 'PAUSED';
    } else if (phase === 3) {
      this.fsmPhase = 'GOAL';
    } else if (phase === 5) {
      this.fsmPhase = 'STATS';
    }
  }

  public navigateTo(screen: ScreenType): void {
    soundFX.playUIClick();
    this.currentScreen = screen;
  }

  private modalStack: ModalType[] = [];

  private resolveModalType(modal: ModalType | string): ModalType {
    const map: Record<string, ModalType> = {
      settings: 'SETTINGS',
      SETTINGS: 'SETTINGS',
      keybinds: 'KEYBINDS',
      KEYBINDS: 'KEYBINDS',
      physics: 'PHYSICS_MODIFIERS',
      MODIFIERS: 'PHYSICS_MODIFIERS',
      PHYSICS_MODIFIERS: 'PHYSICS_MODIFIERS',
      teamSelect: 'TEAM_MANAGEMENT',
      TEAM_SELECT: 'TEAM_MANAGEMENT',
      TEAM_MANAGEMENT: 'TEAM_MANAGEMENT',
      stadiumSelect: 'STADIUM_SELECTOR',
      STADIUM_SELECT: 'STADIUM_SELECTOR',
      STADIUM_SELECTOR: 'STADIUM_SELECTOR',
      stats: 'STATS',
      STATS: 'STATS'
    };
    return map[modal] ?? (modal as ModalType);
  }

  public openModal(modal: ModalType): void {
    soundFX.playUIClick();
    const resolved = this.resolveModalType(modal);
    if (this.activeModal !== 'NONE' && this.activeModal !== resolved) {
      this.modalStack.push(this.activeModal);
    }
    this.activeModal = resolved;
  }

  public openOverlay(modal: ModalType): void {
    this.openModal(modal);
  }

  /** Overlays `#` de mayor jerarquía que nunca deben ser pisados por la FSM. */
  public get isSecondaryOverlayOpen(): boolean {
    return ['SETTINGS', 'KEYBINDS', 'PHYSICS_MODIFIERS', 'STADIUM_SELECTOR'].includes(this.activeModal);
  }

  /** Contenedor central unificado (menú de sala / estadísticas) visible. */
  public get isRoomPanelOpen(): boolean {
    return (
      this.activeModal === 'TEAM_MANAGEMENT' ||
      this.activeModal === 'TEAM_SELECT' ||
      this.activeModal === 'teamSelect' ||
      this.activeModal === 'STATS' ||
      this.activeModal === 'stats'
    );
  }

  /**
   * Regla de transición de fase única (`previousMatchPhase` + `hasJoinedInitialSync`).
   * - Cuando `newPhase === 0`: fuerza el menú abierto (`TEAM_MANAGEMENT` o `STATS`).
   * - Transición `0 -> != 0`: cierra el menú una única vez (`activeModal = 'NONE'`).
   * - Ingreso inicial a partido activo (`!hasJoinedInitialSync && newPhase !== 0`): inicia con `activeModal = 'NONE'`.
   * - Mientras el partido está en curso (`previousMatchPhase !== 0 && newPhase !== 0`): NUNCA cierra ni sobrescribe `activeModal`.
   * - Transición `!= 0 -> 0`: abre automáticamente el menú de nuevo.
   */
  public handleMatchPhaseTransition(newPhase: number, isInitialSync: boolean = false): void {
    const prev = this.previousMatchPhase;
    const isFirstSync = !this.hasJoinedInitialSync || isInitialSync;

    if (isFirstSync) {
      this.hasJoinedInitialSync = true;
      this.previousMatchPhase = newPhase;
      this.matchPhase = newPhase;
      if (newPhase === 5) {
        this.hasCompletedMatch = true;
        if (!this.isSecondaryOverlayOpen) {
          this.modalStack = [];
          this.activeModal = 'STATS';
        }
      } else if (newPhase !== 0) {
        if (this.isRoomPanelOpen) {
          this.clearModalStack();
          this.activeModal = 'NONE';
          if (typeof document !== 'undefined') {
            (document.activeElement as HTMLElement)?.blur();
          }
        }
      } else {
        this.enforceStopMenu();
      }
      return;
    }

    const wasStopped = prev === 0 || prev === 5;
    const isNowStopped = newPhase === 0 || newPhase === 5;

    if (wasStopped && !isNowStopped) {
      // Transición de inicio (0 -> != 0): cerrar el menú una única vez
      this.matchPhase = newPhase;
      this.previousMatchPhase = newPhase;
      if (this.isRoomPanelOpen) {
        this.clearModalStack();
        this.activeModal = 'NONE';
        if (typeof document !== 'undefined') {
          (document.activeElement as HTMLElement)?.blur();
        }
      }
    } else if (!wasStopped && isNowStopped) {
      // Transición a fin/detención (!= 0 -> 0 / 5): abrir el menú de nuevo
      this.matchPhase = newPhase;
      this.previousMatchPhase = newPhase;
      if (newPhase === 5) {
        this.hasCompletedMatch = true;
        if (!this.isSecondaryOverlayOpen) {
          this.modalStack = [];
          this.activeModal = 'STATS';
        }
      } else {
        this.enforceStopMenu();
      }
    } else if (newPhase === 0) {
      this.matchPhase = 0;
      this.previousMatchPhase = 0;
      this.enforceStopMenu();
    } else {
      // Partido en curso (prev !== 0 && newPhase !== 0): PROHIBIDO tocar activeModal
      this.matchPhase = newPhase;
      this.previousMatchPhase = newPhase;
    }
  }

  /** Conmuta el menú de sala in-game (`Escape` / botón ☰). En `0: STOP` permanece abierto. */
  public toggleRoomMenu(): void {
    if (this.isSecondaryOverlayOpen) {
      this.closeOverlay();
      return;
    }
    if (this.isRoomPanelOpen) {
      if (this.matchPhase === 0) return;
      this.clearModalStack();
    } else {
      this.openModal('TEAM_MANAGEMENT');
    }
  }

  /** Guardia `0: STOP`: fuerza el menú abierto sin pisar overlays `#` ni la vista de estadísticas. */
  public enforceStopMenu(): void {
    if (
      this.matchPhase === 0 &&
      this.currentScreen === 'IN_GAME' &&
      !this.isSecondaryOverlayOpen &&
      !this.isRoomPanelOpen
    ) {
      this.modalStack = [];
      this.activeModal = 'TEAM_MANAGEMENT';
    }
  }

  public closeOverlay(): void {
    soundFX.playUIClick();
    if (this.modalStack.length > 0) {
      this.activeModal = this.modalStack.pop() as ModalType;
    } else if (
      this.matchPhase === 0 &&
      this.currentScreen === 'IN_GAME' &&
      !this.isRoomPanelOpen
    ) {
      this.activeModal = 'TEAM_MANAGEMENT';
    } else {
      this.activeModal = 'NONE';
    }
    this.pendingPasswordRoom = null;
    this.pendingPasswordInput = '';
  }

  public closeModal(): void {
    this.closeOverlay();
  }

  public clearModalStack(): void {
    this.modalStack = [];
    this.activeModal = 'NONE';
    this.pendingPasswordRoom = null;
    this.pendingPasswordInput = '';
  }

  public toggleMute(): void {
    const muted = soundFX.toggleMute();
    this.isAudioMuted = muted;
    this.settings.isMuted = muted;
  }

  public setVolume(val: number): void {
    this.masterVolume = val;
    this.settings.masterVolume = val;
    soundFX.setMasterVolume(val);
  }

  public updateModifier<K extends keyof PhysicsModifiers>(key: K, value: PhysicsModifiers[K]): void {
    this.modifiers[key] = value;
    if (this.onModifiersChanged) {
      this.onModifiersChanged({ ...this.modifiers });
    }
    if (this.isHost) {
      this.onRoomConfigChanged?.({
        gameplayConfig: { ...this.gameplayConfig },
        modifiers: { ...this.modifiers }
      });
    }
  }

  private syncGameplayConfigToModifiers(): void {
    const cfg = this.gameplayConfig;
    this.modifiers.playerMaxSpeed = cfg.playerMaxSpeed;
    this.modifiers.playerAcceleration = cfg.playerAcceleration;
    this.modifiers.playerFriction = cfg.playerFriction ?? 0.96;
    this.modifiers.playerRadius = cfg.playerRadius;
    this.modifiers.playerMass = cfg.playerMass ?? 2.0;
    this.modifiers.ballRadius = cfg.ballRadius;
    this.modifiers.ballMass = cfg.ballMass ?? 1.0;
    this.modifiers.ballFriction = cfg.ballFriction ?? 0.99;
    this.modifiers.pitchFriction = cfg.ballFriction ?? 0.99;
    this.modifiers.ballRestitution = cfg.ballRestitution;
    this.modifiers.wallBounciness = cfg.ballRestitution;
    this.modifiers.kickStrength = cfg.kickStrength;
    this.modifiers.baseKickStrength = (cfg.kickStrength / 4.545) * 320.0;
    this.modifiers.kickMargin = cfg.kickMargin ?? 4.0;
    this.modifiers.boostMultiplier = cfg.boostMultiplier;
    this.modifiers.dashDistance = cfg.dashDistance;
    this.modifiers.dashPower = (cfg.dashDistance / 4) * 60;
    this.modifiers.dashesPerFullBar = cfg.dashesPerFullBar ?? 4;
    this.modifiers.staminaRechargeRate = cfg.staminaRechargeRate;
    this.modifiers.magnusCurveStrength = cfg.magnusCurveStrength;
    this.modifiers.magnusCoefficient = cfg.magnusCurveStrength;
    this.modifiers.turboEnabled = cfg.turboEnabled !== false;
    this.modifiers.dashEnabled = cfg.dashEnabled !== false;
    this.modifiers.magnusEnabled = cfg.magnusEnabled !== false;
  }

  public updateGameplayConfig<K extends keyof GameplayConfig>(key: K, value: GameplayConfig[K]): void {
    (this.gameplayConfig as any)[key] = value;
    gameConfigStore.set({ ...this.gameplayConfig });
    this.syncGameplayConfigToModifiers();
    this.onModifiersChanged?.({ ...this.modifiers });
    if (this.isHost) {
      this.onRoomConfigChanged?.({
        gameplayConfig: { ...this.gameplayConfig },
        modifiers: { ...this.modifiers }
      });
    }
  }

  public applyRemoteGameplayConfig(cfg?: Partial<GameplayConfig>, mods?: Partial<PhysicsModifiers>): void {
    if (cfg && typeof cfg === 'object') {
      this.gameplayConfig = { ...this.gameplayConfig, ...cfg };
      gameConfigStore.set({ ...this.gameplayConfig });
      this.syncGameplayConfigToModifiers();
    }
    if (mods && typeof mods === 'object') {
      this.modifiers = { ...this.modifiers, ...mods };
    }
    this.onModifiersChanged?.({ ...this.modifiers });
  }

  public resetGameplayConfigToDefault(): void {
    soundFX.playUIClick();
    this.gameplayConfig = { ...DEFAULT_GAMEPLAY_CONFIG };
    gameConfigStore.set({ ...this.gameplayConfig });
    this.resetModifiersToDefault();
  }

  public resetModifiersToDefault(): void {
    soundFX.playUIClick();
    this.modifiers = { ...DEFAULT_PHYSICS_MODIFIERS };
    this.syncGameplayConfigToModifiers();
    if (this.onModifiersChanged) {
      this.onModifiersChanged({ ...this.modifiers });
    }
    if (this.isHost) {
      this.onRoomConfigChanged?.({
        gameplayConfig: { ...this.gameplayConfig },
        modifiers: { ...this.modifiers }
      });
    }
  }

  public selectStadium(stadiumId: StadiumPresetKey, displayName?: string): boolean {
    if (this.currentScreen === 'IN_GAME' && this.isMatchActive && this.fsmPhase !== 'STOPPED' && this.matchPhase !== 0) {
      return false;
    }
    const idMap: Record<string, 'individual' | 'small' | 'medium' | 'big' | 'classic' | 'af_3v3'> = {
      individual: 'individual',
      '1v1': 'individual',
      'Individual (1v1)': 'individual',
      Individual: 'individual',
      small: 'small',
      Small: 'small',
      '2v2': 'small',
      'Pequeño (2v2)': 'small',
      Pequeño: 'small',
      smallarena: 'small',
      'Small Arena': 'small',
      medium: 'medium',
      Medium: 'medium',
      '3v3': 'medium',
      'Mediano (3v3)': 'medium',
      Mediano: 'medium',
      classic: 'classic',
      Classic: 'classic',
      'Classic Field': 'classic',
      futsal: 'medium',
      'Futsal Pro Court': 'medium',
      hockey: 'medium',
      'Hockey Rink Arena': 'medium',
      big: 'big',
      Big: 'big',
      '4v4': 'big',
      'Grande (4v4)': 'big',
      Grande: 'big',
      bigstadium: 'big',
      'Big Stadium': 'big',
      af_3v3: 'af_3v3',
      af3v3: 'af_3v3',
      'AF 3v3 Official': 'af_3v3'
    };
    const defaultNames: Record<string, string> = {
      individual: 'Individual (1v1)',
      small: 'Pequeño (2v2)',
      medium: 'Mediano (3v3)',
      classic: 'Mediano (3v3)',
      big: 'Grande (4v4)',
      af_3v3: 'AF 3v3 Official'
    };
    const canonical = (idMap[stadiumId] ?? 'classic') as any;
    this.selectedStadiumId = canonical;
    this.activeStadiumName = displayName ?? defaultNames[canonical] ?? stadiumId;
    this.onStadiumChanged?.(canonical);
    return true;
  }

  public movePlayerToTeam(playerId: number, team: 'red' | 'blue' | 'spectator'): boolean {
    if (!this.isHost && !this.isAdmin && (this.teamsLocked || playerId !== this.localPlayerId)) {
      return false;
    }
    const p = this.rosterPlayers.find((item) => item.id === playerId);
    if (!p) return false;
    p.team = team;
    this.onTeamChanged?.(playerId, team);
    return true;
  }

  public autoBalanceTeams(): void {
    if (!this.isHost) return;
    soundFX.playUIClick();
    const specs = this.rosterPlayers.filter((p) => p.team === 'spectator');
    for (const s of specs) {
      const redCount = this.rosterPlayers.filter((p) => p.team === 'red').length;
      const blueCount = this.rosterPlayers.filter((p) => p.team === 'blue').length;
      s.team = redCount <= blueCount ? 'red' : 'blue';
      this.onTeamChanged?.(s.id, s.team);
    }
  }

  public randomizeTeams(): void {
    if (!this.isHost) return;
    soundFX.playUIClick();
    const all = [...this.rosterPlayers];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = all[i]!;
      all[i] = all[j]!;
      all[j] = tmp;
    }
    all.forEach((p, idx) => {
      p.team = idx % 2 === 0 ? 'red' : 'blue';
      this.onTeamChanged?.(p.id, p.team);
    });
  }

  public togglePlayerAdmin(playerId: number): boolean {
    if (!this.isHost && !this.isAdmin) return false;
    const target = this.rosterPlayers.find((p) => p.id === playerId);
    if (!target || target.isHost) return false;
    target.isAdmin = !target.isAdmin;
    this.onAdminAction?.('TOGGLE_ADMIN', { targetPlayerId: playerId, isAdmin: target.isAdmin });
    return true;
  }

  public kickOrBanPlayer(targetPlayerId: number, ban: boolean = false): boolean {
    if (!this.isHost && !this.isAdmin) return false;
    const target = this.rosterPlayers.find((p) => p.id === targetPlayerId);
    // Host admin immutability: Host cannot kick or ban themselves, and nobody can kick/ban Host
    if (!target || target.isHost) return false;
    if (target.id === this.localPlayerId) return false;
    this.rosterPlayers = this.rosterPlayers.filter((p) => p.id !== targetPlayerId);
    this.onAdminAction?.(ban ? 'BAN' : 'KICK', { targetPlayerId });
    return true;
  }

  public addChatMessage(entry: ChatEntry): void {
    if (this.chatMessages.some((m) => m.id === entry.id)) return;
    this.chatMessages.push(entry);
    if (this.chatMessages.length > 80) {
      this.chatMessages.shift();
    }
  }

  public resetRoomSession(): void {
    this.chatMessages = [];
    this.players = [];
    this.rosterPlayers = [];
    this.lastMatchStats = null;
    this.redTeamStats = [];
    this.blueTeamStats = [];
    this.mvp = null;
    this.hasCompletedMatch = false;
    this.redScore = 0;
    this.blueScore = 0;
    this.matchTimeFormatted = '00:00';
    this.matchPhase = 0;
    this.previousMatchPhase = 0;
    this.hasJoinedInitialSync = false;
    this.fsmPhase = 'STOPPED';
    this.isGoldenGoal = false;
    this.postMatchSlide = 1;
    this.clearModalStack();
    this.redKitVariant = 'home';
    this.blueKitVariant = 'away';
  }

  public sendChatMessage(rawText: string): void {
    const trimmed = rawText.trim().slice(0, 140);
    if (!trimmed) return;
    this.onChatSent?.(trimmed);
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
      stadium: 'Mediano'
    };
    this.activeStadiumName = 'Mediano';
    this.selectedStadiumId = 'mediano';
    this.fsmPhase = 'STOPPED';
    this.matchPhase = 0;
    this.isHost = true;
    this.isAdmin = true;
    this.localPlayerId = 1;

    const profile = {
      nickname: this.nickname || 'Jugador',
      avatar: this.avatarValue || '1',
      avatarType: this.avatarMode || 'letters',
      kit: { ...this.settings.localKit },
      localKit: { ...this.settings.localKit },
      visitorKit: { ...this.settings.visitorKit }
    };

    const localPlayer: RosterPlayer = {
      id: 1,
      peerId: 'local',
      nickname: profile.nickname,
      name: profile.nickname,
      team: 'spectator',
      number: 10,
      isAdmin: true,
      isHost: true,
      avatar: profile.avatar,
      avatarType: profile.avatarType,
      kit: profile.kit,
      localKit: profile.localKit,
      visitorKit: profile.visitorKit,
      ping: 0
    };

    this.rosterPlayers = [localPlayer];
    this.navigateTo('IN_GAME');
    this.openOverlay('TEAM_MANAGEMENT');
    if (this.onStartPracticeMode) {
      this.onStartPracticeMode();
    }
  }

  public createRoomAndLaunch(
    name: string,
    stadium: string,
    maxPlayers: number,
    isPrivate: boolean,
    teamsLocked: boolean = false,
    password: string = '',
    timeLimit: number = 3,
    scoreLimit: number = 3
  ): void {
    soundFX.playUIClick();
    this.teamsLocked = teamsLocked;
    const cleanRoomName = name.trim() || 'Nueva Sala';
    const newRoom: RoomInfo = {
      id: `R-${Date.now().toString().slice(-4)}`,
      name: cleanRoomName,
      playersCount: 1,
      maxPlayers: maxPlayers,
      ping: this.realPing ?? 20,
      isPrivate: isPrivate,
      password: password,
      stadium: stadium
    };

    if (this.signaling && this.signaling.isOpen()) {
      this.signaling.createRoom(cleanRoomName, {
        name: cleanRoomName,
        stadiumId: stadium,
        maxPlayers,
        isPrivate,
        password,
        teamsLocked,
        timeLimit,
        scoreLimit
      });
    }

    this.rooms.unshift(newRoom);
    this.activeRoom = newRoom;
    this.activeStadiumName = stadium;
    this.navigateTo('IN_GAME');
  }

  public get filteredRooms(): RoomInfo[] {
    return this.rooms.filter((room) => {
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
