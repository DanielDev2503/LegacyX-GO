/**
 * gameUI.svelte.ts
 * Centralized Reactive UI State for LegacyX-GO using Svelte 5 Runes ($state, $derived).
 */

import { soundFX } from '../../audio/SoundFX.js';
import { sharedSignaling, type SignalingClient } from '../../net/SignalingClient.js';
import { type GameplayConfig, DEFAULT_GAMEPLAY_CONFIG } from '@legacyx/core';
import { $gameConfig as gameConfigStore } from '../../controllers/stores/gameStore.js';

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
  | 'halves'
  | 'diagonal'
  | 'cross'
  | 'chevrons'
  | 'diagonal_checks';

export interface KitConfig {
  primaryColor: string;
  secondaryColor: string;
  pattern: PatternType;
  tertiaryColor?: string;
}

export interface TeamKitConfig {
  name: string;
  tag: string;
  primaryColor: string;
  secondaryColor: string;
  pattern: PatternType;
  tertiaryColor?: string;
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
    pattern: 'solid'
  },
  visitorKit: {
    name: 'BLUE',
    tag: 'BLUE',
    primaryColor: '#00e5ff',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    pattern: 'solid'
  },

  showPitchEmotes: true,
  emoteTriggers: [
    { trigger: 'gol', emoji: '⚽' },
    { trigger: 'gg', emoji: '🤝' },
    { trigger: 'wow', emoji: '😮' },
    { trigger: 'fire', emoji: '🔥' }
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
  team: TeamSlot;
  isAdmin: boolean;
  isHost: boolean;
  ping: number;
  kit?: TeamKitConfig;
}

export interface ChatEntry {
  id: number;
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
}

export const DEFAULT_PHYSICS_MODIFIERS: Readonly<PhysicsModifiers> = {
  gravity: 0.0,
  pitchFriction: 0.99,
  wallBounciness: 0.8,
  postBounciness: 0.85,
  baseKickStrength: 450.0,
  dashPower: 280.0,
  dashCooldown: 1.5,
  playerMass: 1.0,
  playerRadius: 15.0,
  ballMass: 0.2,
  ballRadius: 5.8,
  magnusCoefficient: 0.35,
  netElasticity: 0.45,
  netDamping: 0.12,
  goalCelebrationDuration: 3.0,
  goalLimit: 3,
  matchTimeMinutes: 3.0,
  goldenGoalOvertime: true,
  airDensity: 1.0
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
  public clubName = $state('LegacyX Clan');
  public clubTag = $state('LEG');
  public redKit = $state<KitConfig>({
    primaryColor: '#e74c3c',
    secondaryColor: '#ffffff',
    tertiaryColor: '#ffffff',
    pattern: 'solid'
  });
  public blueKit = $state<KitConfig>({
    primaryColor: '#3498db',
    secondaryColor: '#00e5ff',
    tertiaryColor: '#ffffff',
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
    { id: 1, peerId: 'host', nickname: 'yami', name: 'yami', number: 10, avatar: 'YA', team: 'red', isAdmin: true, isHost: true, ping: 16 },
    { id: 2, peerId: 'peer_2', nickname: 'Rival', name: 'Rival', number: 7, avatar: '7', team: 'blue', isAdmin: false, isHost: false, ping: 28 }
  ]);

  // Match HUD Telemetry
  public matchId = $state('CTNYRS');
  public redScore = $state(0);
  public blueScore = $state(0);
  public matchTimeFormatted = $state('03:00');
  public fsmPhase = $state<'STOPPED' | 'WARMUP' | 'KICKOFF' | 'PLAYING' | 'PAUSED' | 'GOAL' | 'OVERTIME' | 'STATS'>('STOPPED');
  public isGoldenGoal = $state(false);
  public redPossession = $state(50);
  public bluePossession = $state(50);
  public pingMs = $state(24);
  public jitterMs = $state(2);
  public fps = $state(60);

  // Zero-GC Telemetry Circular Buffer (40 samples)
  public readonly telemetryCapacity = 40;
  public readonly pingSamples = new Float32Array(40);
  public pingSampleHead = $state(0);
  public pingSampleCount = $state(0);
  public avgPingMs = $state(24);

  // Chat State (Responsive & Dynamic Height)
  public chatHeight = $state(160);
  public isChatFocused = $state(false);
  public chatMessages = $state<ChatEntry[]>([]);

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
    { nickname: 'kiko', points: 180, goals: 0, assists: 0, passes: 14, shots: 2, touches: 14, ownGoals: 0, isCaptain: true },
    { nickname: 'dani', points: 140, goals: 0, assists: 0, passes: 9, shots: 1, touches: 10, ownGoals: 0 },
    { nickname: 'mateo', points: 110, goals: 0, assists: 0, passes: 6, shots: 0, touches: 8, ownGoals: 0 }
  ]);
  public blueTeamStats = $state<PlayerStatEntry[]>([
    { nickname: 'yami', points: 420, goals: 3, assists: 1, passes: 12, shots: 4, touches: 14, ownGoals: 0, isMvp: true, isHost: true },
    { nickname: 'nano', points: 290, goals: 0, assists: 2, passes: 18, shots: 3, touches: 8, ownGoals: 0, isCaptain: true },
    { nickname: 'leo', points: 210, goals: 0, assists: 0, passes: 11, shots: 1, touches: 6, ownGoals: 0 }
  ]);

  // Physical Modifiers and Gameplay Config
  public modifiers = $state<PhysicsModifiers>({ ...DEFAULT_PHYSICS_MODIFIERS });
  public gameplayConfig = $state<GameplayConfig>({ ...DEFAULT_GAMEPLAY_CONFIG });
  public activeModifiersTab = $state<'player' | 'ball' | 'mechanics'>('player');

  // Audio convenience getters/state
  public isAudioMuted = $state(false);
  public masterVolume = $state(0.5);

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
      if (savedNick !== null) {
        this.nickname = savedNick;
      }
      const savedAvatar = localStorage.getItem(LEGACYX_PLAYER_AVATAR_KEY) ?? localStorage.getItem('haxball_avatar');
      if (savedAvatar !== null) {
        this.avatarValue = savedAvatar;
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
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACYX_PLAYER_NAME_KEY, name);
        localStorage.setItem('haxball_nickname', name);
      } catch {
        // Ignore storage quota
      }
    }
  }

  public setPlayerAvatar(avatar: string, type?: 'emoji' | 'text' | 'letters'): void {
    this.avatarValue = avatar;
    if (type) {
      this.avatarMode = type === 'emoji' ? 'emoji' : 'letters';
    }
    const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (hostEntry) {
      hostEntry.avatar = avatar;
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
      hostEntry.avatar = avatar;
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
      this.redKit.pattern = this.settings.localKit.pattern;
    }
    if (this.settings.visitorKit) {
      this.blueKit.primaryColor = this.settings.visitorKit.primaryColor;
      this.blueKit.secondaryColor = this.settings.visitorKit.secondaryColor;
      this.blueKit.tertiaryColor = this.settings.visitorKit.tertiaryColor || '#ffffff';
      this.blueKit.pattern = this.settings.visitorKit.pattern;
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
    return this.isHost;
  }

  public set isAdmin(val: boolean) {
    this.isHost = val;
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

  public get lastMatchStats(): PlayerStatEntry[] {
    return [...this.redTeamStats, ...this.blueTeamStats];
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
    this.fsmPhase = 'PLAYING';
    this.onStartMatch?.();
  }

  public stopMatch(): void {
    soundFX.playUIClick();
    this.fsmPhase = 'STOPPED';
    this.onStopMatch?.();
  }

  public togglePause(): void {
    soundFX.playUIClick();
    this.fsmPhase = this.fsmPhase === 'PAUSED' ? 'PLAYING' : 'PAUSED';
    this.onTogglePause?.();
  }

  public leaveRoom(): void {
    soundFX.playUIClick();
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

  public closeOverlay(): void {
    soundFX.playUIClick();
    if (this.modalStack.length > 0) {
      this.activeModal = this.modalStack.pop() as ModalType;
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
  }

  public updateGameplayConfig<K extends keyof GameplayConfig>(key: K, value: GameplayConfig[K]): void {
    (this.gameplayConfig as any)[key] = value;
    gameConfigStore.set({ ...this.gameplayConfig });
    // Synchronize corresponding fields to modifiers
    if (key === 'playerRadius') this.modifiers.playerRadius = value as number;
    if (key === 'playerMass') this.modifiers.playerMass = value as number;
    if (key === 'ballRadius') this.modifiers.ballRadius = value as number;
    if (key === 'ballMass') this.modifiers.ballMass = value as number;
    if (key === 'ballFriction') this.modifiers.pitchFriction = value as number;
    if (key === 'kickStrength') this.modifiers.baseKickStrength = value as number;
    if (key === 'dashDistance') this.modifiers.dashPower = (value as number) * 8;
    if (key === 'magnusCurveStrength') this.modifiers.magnusCoefficient = (value as number) * 0.0025;
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
    if (this.onModifiersChanged) {
      this.onModifiersChanged({ ...this.modifiers });
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
    if (!this.isHost && (this.teamsLocked || playerId !== this.localPlayerId)) {
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

  public kickOrBanPlayer(targetPlayerId: number, _ban: boolean = false): boolean {
    if (!this.isHost) return false;
    const target = this.rosterPlayers.find((p) => p.id === targetPlayerId);
    // Host admin immutability: Host cannot kick or ban themselves
    if (!target || target.isHost || target.isAdmin) return false;
    this.rosterPlayers = this.rosterPlayers.filter((p) => p.id !== targetPlayerId);
    return true;
  }

  public sendChatMessage(rawText: string): void {
    const trimmed = rawText.trim().slice(0, 140);
    if (!trimmed) return;
    soundFX.playChatMessageSound();
    const localPlayer = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    const teamTag: ChatEntry['team'] =
      localPlayer?.team === 'red' ? 'RED' : localPlayer?.team === 'blue' ? 'BLUE' : 'SPEC';
    this.chatMessages.push({
      id: Date.now() + Math.random(),
      team: teamTag,
      sender: this.nickname,
      isHost: this.isHost,
      text: trimmed
    });
    if (this.chatMessages.length > 80) {
      this.chatMessages.shift();
    }
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
    this.fsmPhase = 'STOPPED';
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
