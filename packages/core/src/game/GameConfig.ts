export const defaultStadium = 'AF 3v3 Official';

export interface GameplayConfig {
  playerMaxSpeed: number;       // min: 0.7, max: 11.2, def: 2.8 (px/tick, 0.25x - 4.0x)
  playerAcceleration: number;   // min: 0.03, max: 0.55, def: 0.11 (0.25x - 5.0x)
  kickStrength: number;         // min: 0.9, max: 18.2, def: 4.545 (0.2x - 4.0x)
  kickMargin: number;           // min: 0.0, max: 15.0, def: 4.0 (px)
  playerRadius: number;         // min: 8.0, max: 30.0, def: 15.0 (px)
  ballRadius: number;           // min: 3.0, max: 16.0, def: 5.8 (px)
  ballRestitution: number;      // min: 0.0, max: 1.8, def: 0.5 (bCoef)
  boostMultiplier: number;      // min: 1.1, max: 4.0, def: 2.0 (Turbo Multiplier)
  dashDistance: number;         // min: 3.75, max: 112.5, def: 37.5 (px, 0.1x - 3.0x de 37.5px)
  staminaRechargeRate: number;  // min: 5.0, max: 100.0, def: 25.0 (%/s)
  magnusCurveStrength: number;  // min: 0.0, max: 5.0, def: 1.05 (0.0x - 5.0x)
  ballMass: number;             // min: 0.1, max: 10.0, def: 1.0
  playerMass: number;           // min: 0.1, max: 10.0, def: 2.0
  playerFriction: number;       // min: 0.80, max: 0.999, def: 0.96 (damping jugador)
  ballFriction: number;         // min: 0.80, max: 0.999, def: 0.99 (damping balón)
  turboEnabled: boolean;        // default: true
  dashEnabled: boolean;         // default: true
  magnusEnabled: boolean;       // default: true
  dashesPerFullBar: number;     // min: 1, max: 6, def: 4 (dashes con 100% de estamina)
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

export const GAMEPLAY_CONFIG_LIMITS: Record<
  keyof Omit<GameplayConfig, 'turboEnabled' | 'dashEnabled' | 'magnusEnabled'>,
  ConfigLimits
> = {
  playerMaxSpeed: {
    min: 0.7,
    max: 11.2,
    step: 0.1,
    default: 2.8,
    label: 'Velocidad Jugador',
    unit: 'px/tick',
    description: 'Escala 0.25x - 4.0x sobre velocidad base del jugador.'
  },
  playerAcceleration: {
    min: 0.03,
    max: 0.55,
    step: 0.01,
    default: 0.11,
    label: 'Aceleración Jugador',
    description: 'Escala 0.25x - 5.0x sobre aceleración motriz base.'
  },
  kickStrength: {
    min: 0.9,
    max: 18.2,
    step: 0.05,
    default: 4.545,
    label: 'Fuerza de Patada',
    description: 'Escala 0.2x - 4.0x sobre el impulso cinemático de tiro.'
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
    default: 5.8,
    label: 'Radio del Balón',
    unit: 'px',
    description: 'Radio geométrico del balón en colisiones con postes y jugadores.'
  },
  ballRestitution: {
    min: 0.0,
    max: 1.8,
    step: 0.01,
    default: 0.5,
    label: 'Rebote Balón (bCoef)',
    description: 'Coeficiente de restitución elástica (0.0 sin rebote, >1.0 superelástico).'
  },
  boostMultiplier: {
    min: 1.1,
    max: 4.0,
    step: 0.05,
    default: 2.0,
    label: 'Multiplicador de Turbo',
    description: 'Factor multiplicador de velocidad y aceleración en sprint (1.1x - 4.0x).'
  },
  dashDistance: {
    min: 3.75,
    max: 112.5,
    step: 0.25,
    default: 37.5,
    label: 'Distancia de Dash',
    unit: 'px',
    description: 'Desplazamiento total instantáneo en ráfaga (0.1x - 3.0x de 37.5 px).'
  },
  staminaRechargeRate: {
    min: 5.0,
    max: 100.0,
    step: 1.0,
    default: 25.0,
    label: 'Tasa Recarga Estamina',
    unit: '%/s',
    description: 'Tasa de recuperación pasiva en reposo de teclas.'
  },
  magnusCurveStrength: {
    min: 0.0,
    max: 5.0,
    step: 0.05,
    default: 1.05,
    label: 'Fuerza de Curva Magnus',
    description: 'Intensidad de curvatura lateral durante la pulsación activa de Z / C.'
  },
  ballMass: {
    min: 0.1,
    max: 10.0,
    step: 0.1,
    default: 1.0,
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
    default: 0.96,
    label: 'Fricción Jugador',
    description: 'Factor de amortiguamiento/damping en el movimiento de jugadores.'
  },
  ballFriction: {
    min: 0.80,
    max: 0.999,
    step: 0.005,
    default: 0.99,
    label: 'Fricción Balón',
    description: 'Factor de amortiguamiento/damping por rozamiento del balón con el suelo.'
  },
  dashesPerFullBar: {
    min: 1,
    max: 6,
    step: 1,
    default: 4,
    label: 'Dashes por Barra Llena',
    unit: 'dashes',
    description: 'Cantidad de impulsos con el 100% de estamina (coste = 100 / N%).'
  }
};

export const DEFAULT_GAMEPLAY_CONFIG: Readonly<GameplayConfig> = Object.freeze({
  playerMaxSpeed: 2.8,
  playerAcceleration: 0.11,
  kickStrength: 4.545,
  kickMargin: 4.0,
  playerRadius: 15.0,
  ballRadius: 5.8,
  ballRestitution: 0.5,
  boostMultiplier: 2.0,
  dashDistance: 37.5,
  staminaRechargeRate: 25.0,
  magnusCurveStrength: 1.05,
  ballMass: 1.0,
  playerMass: 2.0,
  playerFriction: 0.96,
  ballFriction: 0.99,
  turboEnabled: true,
  dashEnabled: true,
  magnusEnabled: true,
  dashesPerFullBar: 4
});

/**
 * Sanea y acota cualquier configuración parcial o externa a límites numéricos seguros.
 * Garantiza cero colapsos numéricos o valores NaN/fuera de rango en el motor.
 */
export function sanitizeGameplayConfig(partial?: Partial<GameplayConfig> | null): GameplayConfig {
  const result: GameplayConfig = { ...DEFAULT_GAMEPLAY_CONFIG };
  if (!partial) return result;

  for (const key of Object.keys(DEFAULT_GAMEPLAY_CONFIG) as Array<keyof GameplayConfig>) {
    const val = partial[key];
    if (key === 'turboEnabled' || key === 'dashEnabled' || key === 'magnusEnabled') {
      if (typeof val === 'boolean') {
        result[key] = val;
      }
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      const limits = (GAMEPLAY_CONFIG_LIMITS as any)[key];
      if (limits) {
        (result as any)[key] = Math.max(limits.min, Math.min(limits.max, val));
      }
    }
  }

  return result;
}

/**
 * Catálogo Canónico de los 19 Modificadores Físicos y Configuración de Juego
 * Definidos en docs/GDD.md (mantenido para compatibilidad con EngineInstance y DedicatedHost)
 */
export interface PhysicsModifiers {
  gravity: number;                 // 1. Gravedad / inclinación (px/s^2) [-50..50]
  pitchFriction: number;           // 2. Fricción del campo (0.900..0.999)
  wallBounciness: number;          // 3. Rebote de vallas (0.10..1.20)
  postBounciness: number;          // 4. Rebote de postes (0.20..1.30)
  baseKickStrength: number;        // 5. Fuerza de patada base (200..900)
  dashPower: number;               // 6. Potencia de Dash / Sprint (100..600)
  dashCooldown: number;            // 7. Cooldown de Dash en segundos (0.2..5.0)
  playerMass: number;              // 8. Masa de jugadores (0.5..3.0)
  playerRadius: number;            // 9. Radio de jugadores (10.0..25.0)
  ballMass: number;                // 10. Masa del balón (0.05..1.00)
  ballRadius: number;              // 11. Radio del balón (6.0..20.0)
  magnusCoefficient: number;       // 12. Coeficiente Magnus (0.0..0.010)
  netElasticity: number;           // 13. Elasticidad de redes (0.10..0.90)
  netDamping: number;              // 14. Amortiguamiento de redes (0.02..0.50)
  goalCelebrationDuration: number; // 15. Tiempo de celebración de gol en segundos (1.0..6.0)
  goalLimit: number;               // 16. Límite de goles por partido (1..15, 0 = sin límite)
  matchTimeMinutes: number;        // 17. Tiempo reglamentario en minutos (1.0..15.0)
  goldenGoalOvertime: boolean;     // 18. Modo Overtime / Gol de Oro (true/false)
  airDensity: number;              // 19. Densidad del aire (0.0..3.0)
}

export const DEFAULT_PHYSICS_MODIFIERS: PhysicsModifiers = {
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

export interface GameConfig {
  stadiumId: string;
  modifiers: PhysicsModifiers;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  stadiumId: 'AF 3v3',
  modifiers: { ...DEFAULT_PHYSICS_MODIFIERS }
};
