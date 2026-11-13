export enum MatchPhase {
  STOP = 0,
  PRE_MATCH_VS = 0.5,
  START_COUNTDOWN = 0.6,
  KICKOFF = 1,
  PLAYING = 2,
  PAUSE = 2.1,
  RESUME_COUNTDOWN = 2.2,
  GOAL = 3,
  GOAL_REPLAY = 3.5,
  CELEBRATION = 4,
  STATS = 5,

  // Alias de compatibilidad
  STOPPED = 0,
  COUNTDOWN = 1,
  PAUSED = 2.1,
  GOAL_CELEBRATION = 3,
  VICTORY_CELEBRATION = 4,
  MATCH_ENDED = 5
}

export type MatchState = MatchPhase;
export const MatchState = MatchPhase;

export interface FSMConfig {
  goalCelebrationTicks?: number;    // 180 ticks = 3.0 segundos canónicos a 60 Hz
  goalReplayTicks?: number;         // 240 ticks = 4.0 segundos canónicos a 60 Hz
  victoryCelebrationTicks?: number; // 300 ticks = 5.0 segundos canónicos a 60 Hz
  resumeCountdownTicks?: number;    // 180 ticks = 3.0 segundos canónicos a 60 Hz
  preMatchVsTicks?: number;         // 108 ticks = 1.8 segundos canónicos a 60 Hz
  startCountdownTicks?: number;     // 180 ticks = 3.0 segundos canónicos a 60 Hz
  matchTimeMinutes?: number;        // 3.0 minutos por defecto
  scoreLimit?: number;              // 3 goles por defecto
  goldenGoal?: boolean;             // Gol de oro en empate
}

export class GameFSM {
  public currentState: MatchPhase = MatchPhase.STOP;
  public stateTicksRemaining: number = 0;
  public celebrationDurationTicks: number;
  public goalReplayDurationTicks: number;
  public victoryCelebrationDurationTicks: number;
  public resumeCountdownDurationTicks: number;
  public preMatchVsDurationTicks: number;
  public startCountdownDurationTicks: number;
  public matchTimeLimitTicks: number;
  public matchTicksElapsed: number = 0;
  public scoreLimit: number;
  public goldenGoal: boolean;
  public isOvertime: boolean = false;
  public prePauseState: MatchPhase = MatchPhase.PLAYING;
  public countdownSeconds: number = 0;

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
  public onVictoryCelebrationStart?: (winner: 'red' | 'blue', redScore: number, blueScore: number) => void;
  public onCountdownTick?: (count: number, isResume: boolean) => void;
  public onMatchEnd?: (winner: 'red' | 'blue' | null) => void;

  constructor(config: FSMConfig = {}) {
    this.celebrationDurationTicks = config.goalCelebrationTicks ?? 180;
    this.goalReplayDurationTicks = config.goalReplayTicks ?? 240;
    this.victoryCelebrationDurationTicks = config.victoryCelebrationTicks ?? 300;
    this.resumeCountdownDurationTicks = config.resumeCountdownTicks ?? 180;
    this.preMatchVsDurationTicks = config.preMatchVsTicks ?? 108;
    this.startCountdownDurationTicks = config.startCountdownTicks ?? 180;
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

  public startMatch(withIntro: boolean = false): void {
    this.redScore = 0;
    this.blueScore = 0;
    this.matchTicksElapsed = 0;
    this.redPossessionTicks = 0;
    this.bluePossessionTicks = 0;
    this.winningTeam = null;
    this.lastScoringTeam = null;
    this.isOvertime = false;
    this.countdownSeconds = 0;

    if (withIntro) {
      this.stateTicksRemaining = this.preMatchVsDurationTicks;
      this.transitionTo(MatchPhase.PRE_MATCH_VS);
    } else {
      this.stateTicksRemaining = 0;
      this.transitionTo(MatchPhase.KICKOFF);
    }
  }

  public startMatchWithIntro(): void {
    this.startMatch(true);
  }

  public kickoff(): void {
    this.stateTicksRemaining = 0;
    this.countdownSeconds = 0;
    this.transitionTo(MatchPhase.KICKOFF);
  }

  public startPlaying(): void {
    this.transitionTo(MatchPhase.PLAYING);
  }

  public pauseMatch(): void {
    if (
      this.currentState === MatchPhase.PLAYING ||
      this.currentState === MatchPhase.KICKOFF ||
      this.currentState === MatchPhase.RESUME_COUNTDOWN
    ) {
      if (this.currentState !== MatchPhase.RESUME_COUNTDOWN) {
        this.prePauseState = this.currentState;
      }
      this.stateTicksRemaining = 0;
      this.countdownSeconds = 0;
      this.transitionTo(MatchPhase.PAUSE);
    }
  }

  public pause(): void {
    this.pauseMatch();
  }

  public resumeMatch(immediate: boolean = false): void {
    if (this.currentState === MatchPhase.PAUSE) {
      if (immediate) {
        this.stateTicksRemaining = 0;
        this.countdownSeconds = 0;
        this.transitionTo(this.prePauseState);
      } else {
        this.stateTicksRemaining = this.resumeCountdownDurationTicks;
        this.countdownSeconds = Math.ceil(this.stateTicksRemaining / 60);
        this.transitionTo(MatchPhase.RESUME_COUNTDOWN);
        this.onCountdownTick?.(this.countdownSeconds, true);
      }
    }
  }

  public resume(): void {
    this.resumeMatch();
  }

  public togglePause(): void {
    if (
      this.currentState === MatchPhase.PLAYING ||
      this.currentState === MatchPhase.KICKOFF ||
      this.currentState === MatchPhase.RESUME_COUNTDOWN
    ) {
      this.pauseMatch();
    } else if (this.currentState === MatchPhase.PAUSE) {
      this.resumeMatch();
    }
  }

  public stopMatch(): void {
    this.stateTicksRemaining = 0;
    this.countdownSeconds = 0;
    this.matchTicksElapsed = 0;
    this.redScore = 0;
    this.blueScore = 0;
    this.redPossessionTicks = 0;
    this.bluePossessionTicks = 0;
    this.winningTeam = null;
    this.lastScoringTeam = null;
    this.isOvertime = false;
    this.transitionTo(MatchPhase.STOP);
  }

  public enterVictoryCelebration(winner: 'red' | 'blue'): void {
    this.winningTeam = winner;
    this.stateTicksRemaining = this.victoryCelebrationDurationTicks;
    this.transitionTo(MatchPhase.CELEBRATION);
    this.onVictoryCelebrationStart?.(winner, this.redScore, this.blueScore);
  }

  /**
   * Dispara el registro de gol e inicia la celebración de 3.0s (o 5.0s si define al ganador)
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

    const reachedScoreLimit =
      this.scoreLimit > 0 && (this.redScore >= this.scoreLimit || this.blueScore >= this.scoreLimit);
    const isGoldenGoalWinner =
      this.goldenGoal &&
      (this.isOvertime || (this.matchTimeLimitTicks > 0 && this.matchTicksElapsed >= this.matchTimeLimitTicks)) &&
      this.redScore !== this.blueScore;

    if (reachedScoreLimit || isGoldenGoalWinner) {
      const winner: 'red' | 'blue' = this.redScore > this.blueScore ? 'red' : 'blue';
      this.winningTeam = winner;
      this.onGoalScored?.(scoringTeam, this.redScore, this.blueScore);
      this.enterVictoryCelebration(winner);
      return;
    }

    this.stateTicksRemaining = this.celebrationDurationTicks;
    this.transitionTo(MatchPhase.GOAL);
    this.onGoalScored?.(scoringTeam, this.redScore, this.blueScore);
  }

  /**
   * Sale de la fase GOAL_REPLAY hacia CELEBRATION (si hay ganador) o KICKOFF
   */
  public exitGoalReplay(): void {
    if (this.currentState !== MatchPhase.GOAL_REPLAY) return;
    this.stateTicksRemaining = 0;
    if (this.winningTeam !== null) {
      this.enterVictoryCelebration(this.winningTeam);
    } else {
      this.transitionTo(MatchPhase.KICKOFF);
    }
  }

  /**
   * Actualización secuencial del tick en la FSM (60 Hz)
   */
  public updateTick(): void {
    switch (this.currentState) {
      case MatchPhase.PRE_MATCH_VS: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining <= 0) {
          this.stateTicksRemaining = this.startCountdownDurationTicks;
          this.countdownSeconds = Math.ceil(this.stateTicksRemaining / 60);
          this.transitionTo(MatchPhase.START_COUNTDOWN);
          this.onCountdownTick?.(this.countdownSeconds, false);
        }
        break;
      }

      case MatchPhase.START_COUNTDOWN: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining > 0) {
          const nextSec = Math.ceil(this.stateTicksRemaining / 60);
          if (nextSec !== this.countdownSeconds) {
            this.countdownSeconds = nextSec;
            this.onCountdownTick?.(this.countdownSeconds, false);
          }
        } else {
          this.countdownSeconds = 0;
          this.onCountdownTick?.(0, false);
          this.transitionTo(MatchPhase.KICKOFF);
        }
        break;
      }

      case MatchPhase.RESUME_COUNTDOWN: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining > 0) {
          const nextSec = Math.ceil(this.stateTicksRemaining / 60);
          if (nextSec !== this.countdownSeconds) {
            this.countdownSeconds = nextSec;
            this.onCountdownTick?.(this.countdownSeconds, true);
          }
        } else {
          this.countdownSeconds = 0;
          this.onCountdownTick?.(0, true);
          this.transitionTo(this.prePauseState);
        }
        break;
      }

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
            this.isOvertime = true;
          } else if (this.redScore !== this.blueScore) {
            const winner: 'red' | 'blue' = this.redScore > this.blueScore ? 'red' : 'blue';
            this.enterVictoryCelebration(winner);
          } else {
            this.concludeMatch();
          }
        }
        break;
      }

      case MatchPhase.GOAL: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining <= 0) {
          this.stateTicksRemaining = this.goalReplayDurationTicks;
          this.transitionTo(MatchPhase.GOAL_REPLAY);
          if (this.stateTicksRemaining <= 0) {
            this.exitGoalReplay();
          }
        }
        break;
      }

      case MatchPhase.GOAL_REPLAY: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining <= 0) {
          this.exitGoalReplay();
        }
        break;
      }

      case MatchPhase.CELEBRATION: {
        this.stateTicksRemaining--;
        if (this.stateTicksRemaining <= 0) {
          this.concludeMatch();
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
    this.stateTicksRemaining = 0;
    this.countdownSeconds = 0;
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
