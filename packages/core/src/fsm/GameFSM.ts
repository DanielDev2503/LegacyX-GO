export enum MatchPhase {
  STOP = 0,
  KICKOFF = 1,
  PLAYING = 2,
  PAUSE = 2.1,
  GOAL = 3,
  STATS = 5,

  // Alias de compatibilidad
  STOPPED = 0,
  COUNTDOWN = 1,
  PAUSED = 2.1,
  GOAL_CELEBRATION = 3,
  VICTORY_CELEBRATION = 5,
  MATCH_ENDED = 5
}

export type MatchState = MatchPhase;
export const MatchState = MatchPhase;

export interface FSMConfig {
  goalCelebrationTicks?: number; // 180 ticks = 3.0 segundos canónicos a 60 Hz
  matchTimeMinutes?: number;     // 3.0 minutos por defecto
  scoreLimit?: number;           // 3 goles por defecto
  goldenGoal?: boolean;          // Gol de oro en empate
}

export class GameFSM {
  public currentState: MatchPhase = MatchPhase.STOP;
  public stateTicksRemaining: number = 0;
  public celebrationDurationTicks: number;
  public matchTimeLimitTicks: number;
  public matchTicksElapsed: number = 0;
  public scoreLimit: number;
  public goldenGoal: boolean;

  public redScore: number = 0;
  public blueScore: number = 0;
  public winningTeam: 'red' | 'blue' | null = null;
  public lastScoringTeam: 'red' | 'blue' | null = null;

  // Posesión acumulada en ticks
  public redPossessionTicks: number = 0;
  public bluePossessionTicks: number = 0;
  public currentPossessionTeam: 'red' | 'blue' | null = null;

  public onStateChange?: (newState: MatchPhase, prevState: MatchPhase) => void;
  public onGoalScored?: (scoringTeam: 'red' | 'blue', redScore: number, blueScore: number) => void;
  public onMatchEnd?: (winner: 'red' | 'blue' | null) => void;

  constructor(config: FSMConfig = {}) {
    this.celebrationDurationTicks = config.goalCelebrationTicks ?? 180;
    this.matchTimeLimitTicks = Math.round((config.matchTimeMinutes ?? 3.0) * 60 * 60);
    this.scoreLimit = config.scoreLimit ?? 3;
    this.goldenGoal = config.goldenGoal ?? true;
  }

  public get state(): MatchPhase {
    return this.currentState;
  }

  public set state(val: MatchPhase) {
    this.transitionTo(val);
  }

  public transitionTo(newState: MatchPhase): void {
    if (this.currentState === newState) return;
    const prev = this.currentState;
    this.currentState = newState;
    this.onStateChange?.(newState, prev);
  }

  public startMatch(): void {
    this.redScore = 0;
    this.blueScore = 0;
    this.matchTicksElapsed = 0;
    this.redPossessionTicks = 0;
    this.bluePossessionTicks = 0;
    this.winningTeam = null;
    this.lastScoringTeam = null;
    this.transitionTo(MatchPhase.KICKOFF);
  }

  public kickoff(): void {
    this.transitionTo(MatchPhase.KICKOFF);
  }

  public startPlaying(): void {
    this.transitionTo(MatchPhase.PLAYING);
  }

  public pauseMatch(): void {
    if (this.currentState === MatchPhase.PLAYING) {
      this.transitionTo(MatchPhase.PAUSE);
    }
  }

  public pause(): void {
    this.pauseMatch();
  }

  public resumeMatch(): void {
    if (this.currentState === MatchPhase.PAUSE) {
      this.transitionTo(MatchPhase.PLAYING);
    }
  }

  public resume(): void {
    this.resumeMatch();
  }

  public togglePause(): void {
    if (this.currentState === MatchPhase.PLAYING) {
      this.pauseMatch();
    } else if (this.currentState === MatchPhase.PAUSE) {
      this.resumeMatch();
    }
  }

  public stopMatch(): void {
    this.stateTicksRemaining = 0;
    this.winningTeam = null;
    this.transitionTo(MatchPhase.STOP);
  }

  /**
   * Dispara el registro de gol e inicia la celebración de 3.0 segundos
   */
  public registerGoal(scoringTeam: 'red' | 'blue'): void {
    if (this.currentState !== MatchPhase.PLAYING && this.currentState !== MatchPhase.KICKOFF) {
      return;
    }

    if (scoringTeam === 'red') {
      this.redScore++;
    } else {
      this.blueScore++;
    }

    this.lastScoringTeam = scoringTeam;
    this.stateTicksRemaining = this.celebrationDurationTicks;
    this.transitionTo(MatchPhase.GOAL);
    this.onGoalScored?.(scoringTeam, this.redScore, this.blueScore);

    // Verificar si alcanzó el límite de goles
    if (this.scoreLimit > 0 && (this.redScore >= this.scoreLimit || this.blueScore >= this.scoreLimit)) {
      this.winningTeam = this.redScore > this.blueScore ? 'red' : 'blue';
    }
  }

  /**
   * Actualización secuencial del tick en la FSM (60 Hz)
   */
  public updateTick(): void {
    switch (this.currentState) {
      case MatchPhase.PLAYING: {
        this.matchTicksElapsed++;

        // Actualizar posesión
        if (this.currentPossessionTeam === 'red') {
          this.redPossessionTicks++;
        } else if (this.currentPossessionTeam === 'blue') {
          this.bluePossessionTicks++;
        }

        // Verificar tiempo reglamentario
        if (this.matchTimeLimitTicks > 0 && this.matchTicksElapsed >= this.matchTimeLimitTicks) {
          if (this.redScore === this.blueScore && this.goldenGoal) {
            // Continúa jugando hasta el gol de oro
          } else {
            this.concludeMatch();
          }
        }
        break;
      }

      case MatchPhase.GOAL: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining <= 0) {
          if (this.winningTeam !== null) {
            this.concludeMatch();
          } else {
            this.transitionTo(MatchPhase.KICKOFF);
          }
        }
        break;
      }

      case MatchPhase.KICKOFF:
      case MatchPhase.STOP:
      case MatchPhase.PAUSE:
      case MatchPhase.STATS:
      default:
        break;
    }
  }

  public concludeMatch(): void {
    if (this.redScore > this.blueScore) {
      this.winningTeam = 'red';
    } else if (this.blueScore > this.redScore) {
      this.winningTeam = 'blue';
    } else {
      this.winningTeam = null;
    }
    this.transitionTo(MatchPhase.STATS);
    this.onMatchEnd?.(this.winningTeam);
  }

  public getPossessionPercentages(): { red: number; blue: number } {
    const total = this.redPossessionTicks + this.bluePossessionTicks;
    if (total === 0) return { red: 50, blue: 50 };
    return {
      red: Math.round((this.redPossessionTicks / total) * 100),
      blue: Math.round((this.bluePossessionTicks / total) * 100)
    };
  }
}
