import { Stadium, StadiumOptions, StadiumBallPhysics, StadiumPlayerPhysics } from './Stadium';
import { defaultStadium } from '../game/GameConfig';

export type StadiumId =
  | 'individual'
  | 'small'
  | 'classic'
  | 'medium'
  | 'mediano'
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
  | 'AF 3v3 Official'
  | 'af3v3'
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

export const STADIUM_INDIVIDUAL: StadiumPreset = {
  id: 'individual',
  name: 'Individual (1v1)',
  description: '800x380 - Arcos 120 (1v1) by Yami',
  width: 800,
  height: 380,
  goalSize: 120,
  goalWidth: 120,
  goalDepth: 35,
  runOff: 45,
  spawnDistance: 240,
  kickOffRadius: 70,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_SMALL: StadiumPreset = {
  id: 'small',
  name: 'Pequeño (2v2)',
  description: '1000x460 - Arcos 130 (2v2) by Yami',
  width: 1000,
  height: 460,
  goalSize: 130,
  goalWidth: 130,
  goalDepth: 35,
  runOff: 45,
  spawnDistance: 300,
  kickOffRadius: 75,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_CLASSIC: StadiumPreset = {
  id: 'classic',
  name: 'Mediano (3v3 Clásico)',
  description: '1200x540 - Arcos 140 (3v3) by Yami',
  width: 1200,
  height: 540,
  goalSize: 140,
  goalWidth: 140,
  goalDepth: 35,
  runOff: 45,
  spawnDistance: 360,
  kickOffRadius: 80,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_BIG: StadiumPreset = {
  id: 'big',
  name: 'Grande (4v4)',
  description: '1600x720 - Arcos 160 (4v4) by Yami',
  width: 1600,
  height: 720,
  goalSize: 160,
  goalWidth: 160,
  goalDepth: 35,
  runOff: 45,
  spawnDistance: 480,
  kickOffRadius: 90,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_AF_3V3: StadiumPreset = {
  id: 'AF 3v3',
  name: 'AF 3v3 Official',
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

export const STADIUM_PRESETS: Record<string, StadiumPreset> = {
  individual: STADIUM_INDIVIDUAL,
  '1v1': STADIUM_INDIVIDUAL,
  'AF 3v3': STADIUM_AF_3V3,
  'AF 3v3 Official': STADIUM_AF_3V3,
  af3v3: STADIUM_AF_3V3,
  small: STADIUM_SMALL,
  '2v2': STADIUM_SMALL,
  classic: STADIUM_CLASSIC,
  medium: STADIUM_CLASSIC,
  mediano: STADIUM_CLASSIC,
  Mediano: STADIUM_CLASSIC,
  '3v3': STADIUM_CLASSIC,
  big: STADIUM_BIG,
  '4v4': STADIUM_BIG
};

export const StadiumRegistry: Record<string, StadiumPreset> = STADIUM_PRESETS;

export const DEFAULT_STADIUM_ID: StadiumId = 'mediano';

export function createStadium(id: StadiumId | string = defaultStadium, customOptions?: Partial<StadiumOptions>): Stadium {
  let preset: StadiumPreset;
  if (id === 'individual' || id === '1v1' || id === 'Individual' || id === 'Individual (1v1)') {
    preset = STADIUM_INDIVIDUAL;
  } else if (id === 'AF 3v3') {
    preset = STADIUM_AF_3V3;
  } else if (id === 'small' || id === '2v2' || id === 'Small' || id === 'Pequeño' || id === 'Pequeño (2v2)' || id === 'Small Arena') {
    preset = STADIUM_SMALL;
  } else if (id === 'big' || id === '4v4' || id === 'Big' || id === 'Grande' || id === 'Grande (4v4)' || id === 'Big Stadium') {
    preset = STADIUM_BIG;
  } else if (
    id === 'classic' ||
    id === 'medium' ||
    id === 'mediano' ||
    id === '3v3' ||
    id === 'Mediano' ||
    id === 'Mediano (3v3)' ||
    id === 'Classic' ||
    id === 'Classic Stadium' ||
    id === 'AF 3v3 Official'
  ) {
    preset = STADIUM_CLASSIC;
  } else {
    const presetKey = (id in STADIUM_PRESETS)
      ? id
      : (defaultStadium in STADIUM_PRESETS ? defaultStadium : 'mediano');
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
