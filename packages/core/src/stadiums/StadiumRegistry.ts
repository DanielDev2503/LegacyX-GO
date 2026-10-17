import { Stadium, StadiumOptions, StadiumBallPhysics, StadiumPlayerPhysics } from './Stadium';
import { defaultStadium } from '../game/GameConfig';

export type StadiumId =
  | 'AF 3v3 Official'
  | 'af3v3'
  | 'small'
  | 'classic'
  | 'big'
  | 'AF 3v3'
  | 'Classic Stadium'
  | 'Big Stadium'
  | 'Small Arena';

export interface StadiumPreset {
  id: StadiumId;
  name: string;
  description: string;
  width: number;
  height: number;
  goalSize: number;
  goalWidth: number;
  goalDepth: number;
  runOff: number;
  spawnDistance?: number;
  kickOffRadius?: number;
  bgColor?: string;
  postRadius?: number;
  postColor?: string;
  ballPhysics?: StadiumBallPhysics;
  playerPhysics?: StadiumPlayerPhysics;
  leftGoalPos?: { p0: { x: number; y: number }; p1: { x: number; y: number } };
  rightGoalPos?: { p0: { x: number; y: number }; p1: { x: number; y: number } };
}

export const STADIUM_AF_3V3: StadiumPreset = {
  id: 'AF 3v3',
  name: 'AF 3v3 (Oficial)',
  description: '840x400 - Arcos 120 (Canónico GDD)',
  width: 840,
  height: 400,
  goalSize: 120,
  goalWidth: 120,
  goalDepth: 45,
  kickOffRadius: 70,
  runOff: 45,
  spawnDistance: 240,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff',
  ballPhysics: {
    radius: 10,
    bCoef: 0.80,
    invMass: 5.0,
    color: '#ffffff'
  },
  playerPhysics: {
    acceleration: 0.15,
    kickingAcceleration: 0.10,
    kickStrength: 450,
    bCoef: 0.5
  }
};

const AF_3V3_PRESET: StadiumPreset = {
  id: 'AF 3v3 Official',
  name: 'AF 3v3 Official by Vitão ®',
  description: '710x300 - Arcos 170 (Oficial Vitão)',
  width: 1200,
  height: 540,
  goalSize: 170,
  goalWidth: 170,
  goalDepth: 35,
  runOff: 110,
  spawnDistance: 366.5,
  kickOffRadius: 80,
  bgColor: '#1D2431',
  postRadius: 5.4,
  postColor: '#3B424F',
  ballPhysics: {
    radius: 5.8,
    bCoef: 0.412,
    invMass: 1.5,
    color: '#FFA500'
  },
  playerPhysics: {
    acceleration: 0.11,
    kickingAcceleration: 0.083,
    kickStrength: 4.545,
    bCoef: 0
  },
  leftGoalPos: {
    p0: { x: -608.3, y: -85 },
    p1: { x: -608.3, y: 85 }
  },
  rightGoalPos: {
    p0: { x: 608.3, y: 85 },
    p1: { x: 608.3, y: -85 }
  }
};

export const STADIUM_SMALL: StadiumPreset = {
  id: 'small',
  name: 'Pequeño (1v1 / 2v2)',
  description: '1000x460 - Arcos 140',
  width: 1000,
  height: 460,
  goalSize: 140,
  goalWidth: 140,
  goalDepth: 35,
  runOff: 45
};

export const STADIUM_CLASSIC: StadiumPreset = {
  id: 'classic',
  name: 'Mediano (3v3 Clásico)',
  description: '1200x540 - Arcos 170',
  width: 1200,
  height: 540,
  goalSize: 170,
  goalWidth: 170,
  goalDepth: 35,
  runOff: 45
};

export const STADIUM_BIG: StadiumPreset = {
  id: 'big',
  name: 'Grande (4v4 / Competitivo)',
  description: '1600x720 - Arcos 200',
  width: 1600,
  height: 720,
  goalSize: 200,
  goalWidth: 200,
  goalDepth: 35,
  runOff: 45
};

export const STADIUM_PRESETS: Record<string, StadiumPreset> = {
  'AF 3v3 Official': AF_3V3_PRESET,
  af3v3: { ...AF_3V3_PRESET, id: 'af3v3' },
  small: STADIUM_SMALL,
  classic: STADIUM_CLASSIC,
  big: STADIUM_BIG
};

export const StadiumRegistry: Record<string, StadiumPreset> = STADIUM_PRESETS;

export const DEFAULT_STADIUM_ID: StadiumId = 'AF 3v3';

export function createStadium(id: StadiumId | string = defaultStadium, customOptions?: Partial<StadiumOptions>): Stadium {
  let preset: StadiumPreset;
  if (id === 'AF 3v3') {
    preset = STADIUM_AF_3V3;
  } else if (id === 'Classic Stadium') {
    preset = STADIUM_CLASSIC;
  } else if (id === 'Big Stadium') {
    preset = STADIUM_BIG;
  } else if (id === 'Small Arena') {
    preset = STADIUM_SMALL;
  } else {
    const presetKey = (id in STADIUM_PRESETS)
      ? id
      : (defaultStadium in STADIUM_PRESETS ? defaultStadium : 'classic');
    preset = STADIUM_PRESETS[presetKey];
  }

  return new Stadium({
    id: preset.id,
    name: preset.name,
    width: preset.width,
    height: preset.height,
    goalSize: preset.goalSize,
    goalDepth: preset.goalDepth,
    runOff: preset.runOff,
    spawnDistance: preset.spawnDistance,
    kickOffRadius: preset.kickOffRadius,
    bgColor: preset.bgColor,
    postRadius: preset.postRadius,
    postColor: preset.postColor,
    ballPhysics: preset.ballPhysics,
    playerPhysics: preset.playerPhysics,
    leftGoalPos: preset.leftGoalPos,
    rightGoalPos: preset.rightGoalPos,
    ...customOptions
  });
}
