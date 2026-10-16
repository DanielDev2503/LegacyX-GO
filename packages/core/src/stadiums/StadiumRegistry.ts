import { Stadium, StadiumOptions, StadiumBallPhysics, StadiumPlayerPhysics } from './Stadium';

export type StadiumId =
  | 'AF 3v3'
  | 'af3v3'
  | 'AF 3v3 Official'
  | 'Classic Stadium'
  | 'classic'
  | 'Big Stadium'
  | 'big'
  | 'Small Arena'
  | 'small';

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
    invMass: 5.0, // mass = 0.2
    color: '#ffffff'
  },
  playerPhysics: {
    acceleration: 0.15,
    kickingAcceleration: 0.10,
    kickStrength: 450,
    bCoef: 0.5
  }
};

export const STADIUM_CLASSIC: StadiumPreset = {
  id: 'Classic Stadium',
  name: 'Classic Stadium',
  description: '800x360 - Arcos 110',
  width: 800,
  height: 360,
  goalSize: 110,
  goalWidth: 110,
  goalDepth: 40,
  kickOffRadius: 60,
  runOff: 45,
  spawnDistance: 220,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_BIG: StadiumPreset = {
  id: 'Big Stadium',
  name: 'Big Stadium',
  description: '1100x500 - Arcos 140',
  width: 1100,
  height: 500,
  goalSize: 140,
  goalWidth: 140,
  goalDepth: 55,
  kickOffRadius: 90,
  runOff: 50,
  spawnDistance: 320,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_SMALL: StadiumPreset = {
  id: 'Small Arena',
  name: 'Small Arena',
  description: '600x300 - Arcos 90',
  width: 600,
  height: 300,
  goalSize: 90,
  goalWidth: 90,
  goalDepth: 35,
  kickOffRadius: 50,
  runOff: 40,
  spawnDistance: 160,
  bgColor: '#1D2431',
  postRadius: 8,
  postColor: '#ffffff'
};

export const STADIUM_PRESETS: Record<string, StadiumPreset> = {
  'AF 3v3': STADIUM_AF_3V3,
  'af3v3': { ...STADIUM_AF_3V3, id: 'af3v3' },
  'AF 3v3 Official': { ...STADIUM_AF_3V3, id: 'AF 3v3 Official' },
  'Classic Stadium': STADIUM_CLASSIC,
  'classic': { ...STADIUM_CLASSIC, id: 'classic' },
  'Big Stadium': STADIUM_BIG,
  'big': { ...STADIUM_BIG, id: 'big' },
  'Small Arena': STADIUM_SMALL,
  'small': { ...STADIUM_SMALL, id: 'small' }
};

export const DEFAULT_STADIUM_ID: StadiumId = 'AF 3v3';

export function createStadium(stadiumId: string = DEFAULT_STADIUM_ID): Stadium {
  const preset = STADIUM_PRESETS[stadiumId] ?? STADIUM_AF_3V3;
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
    rightGoalPos: preset.rightGoalPos
  });
}
