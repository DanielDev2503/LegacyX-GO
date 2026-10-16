/**
 * Catálogo Canónico de los 19 Modificadores Físicos y Configuración de Juego
 * Definidos en docs/GDD.md
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
