export const defaultStadium = 'mediano';

export interface GameplayConfig {
  playerMaxSpeed: number;          // min: 0.7, max: 11.2, def: 3.9 (px/tick)
  playerSpeed: number;             // min: 0.25, max: 4.0, def: 1.39 (multiplicador base de velocidad)
  playerAcceleration: number;      // min: 0.03, max: 0.55, def: 0.16
  kickingAcceleration: number;     // min: 0.02, max: 0.55, def: 0.16 (sin penalización)
  kickStrength: number;            // min: 0.9, max: 18.2, def: 5.2 (0.2x - 4.0x)
  kickMargin: number;              // min: 0.0, max: 15.0, def: 4.0 (px)
  playerRadius: number;            // min: 8.0, max: 30.0, def: 15.0 (px)
  ballRadius: number;              // min: 3.0, max: 16.0, def: 8.0 (px)
  ballRestitution: number;         // min: 0.0, max: 1.8, def: 0.58 (bCoef)
  boostMultiplier: number;         // min: 1.1, max: 4.0, def: 1.40 (Turbo Multiplier)
  dashDistance: number;            // min: 3.75, max: 112.5, def: 48.0 (px, ~7 ticks continuos)
  dashCooldown: number;            // min: 0.0, max: 5.0, def: 1.25 (s)
  staminaRechargeRate: number;     // min: 5.0, max: 100.0, def: 30.0 (%/s)
  staminaRechargeDelay: number;    // min: 0.0, max: 5.0, def: 1.0 (s)
  staminaRegenMoving: boolean;     // default: false
  staminaRegenMovingRate: number;  // min: 0, max: 200, def: 25 (% respecto a reposo)
  magnusCurveStrength: number;     // min: 0.0, max: 5.0, def: 1.25 (0.0x - 5.0x)
  ballMass: number;                // min: 0.1, max: 10.0, def: 0.7
  playerMass: number;              // min: 0.1, max: 10.0, def: 2.0
  playerFriction: number;          // min: 0.80, max: 0.999, def: 0.95 (damping jugador)
  ballFriction: number;            // min: 0.80, max: 0.999, def: 0.988 (damping balón)
  turboEnabled: boolean;           // default: true
  dashEnabled: boolean;            // default: true
  magnusEnabled: boolean;          // default: true
  dashesPerFullBar: number;        // min: 1, max: 6, def: 3 (dashes con 100% de estamina)
}

export interface ConfigLimits {
  min: number;
  max: number;
  step: number;
  default: number;
  label: string;
  unit?: string;
  description: string;
}

export type BooleanGameplayConfigKey =
  | 'turboEnabled'
  | 'dashEnabled'
  | 'magnusEnabled'
  | 'staminaRegenMoving';

export const GAMEPLAY_CONFIG_LIMITS: Record<
  keyof Omit<GameplayConfig, BooleanGameplayConfigKey>,
  ConfigLimits
> = {
  playerMaxSpeed: {
    min: 0.7,
    max: 11.2,
    step: 0.1,
    default: 3.9,
    label: 'Velocidad Jugador',
    unit: 'px/tick',
    description: 'Escala 0.25x - 4.0x sobre velocidad terminal del jugador (3.9 = 234 px/s).'
  },
  playerSpeed: {
    min: 0.25,
    max: 4.0,
    step: 0.05,
    default: 1.39,
    label: 'Escala Velocidad Base',
    unit: 'x',
    description: 'Multiplicador directo de velocidad máxima base del jugador.'
  },
  playerAcceleration: {
    min: 0.03,
    max: 0.55,
    step: 0.01,
    default: 0.16,
    label: 'Aceleración Jugador',
    description: 'Aceleración motriz base del jugador por tick.'
  },
  kickingAcceleration: {
    min: 0.02,
    max: 0.55,
    step: 0.005,
    default: 0.16,
    label: 'Aceleración Pateando',
    description: 'Mantenido por compatibilidad; patear ya no penaliza la aceleración.'
  },
  kickStrength: {
    min: 0.9,
    max: 18.2,
    step: 0.05,
    default: 5.2,
    label: 'Fuerza de Patada',
    description: 'Escala 0.2x - 4.0x sobre el impulso cinemático de tiro (~515 px/s por defecto).'
  },
  kickMargin: {
    min: 0.0,
    max: 15.0,
    step: 0.5,
    default: 4.0,
    label: 'Distancia de Pateo',
    unit: 'px',
    description: 'Margen de distancia extra para patear sobre el contacto físico (0 = contacto exacto).'
  },
  playerRadius: {
    min: 8.0,
    max: 30.0,
    step: 0.5,
    default: 15.0,
    label: 'Radio del Jugador',
    unit: 'px',
    description: 'Radio físico de colisión y renderizado del disco jugador.'
  },
  ballRadius: {
    min: 3.0,
    max: 16.0,
    step: 0.2,
    default: 8.0,
    label: 'Radio del Balón',
    unit: 'px',
    description: 'Radio geométrico del balón en colisiones con postes y jugadores.'
  },
  ballRestitution: {
    min: 0.0,
    max: 1.8,
    step: 0.01,
    default: 0.58,
    label: 'Rebote Balón (bCoef)',
    description: 'Coeficiente de restitución elástica (0.0 sin rebote, >1.0 superelástico).'
  },
  boostMultiplier: {
    min: 1.1,
    max: 4.0,
    step: 0.05,
    default: 1.4,
    label: 'Multiplicador de Turbo',
    description: 'Factor multiplicador de velocidad y aceleración en sprint (1.1x - 4.0x).'
  },
  dashDistance: {
    min: 3.75,
    max: 112.5,
    step: 0.25,
    default: 48.0,
    label: 'Distancia de Dash',
    unit: 'px',
    description: 'Desplazamiento ultrarrápido continuo durante ~7 ticks.'
  },
  dashCooldown: {
    min: 0.0,
    max: 5.0,
    step: 0.25,
    default: 1.25,
    label: 'Cooldown de Dash',
    unit: 's',
    description: 'Tiempo mínimo de espera entre impulsos de Dash consecutivos (0.0s - 5.0s).'
  },
  staminaRechargeRate: {
    min: 5.0,
    max: 100.0,
    step: 1.0,
    default: 30.0,
    label: 'Tasa Recarga Estamina',
    unit: '%/s',
    description: 'Tasa base de recuperación de estamina por segundo.'
  },
  staminaRechargeDelay: {
    min: 0.0,
    max: 5.0,
    step: 0.1,
    default: 1.0,
    label: 'Retardo Recarga Estamina',
    unit: 's',
    description: 'Tiempo quieto sin movimiento ni turbo/dash antes de iniciar la recarga de estamina.'
  },
  staminaRegenMovingRate: {
    min: 0,
    max: 200,
    step: 5,
    default: 25,
    label: 'Velocidad Recarga en Movimiento',
    unit: '%',
    description: 'Porcentaje de recarga al desplazarse sin usar Turbo tras cumplir el retardo inicial.'
  },
  magnusCurveStrength: {
    min: 0.0,
    max: 5.0,
    step: 0.05,
    default: 1.25,
    label: 'Fuerza de Curva Magnus',
    description: 'Intensidad de curvatura lateral durante la pulsación activa de Curva.'
  },
  ballMass: {
    min: 0.1,
    max: 10.0,
    step: 0.1,
    default: 0.7,
    label: 'Masa del Balón',
    description: 'Masa inercial del balón en transferencias de momento y choques.'
  },
  playerMass: {
    min: 0.1,
    max: 10.0,
    step: 0.1,
    default: 2.0,
    label: 'Masa del Jugador',
    description: 'Masa inercial del jugador para colisiones de cuerpo y tackle.'
  },
  playerFriction: {
    min: 0.80,
    max: 0.999,
    step: 0.005,
    default: 0.95,
    label: 'Fricción Jugador',
    description: 'Factor de amortiguamiento/damping en el movimiento de jugadores.'
  },
  ballFriction: {
    min: 0.80,
    max: 0.999,
    step: 0.005,
    default: 0.988,
    label: 'Fricción Balón',
    description: 'Factor de amortiguamiento/damping por rozamiento del balón con el suelo.'
  },
  dashesPerFullBar: {
    min: 1,
    max: 6,
    step: 1,
    default: 3,
    label: 'Dashes por Barra Llena',
    unit: 'dashes',
    description: 'Cantidad de impulsos con el 100% de estamina (coste = 100 / N%).'
  }
};

export const DEFAULT_GAMEPLAY_CONFIG: Readonly<GameplayConfig> = Object.freeze({
  playerMaxSpeed: 3.9,
  playerSpeed: 1.39,
  playerAcceleration: 0.16,
  kickingAcceleration: 0.16,
  kickStrength: 5.2,
  kickMargin: 4.0,
  playerRadius: 15.0,
  ballRadius: 8.0,
  ballRestitution: 0.58,
  boostMultiplier: 1.4,
  dashDistance: 48.0,
  dashCooldown: 1.25,
  staminaRechargeRate: 30.0,
  staminaRechargeDelay: 1.0,
  staminaRegenMoving: false,
  staminaRegenMovingRate: 25,
  magnusCurveStrength: 1.25,
  ballMass: 0.7,
  playerMass: 2.0,
  playerFriction: 0.95,
  ballFriction: 0.988,
  turboEnabled: true,
  dashEnabled: true,
  magnusEnabled: true,
  dashesPerFullBar: 3
});

export type GameplayPresetId = 'competitive' | 'futsal' | 'classic';

export interface GameplayPreset {
  id: GameplayPresetId;
  name: string;
  badge: string;
  description: string;
  highlights: string[];
  config: Readonly<GameplayConfig>;
}

export const GAMEPLAY_PRESETS: Readonly<Record<GameplayPresetId, GameplayPreset>> = Object.freeze({
  competitive: {
    id: 'competitive',
    name: 'Ágil & Competitivo Equilibrado',
    badge: 'Por defecto',
    description:
      'Balance principal calibrado para aprender en segundos con alto techo técnico en paredes, pases, turbo táctico y efecto Magnus.',
    highlights: ['Balón 8.0 px', 'Vel. base 3.9 / Turbo 1.4x', '3 dashes (CD 1.25 s)', 'Rebote 0.58 · Retardo 1.0 s'],
    config: DEFAULT_GAMEPLAY_CONFIG
  },
  futsal: {
    id: 'futsal',
    name: 'Estilo Futsal Técnico',
    badge: 'Regate fino',
    description:
      'Balón más compacto y rápido, menor rebote en vallas y pases cortos de precisión para juego asociado al pie.',
    highlights: ['Balón 6.5 px', 'Vel. base 4.0 / Turbo 1.35x', 'Acel. 0.17 · Fricción 0.955', 'Rebote 0.50 · Tiro 4.9'],
    config: Object.freeze({
      ...DEFAULT_GAMEPLAY_CONFIG,
      ballRadius: 6.5,
      playerMaxSpeed: 4.0,
      playerSpeed: 1.43,
      playerAcceleration: 0.17,
      kickingAcceleration: 0.17,
      playerFriction: 0.955,
      boostMultiplier: 1.35,
      ballRestitution: 0.5,
      ballFriction: 0.985,
      kickStrength: 4.9,
      dashDistance: 44.0,
      dashCooldown: 1.15,
      dashesPerFullBar: 3,
      staminaRechargeRate: 32.0,
      staminaRechargeDelay: 1.0,
      magnusCurveStrength: 1.15
    })
  },
  classic: {
    id: 'classic',
    name: 'Estilo Arcade Clásico',
    badge: 'Accesible',
    description:
      'Balón grande muy legible con inercia tradicional, mayor rebote elástico, patada potente y margen de disparo amplio.',
    highlights: ['Balón 9.5 px', 'Vel. base 3.6 / Turbo 1.45x', 'Rebote 0.65 · Tiro 5.4', 'Margen patada 5.0 px'],
    config: Object.freeze({
      ...DEFAULT_GAMEPLAY_CONFIG,
      ballRadius: 9.5,
      playerMaxSpeed: 3.6,
      playerSpeed: 1.29,
      playerAcceleration: 0.14,
      kickingAcceleration: 0.14,
      playerFriction: 0.96,
      boostMultiplier: 1.45,
      ballRestitution: 0.65,
      ballFriction: 0.99,
      kickStrength: 5.4,
      kickMargin: 5.0,
      dashDistance: 46.0,
      dashCooldown: 1.25,
      dashesPerFullBar: 3,
      staminaRechargeRate: 28.0,
      staminaRechargeDelay: 1.0,
      magnusCurveStrength: 1.1
    })
  }
});

/**
 * Sanea y acota cualquier configuración parcial o externa a límites numéricos seguros.
 * Garantiza cero colapsos numéricos o valores NaN/fuera de rango en el motor.
 */
export function sanitizeGameplayConfig(partial?: Partial<GameplayConfig> | null): GameplayConfig {
  const result: GameplayConfig = { ...DEFAULT_GAMEPLAY_CONFIG };
  if (!partial) return result;

  const hasMaxSpeed = typeof partial.playerMaxSpeed === 'number' && Number.isFinite(partial.playerMaxSpeed);
  const hasPlayerSpeed = typeof partial.playerSpeed === 'number' && Number.isFinite(partial.playerSpeed);
  const hasAccel = typeof partial.playerAcceleration === 'number' && Number.isFinite(partial.playerAcceleration);
  const hasKickAccel = typeof partial.kickingAcceleration === 'number' && Number.isFinite(partial.kickingAcceleration);

  for (const key of Object.keys(DEFAULT_GAMEPLAY_CONFIG) as Array<keyof GameplayConfig>) {
    const val = partial[key];
    if (
      key === 'turboEnabled' ||
      key === 'dashEnabled' ||
      key === 'magnusEnabled' ||
      key === 'staminaRegenMoving'
    ) {
      if (typeof val === 'boolean') {
        result[key] = val;
      }
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      const limits = (GAMEPLAY_CONFIG_LIMITS as Record<string, ConfigLimits>)[key];
      if (limits) {
        (result as any)[key] = Math.max(limits.min, Math.min(limits.max, val));
      }
    }
  }

  if (hasPlayerSpeed && !hasMaxSpeed) {
    const derivedMax = result.playerSpeed * 2.8;
    result.playerMaxSpeed = Math.max(
      GAMEPLAY_CONFIG_LIMITS.playerMaxSpeed.min,
      Math.min(GAMEPLAY_CONFIG_LIMITS.playerMaxSpeed.max, Number(derivedMax.toFixed(4)))
    );
  } else if (hasMaxSpeed && !hasPlayerSpeed) {
    const derivedScale = result.playerMaxSpeed / 2.8;
    result.playerSpeed = Math.max(
      GAMEPLAY_CONFIG_LIMITS.playerSpeed.min,
      Math.min(GAMEPLAY_CONFIG_LIMITS.playerSpeed.max, Number(derivedScale.toFixed(4)))
    );
  }

  if (hasAccel && !hasKickAccel) {
    result.kickingAcceleration = Math.max(
      GAMEPLAY_CONFIG_LIMITS.kickingAcceleration.min,
      Math.min(GAMEPLAY_CONFIG_LIMITS.kickingAcceleration.max, Number(result.playerAcceleration.toFixed(4)))
    );
  }

  return result;
}

/**
 * Catálogo Canónico de los Modificadores Físicos y Configuración de Juego
 * Definidos en docs/GDD.md (mantenido para compatibilidad con EngineInstance y DedicatedHost)
 */
export interface PhysicsModifiers {
  gravity: number;                 // 1. Gravedad / inclinación (px/s^2) [-50..50]
  pitchFriction: number;           // 2. Fricción del campo (0.900..0.999)
  wallBounciness: number;          // 3. Rebote de vallas (0.10..1.20)
  postBounciness: number;          // 4. Rebote de postes (0.20..1.30)
  baseKickStrength: number;        // 5. Fuerza de patada base (200..900)
  dashPower: number;               // 6. Potencia de Dash / Sprint (100..600)
  dashCooldown: number;            // 7. Cooldown de Dash en segundos (0.0..5.0)
  playerMass: number;              // 8. Masa de jugadores (0.5..3.0)
  playerRadius: number;            // 9. Radio de jugadores (10.0..25.0)
  ballMass: number;                // 10. Masa del balón (0.05..1.00)
  ballRadius: number;              // 11. Radio del balón (6.0..20.0)
  magnusCoefficient: number;       // 12. Coeficiente Magnus (0.0..0.010)
  netElasticity: number;           // 13. Elasticidad de redes (0.10..0.90)
  netDamping: number;              // 14. Amortiguamiento de redes (0.02..0.50)
  goalCelebrationDuration: number; // 15. Tiempo de celebración de gol en segundos (1.0..6.0)
  goalLimit: number;               // 16. Límite de goles por partido (0 = sin límite)
  matchTimeMinutes: number;        // 17. Tiempo reglamentario en minutos (0 = indefinido)
  goldenGoalOvertime: boolean;     // 18. Modo Overtime / Gol de Oro (true/false)
  airDensity: number;              // 19. Densidad del aire (0.0..3.0)
}

export const DEFAULT_PHYSICS_MODIFIERS: PhysicsModifiers = {
  gravity: 0.0,
  pitchFriction: DEFAULT_GAMEPLAY_CONFIG.ballFriction,
  wallBounciness: DEFAULT_GAMEPLAY_CONFIG.ballRestitution,
  postBounciness: 0.85,
  baseKickStrength: (DEFAULT_GAMEPLAY_CONFIG.kickStrength / 4.545) * 450.0,
  dashPower: (DEFAULT_GAMEPLAY_CONFIG.dashDistance / 7) * 60,
  dashCooldown: DEFAULT_GAMEPLAY_CONFIG.dashCooldown,
  playerMass: DEFAULT_GAMEPLAY_CONFIG.playerMass,
  playerRadius: DEFAULT_GAMEPLAY_CONFIG.playerRadius,
  ballMass: DEFAULT_GAMEPLAY_CONFIG.ballMass,
  ballRadius: DEFAULT_GAMEPLAY_CONFIG.ballRadius,
  magnusCoefficient: 0.0025,
  netElasticity: 0.45,
  netDamping: 0.12,
  goalCelebrationDuration: 3.0,
  goalLimit: 3,
  matchTimeMinutes: 3.0,
  goldenGoalOvertime: true,
  airDensity: 1.0
};

export interface GameConfig {
  stadiumId: string;
  modifiers: PhysicsModifiers;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  stadiumId: 'AF 3v3',
  modifiers: { ...DEFAULT_PHYSICS_MODIFIERS }
};
