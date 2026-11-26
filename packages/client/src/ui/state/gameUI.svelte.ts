/**
 * gameUI.svelte.ts
 * Centralized Reactive UI State for LegacyX-GO using Svelte 5 Runes ($state, $derived).
 */

import { Capacitor } from '@capacitor/core';
import { soundFX } from '../../audio/SoundFX.js';
import { sharedSignaling, type SignalingClient } from '../../net/SignalingClient.js';
import {
  type GameplayConfig,
  type PlayerPosition,
  PLAYER_POSITIONS,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_PRESETS,
  type GameplayPresetId
} from '@legacyx/core';
import { $gameConfig as gameConfigStore } from '../../controllers/stores/gameStore.js';
import { triggerPitchEmote } from '../../renderer/DiscRenderer.js';
import { EMOJI_CATALOG } from '../utils/constants.js';

export const CHAT_COOLDOWN_MS = 1500;
export const PENDING_INVITE_STORAGE_KEY = 'legacyx_pending_invite_room';

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
  | 'REPLAY_VIEWER'
  | 'settings'
  | 'keybinds'
  | 'physics'
  | 'teamSelect'
  | 'stadiumSelect'
  | 'stats'
  | 'replayViewer';

export type BallSkinType =
  | 'classic'
  | 'retro'
  | 'neon'
  | 'cyber'
  | 'gold'
  | 'solid'
  | 'champions'
  | 'wc2006'
  | 'wc2010'
  | 'wc2014'
  | 'wc2018'
  | 'wc2022'
  | 'wc2026';

export type ScoreboardDesignType =
  | 'original'
  | 'champions'
  | 'wc2006'
  | 'wc2010'
  | 'wc2014'
  | 'wc2018'
  | 'wc2022'
  | 'wc2026';

export const VALID_BALL_TEXTURE_SKINS: readonly Exclude<BallSkinType, 'solid'>[] = [
  'classic',
  'retro',
  'neon',
  'cyber',
  'gold',
  'champions',
  'wc2006',
  'wc2010',
  'wc2014',
  'wc2018',
  'wc2022',
  'wc2026'
];

export const VALID_SCOREBOARD_DESIGNS: readonly ScoreboardDesignType[] = [
  'original',
  'champions',
  'wc2006',
  'wc2010',
  'wc2014',
  'wc2018',
  'wc2022',
  'wc2026'
];

export type SettingsTabType =
  | 'controls'
  | 'audio'
  | 'video'
  | 'visual'
  | 'kits'
  | 'avatar'
  | 'club'
  | 'account'
  | 'social'
  | 'legal';

export type LegalDocId = 'privacy' | 'terms' | 'legal' | 'cookies' | 'rights';

export interface SlidingScoreEvent {
  id: string;
  playerName: string;
  eventType: string;
  pointsText: string;
  color: string;
  team?: 'red' | 'blue' | 'neutral';
  timestamp: number;
}
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

export type MobileControlsMode = 'auto' | 'on' | 'off';
export type MobileJoystickMode = '360' | '8dir';
export type MobileJoystickAnchor = 'fixed' | 'dynamic';
export type MobileTurboMode = 'hold' | 'toggle';
export type MobileHudLayoutMap = Record<string, { x: number; y: number }>;

export const SETTINGS_STORAGE_KEY = 'haxball_settings_v1';
export const KEYBINDS_STORAGE_KEY = 'haxball_keybinds_v1';
export const SETTINGS_VERSION_KEY = 'haxball_settings_version';
export const SETTINGS_VERSION = 2;
export const LEGACYX_PLAYER_NAME_KEY = 'legacyx_player_name';
export const LEGACYX_PLAYER_AVATAR_KEY = 'legacyx_player_avatar';
export const LEGACYX_AVATAR_TYPE_KEY = 'legacyx_avatar_type';
export const NICKNAME_STORAGE_KEY = 'legacyx_player_name';
export const AVATAR_STORAGE_KEY = 'legacyx_player_avatar';
export type NetModeType = 'classic' | 'predicted';
export const LEGACYX_EXTRAPOLATION_KEY = 'legacyx_extrapolation_ms';
export const LEGACYX_NET_MODE_KEY = 'legacyx_net_mode';

export interface MatchBannerPayload {
  kind: 'NONE' | 'VS' | 'COUNTDOWN' | 'PAUSED' | 'GOAL' | 'VICTORY';
  count?: number;
  label?: string;
  isResume?: boolean;
  scoringTeam?: 'red' | 'blue';
  scorerName?: string | null;
  assisterName?: string | null;
  isOwnGoal?: boolean;
  winner?: 'red' | 'blue' | 'draw';
  redScore?: number;
  blueScore?: number;
  durationMs?: number;
  speedKmh?: number;
  isPower?: boolean;
  isCurve?: boolean;
}

export interface RoomDisconnectNotice {
  kind: 'kicked' | 'banned' | 'banned_join' | 'closed';
  title: string;
  message: string;
  roomName?: string;
}

export interface GamepadBindConfig {
  kick: string[];
  dash: string[];
  turbo: string[];
  curveLeft: string[];
  curveRight: string[];
  focusBall: string[];
  pause: string[];
  menu: string[];
}

export const DEFAULT_GAMEPAD_BINDS: GamepadBindConfig = {
  kick: ['Gamepad0'],
  dash: ['Gamepad1'],
  turbo: ['Gamepad7'],
  curveLeft: ['Gamepad4'],
  curveRight: ['Gamepad5'],
  focusBall: ['Gamepad3'],
  pause: ['Gamepad9'],
  menu: ['Gamepad8']
};

export interface SettingsConfig {
  theme: 'dark' | 'light';

  // 4-Canal Audio Hierarchy + Música
  masterVolume: number;
  chatVolume: number;
  sfxVolume: number;
  envVolume: number;
  crowdVolume: number;
  musicVolume: number;
  musicEnabled: boolean;
  musicInMatch: boolean;
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

  // Controles — Modo de Movimiento y Mando
  movementMode: 'keyboard' | 'mouse';
  gamepadDeadzone: number;
  gamepadBinds: GamepadBindConfig;

  // Togglers Visuales de Jugabilidad
  showPositionTags: boolean;
  showPlayerNicknames: boolean;
  showTelemetryCard: boolean;
  magnusTrailEnabled: boolean;
  ballTrailEnabled: boolean;
  fireShotEnabled: boolean;
  floatingPointsEnabled: boolean;
  floatingGoals: boolean;
  floatingAssists: boolean;
  floatingSaves: boolean;
  floatingShots: boolean;
  floatingPasses: boolean;
  floatingHattricks: boolean;
  floatingOwnGoals: boolean;
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

  // Personalización visual (Balón y Marcador)
  ballMode: 'texture' | 'color';
  ballSkin: BallSkinType | 'futsal';
  ballCustomColor: string;
  scoreboardDesign: ScoreboardDesignType;

  // Compatibility fields
  fpsCap: number;
  showTypingIndicator: boolean;
  showPlayerAvatars: boolean;
  extrapolationMs: number;
  autoExtrapolation: boolean;
  netMode: NetModeType;
  netDeformationEnabled: boolean;
  showStatsMonitor: boolean;

  // Equipaciones (Local / Visitante)
  localKit: TeamKitConfig;
  visitorKit: TeamKitConfig;

  // Avatar y Emotes
  showPitchEmotes: boolean;
  emoteTriggers: EmoteTrigger[];

  // Controles Móviles / Táctiles
  mobileControlsEnabled: MobileControlsMode;
  mobileJoystickMode: MobileJoystickMode;
  mobileJoystickAnchor: MobileJoystickAnchor;
  mobileTurboMode: MobileTurboMode;
  mobileHudScale: number;
  mobileHudOpacity: number;
  mobileHapticsEnabled: boolean;
  mobileCustomLayout: MobileHudLayoutMap;
}

export const DEFAULT_SETTINGS: SettingsConfig = {
  theme: 'dark',
  masterVolume: 1.0,
  chatVolume: 1.0,
  sfxVolume: 1.0,
  envVolume: 1.0,
  crowdVolume: 1.0,
  musicVolume: 0.65,
  musicEnabled: true,
  musicInMatch: true,
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

  movementMode: 'keyboard',
  gamepadDeadzone: 0.18,
  gamepadBinds: {
    kick: [...DEFAULT_GAMEPAD_BINDS.kick],
    dash: [...DEFAULT_GAMEPAD_BINDS.dash],
    turbo: [...DEFAULT_GAMEPAD_BINDS.turbo],
    curveLeft: [...DEFAULT_GAMEPAD_BINDS.curveLeft],
    curveRight: [...DEFAULT_GAMEPAD_BINDS.curveRight],
    focusBall: [...DEFAULT_GAMEPAD_BINDS.focusBall],
    pause: [...DEFAULT_GAMEPAD_BINDS.pause],
    menu: [...DEFAULT_GAMEPAD_BINDS.menu]
  },

  showPositionTags: true,
  showPlayerNicknames: true,
  showTelemetryCard: false,
  magnusTrailEnabled: true,
  ballTrailEnabled: true,
  fireShotEnabled: true,
  floatingPointsEnabled: true,
  floatingGoals: true,
  floatingAssists: true,
  floatingSaves: true,
  floatingShots: true,
  floatingPasses: true,
  floatingHattricks: true,
  floatingOwnGoals: true,
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
  scoreboardDesign: 'original',

  fpsCap: 0,
  showTypingIndicator: true,
  showPlayerAvatars: true,
  extrapolationMs: 0,
  autoExtrapolation: true,
  netMode: 'classic',
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
    { trigger: 'fuego', emoji: '🔥' },
    { trigger: 'gk', emoji: '🧤' },
    { trigger: 'mano', emoji: '✋' },
    { trigger: 'pase', emoji: '👟' },
    { trigger: 'arco', emoji: '🥅' },
    { trigger: 'amarilla', emoji: '🟨' },
    { trigger: 'roja', emoji: '🟥' },
    { trigger: 'defensa', emoji: '🛡️' },
    { trigger: 'dash', emoji: '💨' },
    { trigger: 'comba', emoji: '🌀' },
    { trigger: 'goat', emoji: '🐐' },
    { trigger: 'frio', emoji: '🥶' },
    { trigger: 'shh', emoji: '🤫' },
    { trigger: 'aplauso', emoji: '👏' }
  ],

  mobileControlsEnabled: 'auto',
  mobileJoystickMode: '360',
  mobileJoystickAnchor: 'fixed',
  mobileTurboMode: 'hold',
  mobileHudScale: 1.0,
  mobileHudOpacity: 0.78,
  mobileHapticsEnabled: true,
  mobileCustomLayout: {}
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
  focusBall: string[];
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
  focusBall: ['KeyV', 'Tab'],
  pause: ['KeyP'],
  menu: ['Escape'],
  chat: ['Enter']
};

const GAMEPAD_BUTTON_LABELS: Record<string, string> = {
  Gamepad0: 'Mando A / ✕',
  Gamepad1: 'Mando B / ○',
  Gamepad2: 'Mando X / □',
  Gamepad3: 'Mando Y / △',
  Gamepad4: 'LB / L1',
  Gamepad5: 'RB / R1',
  Gamepad6: 'LT / L2',
  Gamepad7: 'RT / R2',
  Gamepad8: 'Select / Share',
  Gamepad9: 'Start / Options',
  Gamepad10: 'L3',
  Gamepad11: 'R3',
  Gamepad12: 'D-Pad ↑',
  Gamepad13: 'D-Pad ↓',
  Gamepad14: 'D-Pad ←',
  Gamepad15: 'D-Pad →',
  Gamepad16: 'Botón Guía'
};

export function formatKeybindCode(code: string): string {
  if (!code) return '---';
  if (GAMEPAD_BUTTON_LABELS[code]) return GAMEPAD_BUTTON_LABELS[code]!;
  if (code === 'Mouse0') return 'Click Izquierdo';
  if (code === 'Mouse1') return 'Click Central';
  if (code === 'Mouse2') return 'Click Derecho';
  if (code === 'Space') return 'ESPACIO';
  if (code === 'ShiftLeft') return 'SHIFT IZQ';
  if (code === 'ShiftRight') return 'SHIFT DER';
  if (code === 'ControlLeft') return 'CTRL IZQ';
  if (code === 'ControlRight') return 'CTRL DER';
  if (code === 'AltLeft') return 'ALT IZQ';
  if (code === 'AltRight') return 'ALT DER';
  if (code === 'Tab') return 'TAB';
  if (code === 'ArrowUp') return 'FLECHA ARRIBA';
  if (code === 'ArrowDown') return 'FLECHA ABAJO';
  if (code === 'ArrowLeft') return 'FLECHA IZQ';
  if (code === 'ArrowRight') return 'FLECHA DER';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}

export function assignUniqueKeybind(
  current: KeybindConfig,
  action: keyof KeybindConfig,
  newCode: string
): { keybinds: KeybindConfig; swappedAction: keyof KeybindConfig | null } {
  const next = {} as KeybindConfig;
  const keys = Object.keys(current) as Array<keyof KeybindConfig>;
  for (const k of keys) {
    next[k] = [...(current[k] || [])];
  }

  const prevCodesForAction = [...(next[action] || [])];
  let swappedAction: keyof KeybindConfig | null = null;

  for (const k of keys) {
    if (k === action) continue;
    if (next[k].includes(newCode)) {
      if (!swappedAction) {
        swappedAction = k;
      }
      const remaining = next[k].filter((c) => c !== newCode);
      if (remaining.length > 0) {
        next[k] = remaining;
      } else {
        const replacement = prevCodesForAction.find((c) => c !== newCode);
        next[k] = replacement ? [replacement] : [];
      }
    }
  }

  next[action] = [newCode];
  return { keybinds: next, swappedAction };
}

export function isFloatingScoreCategoryEnabled(
  settings: SettingsConfig,
  category?: string
): boolean {
  if (!settings.floatingPointsEnabled) return false;
  switch (category) {
    case 'goal':
      return settings.floatingGoals !== false;
    case 'assist':
      return settings.floatingAssists !== false;
    case 'save':
      return settings.floatingSaves !== false;
    case 'shot':
      return settings.floatingShots !== false;
    case 'pass':
      return settings.floatingPasses !== false;
    case 'hattrick':
      return settings.floatingHattricks !== false;
    case 'ownGoal':
      return settings.floatingOwnGoals !== false;
    default:
      return true;
  }
}

export function normalizeBallSettings<
  T extends Partial<Pick<SettingsConfig, 'ballMode' | 'ballSkin' | 'ballCustomColor'>>
>(raw: T): T & Pick<SettingsConfig, 'ballMode' | 'ballSkin' | 'ballCustomColor'> {
  const ballCustomColor =
    typeof raw.ballCustomColor === 'string' && raw.ballCustomColor.trim().length > 0
      ? raw.ballCustomColor
      : DEFAULT_SETTINGS.ballCustomColor;
  if (String(raw.ballSkin || '') === 'solid') {
    return {
      ...raw,
      ballMode: 'color',
      ballSkin: 'classic',
      ballCustomColor
    };
  }
  const candidateSkin = String(raw.ballSkin || '');
  const isValidTexture =
    candidateSkin === 'futsal' ||
    (VALID_BALL_TEXTURE_SKINS as readonly string[]).includes(candidateSkin);
  return {
    ...raw,
    ballMode: raw.ballMode === 'color' ? 'color' : DEFAULT_SETTINGS.ballMode,
    ballSkin: (isValidTexture ? raw.ballSkin : DEFAULT_SETTINGS.ballSkin) as BallSkinType | 'futsal',
    ballCustomColor
  };
}

export type MobileSettingsFields = Pick<
  SettingsConfig,
  | 'mobileControlsEnabled'
  | 'mobileJoystickMode'
  | 'mobileJoystickAnchor'
  | 'mobileTurboMode'
  | 'mobileHudScale'
  | 'mobileHudOpacity'
  | 'mobileHapticsEnabled'
  | 'mobileCustomLayout'
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeMobileSettings<T extends Partial<MobileSettingsFields>>(
  raw: T
): T & MobileSettingsFields {
  const mobileControlsEnabled: MobileControlsMode =
    raw.mobileControlsEnabled === 'on' || raw.mobileControlsEnabled === 'off' || raw.mobileControlsEnabled === 'auto'
      ? raw.mobileControlsEnabled
      : DEFAULT_SETTINGS.mobileControlsEnabled;

  const mobileJoystickMode: MobileJoystickMode =
    raw.mobileJoystickMode === '8dir' || raw.mobileJoystickMode === '360'
      ? raw.mobileJoystickMode
      : DEFAULT_SETTINGS.mobileJoystickMode;

  const mobileJoystickAnchor: MobileJoystickAnchor =
    raw.mobileJoystickAnchor === 'dynamic' || raw.mobileJoystickAnchor === 'fixed'
      ? raw.mobileJoystickAnchor
      : DEFAULT_SETTINGS.mobileJoystickAnchor;

  const mobileTurboMode: MobileTurboMode =
    raw.mobileTurboMode === 'toggle' || raw.mobileTurboMode === 'hold'
      ? raw.mobileTurboMode
      : DEFAULT_SETTINGS.mobileTurboMode;

  const mobileHudScale =
    typeof raw.mobileHudScale === 'number' && Number.isFinite(raw.mobileHudScale)
      ? Math.max(0.7, Math.min(1.5, raw.mobileHudScale))
      : DEFAULT_SETTINGS.mobileHudScale;

  const mobileHudOpacity =
    typeof raw.mobileHudOpacity === 'number' && Number.isFinite(raw.mobileHudOpacity)
      ? Math.max(0.25, Math.min(1.0, raw.mobileHudOpacity))
      : DEFAULT_SETTINGS.mobileHudOpacity;

  const mobileHapticsEnabled =
    typeof raw.mobileHapticsEnabled === 'boolean'
      ? raw.mobileHapticsEnabled
      : DEFAULT_SETTINGS.mobileHapticsEnabled;

  const clonedLayout: MobileHudLayoutMap = {};
  if (raw.mobileCustomLayout && typeof raw.mobileCustomLayout === 'object' && !Array.isArray(raw.mobileCustomLayout)) {
    for (const [key, value] of Object.entries(raw.mobileCustomLayout)) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        Object.prototype.hasOwnProperty.call(Object.prototype, key)
      ) {
        continue;
      }
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.x === 'number' &&
        Number.isFinite(value.x) &&
        typeof value.y === 'number' &&
        Number.isFinite(value.y)
      ) {
        clonedLayout[key] = { x: value.x, y: value.y };
      }
    }
  }

  return {
    ...raw,
    mobileControlsEnabled,
    mobileJoystickMode,
    mobileJoystickAnchor,
    mobileTurboMode,
    mobileHudScale,
    mobileHudOpacity,
    mobileHapticsEnabled,
    mobileCustomLayout: clonedLayout
  };
}

export interface MobileLayoutEnv {
  mode: MobileControlsMode;
  isCapacitorNative: boolean;
  hasTouchCapability: boolean;
  hasCoarsePointer: boolean;
  isMobileUserAgent: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

export function resolveMobileLayout(env: MobileLayoutEnv): boolean {
  if (env.mode === 'on') return true;
  if (env.mode === 'off') return false;
  if (env.isCapacitorNative) return true;
  const minDim = Math.min(env.viewportWidth || 0, env.viewportHeight || 0);
  const maxDim = Math.max(env.viewportWidth || 0, env.viewportHeight || 0);
  if (env.isMobileUserAgent && (env.hasTouchCapability || env.hasCoarsePointer)) {
    return true;
  }
  if (env.hasCoarsePointer && minDim > 0 && minDim <= 1024) {
    return true;
  }
  if (env.hasTouchCapability && minDim > 0 && minDim <= 600 && maxDim <= 1024) {
    return true;
  }
  return false;
}

function safeIsCapacitorNative(): boolean {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function detectDeviceEnvironment(): Omit<MobileLayoutEnv, 'mode'> {
  const isCapacitorNative = safeIsCapacitorNative();
  if (typeof window === 'undefined') {
    return {
      isCapacitorNative,
      hasTouchCapability: false,
      hasCoarsePointer: false,
      isMobileUserAgent: false,
      viewportWidth: 0,
      viewportHeight: 0
    };
  }
  const viewportWidth =
    window.innerWidth || (typeof document !== 'undefined' ? document.documentElement?.clientWidth : 0) || 0;
  const viewportHeight =
    window.innerHeight || (typeof document !== 'undefined' ? document.documentElement?.clientHeight : 0) || 0;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const maxTouchPoints = typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  const hasTouchCapability = 'ontouchstart' in window || maxTouchPoints > 0;
  let hasCoarsePointer = false;
  try {
    hasCoarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  } catch {
    hasCoarsePointer = false;
  }
  const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
  const platform = typeof nav?.platform === 'string' ? nav.platform : '';
  const isIpadDesktopUa = platform === 'MacIntel' && maxTouchPoints > 1;
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua) || isIpadDesktopUa;
  return {
    isCapacitorNative,
    hasTouchCapability,
    hasCoarsePointer,
    isMobileUserAgent,
    viewportWidth,
    viewportHeight
  };
}

export type ScoreFilterCategory = 'goal' | 'assist' | 'save' | 'shot' | 'pass' | 'hattrick' | 'ownGoal';

export function classifyScoreEvent(ev: Record<string, unknown>): {
  filterCat?: ScoreFilterCategory;
  eventType: string;
  pointsText: string;
} {
  const cat = String(ev.category ?? ev.eventType ?? '').toLowerCase();
  const rawText = String(ev.text ?? '').toLowerCase();

  const isOwn = cat.includes('own') || rawText.includes('autogol');
  const isHattrick = cat.includes('hattrick') || rawText.includes('hattrick');
  const isAssist = cat.includes('assist') || rawText.includes('asistencia');
  const isSave = cat.includes('save') || rawText.includes('atajada');
  const isShot = cat.includes('shot') || rawText.includes('tiro');
  const isPass = cat.includes('pass') || rawText.includes('pase');
  const isPower = !isOwn && (cat.includes('power') || Boolean(ev.isPower) || rawText.includes('potencia'));
  const isCurve = cat.includes('curve') || Boolean(ev.isCurve) || rawText.includes('efecto');
  const isGoal = !isOwn && (cat.includes('goal') || isPower || rawText.includes('gol'));

  const filterCat: ScoreFilterCategory | undefined = isOwn
    ? 'ownGoal'
    : isHattrick
      ? 'hattrick'
      : isAssist
        ? 'assist'
        : isSave
          ? 'save'
          : isShot
            ? 'shot'
            : isPass
              ? 'pass'
              : isGoal
                ? 'goal'
                : undefined;

  let eventType = 'EVENTO';
  if (isOwn) eventType = 'AUTOGOL';
  else if (isHattrick) eventType = 'HATTRICK';
  else if (isAssist && isCurve) eventType = 'ASISTENCIA EFECTO';
  else if (isAssist) eventType = 'ASISTENCIA';
  else if (isPower) eventType = 'GOL POTENCIA';
  else if (isGoal && isCurve) eventType = 'GOL EFECTO';
  else if (isGoal) eventType = 'GOL';
  else if (isSave) eventType = 'ATAJADA';
  else if (isShot) eventType = 'TIRO';
  else if (isPass) eventType = 'PASE';

  const pts = Number(ev.points ?? 0);
  const pointsText = `${pts >= 0 ? '+' : ''}${pts} PTS`;
  return { ...(filterCat ? { filterCat } : {}), eventType, pointsText };
}

export interface RoomInfo {
  id: string;
  name: string;
  playersCount: number;
  maxPlayers: number;
  ping: number;
  hostPingMs?: number;
  countryCode?: string;
  roomType?: 'casual' | 'ranked';
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
  position?: PlayerPosition;
  teamOrder?: number;
  isAdmin: boolean;
  isHost: boolean;
  isGuest?: boolean;
  isBot?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
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
  saves?: number;
  powerGoals?: number;
  curveGoals?: number;
  curveAssists?: number;
  hasHattrickBonus?: boolean;
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
  playerSpeed?: number;
  playerAcceleration?: number;
  kickingAcceleration?: number;
  playerFriction?: number;
  ballFriction?: number;
  ballRestitution?: number;
  kickStrength?: number;
  kickMargin?: number;
  boostMultiplier?: number;
  turboStaminaDrain?: number;
  dashDistance?: number;
  dashesPerFullBar?: number;
  dashStaminaCost?: number;
  staminaRechargeRate?: number;
  staminaRechargeDelay?: number;
  staminaRegenMoving?: boolean;
  staminaRegenMovingRate?: number;
  magnusCurveStrength?: number;
  turboEnabled?: boolean;
  dashEnabled?: boolean;
  magnusEnabled?: boolean;
}

export const DEFAULT_PHYSICS_MODIFIERS: Readonly<PhysicsModifiers> = {
  gravity: 0.0,
  pitchFriction: DEFAULT_GAMEPLAY_CONFIG.ballFriction,
  wallBounciness: DEFAULT_GAMEPLAY_CONFIG.ballRestitution,
  postBounciness: 0.5,
  baseKickStrength: (DEFAULT_GAMEPLAY_CONFIG.kickStrength / 4.545) * 450.0,
  dashPower: (DEFAULT_GAMEPLAY_CONFIG.dashDistance / 7) * 60,
  dashCooldown: DEFAULT_GAMEPLAY_CONFIG.dashCooldown,
  playerMass: DEFAULT_GAMEPLAY_CONFIG.playerMass,
  playerRadius: DEFAULT_GAMEPLAY_CONFIG.playerRadius,
  ballMass: DEFAULT_GAMEPLAY_CONFIG.ballMass,
  ballRadius: DEFAULT_GAMEPLAY_CONFIG.ballRadius,
  magnusCoefficient: DEFAULT_GAMEPLAY_CONFIG.magnusCurveStrength,
  netElasticity: 0.45,
  netDamping: 0.12,
  goalCelebrationDuration: 3.0,
  goalLimit: 3,
  matchTimeMinutes: 3.0,
  goldenGoalOvertime: true,
  airDensity: 1.0,
  playerMaxSpeed: DEFAULT_GAMEPLAY_CONFIG.playerMaxSpeed,
  playerSpeed: DEFAULT_GAMEPLAY_CONFIG.playerSpeed,
  playerAcceleration: DEFAULT_GAMEPLAY_CONFIG.playerAcceleration,
  kickingAcceleration: DEFAULT_GAMEPLAY_CONFIG.kickingAcceleration,
  playerFriction: DEFAULT_GAMEPLAY_CONFIG.playerFriction,
  ballFriction: DEFAULT_GAMEPLAY_CONFIG.ballFriction,
  ballRestitution: DEFAULT_GAMEPLAY_CONFIG.ballRestitution,
  kickStrength: DEFAULT_GAMEPLAY_CONFIG.kickStrength,
  kickMargin: DEFAULT_GAMEPLAY_CONFIG.kickMargin,
  boostMultiplier: DEFAULT_GAMEPLAY_CONFIG.boostMultiplier,
  turboStaminaDrain: DEFAULT_GAMEPLAY_CONFIG.turboStaminaDrain,
  dashDistance: DEFAULT_GAMEPLAY_CONFIG.dashDistance,
  dashesPerFullBar: DEFAULT_GAMEPLAY_CONFIG.dashesPerFullBar,
  dashStaminaCost: DEFAULT_GAMEPLAY_CONFIG.dashStaminaCost,
  staminaRechargeRate: DEFAULT_GAMEPLAY_CONFIG.staminaRechargeRate,
  staminaRechargeDelay: DEFAULT_GAMEPLAY_CONFIG.staminaRechargeDelay,
  staminaRegenMoving: DEFAULT_GAMEPLAY_CONFIG.staminaRegenMoving,
  staminaRegenMovingRate: DEFAULT_GAMEPLAY_CONFIG.staminaRegenMovingRate,
  magnusCurveStrength: DEFAULT_GAMEPLAY_CONFIG.magnusCurveStrength,
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
  public isPracticeMode = $state<boolean>(false);
  public roomType = $state<'casual' | 'ranked'>('casual');
  public lobbyError = $state<string | null>(null);
  public isFocusingBall = $state<boolean>(false);
  public lastKeybindSwapNotice = $state<string | null>(null);

  // Mobile Runtime & Touch HUD Telemetry
  public viewportWidth = $state<number>(0);
  public viewportHeight = $state<number>(0);
  public hasTouchCapability = $state<boolean>(false);
  public hasCoarsePointer = $state<boolean>(false);
  public isMobileUserAgent = $state<boolean>(false);
  public isCapacitorNative = $state<boolean>(false);
  public isHudEditorOpen = $state<boolean>(false);
  public localStamina = $state<number>(100);
  public localDashCooldown = $state<number>(0);
  public localDashMaxCooldown = $state<number>(1.0);
  public localIsDashing = $state<boolean>(false);
  public localIsTurbo = $state<boolean>(false);

  // Settings & Keybinds
  public settings = $state<SettingsConfig>({
    ...DEFAULT_SETTINGS,
    gamepadBinds: {
      kick: [...DEFAULT_GAMEPAD_BINDS.kick],
      dash: [...DEFAULT_GAMEPAD_BINDS.dash],
      turbo: [...DEFAULT_GAMEPAD_BINDS.turbo],
      curveLeft: [...DEFAULT_GAMEPAD_BINDS.curveLeft],
      curveRight: [...DEFAULT_GAMEPAD_BINDS.curveRight],
      focusBall: [...DEFAULT_GAMEPAD_BINDS.focusBall],
      pause: [...DEFAULT_GAMEPAD_BINDS.pause],
      menu: [...DEFAULT_GAMEPAD_BINDS.menu]
    },
    mobileCustomLayout: { ...DEFAULT_SETTINGS.mobileCustomLayout }
  });

  private _isMobileLayout = $derived.by(() =>
    resolveMobileLayout({
      mode: this.settings.mobileControlsEnabled,
      isCapacitorNative: this.isCapacitorNative,
      hasTouchCapability: this.hasTouchCapability,
      hasCoarsePointer: this.hasCoarsePointer,
      isMobileUserAgent: this.isMobileUserAgent,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight
    })
  );

  public get isMobileLayout(): boolean {
    return this._isMobileLayout;
  }

  private _isPortraitOnMobile = $derived(
    this._isMobileLayout && this.viewportHeight > this.viewportWidth
  );

  public get isPortraitOnMobile(): boolean {
    return this._isPortraitOnMobile;
  }

  public setViewportEnvironment(
    width: number,
    height: number,
    isTouch?: boolean,
    isNative?: boolean,
    hasCoarsePointer?: boolean,
    isMobileUa?: boolean
  ): void {
    this.viewportWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
    this.viewportHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
    if (isTouch !== undefined) {
      this.hasTouchCapability = Boolean(isTouch);
    }
    if (isNative !== undefined) {
      this.isCapacitorNative = Boolean(isNative);
    }
    if (hasCoarsePointer !== undefined) {
      this.hasCoarsePointer = Boolean(hasCoarsePointer);
    }
    if (isMobileUa !== undefined) {
      this.isMobileUserAgent = Boolean(isMobileUa);
    }
  }

  public refreshDeviceEnvironment(): void {
    const detected = detectDeviceEnvironment();
    this.isCapacitorNative = detected.isCapacitorNative;
    this.hasTouchCapability = detected.hasTouchCapability;
    this.hasCoarsePointer = detected.hasCoarsePointer;
    this.isMobileUserAgent = detected.isMobileUserAgent;
    this.viewportWidth = detected.viewportWidth;
    this.viewportHeight = detected.viewportHeight;
  }

  public resetMobileHudLayout(): void {
    this.saveSettings({ mobileCustomLayout: {} });
  }
  public extrapolationMs = $state<number>(0);
  public activeBanner = $state<MatchBannerPayload>({ kind: 'NONE' });
  public activeSettingsTab = $state<SettingsTabType>('controls');
  public activeControlsSubTab = $state<'keyboard' | 'gamepad' | 'touch'>('keyboard');
  private _authReader = $state<(() => boolean) | null>(null);

  public setAuthStatusReader(reader: () => boolean): void {
    this._authReader = reader;
  }

  public get isAuthenticatedUser(): boolean {
    if (this._authReader) {
      return this._authReader();
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('legacyx_auth_session_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          return Boolean(parsed?.isAuthenticated && !parsed?.isGuest);
        }
      } catch {
        // Ignore malformed storage session
      }
    }
    return false;
  }

  private _effectiveExtrapolationMs = $derived.by(() => {
    if (this.settings.autoExtrapolation === false) {
      return Math.max(0, Math.min(250, Math.round(Number(this.settings.extrapolationMs) || 0)));
    }
    const p = Math.max(0, Number(this.pingMs) || 0);
    if (p <= 20) return 0;
    if (p >= 200) return 85;
    return Math.round(((p - 20) / 180) * 85);
  });

  public get effectiveExtrapolationMs(): number {
    return this._effectiveExtrapolationMs;
  }

  public get effectiveBallMode(): 'texture' | 'color' {
    return this.isAuthenticatedUser ? this.settings.ballMode : DEFAULT_SETTINGS.ballMode;
  }

  public get effectiveBallSkin(): BallSkinType | 'futsal' {
    return this.isAuthenticatedUser ? this.settings.ballSkin : DEFAULT_SETTINGS.ballSkin;
  }

  public get effectiveBallCustomColor(): string {
    return this.isAuthenticatedUser ? this.settings.ballCustomColor : DEFAULT_SETTINGS.ballCustomColor;
  }

  public get effectiveScoreboardDesign(): ScoreboardDesignType {
    return this.isAuthenticatedUser ? this.settings.scoreboardDesign : DEFAULT_SETTINGS.scoreboardDesign;
  }

  public get effectiveLocalKit(): TeamKitConfig {
    return this.isAuthenticatedUser ? this.settings.localKit : GameUIStore.DEFAULT_RED_KIT;
  }

  public get effectiveVisitorKit(): TeamKitConfig {
    return this.isAuthenticatedUser ? this.settings.visitorKit : GameUIStore.DEFAULT_BLUE_KIT;
  }
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
    focusBall: [...DEFAULT_KEYBINDS.focusBall],
    pause: [...DEFAULT_KEYBINDS.pause],
    menu: [...DEFAULT_KEYBINDS.menu],
    chat: [...DEFAULT_KEYBINDS.chat]
  });

  // Rooms & Lobby (Clean live state, zero mock rooms)
  public rooms = $state<RoomInfo[]>([]);
  public get availableRooms(): RoomInfo[] {
    return this.rooms;
  }
  public set availableRooms(value: RoomInfo[]) {
    this.rooms = value;
  }
  public roomFilterQuery = $state('');
  public filterLockedOnly = $state(false);
  public activeRoom = $state<RoomInfo | null>(null);
  public pendingPasswordRoom = $state<RoomInfo | null>(null);
  public pendingPasswordInput = $state('');
  public pendingInviteRoomId = $state<string | null>(null);

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
  public fsmPhase = $state<
    | 'STOPPED'
    | 'PRE_MATCH_VS'
    | 'START_COUNTDOWN'
    | 'WARMUP'
    | 'KICKOFF'
    | 'PLAYING'
    | 'PAUSED'
    | 'RESUME_COUNTDOWN'
    | 'GOAL'
    | 'GOAL_REPLAY'
    | 'OVERTIME'
    | 'CELEBRATION'
    | 'STATS'
  >('STOPPED');
  public activeGoalScorerId = $state<number | null>(null);
  private _isGoalReplay = $derived(this.fsmPhase === 'GOAL_REPLAY');
  public get isGoalReplay(): boolean {
    return this._isGoalReplay;
  }
  public previousMatchPhase = $state<number>(0);
  public hasJoinedInitialSync = $state<boolean>(false);
  public isGoldenGoal = $state(false);
  public slidingEventQueue = $state<SlidingScoreEvent[]>([]);
  public currentSlidingEvent = $state<SlidingScoreEvent | null>(null);
  public matchTimerSeconds = $state<number>(0);
  public onChatAdded?: (entry: ChatEntry) => void;
  public onBannerApplied?: (banner: MatchBannerPayload) => void;
  public onHudStateChange?: (kind: string, detail?: any) => void;

  private emitHudStateChange(kind: string, detail?: any): void {
    this.onHudStateChange?.(kind, detail);
  }

  public syncUiOverlay(): void {
    this.emitHudStateChange('ui_overlay', {
      activeModal: this.activeModal,
      activeSlide: this._activeSlide
    });
  }
  private slidingEventTimeout: ReturnType<typeof setTimeout> | null = null;
  private slidingEventTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private clearAllSlidingEventTimers(): void {
    if (this.slidingEventTimeout) {
      clearTimeout(this.slidingEventTimeout);
      this.slidingEventTimeout = null;
    }
    for (const timer of this.slidingEventTimers.values()) {
      clearTimeout(timer);
    }
    this.slidingEventTimers.clear();
  }

  public pushScoreEvent(event: Omit<SlidingScoreEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): void {
    const fullEvent: SlidingScoreEvent = {
      id: event.id || Math.random().toString(36).slice(2, 9),
      playerName: event.playerName,
      eventType: event.eventType,
      pointsText: event.pointsText,
      color: event.color || '#00e5ff',
      team: event.team || 'neutral',
      timestamp: event.timestamp || Date.now()
    };

    const existingTimer = this.slidingEventTimers.get(fullEvent.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.slidingEventTimers.delete(fullEvent.id);
    }

    const nextQueue = [...this.slidingEventQueue.filter((e) => e.id !== fullEvent.id), fullEvent];
    while (nextQueue.length > 3) {
      const evicted = nextQueue.shift();
      if (evicted) {
        const evictedTimer = this.slidingEventTimers.get(evicted.id);
        if (evictedTimer) {
          clearTimeout(evictedTimer);
          this.slidingEventTimers.delete(evicted.id);
        }
      }
    }
    this.slidingEventQueue = nextQueue;
    this.currentSlidingEvent = fullEvent;
    this.emitHudStateChange('score_event', fullEvent);

    const timer = setTimeout(() => {
      this.slidingEventTimers.delete(fullEvent.id);
      this.slidingEventQueue = this.slidingEventQueue.filter((e) => e.id !== fullEvent.id);
      if (this.currentSlidingEvent?.id === fullEvent.id) {
        this.currentSlidingEvent = this.slidingEventQueue[this.slidingEventQueue.length - 1] ?? null;
      }
    }, 2400);
    this.slidingEventTimers.set(fullEvent.id, timer);
  }
  public redPossession = $state(50);
  public bluePossession = $state(50);
  public pingMs = $state(0);
  public jitterMs = $state(0);
  public packetLossPct = $state(0);
  public iceRoute = $state<string>('Local');
  public reconciliationsPerSec = $state(0);
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
  public activeModifiersTab = $state<'presets' | 'player' | 'ball' | 'mechanics'>('presets');
  public activeLegalDoc = $state<LegalDocId | null>(null);

  public openLegalDoc(doc: LegalDocId = 'privacy'): void {
    soundFX.playUIClick();
    this.activeLegalDoc = doc;
  }

  public closeLegalDoc(): void {
    soundFX.playUIClick();
    this.activeLegalDoc = null;
  }

  // Audio convenience getters/state
  public isAudioMuted = $state(false);
  public masterVolume = $state(1.0);

  // Superadmin /var telemetry monitor state
  public showVarMonitor = $state<boolean>(false);
  public varTelemetry = $state({
    ballSpeedPx: 0,
    ballSpeedKmh: 0,
    ballX: 0,
    ballY: 0,
    playerSpeedPx: 0,
    playerSpeedKmh: 0,
    playerX: 0,
    playerY: 0,
    tick: 0,
    ping: 0
  });
  private userRoleReader: (() => string | null | undefined) | null = null;

  public registerUserRoleReader(reader: () => string | null | undefined): void {
    this.userRoleReader = reader;
  }

  // Chat anti-spam cooldown (1500ms)
  private lastChatSentAtMs = -CHAT_COOLDOWN_MS;
  private chatCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  public chatCooldownActive = $state<boolean>(false);

  private clearChatCooldownTimer(): void {
    if (this.chatCooldownTimer !== null) {
      clearTimeout(this.chatCooldownTimer);
      this.chatCooldownTimer = null;
    }
  }

  public canSendChatNow(now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): boolean {
    return now - this.lastChatSentAtMs >= CHAT_COOLDOWN_MS;
  }

  public markChatSent(now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): void {
    this.lastChatSentAtMs = now;
    this.clearChatCooldownTimer();
    this.chatCooldownActive = false;
  }

  public triggerChatCooldownNotice(): void {
    this.clearChatCooldownTimer();
    this.chatCooldownActive = true;
    this.chatCooldownTimer = setTimeout(() => {
      this.chatCooldownActive = false;
      this.chatCooldownTimer = null;
    }, 1450);
  }

  // Stylized Room Disconnect Notice Modal State
  public roomDisconnectNotice = $state<RoomDisconnectNotice | null>(null);

  public showRoomDisconnectNotice(notice: RoomDisconnectNotice): void {
    this.roomDisconnectNotice = { ...notice };
  }

  public clearRoomDisconnectNotice(): void {
    this.roomDisconnectNotice = null;
  }

  // Diapositiva activa del carrusel ('MENU' | 'STATS')
  private _activeSlide = $state<'MENU' | 'STATS'>('MENU');
  public get activeSlide(): 'MENU' | 'STATS' {
    return this._activeSlide;
  }
  public set activeSlide(value: 'MENU' | 'STATS') {
    if (this._activeSlide !== value) {
      this._activeSlide = value;
      this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: value });
    }
  }

  // Ajuste de sala: permitir a capitanes conmutar su kit
  public allowCaptainKitSwitch = $state(false);

  // Callbacks for Engine / Worker / Netcode integration
  public onModifiersChanged: ((modifiers: PhysicsModifiers) => void) | null = null;
  public onStartPracticeMode: (() => void) | null = null;
  public onStadiumChanged: ((stadiumId: string) => void) | null = null;
  public onTogglePause: (() => void) | null = null;
  public onSkipGoalReplay: (() => void) | null = null;
  public onStartMatch: (() => void) | null = null;
  public onStopMatch: (() => void) | null = null;
  public onSettingsChanged: ((settings: SettingsConfig) => void) | null = null;
  public onChatSent: ((text: string) => void) | null = null;
  public onTeamChanged: ((playerId: number, team: 'red' | 'blue' | 'spectator') => void) | null = null;
  public onPositionChange: ((playerId: number, position: PlayerPosition) => void) | null = null;
  public onPlayerEmote: ((playerId: number, emoji: string) => void) | null = null;
  public onLeaveRoom: (() => void) | null = null;
  public onAdminAction: ((action: string, payload?: any) => void) | null = null;
  public onRoomConfigChanged: ((patch: any) => void) | null = null;
  public onProfileUpdated: (() => void) | null = null;
  public onSuperadminElevate: (() => void) | null = null;
  public onAddBot: ((team: 'red' | 'blue', difficulty: 'easy' | 'medium' | 'hard') => void) | null = null;
  public onSetBotDifficulty: ((botId: number, difficulty: 'easy' | 'medium' | 'hard') => void) | null = null;
  public onRemoveBot: ((botId: number) => void) | null = null;
  public onClearTeam: ((team: 'red' | 'blue') => void) | null = null;
  public onTriggerShake: ((intensity: number, durationMs: number) => void) | null = null;
  public onSimLagChanged: ((cfg: { enabled: boolean; rttMs: number; jitterMs: number; lossPct: number }) => void) | null = null;
  public isGamepadActive = $state<boolean>(false);
  private hasShownHighPingNetModeHint = false;
  public simLagConfig = $state<{ enabled: boolean; rttMs: number; jitterMs: number; lossPct: number }>({
    enabled: false,
    rttMs: 0,
    jitterMs: 0,
    lossPct: 0
  });

  public get screenShake(): boolean {
    return this.settings.screenShakeEnabled !== false;
  }

  public set screenShake(val: boolean) {
    this.settings.screenShakeEnabled = Boolean(val);
    this.settings.goalShakeEnabled = Boolean(val);
    this.saveSettings();
  }

  public setNetMode(mode: NetModeType): NetModeType {
    const normalized: NetModeType = mode === 'predicted' ? 'predicted' : 'classic';
    this.settings.netMode = normalized;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACYX_NET_MODE_KEY, normalized);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      } catch {
        // Ignore storage quota
      }
    }
    this.onSettingsChanged?.(this.settings);
    return normalized;
  }

  public setSimLag(
    rttMs: number,
    jitterMs: number = 0,
    lossPct: number = 0
  ): { enabled: boolean; rttMs: number; jitterMs: number; lossPct: number } {
    const safeRtt = Number.isFinite(rttMs) ? Math.max(0, Math.min(1000, Math.round(rttMs))) : 0;
    const safeJitter = Number.isFinite(jitterMs) ? Math.max(0, Math.min(300, Math.round(jitterMs))) : 0;
    const safeLoss = Number.isFinite(lossPct)
      ? Math.max(0, Math.min(50, Math.round(lossPct * 10) / 10))
      : 0;
    const enabled = safeRtt > 0 || safeJitter > 0 || safeLoss > 0;
    const nextCfg = {
      enabled,
      rttMs: enabled ? safeRtt : 0,
      jitterMs: enabled ? safeJitter : 0,
      lossPct: enabled ? safeLoss : 0
    };
    this.simLagConfig = nextCfg;
    this.onSimLagChanged?.(nextCfg);
    return nextCfg;
  }

  public setExtrapolationMs(ms: number): number {
    const num = Number(ms);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(250, Math.round(num))) : 0;
    this.extrapolationMs = clamped;
    this.settings.extrapolationMs = clamped;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACYX_EXTRAPOLATION_KEY, String(clamped));
        localStorage.setItem('haxball_extrapolation_ms', String(clamped));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      } catch {
        // Ignore storage quota
      }
    }
    this.onSettingsChanged?.(this.settings);
    return clamped;
  }

  public applyMatchBanner(banner: MatchBannerPayload | null | undefined): void {
    const normalized: MatchBannerPayload = !banner || !banner.kind ? { kind: 'NONE' } : { ...banner };
    this.activeBanner = normalized;
    this.onBannerApplied?.(normalized);
    this.emitHudStateChange('banner', normalized);
  }

  public pushLocalSystemNotice(text: string): void {
    const msgId = `local-sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.addChatMessage({
      id: msgId,
      team: 'SYSTEM',
      senderTeam: 'system',
      sender: '',
      isHost: false,
      isSystem: true,
      text
    });
  }

  public handleChatCommand(rawText: string): boolean {
    const trimmed = rawText.trim();
    if (/^\/admin$/i.test(trimmed)) {
      const role = this.userRoleReader?.();
      if (typeof role === 'string' && role.trim().toLowerCase() === 'superadmin') {
        this.onSuperadminElevate?.();
      } else {
        this.pushLocalSystemNotice('Comando /admin exclusivo para Superadmin.');
      }
      return true;
    }

    if (/^\/var$/i.test(trimmed)) {
      const role = this.userRoleReader?.();
      if (typeof role === 'string' && role.trim().toLowerCase() === 'superadmin') {
        this.showVarMonitor = !this.showVarMonitor;
        this.pushLocalSystemNotice(
          '[VAR] Monitor de telemetría en tiempo real ' +
            (this.showVarMonitor ? 'ACTIVADO' : 'DESACTIVADO') +
            '.'
        );
      } else {
        this.pushLocalSystemNotice('Comando /var exclusivo para Superadmin.');
      }
      return true;
    }

    const netModeMatch = /^\/netmode(?:\s+(.*))?$/i.exec(trimmed);
    if (netModeMatch) {
      const arg = (netModeMatch[1] ?? '').trim().toLowerCase();
      if (!arg) {
        this.pushLocalSystemNotice(
          `Modo de red actual: ${this.settings.netMode.toUpperCase()}. Uso: /netmode <classic|predicted>`
        );
        return true;
      }
      if (arg === 'classic' || arg === 'clasico' || arg === 'clásico') {
        this.setNetMode('classic');
        this.pushLocalSystemNotice('Modo de red: CLASSIC (Haxball puro — línea temporal unificada).');
        return true;
      }
      if (arg === 'predicted' || arg === 'predict' || arg === 'prediccion' || arg === 'predicción') {
        this.setNetMode('predicted');
        this.pushLocalSystemNotice('Modo de red: PREDICTED (predicción local con reconciliación).');
        return true;
      }
      this.pushLocalSystemNotice('Valor inválido. Uso: /netmode <classic|predicted>');
      return true;
    }

    const simLagMatch = /^\/simlag(?:\s+(.*))?$/i.exec(trimmed);
    if (simLagMatch) {
      const arg = (simLagMatch[1] ?? '').trim();
      if (!arg) {
        if (this.simLagConfig.enabled) {
          this.pushLocalSystemNotice(
            `Simulador de lag ACTIVO: ${this.simLagConfig.rttMs} ms RTT · ±${this.simLagConfig.jitterMs} ms jitter · ${this.simLagConfig.lossPct}% pérdida. Uso: /simlag <rttMs> [jitterMs] [lossPct] o /simlag 0`
          );
        } else {
          this.pushLocalSystemNotice(
            'Simulador de lag (/simlag) INACTIVO. Uso: /simlag <rttMs> [jitterMs] [lossPct] (ej. /simlag 260 40 3)'
          );
        }
        return true;
      }
      if (/^(?:0|off|disable|none)$/i.test(arg)) {
        this.setSimLag(0, 0, 0);
        this.pushLocalSystemNotice('Simulador de lag (/simlag) DESACTIVADO.');
        return true;
      }
      const parts = arg.split(/\s+/);
      if (parts.length > 3 || parts.some((p) => !/^\d+(?:\.\d+)?$/.test(p))) {
        this.pushLocalSystemNotice(
          'Uso: /simlag <rttMs> [jitterMs] [lossPct] (ej. /simlag 260 40 3) o /simlag 0'
        );
        return true;
      }
      const rtt = Number(parts[0]);
      const jitter = parts[1] !== undefined ? Number(parts[1]) : 0;
      const loss = parts[2] !== undefined ? Number(parts[2]) : 0;
      const applied = this.setSimLag(rtt, jitter, loss);
      if (!applied.enabled) {
        this.pushLocalSystemNotice('Simulador de lag (/simlag) DESACTIVADO.');
      } else {
        this.pushLocalSystemNotice(
          `Simulador de lag ACTIVO: ${applied.rttMs} ms RTT · ±${applied.jitterMs} ms jitter · ${applied.lossPct}% pérdida.`
        );
      }
      return true;
    }

    const match = /^\/(?:extrapolation|extra)(?:\s+(.*))?$/i.exec(trimmed);
    if (!match) return false;

    const arg = (match[1] ?? '').trim();
    if (!arg) {
      this.pushLocalSystemNotice(`Extrapolación actual: ${this.extrapolationMs} ms. Uso: /extrapolation <0-250>`);
      return true;
    }

    if (!/^-?\d+(?:\.\d+)?$/.test(arg)) {
      this.pushLocalSystemNotice(`Valor inválido. Uso: /extrapolation <0-250>`);
      return true;
    }

    this.settings.autoExtrapolation = false;
    const clamped = this.setExtrapolationMs(Number(arg));
    this.pushLocalSystemNotice(`Extrapolación establecida en ${clamped} ms`);
    return true;
  }

  public canTriggerPitchEmote(team: TeamSlot = this.myTeam): boolean {
    return this.isAuthenticatedUser && (team === 'red' || team === 'blue');
  }

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

  private pickDefaultZoneForTeam(team: 'red' | 'blue'): PlayerPosition {
    const teammates = this.rosterPlayers.filter((p) => p.team === team);
    const occupied = new Set(teammates.map((p) => p.position).filter(Boolean));
    for (const pos of PLAYER_POSITIONS) {
      if (!occupied.has(pos)) return pos;
    }
    const counts: Record<PlayerPosition, number> = { GK: 0, DFC: 0, MC: 0, ST: 0 };
    for (const tm of teammates) {
      if (tm.position && counts[tm.position] !== undefined) counts[tm.position]++;
    }
    const outfield: PlayerPosition[] = ['DFC', 'MC', 'ST'];
    outfield.sort((a, b) => counts[a] - counts[b]);
    return outfield[0] ?? 'MC';
  }

  public addBotToTeam(team: 'red' | 'blue', difficulty: 'easy' | 'medium' | 'hard' = 'medium'): boolean {
    if (!this.isPracticeMode && this.roomType === 'ranked') return false;
    if (!this.isPracticeMode && !this.isHost) return false;
    soundFX.playUIClick();
    if (this.isPracticeMode) {
      const nextId = Math.max(1, ...this.rosterPlayers.map((p) => p.id)) + 1;
      const maxOrder = Math.max(0, ...this.rosterPlayers.map((p) => p.teamOrder ?? p.id));
      const botCount = this.rosterPlayers.filter((p) => p.isBot).length + 1;
      const pos = this.pickDefaultZoneForTeam(team);
      const botPlayer: RosterPlayer = {
        id: nextId,
        peerId: `bot_${nextId}`,
        nickname: `BOT ${botCount}`,
        name: `BOT ${botCount}`,
        number: nextId,
        avatar: '🤖',
        avatarType: 'emoji',
        team,
        position: pos,
        teamOrder: maxOrder + 1,
        isAdmin: false,
        isHost: false,
        isGuest: false,
        isBot: true,
        botDifficulty: difficulty,
        ping: 0
      };
      this.rosterPlayers = [...this.rosterPlayers, botPlayer];
      return true;
    }
    this.onAddBot?.(team, difficulty);
    return true;
  }

  public setBotDifficulty(botId: number, difficulty: 'easy' | 'medium' | 'hard'): boolean {
    if (!this.isPracticeMode && (!this.isHost || this.roomType === 'ranked')) return false;
    soundFX.playUIClick();
    if (this.isPracticeMode) {
      let updated = false;
      this.rosterPlayers = this.rosterPlayers.map((p) => {
        if (p.id === botId && p.isBot) {
          updated = true;
          return { ...p, botDifficulty: difficulty };
        }
        return p;
      });
      return updated;
    }
    this.onSetBotDifficulty?.(botId, difficulty);
    return true;
  }

  public removeBot(botId: number): boolean {
    if (!this.isPracticeMode && !this.isHost) return false;
    soundFX.playUIClick();
    if (this.isPracticeMode) {
      const prevLen = this.rosterPlayers.length;
      this.rosterPlayers = this.rosterPlayers.filter((p) => !(p.id === botId && p.isBot));
      return this.rosterPlayers.length !== prevLen;
    }
    this.onRemoveBot?.(botId);
    return true;
  }

  public clearTeam(team: 'red' | 'blue'): boolean {
    if (!this.isPracticeMode && !this.isHost && !this.isAdmin) return false;
    soundFX.playUIClick();
    if (this.isPracticeMode) {
      const next: RosterPlayer[] = [];
      for (const p of this.rosterPlayers) {
        if (p.team !== team) {
          next.push(p);
          continue;
        }
        if (p.isBot) continue;
        next.push({ ...p, team: 'spectator', teamOrder: 0, position: undefined });
      }
      this.rosterPlayers = next;
      return true;
    }
    this.onClearTeam?.(team);
    return true;
  }

  public resetTeamsToSpectators(): boolean {
    if (!this.isHost && !this.isAdmin) return false;
    soundFX.playUIClick();
    let changed = false;
    for (const p of this.rosterPlayers) {
      if (p.team === 'red' || p.team === 'blue') {
        p.team = 'spectator';
        p.teamOrder = 0;
        p.position = undefined;
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
    this.refreshDeviceEnvironment();
    this.loadPersistedState();
    void import('./userProfile.svelte.js')
      .then((mod) => {
        if (mod?.userProfile && !this._authReader) {
          this._authReader = () => Boolean(mod.userProfile.isAuthenticated && !mod.userProfile.isGuest);
        }
      })
      .catch(() => {});
    if (typeof window !== 'undefined') {
      this.initSignaling();
    }
  }

  public initSignaling(client: SignalingClient = sharedSignaling): void {
    if (typeof window === 'undefined') return;
    this.signaling = client;

    client.onRoomPingResult = (roomId: string, pingMs: number) => {
      if (pingMs > 0) {
        this.updateRoomHoverPing(roomId, pingMs);
      }
    };

    client.on('telemetry', (data: { pingMs: number | null; onlineCount: number }) => {
      this.realPing = data.pingMs;
      if (typeof data.onlineCount === 'number') {
        this.onlineUsersCount = data.onlineCount;
      }
    });

    const onRoomList = (data: { rooms?: Array<any>; onlineCount?: number }) => {
      if (typeof data.onlineCount === 'number') {
        this.onlineUsersCount = data.onlineCount;
      }
      if (Array.isArray(data.rooms)) {
        const previousPings = new Map(this.rooms.map((rm) => [rm.id, rm.ping]));
        this.rooms = data.rooms.map((r: any) => {
          const id = r.id || `R-${Math.random().toString(36).substring(2, 6)}`;
          const prevPing = previousPings.get(id) ?? 0;
          const livePing = typeof r.ping === 'number' && r.ping > 0 ? Math.round(r.ping) : prevPing;
          return {
            id,
            name: r.name || 'Sala Pública',
            playersCount: r.playerCount ?? r.playersCount ?? 1,
            maxPlayers: Math.min(30, Math.max(2, r.maxPlayers ?? 12)),
            ping: livePing,
            hostPingMs: typeof r.hostPingMs === 'number' ? r.hostPingMs : undefined,
            countryCode: r.countryCode || 'UN',
            roomType: r.roomType === 'ranked' ? 'ranked' : 'casual',
            isPrivate: Boolean(r.isPrivate ?? r.hasPassword),
            stadium: r.stadiumId || r.stadium || 'AF 3v3',
            timeLimit: r.timeLimit,
            scoreLimit: r.scoreLimit
          };
        });
      }
    };

    client.on('room_list', onRoomList);
    client.on('ROOM_LIST', onRoomList);

    if (!client.isConnected) {
      client.ensureConnected().catch(() => {
        // Fallback silently if offline
      });
    }
  }

  public updateRoomHoverPing(roomId: string, ping: number): void {
    const cleanPing = Math.max(1, Math.round(ping));
    const idx = this.rooms.findIndex((r) => r.id === roomId);
    if (idx !== -1) {
      this.rooms[idx] = { ...this.rooms[idx]!, ping: cleanPing };
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

  public extractRoomIdFromLocation(loc: { search?: string; hash?: string } | null = typeof window !== 'undefined' ? window.location : null): string | null {
    if (loc) {
      const hash = String(loc.hash || '');
      if (hash && !hash.includes('access_token=')) {
        const hashRoomParam = hash.match(/(?:^#|&)room=([A-Za-z0-9_-]{3,64})(?:&|$)/i);
        if (hashRoomParam?.[1]) {
          return hashRoomParam[1].trim();
        }
        const hashPathMatch = hash.match(/^#\/?room\/([A-Za-z0-9_-]{3,64})(?:[/?#]|$)/i);
        if (hashPathMatch?.[1]) {
          return hashPathMatch[1].trim();
        }
      }
      const search = String(loc.search || '');
      if (search && typeof URLSearchParams !== 'undefined') {
        const qRoom = new URLSearchParams(search).get('room')?.trim();
        if (qRoom && /^[A-Za-z0-9_-]{3,64}$/.test(qRoom)) {
          return qRoom;
        }
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)?.trim();
        if (stored && /^[A-Za-z0-9_-]{3,64}$/.test(stored)) {
          return stored;
        }
      } catch {
        // Ignore restricted sessionStorage
      }
    }
    return null;
  }

  public persistPendingInviteRoomId(roomId: string | null = this.pendingInviteRoomId): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      if (roomId && /^[A-Za-z0-9_-]{3,64}$/.test(roomId.trim())) {
        sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, roomId.trim());
      } else {
        sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
      }
    } catch {
      // Ignore restricted sessionStorage
    }
  }

  public clearRoomInviteUrl(): void {
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
      } catch {
        // Ignore restricted sessionStorage
      }
    }
    if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) return;
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has('room')) {
        url.searchParams.delete('room');
        changed = true;
      }
      if (
        url.hash &&
        !url.hash.includes('access_token=') &&
        (/^#room=/i.test(url.hash) || /^#\/?room\//i.test(url.hash) || /(?:^#|&)room=/i.test(url.hash))
      ) {
        url.hash = '';
        changed = true;
      }
      if (changed) {
        const nextUrl = `${url.pathname}${url.search}${url.hash}` || '/';
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    } catch {
      // Ignore invalid URL environments
    }
  }

  public loadPersistedState(): void {
    const inviteRoom = this.extractRoomIdFromLocation();
    if (inviteRoom) {
      this.pendingInviteRoomId = inviteRoom;
    }
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
    } catch {
      // Ignore corrupt profile localStorage
    }

    try {
      const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsedRaw: unknown = JSON.parse(rawSettings);
        if (isPlainObject(parsedRaw)) {
          const parsed = parsedRaw as Partial<SettingsConfig>;
          const parsedLocalKit = isPlainObject(parsed.localKit) ? parsed.localKit : {};
          const localKit = { ...DEFAULT_SETTINGS.localKit, ...parsedLocalKit };
          if (localKit.name === 'Local FC') localKit.name = 'RED';
          if (localKit.tag === 'LOC') localKit.tag = 'RED';

          const parsedVisitorKit = isPlainObject(parsed.visitorKit) ? parsed.visitorKit : {};
          const visitorKit = { ...DEFAULT_SETTINGS.visitorKit, ...parsedVisitorKit };
          if (visitorKit.name === 'Visitante CF') visitorKit.name = 'BLUE';
          if (visitorKit.tag === 'VIS') visitorKit.tag = 'BLUE';
          if (visitorKit.primaryColor === '#3498db') visitorKit.primaryColor = '#00e5ff';

          const rawZoom = typeof parsed.cameraZoom === 'number' ? parsed.cameraZoom : DEFAULT_SETTINGS.cameraZoom;
          const clampedZoom = Math.max(0.40, Math.min(2.50, rawZoom));
          const rawChatOpacity = typeof parsed.chatOpacity === 'number' && Number.isFinite(parsed.chatOpacity)
            ? parsed.chatOpacity
            : DEFAULT_SETTINGS.chatOpacity;
          const normalizedChatOpacityPct =
            rawChatOpacity > 0 && rawChatOpacity <= 1
              ? Math.round(rawChatOpacity * 100)
              : Math.max(10, Math.min(100, Math.round(rawChatOpacity)));
          const normalizedBall = normalizeBallSettings(parsed);
          const normalizedMobile = normalizeMobileSettings(parsed);
          const legacySolidSkin =
            String(parsed.ballSkin || '') === 'solid' ||
            localStorage.getItem('haxball_ball_skin') === 'solid';

          const scoreboardDesign: ScoreboardDesignType = (
            VALID_SCOREBOARD_DESIGNS as readonly string[]
          ).includes(String(parsed.scoreboardDesign || ''))
            ? (parsed.scoreboardDesign as ScoreboardDesignType)
            : DEFAULT_SETTINGS.scoreboardDesign;

          const parsedGamepad: Record<string, unknown> = isPlainObject(parsed.gamepadBinds)
            ? (parsed.gamepadBinds as Record<string, unknown>)
            : {};
          const gamepadBinds: GamepadBindConfig = {
            kick: Array.isArray(parsedGamepad.kick) && parsedGamepad.kick.length > 0 ? [...parsedGamepad.kick] : [...DEFAULT_GAMEPAD_BINDS.kick],
            dash: Array.isArray(parsedGamepad.dash) && parsedGamepad.dash.length > 0 ? [...parsedGamepad.dash] : [...DEFAULT_GAMEPAD_BINDS.dash],
            turbo: Array.isArray(parsedGamepad.turbo) && parsedGamepad.turbo.length > 0 ? [...parsedGamepad.turbo] : [...DEFAULT_GAMEPAD_BINDS.turbo],
            curveLeft: Array.isArray(parsedGamepad.curveLeft) && parsedGamepad.curveLeft.length > 0 ? [...parsedGamepad.curveLeft] : [...DEFAULT_GAMEPAD_BINDS.curveLeft],
            curveRight: Array.isArray(parsedGamepad.curveRight) && parsedGamepad.curveRight.length > 0 ? [...parsedGamepad.curveRight] : [...DEFAULT_GAMEPAD_BINDS.curveRight],
            focusBall: Array.isArray(parsedGamepad.focusBall) && parsedGamepad.focusBall.length > 0 ? [...parsedGamepad.focusBall] : [...DEFAULT_GAMEPAD_BINDS.focusBall],
            pause: Array.isArray(parsedGamepad.pause) && parsedGamepad.pause.length > 0 ? [...parsedGamepad.pause] : [...DEFAULT_GAMEPAD_BINDS.pause],
            menu: Array.isArray(parsedGamepad.menu) && parsedGamepad.menu.length > 0 ? [...parsedGamepad.menu] : [...DEFAULT_GAMEPAD_BINDS.menu]
          };
          const gamepadDeadzone =
            typeof parsed.gamepadDeadzone === 'number' && Number.isFinite(parsed.gamepadDeadzone)
              ? Math.max(0.05, Math.min(0.45, parsed.gamepadDeadzone))
              : DEFAULT_SETTINGS.gamepadDeadzone;

          this.settings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            gamepadDeadzone,
            gamepadBinds,
            showPositionTags:
              typeof parsed.showPositionTags === 'boolean'
                ? parsed.showPositionTags
                : DEFAULT_SETTINGS.showPositionTags,
            showPlayerNicknames:
              typeof parsed.showPlayerNicknames === 'boolean'
                ? parsed.showPlayerNicknames
                : DEFAULT_SETTINGS.showPlayerNicknames,
            showTelemetryCard:
              typeof parsed.showTelemetryCard === 'boolean'
                ? parsed.showTelemetryCard
                : DEFAULT_SETTINGS.showTelemetryCard,
            musicVolume:
              typeof parsed.musicVolume === 'number' && Number.isFinite(parsed.musicVolume)
                ? Math.max(0, Math.min(1, parsed.musicVolume))
                : DEFAULT_SETTINGS.musicVolume,
            musicEnabled:
              typeof parsed.musicEnabled === 'boolean'
                ? parsed.musicEnabled
                : DEFAULT_SETTINGS.musicEnabled,
            musicInMatch:
              typeof parsed.musicInMatch === 'boolean'
                ? parsed.musicInMatch
                : DEFAULT_SETTINGS.musicInMatch,
            ballMode: normalizedBall.ballMode,
            ballSkin: normalizedBall.ballSkin,
            ballCustomColor: normalizedBall.ballCustomColor,
            scoreboardDesign,
            fpsCap:
              typeof parsed.fpsCap === 'number' && Number.isFinite(parsed.fpsCap) && parsed.fpsCap >= 0
                ? parsed.fpsCap
                : DEFAULT_SETTINGS.fpsCap,
            showTypingIndicator:
              typeof parsed.showTypingIndicator === 'boolean'
                ? parsed.showTypingIndicator
                : DEFAULT_SETTINGS.showTypingIndicator,
            showPlayerAvatars:
              typeof parsed.showPlayerAvatars === 'boolean'
                ? parsed.showPlayerAvatars
                : DEFAULT_SETTINGS.showPlayerAvatars,
            autoExtrapolation:
              typeof parsed.autoExtrapolation === 'boolean'
                ? parsed.autoExtrapolation
                : DEFAULT_SETTINGS.autoExtrapolation,
            netMode: parsed.netMode === 'predicted' ? 'predicted' : 'classic',
            cameraZoom: clampedZoom,
            chatOpacity: normalizedChatOpacityPct,
            localKit,
            visitorKit,
            emoteTriggers: Array.isArray(parsed.emoteTriggers) && parsed.emoteTriggers.length > 0
              ? parsed.emoteTriggers
              : [...DEFAULT_SETTINGS.emoteTriggers],
            mobileControlsEnabled: normalizedMobile.mobileControlsEnabled,
            mobileJoystickMode: normalizedMobile.mobileJoystickMode,
            mobileJoystickAnchor: normalizedMobile.mobileJoystickAnchor,
            mobileTurboMode: normalizedMobile.mobileTurboMode,
            mobileHudScale: normalizedMobile.mobileHudScale,
            mobileHudOpacity: normalizedMobile.mobileHudOpacity,
            mobileHapticsEnabled: normalizedMobile.mobileHapticsEnabled,
            mobileCustomLayout: normalizedMobile.mobileCustomLayout
          };
          if (legacySolidSkin) {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
            localStorage.setItem('haxball_ball_skin', this.settings.ballSkin);
          }
          this.isAudioMuted = this.settings.isMuted;
          this.masterVolume = this.settings.masterVolume;

          soundFX.setMuted(this.settings.isMuted);
          soundFX.setMasterVolume(this.settings.masterVolume);
          soundFX.setChatVolume(this.settings.chatVolume);
          soundFX.setSfxVolume(this.settings.sfxVolume);
          soundFX.setEnvVolume(this.settings.envVolume);
        }
      } else if (localStorage.getItem('haxball_ball_skin') === 'solid') {
        this.settings.ballMode = 'color';
        this.settings.ballSkin = 'classic';
        localStorage.setItem('haxball_ball_skin', 'classic');
      }
    } catch {
      // Ignore corrupt settings localStorage
    }

    try {
      const savedExtrap =
        localStorage.getItem(LEGACYX_EXTRAPOLATION_KEY) ??
        localStorage.getItem('haxball_extrapolation_ms');
      if (savedExtrap !== null && savedExtrap !== '') {
        const parsedExtrap = Number(savedExtrap);
        const clampedExtrap = Number.isFinite(parsedExtrap)
          ? Math.max(0, Math.min(250, Math.round(parsedExtrap)))
          : 0;
        this.extrapolationMs = clampedExtrap;
        this.settings.extrapolationMs = clampedExtrap;
      } else {
        const clampedExtrap = Math.max(0, Math.min(250, Math.round(this.settings.extrapolationMs || 0)));
        this.extrapolationMs = clampedExtrap;
        this.settings.extrapolationMs = clampedExtrap;
      }
    } catch {
      // Ignore corrupt extrapolation localStorage
    }

    try {
      const savedNetMode = localStorage.getItem(LEGACYX_NET_MODE_KEY);
      if (savedNetMode === 'predicted' || savedNetMode === 'classic') {
        this.settings.netMode = savedNetMode;
      } else {
        this.settings.netMode = this.settings.netMode === 'predicted' ? 'predicted' : 'classic';
      }
    } catch {
      // Ignore corrupt netmode localStorage
    }

    try {
      if (!localStorage.getItem('lxg_audio_max_default_v1')) {
        this.settings = {
          ...this.settings,
          masterVolume: 1.0,
          chatVolume: 1.0,
          sfxVolume: 1.0,
          envVolume: 1.0,
          crowdVolume: 1.0
        };
        localStorage.setItem('lxg_audio_max_default_v1', '1');
        this.saveSettings();
      }
    } catch {
      // Ignore corrupt audio migration localStorage
    }

    const hostEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (hostEntry) {
      hostEntry.avatarType = this.avatarMode;
      hostEntry.kit = { ...this.effectiveLocalKit };
      hostEntry.localKit = { ...this.effectiveLocalKit };
      hostEntry.visitorKit = { ...this.effectiveVisitorKit };
    }

    try {
      const currentVersion = Number(localStorage.getItem(SETTINGS_VERSION_KEY) || 0);
      const rawKeybinds = localStorage.getItem(KEYBINDS_STORAGE_KEY);
      if (currentVersion < SETTINGS_VERSION || !rawKeybinds) {
        this.resetKeybinds();
        localStorage.setItem(SETTINGS_VERSION_KEY, String(SETTINGS_VERSION));
      } else {
        const parsedKeysRaw: unknown = JSON.parse(rawKeybinds);
        if (isPlainObject(parsedKeysRaw)) {
          const parsedKeys = parsedKeysRaw as Partial<KeybindConfig>;
          this.keybinds = {
            ...DEFAULT_KEYBINDS,
            ...parsedKeys,
            focusBall:
              Array.isArray(parsedKeys.focusBall) && parsedKeys.focusBall.length > 0
                ? parsedKeys.focusBall
                : [...DEFAULT_KEYBINDS.focusBall]
          };
        }
      }
    } catch {
      // Ignore corrupt keybinds localStorage
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
    const normalizedBall = normalizeBallSettings(this.settings);
    this.settings.ballMode = normalizedBall.ballMode;
    this.settings.ballSkin = normalizedBall.ballSkin;
    this.settings.ballCustomColor = normalizedBall.ballCustomColor;
    const normalizedMobile = normalizeMobileSettings(this.settings);
    this.settings.mobileControlsEnabled = normalizedMobile.mobileControlsEnabled;
    this.settings.mobileJoystickMode = normalizedMobile.mobileJoystickMode;
    this.settings.mobileJoystickAnchor = normalizedMobile.mobileJoystickAnchor;
    this.settings.mobileTurboMode = normalizedMobile.mobileTurboMode;
    this.settings.mobileHudScale = normalizedMobile.mobileHudScale;
    this.settings.mobileHudOpacity = normalizedMobile.mobileHudOpacity;
    this.settings.mobileHapticsEnabled = normalizedMobile.mobileHapticsEnabled;
    this.settings.mobileCustomLayout = normalizedMobile.mobileCustomLayout;
    this.extrapolationMs = Math.max(0, Math.min(250, Math.round(Number(this.settings.extrapolationMs) || 0)));
    this.settings.extrapolationMs = this.extrapolationMs;
    this.settings.netMode = this.settings.netMode === 'predicted' ? 'predicted' : 'classic';
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

    // Sincronizar kits efectivos con redKit y blueKit para compatibilidad
    const activeLocalKit = this.effectiveLocalKit;
    const activeVisitorKit = this.effectiveVisitorKit;
    if (activeLocalKit) {
      this.redKit.primaryColor = activeLocalKit.primaryColor;
      this.redKit.secondaryColor = activeLocalKit.secondaryColor;
      this.redKit.tertiaryColor = activeLocalKit.tertiaryColor || '#ffffff';
      this.redKit.outlineColor = activeLocalKit.outlineColor || '#000000';
      this.redKit.pattern = activeLocalKit.pattern;
    }
    if (activeVisitorKit) {
      this.blueKit.primaryColor = activeVisitorKit.primaryColor;
      this.blueKit.secondaryColor = activeVisitorKit.secondaryColor;
      this.blueKit.tertiaryColor = activeVisitorKit.tertiaryColor || '#ffffff';
      this.blueKit.outlineColor = activeVisitorKit.outlineColor || '#000000';
      this.blueKit.pattern = activeVisitorKit.pattern;
    }

    const localEntry = this.rosterPlayers.find((p) => p.id === this.localPlayerId);
    if (localEntry) {
      localEntry.kit = { ...activeLocalKit };
      localEntry.localKit = { ...activeLocalKit };
      localEntry.visitorKit = { ...activeVisitorKit };
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
        localStorage.setItem('haxball_ball_skin', this.settings.ballSkin);
        localStorage.setItem(LEGACYX_EXTRAPOLATION_KEY, String(this.extrapolationMs));
        localStorage.setItem('haxball_extrapolation_ms', String(this.extrapolationMs));
        localStorage.setItem(LEGACYX_NET_MODE_KEY, this.settings.netMode);
      } catch {
        // Ignore storage error
      }
    }
    this.onSettingsChanged?.(this.settings);
    this.onProfileUpdated?.();
    this.emitHudStateChange('kits_updated', {
      redKitVariant: this.redKitVariant,
      blueKitVariant: this.blueKitVariant,
      localKit: activeLocalKit,
      visitorKit: activeVisitorKit
    });
  }

  public resetGraphicsSettings(): void {
    this.settings.cameraZoom = DEFAULT_SETTINGS.cameraZoom;
    this.settings.chatOpacity = DEFAULT_SETTINGS.chatOpacity;
    this.settings.minimapOpacity = DEFAULT_SETTINGS.minimapOpacity;
    this.settings.magnusTrailEnabled = DEFAULT_SETTINGS.magnusTrailEnabled;
    this.settings.ballTrailEnabled = DEFAULT_SETTINGS.ballTrailEnabled;
    this.settings.fireShotEnabled = DEFAULT_SETTINGS.fireShotEnabled;
    this.settings.floatingPointsEnabled = DEFAULT_SETTINGS.floatingPointsEnabled;
    this.settings.floatingGoals = DEFAULT_SETTINGS.floatingGoals;
    this.settings.floatingAssists = DEFAULT_SETTINGS.floatingAssists;
    this.settings.floatingSaves = DEFAULT_SETTINGS.floatingSaves;
    this.settings.floatingShots = DEFAULT_SETTINGS.floatingShots;
    this.settings.floatingPasses = DEFAULT_SETTINGS.floatingPasses;
    this.settings.floatingHattricks = DEFAULT_SETTINGS.floatingHattricks;
    this.settings.floatingOwnGoals = DEFAULT_SETTINGS.floatingOwnGoals;
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
    this.settings.scoreboardDesign = DEFAULT_SETTINGS.scoreboardDesign;
    this.settings.fpsCap = DEFAULT_SETTINGS.fpsCap;
    this.settings.showTypingIndicator = DEFAULT_SETTINGS.showTypingIndicator;
    this.settings.showPlayerAvatars = DEFAULT_SETTINGS.showPlayerAvatars;
    this.settings.showPositionTags = DEFAULT_SETTINGS.showPositionTags;
    this.settings.showPlayerNicknames = DEFAULT_SETTINGS.showPlayerNicknames;
    this.settings.showTelemetryCard = DEFAULT_SETTINGS.showTelemetryCard;
    this.settings.extrapolationMs = DEFAULT_SETTINGS.extrapolationMs;
    this.settings.autoExtrapolation = DEFAULT_SETTINGS.autoExtrapolation;
    this.settings.netMode = DEFAULT_SETTINGS.netMode;
    this.extrapolationMs = DEFAULT_SETTINGS.extrapolationMs;
    this.saveSettings();
  }

  public remapKey(action: keyof KeybindConfig, code: string): keyof KeybindConfig | null {
    const { keybinds: nextKeybinds, swappedAction } = assignUniqueKeybind(this.keybinds, action, code);
    this.keybinds = nextKeybinds;
    if (swappedAction) {
      this.lastKeybindSwapNotice = `${formatKeybindCode(code)} estaba en otra acción y se intercambió automáticamente.`;
    } else {
      this.lastKeybindSwapNotice = null;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(this.keybinds));
      } catch {
        // Ignore storage error
      }
    }
    return swappedAction;
  }

  public resetKeybinds(): void {
    this.lastKeybindSwapNotice = null;
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
      focusBall: [...DEFAULT_KEYBINDS.focusBall],
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

  public remapGamepadButton(action: keyof GamepadBindConfig, code: string): void {
    const nextBinds: GamepadBindConfig = {
      kick: [...this.settings.gamepadBinds.kick],
      dash: [...this.settings.gamepadBinds.dash],
      turbo: [...this.settings.gamepadBinds.turbo],
      curveLeft: [...this.settings.gamepadBinds.curveLeft],
      curveRight: [...this.settings.gamepadBinds.curveRight],
      focusBall: [...this.settings.gamepadBinds.focusBall],
      pause: [...this.settings.gamepadBinds.pause],
      menu: [...this.settings.gamepadBinds.menu]
    };
    for (const key of Object.keys(nextBinds) as Array<keyof GamepadBindConfig>) {
      if (key !== action && nextBinds[key].includes(code)) {
        nextBinds[key] = nextBinds[key].filter((c) => c !== code);
      }
    }
    nextBinds[action] = [code];
    this.saveSettings({ gamepadBinds: nextBinds });
  }

  public resetGamepadBinds(): void {
    this.saveSettings({
      gamepadDeadzone: DEFAULT_SETTINGS.gamepadDeadzone,
      gamepadBinds: {
        kick: [...DEFAULT_GAMEPAD_BINDS.kick],
        dash: [...DEFAULT_GAMEPAD_BINDS.dash],
        turbo: [...DEFAULT_GAMEPAD_BINDS.turbo],
        curveLeft: [...DEFAULT_GAMEPAD_BINDS.curveLeft],
        curveRight: [...DEFAULT_GAMEPAD_BINDS.curveRight],
        focusBall: [...DEFAULT_GAMEPAD_BINDS.focusBall],
        pause: [...DEFAULT_GAMEPAD_BINDS.pause],
        menu: [...DEFAULT_GAMEPAD_BINDS.menu]
      }
    });
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
    const clean = Math.max(0, Math.min(15, Number.isFinite(val) ? val : 0));
    this.modifiers.timeLimit = clean;
    this.updateModifier('matchTimeMinutes', clean);
  }

  public get timeLimit(): number {
    return this.modifiers.matchTimeMinutes;
  }

  public set timeLimit(val: number) {
    this.timeLimitMinutes = val;
  }

  public get scoreLimitGoals(): number {
    return this.modifiers.goalLimit;
  }

  public set scoreLimitGoals(val: number) {
    const clean = Math.max(0, Math.min(15, Number.isFinite(val) ? Math.round(val) : 0));
    this.modifiers.scoreLimit = clean;
    this.updateModifier('goalLimit', clean);
  }

  public get scoreLimit(): number {
    return this.modifiers.goalLimit;
  }

  public set scoreLimit(val: number) {
    this.scoreLimitGoals = val;
  }

  public get physicsModifiers(): PhysicsModifiers {
    return this.modifiers;
  }

  public get activeRoomName(): string {
    return this.activeRoom?.name ?? 'LegacyX-GO Arena';
  }

  public get roomCapacity(): number {
    return Math.max(2, Math.min(30, this.activeRoom?.maxPlayers || 12));
  }

  private nextTeamOrderSeq: number = 1;

  public assignDefaultPositionForTeam(
    team: 'red' | 'blue',
    excludePlayerId?: number
  ): PlayerPosition {
    const teammates = this.rosterPlayers.filter(
      (p) => p.team === team && p.id !== excludePlayerId
    );
    const occupied = new Set(teammates.map((p) => p.position).filter(Boolean));
    for (const pos of PLAYER_POSITIONS) {
      if (!occupied.has(pos)) return pos;
    }
    const counts: Record<PlayerPosition, number> = { GK: 0, DFC: 0, MC: 0, ST: 0 };
    for (const tm of teammates) {
      if (tm.position && counts[tm.position] !== undefined) {
        counts[tm.position]++;
      }
    }
    const outfield: PlayerPosition[] = ['DFC', 'MC', 'ST'];
    outfield.sort((a, b) => counts[a] - counts[b]);
    return outfield[0] ?? 'MC';
  }

  public getTeamPlayers(team: 'red' | 'blue' | 'spectator'): RosterPlayer[] {
    const filtered = this.rosterPlayers
      .map((p, idx) => ({ p, idx }))
      .filter((item) => item.p.team === team);
    if (team === 'red' || team === 'blue') {
      filtered.sort((a, b) => {
        const oa = a.p.teamOrder && a.p.teamOrder > 0 ? a.p.teamOrder : Number.MAX_SAFE_INTEGER;
        const ob = b.p.teamOrder && b.p.teamOrder > 0 ? b.p.teamOrder : Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return a.idx - b.idx;
      });
    }
    return filtered.map((item) => item.p);
  }

  public getTeamCaptain(team: 'red' | 'blue'): RosterPlayer | null {
    const teamPlayers = this.getTeamPlayers(team);
    return teamPlayers[0] ?? null;
  }

  public canManageTeamPositions(team: 'red' | 'blue'): boolean {
    if (this.isHost || this.isAdmin) return true;
    const cap = this.getTeamCaptain(team);
    return Boolean(cap && cap.id === this.localPlayerId);
  }

  public changePlayerPosition(targetPlayerId: number, position: PlayerPosition): boolean {
    const target = this.rosterPlayers.find((p) => p.id === targetPlayerId);
    if (!target || (target.team !== 'red' && target.team !== 'blue')) return false;
    if (!this.canManageTeamPositions(target.team)) return false;
    if (!PLAYER_POSITIONS.includes(position)) return false;

    const prevPos: PlayerPosition = target.position || 'DFC';
    if (prevPos === position) return true;

    if (position === 'GK') {
      const existingGk = this.rosterPlayers.find(
        (p) => p.id !== targetPlayerId && p.team === target.team && p.position === 'GK'
      );
      if (existingGk) {
        existingGk.position = prevPos === 'GK' ? 'DFC' : prevPos;
      }
    }
    target.position = position;
    soundFX.playUIClick();
    this.onPositionChange?.(targetPlayerId, position);
    return true;
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
    return this.effectiveLocalKit;
  }

  public get blueTeamKit(): TeamKitConfig {
    return this.effectiveVisitorKit;
  }

  private isGuestPlayer(player: RosterPlayer): boolean {
    const nick = (player.nickname || player.name || '').trim();
    if (/^inv_/i.test(nick)) return true;
    if (player.id === this.localPlayerId && !this.isAuthenticatedUser) {
      return !nick || /^inv_/i.test(nick) || nick === 'Jugador';
    }
    return false;
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
    this.emitHudStateChange('kits_updated', { redKitVariant: variant, blueKitVariant: this.blueKitVariant });
  }

  public setBlueKitVariant(variant: 'home' | 'away'): void {
    this.blueKitVariant = variant;
    this.onRoomConfigChanged?.({ blueKitVariant: variant });
    this.emitHudStateChange('kits_updated', { redKitVariant: this.redKitVariant, blueKitVariant: variant });
  }

  /** Equipación activa del capitán RED (primer jugador unido al equipo): su kit Local por defecto, o Visitante si se conmuta. */
  public get redCaptainKit(): TeamKitConfig {
    const cap = this.getTeamCaptain('red');
    if (!cap) {
      return GameUIStore.DEFAULT_RED_KIT;
    }
    if (this.isGuestPlayer(cap)) {
      return GameUIStore.DEFAULT_RED_KIT;
    }
    const kit = this.redKitVariant === 'home'
      ? (cap.localKit || cap.kit || this.effectiveLocalKit || GameUIStore.DEFAULT_RED_KIT)
      : (cap.visitorKit || cap.kit || this.effectiveVisitorKit || GameUIStore.DEFAULT_RED_KIT);
    return kit;
  }

  /** Equipación activa del capitán BLUE (primer jugador unido al equipo): su kit Visitante por defecto, o Local si se conmuta. */
  public get blueCaptainKit(): TeamKitConfig {
    const cap = this.getTeamCaptain('blue');
    if (!cap) {
      return GameUIStore.DEFAULT_BLUE_KIT;
    }
    if (this.isGuestPlayer(cap)) {
      return GameUIStore.DEFAULT_BLUE_KIT;
    }
    const kit = this.blueKitVariant === 'away'
      ? (cap.visitorKit || cap.kit || this.effectiveVisitorKit || GameUIStore.DEFAULT_BLUE_KIT)
      : (cap.localKit || cap.kit || this.effectiveLocalKit || GameUIStore.DEFAULT_BLUE_KIT);
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
    if (!this.isHost && !this.isAdmin) return;
    soundFX.playUIClick();
    this.hasCompletedMatch = false;
    this.lastMatchStats = null;
    this.activeSlide = 'MENU';
    this.hasJoinedInitialSync = true;
    this.activeModal = 'NONE';
    this.clearModalStack();
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur();
    }
    if (!this.isHost && this.isAdmin) {
      this.onAdminAction?.('START_MATCH');
      return;
    }
    this.fsmPhase = 'PLAYING';
    this.previousMatchPhase = 2;
    this.onStartMatch?.();
  }

  public stopMatch(): void {
    if (!this.isHost && !this.isAdmin) return;
    soundFX.playUIClick();
    if (!this.isHost && this.isAdmin) {
      this.onAdminAction?.('STOP_MATCH');
      return;
    }
    this.activeBanner = { kind: 'NONE' };
    this.activeGoalScorerId = null;
    this.fsmPhase = 'STOPPED';
    this.previousMatchPhase = 0;
    this.onStopMatch?.();
  }

  public togglePause(): void {
    if (!this.isHost && !this.isAdmin) return;
    if (
      this.fsmPhase === 'RESUME_COUNTDOWN' ||
      this.fsmPhase === 'PRE_MATCH_VS' ||
      this.fsmPhase === 'START_COUNTDOWN' ||
      this.fsmPhase === 'STOPPED' ||
      this.fsmPhase === 'CELEBRATION' ||
      this.fsmPhase === 'STATS'
    ) {
      if (!this.onTogglePause && this.fsmPhase === 'STOPPED') {
        // Standalone unit test compatibility when no engine callback is attached
        soundFX.playUIClick();
        this.fsmPhase = 'PAUSED';
        return;
      }
      return;
    }
    soundFX.playUIClick();
    if (!this.isHost && this.isAdmin) {
      this.onAdminAction?.('TOGGLE_PAUSE');
      return;
    }
    if (this.onTogglePause) {
      this.onTogglePause();
    } else {
      this.fsmPhase = this.fsmPhase === 'PAUSED' ? 'PLAYING' : 'PAUSED';
    }
  }

  public leaveRoom(): void {
    soundFX.playUIClick();
    this.isPracticeMode = false;
    this.roomType = 'casual';
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
    if (
      !this.isHost &&
      !this.isPracticeMode &&
      this.settings.netMode === 'predicted' &&
      this.pingMs > 120 &&
      !this.hasShownHighPingNetModeHint
    ) {
      this.hasShownHighPingNetModeHint = true;
      this.pushLocalSystemNotice(
        `Ping alto (${this.pingMs} ms). Consejo: usa /netmode classic para cero tirones en redes móviles.`
      );
    }
    this.emitHudStateChange('telemetry', {
      pingMs: this.pingMs,
      avgPingMs: this.avgPingMs,
      fps: this.fps
    });
  }

  public updateNetworkDiagnostics(opts: {
    jitterMs?: number;
    packetLossPct?: number;
    iceRoute?: string;
    reconciliationsPerSec?: number;
  }): void {
    if (typeof opts.jitterMs === 'number' && Number.isFinite(opts.jitterMs)) {
      this.jitterMs = Math.max(0, Math.round(opts.jitterMs));
    }
    if (typeof opts.packetLossPct === 'number' && Number.isFinite(opts.packetLossPct)) {
      this.packetLossPct = Math.max(0, Math.min(100, Math.round(opts.packetLossPct * 10) / 10));
    }
    if (typeof opts.iceRoute === 'string' && opts.iceRoute) {
      this.iceRoute = opts.iceRoute;
    }
    if (typeof opts.reconciliationsPerSec === 'number' && Number.isFinite(opts.reconciliationsPerSec)) {
      this.reconciliationsPerSec = Math.max(0, Math.round(opts.reconciliationsPerSec));
    }
  }

  public resetTelemetry(): void {
    this.pingMs = 0;
    this.jitterMs = 0;
    this.packetLossPct = 0;
    this.iceRoute = 'Local';
    this.reconciliationsPerSec = 0;
    this.avgPingMs = 0;
    this.pingSampleHead = 0;
    this.pingSampleCount = 0;
    this.pingSamples.fill(0);
  }

  public get isMatchActive(): boolean {
    return (
      this.fsmPhase === 'PRE_MATCH_VS' ||
      this.fsmPhase === 'START_COUNTDOWN' ||
      this.fsmPhase === 'PLAYING' ||
      this.fsmPhase === 'KICKOFF' ||
      this.fsmPhase === 'PAUSED' ||
      this.fsmPhase === 'RESUME_COUNTDOWN' ||
      this.fsmPhase === 'GOAL' ||
      this.fsmPhase === 'GOAL_REPLAY' ||
      this.fsmPhase === 'OVERTIME' ||
      this.fsmPhase === 'CELEBRATION'
    );
  }

  public get matchPhase(): number {
    switch (this.fsmPhase) {
      case 'STOPPED': return 0;
      case 'PRE_MATCH_VS': return 0.5;
      case 'START_COUNTDOWN': return 0.6;
      case 'KICKOFF': return 1;
      case 'PLAYING': return 2;
      case 'PAUSED': return 2.1;
      case 'RESUME_COUNTDOWN': return 2.2;
      case 'GOAL': return 3;
      case 'GOAL_REPLAY': return 3.5;
      case 'CELEBRATION': return 4;
      case 'OVERTIME': return 2;
      case 'WARMUP': return 1;
      case 'STATS': return 5;
      default: return 0;
    }
  }

  public set matchPhase(phase: number) {
    if (phase !== 0 && phase !== 4 && phase !== 5) {
      this.hasCompletedMatch = false;
      this.lastMatchStats = null;
      this.activeSlide = 'MENU';
    }
    if (phase === 0) {
      this.fsmPhase = 'STOPPED';
      this.activeGoalScorerId = null;
    } else if (phase === 0.5) {
      this.fsmPhase = 'PRE_MATCH_VS';
    } else if (phase === 0.6) {
      this.fsmPhase = 'START_COUNTDOWN';
    } else if (phase === 1) {
      this.fsmPhase = 'KICKOFF';
      this.activeGoalScorerId = null;
    } else if (phase === 2) {
      this.fsmPhase = 'PLAYING';
      this.activeGoalScorerId = null;
    } else if (phase === 2.1) {
      this.fsmPhase = 'PAUSED';
    } else if (phase === 2.2) {
      this.fsmPhase = 'RESUME_COUNTDOWN';
    } else if (phase === 3) {
      this.fsmPhase = 'GOAL';
    } else if (phase === 3.5) {
      this.fsmPhase = 'GOAL_REPLAY';
    } else if (phase === 4) {
      this.fsmPhase = 'CELEBRATION';
    } else if (phase === 5) {
      this.fsmPhase = 'STATS';
      this.activeGoalScorerId = null;
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
      STATS: 'STATS',
      replayViewer: 'REPLAY_VIEWER',
      REPLAY_VIEWER: 'REPLAY_VIEWER'
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
    this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: this._activeSlide });
  }

  public openOverlay(modal: ModalType): void {
    this.openModal(modal);
  }

  /** Overlays `#` de mayor jerarquía que nunca deben ser pisados por la FSM. */
  public get isSecondaryOverlayOpen(): boolean {
    return ['SETTINGS', 'KEYBINDS', 'PHYSICS_MODIFIERS', 'STADIUM_SELECTOR', 'REPLAY_VIEWER'].includes(this.activeModal);
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
    const prevModal = this.activeModal;
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
      if (this.activeModal !== prevModal) {
        this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: this._activeSlide });
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
        if (!this.isSecondaryOverlayOpen && !this.isRoomPanelOpen) {
          this.modalStack = [];
          this.activeModal = 'TEAM_MANAGEMENT';
        }
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

    if (this.activeModal !== prevModal) {
      this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: this._activeSlide });
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

  public toggleEscapeMenu(): void {
    this.toggleRoomMenu();
  }

  /** Guardia `0: STOP`: fuerza el menú abierto sin pisar overlays `#` ni la vista de estadísticas. */
  public enforceStopMenu(): void {
    if (
      this.matchPhase === 0 &&
      this.currentScreen === 'IN_GAME' &&
      !this.isSecondaryOverlayOpen &&
      !this.isRoomPanelOpen
    ) {
      const prevModal = this.activeModal;
      this.modalStack = [];
      this.activeModal = 'TEAM_MANAGEMENT';
      if (this.activeModal !== prevModal) {
        this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: this._activeSlide });
      }
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
    this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: this._activeSlide });
  }

  public closeModal(): void {
    this.closeOverlay();
  }

  public clearModalStack(): void {
    this.modalStack = [];
    this.activeModal = 'NONE';
    this.pendingPasswordRoom = null;
    this.pendingPasswordInput = '';
    this.emitHudStateChange('ui_overlay', { activeModal: this.activeModal, activeSlide: this._activeSlide });
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
    this.modifiers.playerSpeed = cfg.playerSpeed ?? cfg.playerMaxSpeed / 2.8;
    this.modifiers.playerAcceleration = cfg.playerAcceleration;
    this.modifiers.kickingAcceleration = cfg.kickingAcceleration ?? cfg.playerAcceleration;
    this.modifiers.playerFriction = cfg.playerFriction ?? DEFAULT_GAMEPLAY_CONFIG.playerFriction;
    this.modifiers.playerRadius = cfg.playerRadius;
    this.modifiers.playerMass = cfg.playerMass ?? DEFAULT_GAMEPLAY_CONFIG.playerMass;
    this.modifiers.ballRadius = cfg.ballRadius;
    this.modifiers.ballMass = cfg.ballMass ?? DEFAULT_GAMEPLAY_CONFIG.ballMass;
    this.modifiers.ballFriction = cfg.ballFriction ?? DEFAULT_GAMEPLAY_CONFIG.ballFriction;
    this.modifiers.pitchFriction = cfg.ballFriction ?? DEFAULT_GAMEPLAY_CONFIG.ballFriction;
    this.modifiers.ballRestitution = cfg.ballRestitution;
    this.modifiers.wallBounciness = cfg.ballRestitution;
    this.modifiers.kickStrength = cfg.kickStrength;
    this.modifiers.baseKickStrength = (cfg.kickStrength / 4.545) * 450.0;
    this.modifiers.kickMargin = cfg.kickMargin ?? DEFAULT_GAMEPLAY_CONFIG.kickMargin;
    this.modifiers.boostMultiplier = cfg.boostMultiplier;
    this.modifiers.turboStaminaDrain =
      cfg.turboStaminaDrain ?? DEFAULT_GAMEPLAY_CONFIG.turboStaminaDrain;
    this.modifiers.dashDistance = cfg.dashDistance;
    this.modifiers.dashPower = (cfg.dashDistance / 7) * 60;
    this.modifiers.dashCooldown = cfg.dashCooldown ?? DEFAULT_GAMEPLAY_CONFIG.dashCooldown;
    this.modifiers.dashesPerFullBar = cfg.dashesPerFullBar ?? DEFAULT_GAMEPLAY_CONFIG.dashesPerFullBar;
    this.modifiers.dashStaminaCost =
      cfg.dashStaminaCost ?? DEFAULT_GAMEPLAY_CONFIG.dashStaminaCost;
    this.modifiers.staminaRechargeRate = cfg.staminaRechargeRate;
    this.modifiers.staminaRechargeDelay =
      cfg.staminaRechargeDelay ?? DEFAULT_GAMEPLAY_CONFIG.staminaRechargeDelay;
    this.modifiers.staminaRegenMoving = cfg.staminaRegenMoving === true;
    this.modifiers.staminaRegenMovingRate =
      cfg.staminaRegenMovingRate ?? DEFAULT_GAMEPLAY_CONFIG.staminaRegenMovingRate;
    this.modifiers.magnusCurveStrength = cfg.magnusCurveStrength;
    this.modifiers.magnusCoefficient = cfg.magnusCurveStrength;
    this.modifiers.turboEnabled = cfg.turboEnabled !== false;
    this.modifiers.dashEnabled = cfg.dashEnabled !== false;
    this.modifiers.magnusEnabled = cfg.magnusEnabled !== false;
  }

  public applyGameplayPreset(presetId: GameplayPresetId): void {
    const preset = GAMEPLAY_PRESETS[presetId];
    if (!preset) return;
    soundFX.playUIClick();
    this.gameplayConfig = { ...preset.config };
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
      mediano: 'medium',
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
      'AF 3v3': 'af_3v3',
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
    const prevTeam = p.team;
    p.team = team;
    if (prevTeam !== team) {
      if (team === 'spectator') {
        p.teamOrder = 0;
        p.position = undefined;
      } else {
        p.teamOrder = this.nextTeamOrderSeq++;
        p.position = this.assignDefaultPositionForTeam(team, p.id);
      }
    }
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
      const nextTeam = redCount <= blueCount ? 'red' : 'blue';
      s.team = nextTeam;
      s.teamOrder = this.nextTeamOrderSeq++;
      s.position = this.assignDefaultPositionForTeam(nextTeam, s.id);
      this.onTeamChanged?.(s.id, nextTeam);
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
      const nextTeam = idx % 2 === 0 ? 'red' : 'blue';
      p.team = nextTeam;
      p.teamOrder = this.nextTeamOrderSeq++;
      p.position = this.assignDefaultPositionForTeam(nextTeam, p.id);
      this.onTeamChanged?.(p.id, nextTeam);
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
    this.onChatAdded?.(entry);
    this.emitHudStateChange('chat', entry);
  }

  public resetRoomSession(): void {
    this.clearAllSlidingEventTimers();
    this.clearChatCooldownTimer();
    this.chatCooldownActive = false;
    this.lastChatSentAtMs = -CHAT_COOLDOWN_MS;
    this.showVarMonitor = false;
    this.varTelemetry = {
      ballSpeedPx: 0,
      ballSpeedKmh: 0,
      ballX: 0,
      ballY: 0,
      playerSpeedPx: 0,
      playerSpeedKmh: 0,
      playerX: 0,
      playerY: 0,
      tick: 0,
      ping: 0
    };
    this.resetTelemetry();
    this.hasShownHighPingNetModeHint = false;
    this.isHudEditorOpen = false;
    this.isFocusingBall = false;
    this.localStamina = 100;
    this.localDashCooldown = 0;
    this.localDashMaxCooldown = 1.0;
    this.localIsDashing = false;
    this.localIsTurbo = false;
    this.isPracticeMode = false;
    this.chatMessages = [];
    this.players = [];
    this.rosterPlayers = [];
    this.nextTeamOrderSeq = 1;
    this.lastMatchStats = null;
    this.redTeamStats = [];
    this.blueTeamStats = [];
    this.mvp = null;
    this.hasCompletedMatch = false;
    this.redScore = 0;
    this.blueScore = 0;
    this.matchTimeFormatted = '00:00';
    this.matchTimerSeconds = 0;
    this.activeBanner = { kind: 'NONE' };
    this.activeGoalScorerId = null;
    this.matchPhase = 0;
    this.previousMatchPhase = 0;
    this.hasJoinedInitialSync = false;
    this.fsmPhase = 'STOPPED';
    this.isGoldenGoal = false;
    this.slidingEventQueue = [];
    this.currentSlidingEvent = null;
    this.postMatchSlide = 1;
    this.clearModalStack();
    this.redKitVariant = 'home';
    this.blueKitVariant = 'away';
  }

  public sendChatMessage(rawText: string): void {
    const trimmed = rawText.trim().slice(0, 140);
    if (!trimmed) return;
    if (this.handleChatCommand(trimmed)) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.canSendChatNow(now)) {
      this.triggerChatCooldownNotice();
      return;
    }
    this.markChatSent(now);
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
    this.lobbyError = null;
    this.isPracticeMode = false;
    this.roomType = room.roomType === 'ranked' ? 'ranked' : 'casual';
    this.activeRoom = room;
    this.activeStadiumName = room.stadium;
    this.navigateTo('IN_GAME');
  }

  public enterPracticeMode(): void {
    soundFX.playUIClick();
    this.lobbyError = null;
    this.isPracticeMode = true;
    this.roomType = 'casual';
    this.teamsLocked = false;
    this.allowCaptainKitSwitch = false;
    this.modifiers.matchTimeMinutes = 0;
    this.modifiers.timeLimit = 0;
    this.modifiers.goalLimit = 0;
    this.modifiers.scoreLimit = 0;
    this.activeRoom = {
      id: 'LOCAL-PRACTICE',
      name: 'Entrenamiento Táctico',
      playersCount: 1,
      maxPlayers: 1,
      ping: 0,
      roomType: 'casual',
      isPrivate: false,
      stadium: 'Mediano',
      timeLimit: 0,
      scoreLimit: 0
    };
    this.activeStadiumName = 'Mediano';
    this.selectedStadiumId = 'mediano';
    this.resetTelemetry();
    this.fsmPhase = 'PLAYING';
    this.matchPhase = 2;
    this.previousMatchPhase = 2;
    this.hasJoinedInitialSync = true;
    this.isHost = true;
    this.isAdmin = true;
    this.localPlayerId = 1;

    this.activeGoalScorerId = null;
    const profile = {
      nickname: this.nickname || 'Jugador',
      avatar: this.avatarValue || '1',
      avatarType: this.avatarMode || 'letters',
      kit: { ...this.effectiveLocalKit },
      localKit: { ...this.effectiveLocalKit },
      visitorKit: { ...this.effectiveVisitorKit }
    };

    const localPlayer: RosterPlayer = {
      id: 1,
      peerId: 'local',
      nickname: profile.nickname,
      name: profile.nickname,
      team: 'red',
      position: 'MC',
      teamOrder: 1,
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
    this.clearModalStack();
    this.navigateTo('IN_GAME');
    this.closeOverlay();
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
    scoreLimit: number = 3,
    roomType: 'casual' | 'ranked' = 'casual'
  ): void {
    soundFX.playUIClick();
    this.lobbyError = null;
    this.isPracticeMode = false;
    this.roomType = roomType;
    this.teamsLocked = teamsLocked;
    const clampedMax = Math.max(2, Math.min(30, Math.round(maxPlayers || 12)));
    const cleanTime = Math.max(0, Math.min(15, Number.isFinite(timeLimit) ? timeLimit : 3));
    const cleanScore = Math.max(0, Math.min(15, Number.isFinite(scoreLimit) ? Math.round(scoreLimit) : 3));
    this.modifiers.matchTimeMinutes = cleanTime;
    this.modifiers.timeLimit = cleanTime;
    this.modifiers.goalLimit = cleanScore;
    this.modifiers.scoreLimit = cleanScore;

    const cleanRoomName = name.trim() || 'Nueva Sala';
    const newRoom: RoomInfo = {
      id: `R-${Date.now().toString().slice(-4)}`,
      name: cleanRoomName,
      playersCount: 1,
      maxPlayers: clampedMax,
      ping: this.realPing ?? 20,
      roomType,
      isPrivate: isPrivate,
      password: password,
      stadium: stadium,
      timeLimit: cleanTime,
      scoreLimit: cleanScore
    };

    if (this.signaling && this.signaling.isOpen()) {
      let tz = '';
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch {
        tz = '';
      }
      this.signaling.createRoom(cleanRoomName, {
        name: cleanRoomName,
        stadiumId: stadium,
        maxPlayers: clampedMax,
        isPrivate,
        password,
        teamsLocked,
        timeLimit: cleanTime,
        scoreLimit: cleanScore,
        roomType,
        timeZone: tz
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
